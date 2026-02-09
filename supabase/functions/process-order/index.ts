import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // External database credentials
    const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("VITE_EXTERNAL_SUPABASE_URL") || "";
    const extAnonKey = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") || Deno.env.get("VITE_EXTERNAL_SUPABASE_ANON_KEY") || "";
    const extServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!extUrl || !extAnonKey || !extServiceKey) {
      console.error("External DB not configured");
      return new Response(JSON.stringify({ error: "Database not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user with EXTERNAL database (where the token was issued)
    const userClient = createClient(extUrl, extAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    
    if (userError || !userData?.user) {
      console.error("Auth failed:", userError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;
    const db = createClient(extUrl, extServiceKey);
    const { items, payment_method, wallet_topup, topup_amount } = await req.json();

    // Wallet top-up
    if (wallet_topup && topup_amount > 0) {
      const orderNum = `TOP-${Date.now()}`;
      const { data: order } = await db.from("orders").insert({
        user_id: userId, total_amount: topup_amount, payment_method: "wallet_topup",
        payment_status: "pending", status: "pending", order_number: orderNum,
      }).select().single();
      return new Response(JSON.stringify({ success: true, order: { id: order?.id, order_number: order?.order_number }, wallet_topup: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!items?.length) {
      return new Response(JSON.stringify({ error: "No items" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let total = 0;
    const now = new Date().toISOString();
    const orderItems: any[] = [];

    for (const item of items) {
      const { data: prod } = await db.from("products").select("*").eq("id", item.product_id).single();
      if (!prod?.is_active) continue;

      let price = prod.price;
      const variantId = item.variant_id || null;

      let isUnlimited = false;
      if (variantId) {
        const { data: v } = await db.from("product_variants").select("price, is_active, is_unlimited").eq("id", variantId).single();
        if (v?.is_active) {
          price = v.price;
          isUnlimited = v.is_unlimited === true;
        }
      }

      // Flash sale
      let fsQ = db.from("flash_sales").select("sale_price, max_quantity, sold_quantity")
        .eq("product_id", item.product_id).eq("is_active", true).lte("starts_at", now).gt("ends_at", now);
      fsQ = variantId ? fsQ.eq("variant_id", variantId) : fsQ.is("variant_id", null);
      const { data: fs } = await fsQ.maybeSingle();
      if (fs && (fs.max_quantity === null || (fs.sold_quantity || 0) + item.quantity <= fs.max_quantity)) {
        price = fs.sale_price;
        console.log("Flash sale price:", price);
      }

      // Stock check - skip for unlimited variants
      if (prod.product_type === "account" && !isUnlimited) {
        let stQ = db.from("product_accounts").select("id").eq("product_id", item.product_id).eq("is_sold", false);
        stQ = variantId ? stQ.eq("variant_id", variantId) : stQ.is("variant_id", null);
        const { data: accs } = await stQ.limit(item.quantity);
        if (!accs || accs.length < item.quantity) {
          return new Response(JSON.stringify({ error: "Not enough stock" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      orderItems.push({ product_id: item.product_id, variant_id: variantId, quantity: item.quantity, price, product_type: prod.product_type, is_unlimited: isUnlimited });
      total += price * item.quantity;
    }

    // Wallet balance
    if (payment_method === "wallet") {
      const { data: w } = await db.from("wallets").select("balance").eq("user_id", userId).single();
      if (!w || w.balance < total) {
        return new Response(JSON.stringify({ error: "Insufficient balance" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Create order
    const orderNum = `ORD-${Date.now()}`;
    const { data: order, error: orderErr } = await db.from("orders").insert({
      user_id: userId, total_amount: total, payment_method,
      payment_status: payment_method === "wallet" ? "completed" : "pending",
      status: payment_method === "wallet" ? "processing" : "pending",
      order_number: orderNum,
    }).select().single();

    if (orderErr) {
      console.error("Order error:", orderErr);
      return new Response(JSON.stringify({ error: "Failed to create order" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Order items
    const createdItems: any[] = [];
    for (const oi of orderItems) {
      const { data: created, error: itemErr } = await db.from("order_items").insert({
        order_id: order.id, product_id: oi.product_id, variant_id: oi.variant_id, quantity: oi.quantity, price: oi.price,
      }).select("id").single();
      
      if (itemErr) {
        console.error("Order item insert error:", itemErr.message);
        // Fallback: try without variant_id (column might not exist in external DB)
        const { data: createdFallback } = await db.from("order_items").insert({
          order_id: order.id, product_id: oi.product_id, quantity: oi.quantity, price: oi.price,
        }).select("id").single();
        if (createdFallback) createdItems.push({ ...oi, id: createdFallback.id });
      } else if (created) {
        createdItems.push({ ...oi, id: created.id });
      }
    }

    console.log(`Created ${createdItems.length} order items for order ${order.id}`);

    // Wallet payment - deliver accounts immediately
    if (payment_method === "wallet") {
      const { data: w } = await db.from("wallets").select("id, balance").eq("user_id", userId).single();
      if (w) {
        await db.from("wallets").update({ balance: w.balance - total }).eq("id", w.id);
        await db.from("wallet_transactions").insert({
          wallet_id: w.id, type: "purchase", amount: -total,
          description: `طلب ${order.order_number}`, reference_id: order.id, status: "completed",
        });
      }

      // Deliver accounts
      let deliveredCount = 0;
      for (const ci of createdItems) {
        if (ci.product_type !== "account") {
          deliveredCount++; // Non-account items are "delivered" by default
          continue;
        }

        // For unlimited variants: pick any account (even sold ones) as a template, don't mark as sold
        // For regular variants: pick unsold account and mark as sold
        let aQ;
        if (ci.is_unlimited) {
          aQ = db.from("product_accounts").select("id, account_data").eq("product_id", ci.product_id);
          aQ = ci.variant_id ? aQ.eq("variant_id", ci.variant_id) : aQ.is("variant_id", null);
        } else {
          aQ = db.from("product_accounts").select("id, account_data").eq("product_id", ci.product_id).eq("is_sold", false);
          aQ = ci.variant_id ? aQ.eq("variant_id", ci.variant_id) : aQ.is("variant_id", null);
        }
        
        const { data: acc, error: accErr } = await aQ.limit(1).maybeSingle();
        
        if (accErr) {
          console.error(`Error fetching account for product ${ci.product_id}:`, accErr.message);
          continue;
        }
        
        if (acc) {
          // Only mark as sold for non-unlimited products
          if (!ci.is_unlimited) {
            const { error: soldErr } = await db.from("product_accounts").update({ is_sold: true, sold_at: now }).eq("id", acc.id);
            if (soldErr) {
              console.error(`Error marking account ${acc.id} as sold:`, soldErr.message);
              continue;
            }
          }

          const { error: deliverErr } = await db.from("order_items").update({ 
            product_account_id: acc.id, 
            delivered_data: acc.account_data 
          }).eq("id", ci.id);
          
          if (deliverErr) {
            console.error(`Error updating order item ${ci.id} with delivery data:`, deliverErr.message);
          } else {
            deliveredCount++;
            console.log(`✅ Delivered account ${acc.id} to order item ${ci.id} (unlimited: ${ci.is_unlimited})`);
          }
        } else {
          console.error(`❌ No available account found for product ${ci.product_id}, variant ${ci.variant_id}`);
        }
      }

      console.log(`Delivery: ${deliveredCount}/${createdItems.length} items delivered`);

      // Update sales counts
      for (const oi of orderItems) {
        const { data: p } = await db.from("products").select("sales_count").eq("id", oi.product_id).single();
        if (p) await db.from("products").update({ sales_count: (p.sales_count || 0) + oi.quantity }).eq("id", oi.product_id);

        let fsQ = db.from("flash_sales").select("id, sold_quantity")
          .eq("product_id", oi.product_id).eq("is_active", true).lte("starts_at", now).gt("ends_at", now);
        fsQ = oi.variant_id ? fsQ.eq("variant_id", oi.variant_id) : fsQ.is("variant_id", null);
        const { data: fs } = await fsQ.maybeSingle();
        if (fs) await db.from("flash_sales").update({ sold_quantity: (fs.sold_quantity || 0) + oi.quantity }).eq("id", fs.id);
      }

      // Only mark as completed if ALL items were delivered
      if (deliveredCount === createdItems.length && createdItems.length > 0) {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 7);
        await db.from("orders").update({ 
          status: "completed", 
          payment_status: "paid", 
          warranty_expires_at: expiry.toISOString() 
        }).eq("id", order.id);
        console.log(`✅ Order ${order.id} marked as completed`);
      } else {
        // Keep as "processing" so complete-payment can retry delivery
        console.log(`⚠️ Order ${order.id} kept as processing - ${deliveredCount}/${createdItems.length} delivered`);
        await db.from("orders").update({ 
          payment_status: "paid" 
        }).eq("id", order.id);
      }
    }

    return new Response(JSON.stringify({ success: true, order: { id: order.id, order_number: order.order_number } }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: e.message || "Error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
