import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CompletePaymentRequest {
  order_id: string;
  // Optional: When called from payment gateways (PayPal/Crypto) with service role key,
  // they pass user_id to skip auth token validation
  internal_user_id?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // External database credentials (where orders/accounts live)
    // Prefer non-VITE secrets (these are meant for server/runtime), fallback to legacy VITE_* if present.
    const externalUrl =
      Deno.env.get("EXTERNAL_SUPABASE_URL") ||
      Deno.env.get("VITE_EXTERNAL_SUPABASE_URL") ||
      "";
    const externalAnonKey =
      Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") ||
      Deno.env.get("VITE_EXTERNAL_SUPABASE_ANON_KEY") ||
      "";
    const externalServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || "";
    const cloudServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!externalUrl) {
      throw new Error(
        "External URL is not configured (EXTERNAL_SUPABASE_URL or VITE_EXTERNAL_SUPABASE_URL)"
      );
    }
    if (!externalAnonKey) {
      throw new Error(
        "External anon key is not configured (EXTERNAL_SUPABASE_ANON_KEY or VITE_EXTERNAL_SUPABASE_ANON_KEY)"
      );
    }
    if (!externalServiceKey) {
      throw new Error("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY is not configured");
    }

    // Helpful diagnostics (do not log secrets)
    try {
      const host = new URL(externalUrl).host;
      console.log("complete-payment external host:", host);
    } catch {
      console.log("complete-payment externalUrl is not a valid URL");
    }

    const body = await req.json();
    const { order_id, internal_user_id }: CompletePaymentRequest = body;

    // Check if this is an internal call from payment gateway using service role key
    const token = authHeader.replace("Bearer ", "");
    const isInternalCall = token === cloudServiceKey && !!internal_user_id;
    
    let userId: string;
    
    if (isInternalCall) {
      // Trusted internal call from payment gateway (PayPal/Crypto)
      console.log("Internal call from payment gateway, user_id:", internal_user_id);
      userId = internal_user_id;
    } else {
      // Normal user call - validate token against external auth
      const userClient = createClient(externalUrl, externalAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userError } = await userClient.auth.getUser();
      if (userError || !userData?.user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized", details: userError?.message }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      userId = userData.user.id;
    }

    // Admin client to bypass RLS for delivery operations
    const adminClient = createClient(externalUrl, externalServiceKey);

    // Cloud client for accessing osn_sessions (stored in Lovable Cloud)
    const cloudUrl = Deno.env.get("SUPABASE_URL") || "";
    const cloudSvcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const cloudClient = cloudUrl && cloudSvcKey ? createClient(cloudUrl, cloudSvcKey) : null;

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: "Order ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get order
    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only the owner should be able to complete OR re-send delivery email
    // Skip this check for internal calls (already validated by payment gateway)
    if (!isInternalCall && order.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // For internal calls, ensure the order belongs to the claimed user
    if (isInternalCall && order.user_id !== userId) {
      console.error("Internal call user_id mismatch:", userId, "vs order.user_id:", order.user_id);
      return new Response(JSON.stringify({ error: "User ID mismatch" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If already completed, allow re-sending delivery email from stored delivered_data
    if (order.status === "completed") {
      const { data: existingItems } = await adminClient
        .from("order_items")
        .select("id, quantity, delivered_data, product_id, products(name)")
        .eq("order_id", order_id);

      const deliveredProducts: Array<{ name: string; account_data: string; quantity: number }> =
        (existingItems || [])
          .filter((i: any) => !!i.delivered_data)
          .map((i: any) => ({
            name: i.products?.name || "منتج",
            account_data: i.delivered_data,
            quantity: i.quantity || 1,
          }));

      if (deliveredProducts.length === 0) {
        // Check if all items are from unlimited variants via product_account_id -> product_accounts -> variant_id
        let allUnlimited = true;
        for (const item of (existingItems || [])) {
          let variantId: string | null = null;
          
          // Get variant_id through product_account_id
          if ((item as any).product_account_id) {
            const { data: pa } = await adminClient
              .from("product_accounts")
              .select("variant_id")
              .eq("id", (item as any).product_account_id)
              .single();
            variantId = pa?.variant_id || null;
          }
          
          // Fallback: check if the product has any unlimited variant
          if (!variantId) {
            const { data: unlimitedV } = await adminClient
              .from("product_variants")
              .select("id")
              .eq("product_id", item.product_id)
              .eq("is_unlimited", true)
              .limit(1)
              .maybeSingle();
            variantId = unlimitedV?.id || null;
          }

          if (variantId) {
            const { data: vd } = await adminClient.from("product_variants").select("is_unlimited").eq("id", variantId).single();
            if (!vd?.is_unlimited) { allUnlimited = false; break; }
          } else {
            allUnlimited = false; break;
          }
        }

        if (allUnlimited) {
          // Fetch activation codes for this order to return them
          const { data: existingCodes } = await adminClient
            .from("activation_codes")
            .select("code, product_id")
            .eq("order_id", order_id);
          
          const activationCodesForResponse = (existingCodes || []).map((c: any) => ({
            code: c.code,
            product_id: c.product_id,
          }));

          return new Response(
            JSON.stringify({
              success: true,
              message: "الطلب مكتمل — منتج غير محدود (يتم التفعيل تلقائياً)",
              activation_codes: activationCodesForResponse.length > 0 ? activationCodesForResponse : null,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Not unlimited and no delivered data - still return success for completed orders
        return new Response(
          JSON.stringify({
            success: true,
            message: "الطلب مكتمل",
            order_id: order_id,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: profile } = await adminClient
        .from("profiles")
        .select("email, full_name")
        .eq("user_id", order.user_id)
        .single();

      const { data: storeNameSetting } = await adminClient
        .from("site_settings")
        .select("value")
        .eq("key", "store_name")
        .single();

      const storeName = storeNameSetting?.value || "Digital Store";
      const warrantyExpiryIso =
        order.warranty_expires_at || new Date().toISOString();

      let emailSent = false;
      let emailError: string | null = null;

      if (profile?.email) {
        try {
          const cloudUrl = Deno.env.get("SUPABASE_URL") || "";
          const cloudServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

          console.log("Re-sending delivery email to:", profile.email);

          if (cloudUrl && cloudServiceKey) {
            const emailResponse = await fetch(`${cloudUrl}/functions/v1/send-delivery-email`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${cloudServiceKey}`,
              },
              body: JSON.stringify({
                to_email: profile.email,
                customer_name: profile.full_name || "",
                order_number: order.order_number,
                products: deliveredProducts,
                total_amount: order.total_amount,
                warranty_expires_at: warrantyExpiryIso,
                store_name: storeName,
              }),
            });

            const emailResult = await emailResponse.json();
            console.log("Re-send email status:", emailResponse.status);
            console.log("Re-send email result:", JSON.stringify(emailResult));

            if (emailResponse.ok && emailResult.success) {
              emailSent = true;
            } else {
              emailError = emailResult.error || "Unknown email error";
            }
          } else {
            emailError = "Cloud credentials not configured";
          }
        } catch (err) {
          emailError = err instanceof Error ? err.message : "Email sending exception";
        }
      } else {
        emailError = "No email address found for user";
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: emailSent ? "تمت إعادة إرسال الإيميل" : "الطلب مكتمل لكن فشل إرسال الإيميل",
          email_sent: emailSent,
          email_error: emailError,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get order items with product info
    const { data: orderItems } = await adminClient
      .from("order_items")
      .select("*, products(name, product_type, warranty_days)")
      .eq("order_id", order_id);

    if (!orderItems || orderItems.length === 0) {
      return new Response(
        JSON.stringify({ error: "No items in order" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Process delivery for each item
    const deliveredProducts: Array<{ name: string; account_data: string; quantity: number }> = [];
    let deliveredCount = 0;
    let skippedCount = 0;

    console.log(`Processing ${orderItems.length} items for delivery`);

    for (const item of orderItems) {
      const productType = item.products?.product_type || "account";
      const productName = item.products?.name || "منتج";

      console.log(`Item ${item.id}: type=${productType}, has_delivered_data=${!!item.delivered_data}, product_id=${item.product_id}`);

      if (productType === "account" && !item.delivered_data) {
        const variantId = (item as any).variant_id;
        
        console.log(`Looking for account: product_id=${item.product_id}, variant_id=${variantId || 'NULL'}`);
        
        // Check if variant is unlimited BEFORE querying accounts
        let isUnlimitedVariant = false;
        if (variantId) {
          const { data: variantData } = await adminClient
            .from("product_variants")
            .select("is_unlimited")
            .eq("id", variantId)
            .single();
          isUnlimitedVariant = variantData?.is_unlimited === true;
          console.log(`Variant ${variantId} is_unlimited: ${isUnlimitedVariant}`);
        }

        // First, check available accounts count for debugging
        const { data: allAccounts, error: countError } = await adminClient
          .from("product_accounts")
          .select("id, is_sold, variant_id")
          .eq("product_id", item.product_id);
        
        console.log(`Total accounts for product: ${allAccounts?.length || 0}, countError: ${countError?.message || 'none'}`);
        if (allAccounts && allAccounts.length > 0) {
          const available = allAccounts.filter(a => !a.is_sold);
          const withVariant = allAccounts.filter(a => a.variant_id === variantId);
          const availableWithVariant = allAccounts.filter(a => !a.is_sold && a.variant_id === variantId);
          const withNullVariant = allAccounts.filter(a => a.variant_id === null);
          console.log(`Breakdown: available=${available.length}, withVariant=${withVariant.length}, availableWithVariant=${availableWithVariant.length}, nullVariant=${withNullVariant.length}`);
        }

        // Build query - for unlimited, pick ANY account (even sold ones)
        let accountQuery = adminClient
          .from("product_accounts")
          .select("id, account_data, variant_id")
          .eq("product_id", item.product_id);
        
        if (!isUnlimitedVariant) {
          accountQuery = accountQuery.eq("is_sold", false);
        }
        
        // If no variant specified OR no accounts match exact variant, try without variant filter
        let account = null;
        let accountError = null;
        
        if (variantId) {
          // First try exact variant match
          let exactQuery = adminClient
            .from("product_accounts")
            .select("id, account_data, variant_id")
            .eq("product_id", item.product_id)
            .eq("variant_id", variantId)
            .limit(1);
          
          if (!isUnlimitedVariant) {
            exactQuery = exactQuery.eq("is_sold", false);
          }
          
          const { data: exactMatch, error: exactError } = await exactQuery.maybeSingle();
          
          if (exactMatch) {
            account = exactMatch;
            console.log(`Found exact variant match: account ${account.id}`);
          } else {
            // Fallback: try accounts with null variant
            console.log(`No exact variant match, trying null variant fallback...`);
            const { data: fallbackMatch, error: fallbackError } = await adminClient
              .from("product_accounts")
              .select("id, account_data, variant_id")
              .eq("product_id", item.product_id)
              .eq("is_sold", false)
              .is("variant_id", null)
              .limit(1)
              .maybeSingle();
            
            if (fallbackMatch) {
              account = fallbackMatch;
              console.log(`Found fallback (null variant): account ${account.id}`);
            } else {
              // Last fallback: any available account for this product
              console.log(`Trying any available account fallback...`);
              const { data: anyMatch, error: anyError } = await adminClient
                .from("product_accounts")
                .select("id, account_data, variant_id")
                .eq("product_id", item.product_id)
                .eq("is_sold", false)
                .limit(1)
                .maybeSingle();
              
              account = anyMatch;
              accountError = anyError;
              if (anyMatch) {
                console.log(`Found any available: account ${account.id}`);
              }
            }
          }
        } else {
          // No variant specified, get any available account
          const { data: nullVariantMatch, error: nullError } = await adminClient
            .from("product_accounts")
            .select("id, account_data, variant_id")
            .eq("product_id", item.product_id)
            .eq("is_sold", false)
            .limit(1)
            .maybeSingle();
          
          account = nullVariantMatch;
          accountError = nullError;
        }

        if (accountError || !account) {
          console.error(`❌ No available account for product ${item.product_id}:`, accountError?.message || "No accounts found");
          console.error(`Debug: variantId=${variantId}, isUnlimited=${isUnlimitedVariant}`);
          return new Response(
            JSON.stringify({ 
              error: "لا توجد حسابات متوفرة لهذا المنتج. يرجى التواصل مع الدعم.",
              product_id: item.product_id,
              product_name: productName,
              variant_id: variantId,
              debug: {
                product_type: productType,
                variant_id: variantId,
                is_unlimited: isUnlimitedVariant,
                account_error: accountError?.message
              }
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`Found account ${account.id} for product ${item.product_id} (unlimited: ${isUnlimitedVariant})`);

        // Only mark as sold if NOT unlimited
        if (!isUnlimitedVariant) {
          const { error: soldError } = await adminClient
            .from("product_accounts")
            .update({ is_sold: true, sold_at: new Date().toISOString() })
            .eq("id", account.id);

          if (soldError) {
            console.error("Error marking account as sold:", soldError.message);
          }
        } else {
          console.log(`Account ${account.id} is unlimited - not marking as sold`);
        }

        // Update order item with delivered data
        const { error: updateError } = await adminClient
          .from("order_items")
          .update({
            product_account_id: account.id,
            delivered_data: account.account_data,
          })
          .eq("id", item.id);

        if (updateError) {
          console.error("Error updating order item:", updateError.message);
        } else {
          deliveredCount++;
          console.log(`Delivered account to order item ${item.id}`);
        }

        deliveredProducts.push({
          name: productName,
          account_data: account.account_data,
          quantity: item.quantity || 1,
        });
      } else if (item.delivered_data) {
        // Already delivered, add to list for email
        console.log(`Item ${item.id} already has delivered_data`);
        skippedCount++;
        deliveredProducts.push({
          name: productName,
          account_data: item.delivered_data,
          quantity: item.quantity || 1,
        });
      } else {
        console.log(`Skipping item ${item.id}: productType=${productType}`);
        skippedCount++;
      }

      // Update sales count
      const { data: product } = await adminClient
        .from("products")
        .select("sales_count")
        .eq("id", item.product_id)
        .single();

      if (product) {
        await adminClient
          .from("products")
          .update({ sales_count: (product.sales_count || 0) + (item.quantity || 1) })
          .eq("id", item.product_id);
      }
    }

    console.log(`Delivery summary: delivered=${deliveredCount}, skipped=${skippedCount}`);

    // If no items were delivered and none were already delivered, something went wrong
    if (deliveredCount === 0 && deliveredProducts.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: "لم يتم تسليم أي منتج",
          debug: {
            items_count: orderItems.length,
            skipped: skippedCount
          }
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate warranty expiry (use max warranty from all products)
    const maxWarrantyDays = Math.max(
      ...orderItems.map(item => item.products?.warranty_days || 7)
    );
    const warrantyExpiry = new Date();
    warrantyExpiry.setDate(warrantyExpiry.getDate() + maxWarrantyDays);

    // Update order
    await adminClient
      .from("orders")
      .update({
        status: "completed",
        payment_status: "paid",
        warranty_expires_at: warrantyExpiry.toISOString(),
      })
      .eq("id", order_id);

    // === توليد أكواد التفعيل للمنتجات التي تتطلب تفعيل ===
    const activationCodes: Array<{ code: string; product_name: string; product_id: string }> = [];
    
    for (const item of orderItems) {
      // التحقق من أن المنتج يتطلب تفعيل
      const { data: productData } = await adminClient
        .from("products")
        .select("requires_activation, activation_type, name")
        .eq("id", item.product_id)
        .single();
      
      if (productData?.requires_activation) {
        console.log(`Product ${item.product_id} requires activation, generating code...`);
        
        // توليد كود تفعيل فريد
        const generateCode = (): string => {
          const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
          let code = '';
          for (let i = 0; i < 8; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          return code;
        };
        
        const activationCode = generateCode();
        
        // جلب البريد من osn_sessions (Cloud DB) للمنتجات غير المحدودة
        let accountEmail: string | null = null;
        try {
          // Get the variant for this item from the delivered product_account
          const { data: deliveredItem } = await adminClient
            .from("order_items")
            .select("product_account_id")
            .eq("id", item.id)
            .single();
          
          if (deliveredItem?.product_account_id) {
            const { data: pa } = await adminClient
              .from("product_accounts")
              .select("variant_id")
              .eq("id", deliveredItem.product_account_id)
              .single();
            
            if (pa?.variant_id && cloudClient) {
              const { data: osnSession } = await cloudClient
                .from("osn_sessions")
                .select("email")
                .eq("variant_id", pa.variant_id)
                .eq("is_active", true)
                .limit(1)
                .maybeSingle();
              
              if (osnSession?.email) {
                accountEmail = osnSession.email;
                console.log(`Found OSN email for variant ${pa.variant_id}: ${accountEmail}`);
              }
            }
          }
          
          // Fallback: try finding unlimited variant for this product
          if (!accountEmail && cloudClient) {
            const { data: unlimitedVariants } = await adminClient
              .from("product_variants")
              .select("id")
              .eq("product_id", item.product_id)
              .eq("is_unlimited", true);
            
            if (unlimitedVariants && unlimitedVariants.length > 0) {
              for (const v of unlimitedVariants) {
                const { data: session } = await cloudClient
                  .from("osn_sessions")
                  .select("email")
                  .eq("variant_id", v.id)
                  .eq("is_active", true)
                  .limit(1)
                  .maybeSingle();
                
                if (session?.email) {
                  accountEmail = session.email;
                  console.log(`Found OSN email via unlimited variant ${v.id}: ${accountEmail}`);
                  break;
                }
              }
            }
          }
        } catch (emailErr) {
          console.error("Error fetching OSN session email:", emailErr);
        }
        
        // إنشاء سجل كود التفعيل
        const insertData: Record<string, unknown> = {
          code: activationCode,
          user_id: order.user_id,
          product_id: item.product_id,
          order_id: order_id,
          order_item_id: item.id,
          status: 'pending',
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        };
        
        if (accountEmail) {
          insertData.account_email = accountEmail;
        }
        
        const { data: codeData, error: codeError } = await adminClient
          .from("activation_codes")
          .insert(insertData)
          .select()
          .single();
        
        if (codeError) {
          console.error(`Error creating activation code for product ${item.product_id}:`, codeError.message);
        } else {
          console.log(`✅ Created activation code ${activationCode} for product ${item.product_id} (email: ${accountEmail || 'none'})`);
          activationCodes.push({
            code: activationCode,
            product_name: productData.name || 'منتج',
            product_id: item.product_id,
          });
        }
      }
    }

    // Get user email for delivery
    const { data: profile } = await adminClient
      .from("profiles")
      .select("email, full_name, referred_by")
      .eq("user_id", order.user_id)
      .single();

    // Get store name from settings
    const { data: storeNameSetting } = await adminClient
      .from("site_settings")
      .select("value")
      .eq("key", "store_name")
      .single();

    const storeName = storeNameSetting?.value || "Digital Store";

    // Send delivery email (best-effort)
    let emailSent = false;
    let emailError: string | null = null;
    
    if (profile?.email && deliveredProducts.length > 0) {
      try {
        const cloudUrl = Deno.env.get("SUPABASE_URL") || "";
        const cloudServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
        
        console.log("Attempting to send delivery email to:", profile.email);
        console.log("Products to include in email:", deliveredProducts.length);
        
        // جلب اسم بوت تيليجرام من الإعدادات
        const { data: botUsernameSetting } = await adminClient
          .from("site_settings")
          .select("value")
          .eq("key", "telegram_bot_username")
          .maybeSingle();
        
        const telegramBotUsername = botUsernameSetting?.value || "";
        
        // تحديد كود التفعيل الأول (إذا كان موجوداً)
        const firstActivationCode = activationCodes.length > 0 ? activationCodes[0] : null;
        const activationExpiresAt = firstActivationCode 
          ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          : undefined;
        
        if (cloudUrl && cloudServiceKey) {
          const emailPayload: Record<string, unknown> = {
            to_email: profile.email,
            customer_name: profile.full_name || "",
            order_number: order.order_number,
            order_id: order_id,
            user_id: order.user_id,
            products: deliveredProducts,
            total_amount: order.total_amount,
            warranty_expires_at: warrantyExpiry.toISOString(),
            store_name: storeName,
          };
          
          // إضافة بيانات كود التفعيل إذا كان موجوداً
          if (firstActivationCode) {
            emailPayload.activation_code = firstActivationCode.code;
            emailPayload.activation_expires_at = activationExpiresAt;
            emailPayload.telegram_bot_username = telegramBotUsername;
            console.log("Including activation code in email:", firstActivationCode.code);
          }
          
          const emailResponse = await fetch(`${cloudUrl}/functions/v1/send-delivery-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${cloudServiceKey}`,
            },
            body: JSON.stringify(emailPayload),
          });

          const emailResult = await emailResponse.json();
          console.log("Email delivery response status:", emailResponse.status);
          console.log("Email delivery result:", JSON.stringify(emailResult));
          
          if (emailResponse.ok && emailResult.success) {
            emailSent = true;
            console.log("✅ Delivery email sent successfully");
          } else {
            emailError = emailResult.error || "Unknown email error";
            console.error("❌ Email sending failed:", emailError);
          }
        } else {
          emailError = "Cloud credentials not configured";
          console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
        }
      } catch (err) {
        emailError = err instanceof Error ? err.message : "Email sending exception";
        console.error("❌ Failed to send delivery email:", err);
      }
    } else {
      if (!profile?.email) {
        emailError = "No email address found for user";
        console.log("⚠️ User has no email address");
      } else {
        emailError = "No products to deliver";
        console.log("⚠️ No delivered products for email");
      }
    }

    // Handle affiliate commission
    if (profile?.referred_by) {
      const { data: commissionSetting } = await adminClient
        .from("site_settings")
        .select("value")
        .eq("key", "affiliate_commission")
        .single();

      const commissionRate = commissionSetting?.value
        ? parseFloat(commissionSetting.value) / 100
        : 0.1;

      const commission = order.total_amount * commissionRate;

      const { data: affiliate } = await adminClient
        .from("affiliates")
        .select("id, user_id, total_earnings")
        .eq("id", profile.referred_by)
        .single();

      if (affiliate) {
        await adminClient
          .from("affiliates")
          .update({
            total_earnings: (affiliate.total_earnings || 0) + commission,
          })
          .eq("id", affiliate.id);

        const { data: affiliateWallet } = await adminClient
          .from("wallets")
          .select("id, balance, total_earned")
          .eq("user_id", affiliate.user_id)
          .single();

        if (affiliateWallet) {
          await adminClient
            .from("wallets")
            .update({
              balance: affiliateWallet.balance + commission,
              total_earned: (affiliateWallet.total_earned || 0) + commission,
              updated_at: new Date().toISOString(),
            })
            .eq("id", affiliateWallet.id);

          await adminClient
            .from("wallet_transactions")
            .insert({
              wallet_id: affiliateWallet.id,
              type: "affiliate_commission",
              amount: commission,
              description: `عمولة إحالة من طلب ${order.order_number}`,
              reference_id: order.id,
              status: "completed",
            });
        }

        await adminClient
          .from("referrals")
          .update({ status: "purchased" })
          .eq("referrer_id", profile.referred_by)
          .eq("referred_user_id", order.user_id);
      }
    }

    // Fetch final order
    const { data: finalOrder } = await adminClient
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", order_id)
      .single();

    // جلب إعدادات البوت لإرسالها للعميل
    const { data: botSettings } = await adminClient
      .from("site_settings")
      .select("key, value")
      .in("key", ["telegram_bot_username", "activation_message_template"]);
    
    const botUsername = botSettings?.find(s => s.key === "telegram_bot_username")?.value || null;

    return new Response(
      JSON.stringify({
        success: true,
        order: finalOrder,
        email_sent: emailSent,
        email_error: emailError,
        activation_codes: activationCodes.length > 0 ? activationCodes : null,
        telegram_bot_username: botUsername,
        message: emailSent 
          ? "تم تأكيد الدفع وتسليم الطلب بنجاح وإرسال الإيميل" 
          : "تم تأكيد الدفع وتسليم الطلب بنجاح",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Complete payment error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
