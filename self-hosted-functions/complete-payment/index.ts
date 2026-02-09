// ============================================================
// complete-payment Edge Function - Standalone للرفع اليدوي
// يعمل على Supabase الخارجي مباشرة
// يستخدم Service Role لتجاوز RLS وتسليم الحسابات
// ============================================================
// 
// Secrets المطلوبة في Supabase Dashboard → Edge Functions:
// - SUPABASE_URL (تلقائي)
// - SUPABASE_ANON_KEY (تلقائي)
// - SUPABASE_SERVICE_ROLE_KEY (تلقائي)
// - RESEND_API_KEY (اختياري - لإرسال بريد التسليم)
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CompletePaymentRequest {
  order_id: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ============================================================
    // 1. التحقق من المصادقة
    // ============================================================
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - No token provided" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================================
    // 2. إعداد العملاء (Clients)
    // ============================================================
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // عميل المستخدم للتحقق من الهوية
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // التحقق من المستخدم
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      console.error("Auth error:", userError?.message || "No user data");
      return new Response(
        JSON.stringify({ error: "Unauthorized", details: userError?.message }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const userId = userData.user.id;

    // عميل الأدمن لتجاوز RLS
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // ============================================================
    // 3. قراءة الطلب
    // ============================================================
    const { order_id }: CompletePaymentRequest = await req.json();

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: "Order ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing order: ${order_id} for user: ${userId}`);

    // ============================================================
    // 4. جلب الطلب والتحقق من الملكية
    // ============================================================
    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      console.error("Order not found:", orderError);
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // التحقق من أن المستخدم هو صاحب الطلب
    if (order.user_id !== userId) {
      return new Response(
        JSON.stringify({ error: "Forbidden - You don't own this order" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // إذا كان الطلب مكتمل بالفعل
    if (order.status === "completed") {
      return new Response(
        JSON.stringify({ success: true, message: "Order already completed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================================
    // 5. جلب عناصر الطلب مع معلومات المنتجات
    // ============================================================
    const { data: orderItems, error: itemsError } = await adminClient
      .from("order_items")
      .select("*, products(name, product_type, warranty_days)")
      .eq("order_id", order_id);

    if (itemsError) {
      console.error("Error fetching order items:", itemsError);
    }

    if (!orderItems || orderItems.length === 0) {
      return new Response(
        JSON.stringify({ error: "No items in order" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${orderItems.length} items in order`);

    // ============================================================
    // 6. معالجة التسليم لكل عنصر
    // ============================================================
    const deliveredProducts: Array<{ name: string; account_data: string; quantity: number }> = [];
    let deliveredCount = 0;

    for (const item of orderItems) {
      const productType = item.products?.product_type || "account";
      const productName = item.products?.name || "منتج";

      // تسليم حسابات المنتجات من نوع account
      if (productType === "account" && !item.delivered_data) {
        // جلب حساب متوفر (مع عزل المنتجات الفرعية)
        let accountQuery = adminClient
          .from("product_accounts")
          .select("id, account_data, variant_id")
          .eq("product_id", item.product_id)
          .eq("is_sold", false);

        const variantId = (item as any).variant_id;
        if (variantId) {
          accountQuery = accountQuery.eq("variant_id", variantId);
        } else {
          // الطلب بدون منتج فرعي يجب ألا يسحب حسابات من المنتجات الفرعية
          accountQuery = accountQuery.is("variant_id", null);
        }

        const { data: account, error: accountError } = await accountQuery.limit(1).single();

        if (accountError || !account) {
          console.error(`No available account for product ${item.product_id}:`, accountError);
          return new Response(
            JSON.stringify({
              error: "لا توجد حسابات متوفرة لهذا المنتج. يرجى التواصل مع الدعم.",
              product_id: item.product_id,
              product_name: productName,
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`Delivering account ${account.id} for product ${item.product_id}`);

        // لا نعلّم الحساب كمباع إذا كان المنتج الفرعي غير محدود
        let isUnlimitedVariant = false;
        if (account.variant_id) {
          const { data: v } = await adminClient
            .from("product_variants")
            .select("is_unlimited")
            .eq("id", account.variant_id)
            .single();
          isUnlimitedVariant = v?.is_unlimited === true;
        }

        if (!isUnlimitedVariant) {
          const { error: soldError } = await adminClient
            .from("product_accounts")
            .update({ is_sold: true, sold_at: new Date().toISOString() })
            .eq("id", account.id);

          if (soldError) {
            console.error("Error marking account as sold:", soldError);
          }
        }

        // تحديث عنصر الطلب بالبيانات المسلّمة
        const { error: updateError } = await adminClient
          .from("order_items")
          .update({
            product_account_id: account.id,
            delivered_data: account.account_data,
          })
          .eq("id", item.id);

        if (updateError) {
          console.error("Error updating order item:", updateError);
        } else {
          deliveredCount++;
        }

        deliveredProducts.push({
          name: productName,
          account_data: account.account_data,
          quantity: item.quantity || 1,
        });
      } else if (item.delivered_data) {
        // العنصر مسلّم مسبقاً
        deliveredProducts.push({
          name: productName,
          account_data: item.delivered_data,
          quantity: item.quantity || 1,
        });
      }

      // تحديث عداد المبيعات
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

    // ============================================================
    // 7. حساب انتهاء الضمان
    // ============================================================
    const maxWarrantyDays = Math.max(
      ...orderItems.map((item: any) => item.products?.warranty_days || 7)
    );
    const warrantyExpiry = new Date();
    warrantyExpiry.setDate(warrantyExpiry.getDate() + maxWarrantyDays);

    // ============================================================
    // 8. تحديث حالة الطلب إلى "مكتمل"
    // ============================================================
    const { error: orderUpdateError } = await adminClient
      .from("orders")
      .update({
        status: "completed",
        payment_status: "paid",
        warranty_expires_at: warrantyExpiry.toISOString(),
      })
      .eq("id", order_id);

    if (orderUpdateError) {
      console.error("Error updating order status:", orderUpdateError);
    }

    console.log(`Order ${order_id} marked as completed`);

    // ============================================================
    // 9. جلب بيانات المستخدم للإيميل والعمولة
    // ============================================================
    const { data: profile } = await adminClient
      .from("profiles")
      .select("email, full_name, referred_by")
      .eq("user_id", order.user_id)
      .single();

    // جلب اسم المتجر
    const { data: storeNameSetting } = await adminClient
      .from("site_settings")
      .select("value")
      .eq("key", "store_name")
      .single();

    const storeName = storeNameSetting?.value || "Digital Store";

    // ============================================================
    // 10. إرسال إيميل التسليم (اختياري)
    // ============================================================
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (resendApiKey && profile?.email && deliveredProducts.length > 0) {
      try {
        const resend = new Resend(resendApiKey);

        const itemsHtml = deliveredProducts
          .map(
            (item) => `
          <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin-bottom: 16px; direction: rtl;">
            <h3 style="margin: 0 0 8px 0; color: #333;">${item.name}</h3>
            <p style="margin: 0 0 4px 0; color: #666;">الكمية: ${item.quantity}</p>
            <div style="background: #fff; border: 1px solid #ddd; border-radius: 4px; padding: 12px; margin-top: 8px;">
              <pre style="margin: 0; white-space: pre-wrap; word-break: break-all; font-family: monospace; font-size: 14px;">${item.account_data}</pre>
            </div>
          </div>
        `
          )
          .join("");

        await resend.emails.send({
          from: `${storeName} <noreply@resend.dev>`,
          to: [profile.email],
          subject: `✅ تم تسليم طلبك #${order.order_number}`,
          html: `
            <!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <body style="font-family: sans-serif; background: #f5f5f5; padding: 20px;">
              <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden;">
                <div style="background: linear-gradient(135deg, #667eea, #764ba2); padding: 30px; text-align: center;">
                  <h1 style="color: white; margin: 0;">🎉 تم تسليم طلبك!</h1>
                </div>
                <div style="padding: 30px;">
                  <p>مرحباً ${profile.full_name || "عزيزنا العميل"},</p>
                  <p>رقم الطلب: <strong>${order.order_number}</strong></p>
                  <p>المبلغ الإجمالي: <strong>$${order.total_amount}</strong></p>
                  <h2>المنتجات المُسلَّمة</h2>
                  ${itemsHtml}
                  <p style="background: #d4edda; padding: 16px; border-radius: 8px; color: #155724;">
                    🛡️ الضمان ساري حتى: ${warrantyExpiry.toLocaleDateString("ar-SA")}
                  </p>
                  <p style="background: #fff3cd; padding: 16px; border-radius: 8px; color: #856404;">
                    ⚠️ يرجى حفظ هذه البيانات في مكان آمن.
                  </p>
                </div>
              </div>
            </body>
            </html>
          `,
        });
        console.log("Delivery email sent to:", profile.email);
      } catch (emailError) {
        console.error("Failed to send delivery email:", emailError);
        // لا نفشل إكمال الطلب إذا فشل الإيميل
      }
    }

    // ============================================================
    // 11. معالجة عمولة الأفلييت (إن وجدت)
    // ============================================================
    if (profile?.referred_by) {
      try {
        const { data: commissionSetting } = await adminClient
          .from("site_settings")
          .select("value")
          .eq("key", "affiliate_commission")
          .single();

        const commissionRate = commissionSetting?.value
          ? parseFloat(commissionSetting.value) / 100
          : 0.1; // 10% افتراضي

        const commission = order.total_amount * commissionRate;

        const { data: affiliate } = await adminClient
          .from("affiliates")
          .select("id, user_id, total_earnings")
          .eq("id", profile.referred_by)
          .single();

        if (affiliate) {
          // تحديث أرباح الأفلييت
          await adminClient
            .from("affiliates")
            .update({
              total_earnings: (affiliate.total_earnings || 0) + commission,
            })
            .eq("id", affiliate.id);

          // إضافة العمولة للمحفظة
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

            await adminClient.from("wallet_transactions").insert({
              wallet_id: affiliateWallet.id,
              type: "affiliate_commission",
              amount: commission,
              description: `عمولة إحالة من طلب ${order.order_number}`,
              reference_id: order.id,
              status: "completed",
            });
          }

          // تحديث حالة الإحالة
          await adminClient
            .from("referrals")
            .update({ status: "purchased" })
            .eq("referrer_id", profile.referred_by)
            .eq("referred_user_id", order.user_id);

          console.log(`Affiliate commission ${commission} added for affiliate ${affiliate.id}`);
        }
      } catch (affError) {
        console.error("Affiliate commission error:", affError);
        // لا نفشل الطلب بسبب خطأ في العمولة
      }
    }

    // ============================================================
    // 12. إرجاع النتيجة
    // ============================================================
    return new Response(
      JSON.stringify({
        success: true,
        message: "تم تأكيد الدفع وتسليم الطلب بنجاح",
        delivered_items: deliveredCount,
        order_id: order_id,
        order_number: order.order_number,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Complete payment error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
