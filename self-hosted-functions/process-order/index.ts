import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * نسخة Self-Hosted - للنشر على Supabase الخارجي
 * process-order: معالجة الطلبات الجديدة
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OrderItem {
  product_id: string;
  quantity: number;
  variant_id?: string | null;
}

interface ProcessOrderRequest {
  items: OrderItem[];
  payment_method: "wallet" | "manual";
  wallet_topup?: boolean;
  topup_amount?: number;
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Backend not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const body: ProcessOrderRequest = await req.json();
    const { items, payment_method, wallet_topup, topup_amount } = body;

    // Handle wallet top-up
    if (wallet_topup && topup_amount) {
      if (topup_amount < 1) {
        return new Response(JSON.stringify({ error: "Minimum top-up amount is $1" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const randomSuffix = Math.random().toString(36).substring(2, 10).toUpperCase();
      const orderNumber = `TOP-${dateStr}-${randomSuffix}`;

      const { data: order, error: orderError } = await adminClient
        .from("orders")
        .insert({
          user_id: userId,
          total_amount: topup_amount,
          payment_method: "wallet_topup",
          payment_status: "pending",
          status: "pending",
          order_number: orderNumber,
        })
        .select()
        .single();

      if (orderError || !order) {
        return new Response(JSON.stringify({ error: "Failed to create top-up order" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ success: true, order: { id: order.id, order_number: order.order_number }, wallet_topup: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ error: "No items in order" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process items
    let totalAmount = 0;
    const orderItems: Array<{
      product_id: string;
      variant_id: string | null;
      quantity: number;
      price: number;
      product_type: string;
    }> = [];

    const now = new Date().toISOString();

    for (const item of items) {
      const { data: product } = await adminClient
        .from("products")
        .select("id, name, price, product_type, is_active")
        .eq("id", item.product_id)
        .single();

      if (!product || !product.is_active) {
        return new Response(JSON.stringify({ error: `Product not found: ${item.product_id}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let unitPrice = product.price;
      const variantId = item.variant_id ?? null;

      // Get variant price if specified
      if (variantId) {
        const { data: variant } = await adminClient
          .from("product_variants")
          .select("id, price, is_active")
          .eq("id", variantId)
          .single();

        if (variant?.is_active) {
          unitPrice = Number(variant.price);
        }
      }

      // Check for flash sale
      let flashQuery = adminClient
        .from("flash_sales")
        .select("sale_price, max_quantity, sold_quantity")
        .eq("product_id", item.product_id)
        .eq("is_active", true)
        .lte("starts_at", now)
        .gt("ends_at", now);

      flashQuery = variantId ? flashQuery.eq("variant_id", variantId) : flashQuery.is("variant_id", null);
      const { data: flashSale } = await flashQuery.maybeSingle();

      if (flashSale) {
        const maxQty = flashSale.max_quantity;
        const soldQty = flashSale.sold_quantity ?? 0;
        if (maxQty === null || soldQty + item.quantity <= maxQty) {
          unitPrice = Number(flashSale.sale_price);
          console.log("Flash sale price applied:", unitPrice);
        }
      }

      // Check stock for account products
      if (product.product_type === "account") {
        let stockQuery = adminClient
          .from("product_accounts")
          .select("id")
          .eq("product_id", item.product_id)
          .eq("is_sold", false);

        stockQuery = variantId ? stockQuery.eq("variant_id", variantId) : stockQuery.is("variant_id", null);
        const { data: accounts } = await stockQuery.limit(item.quantity);

        if (!accounts || accounts.length < item.quantity) {
          return new Response(
            JSON.stringify({ error: `Not enough stock for: ${product.name}`, available: accounts?.length || 0 }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      orderItems.push({
        product_id: item.product_id,
        variant_id: variantId,
        quantity: item.quantity,
        price: unitPrice,
        product_type: product.product_type,
      });

      totalAmount += unitPrice * item.quantity;
    }

    // Check wallet balance
    if (payment_method === "wallet") {
      const { data: wallet } = await adminClient.from("wallets").select("balance").eq("user_id", userId).single();
      if (!wallet || wallet.balance < totalAmount) {
        return new Response(
          JSON.stringify({ error: "Insufficient wallet balance", required: totalAmount, current: wallet?.balance || 0 }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Create order
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomSuffix = Math.random().toString(36).substring(2, 10).toUpperCase();
    const orderNumber = `ORD-${dateStr}-${randomSuffix}`;

    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .insert({
        user_id: userId,
        total_amount: totalAmount,
        payment_method,
        payment_status: payment_method === "wallet" ? "completed" : "pending",
        status: payment_method === "wallet" ? "processing" : "pending",
        order_number: orderNumber,
      })
      .select()
      .single();

    if (orderError || !order) {
      console.error("Order creation error:", orderError);
      return new Response(JSON.stringify({ error: "Failed to create order" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create order items
    const createdItems: Array<{ id: string; product_id: string; variant_id: string | null; product_type: string; quantity: number }> = [];
    
    for (const item of orderItems) {
      const { data: oi, error: oiError } = await adminClient
        .from("order_items")
        .insert({
          order_id: order.id,
          product_id: item.product_id,
          variant_id: item.variant_id,
          quantity: item.quantity,
          price: item.price,
        })
        .select("id")
        .single();

      if (!oiError && oi) {
        createdItems.push({ id: oi.id, ...item });
      }
    }

    // Process wallet payment
    if (payment_method === "wallet") {
      const { data: wallet } = await adminClient.from("wallets").select("id, balance").eq("user_id", userId).single();
      
      if (wallet) {
        await adminClient.from("wallets").update({ balance: wallet.balance - totalAmount }).eq("id", wallet.id);
        await adminClient.from("wallet_transactions").insert({
          wallet_id: wallet.id,
          type: "purchase",
          amount: -totalAmount,
          description: `شراء طلب رقم ${order.order_number}`,
          reference_id: order.id,
          status: "completed",
        });
      }

      // Deliver accounts
      for (const oi of createdItems) {
        if (oi.product_type !== "account") continue;

        let accQuery = adminClient
          .from("product_accounts")
          .select("id, account_data, variant_id")
          .eq("product_id", oi.product_id)
          .eq("is_sold", false);

        accQuery = oi.variant_id ? accQuery.eq("variant_id", oi.variant_id) : accQuery.is("variant_id", null);
        const { data: account } = await accQuery.limit(1).single();

        if (account) {
          // Check if unlimited
          let isUnlimited = false;
          if (account.variant_id) {
            const { data: v } = await adminClient.from("product_variants").select("is_unlimited").eq("id", account.variant_id).single();
            isUnlimited = v?.is_unlimited === true;
          }

          if (!isUnlimited) {
            await adminClient.from("product_accounts").update({ is_sold: true, sold_at: now }).eq("id", account.id);
          }

          await adminClient.from("order_items").update({ product_account_id: account.id, delivered_data: account.account_data }).eq("id", oi.id);
        }
      }

      // Update sales count & flash sale sold_quantity
      for (const item of orderItems) {
        const { data: prod } = await adminClient.from("products").select("sales_count").eq("id", item.product_id).single();
        if (prod) {
          await adminClient.from("products").update({ sales_count: (prod.sales_count || 0) + item.quantity }).eq("id", item.product_id);
        }

        let fsQuery = adminClient
          .from("flash_sales")
          .select("id, sold_quantity")
          .eq("product_id", item.product_id)
          .eq("is_active", true)
          .lte("starts_at", now)
          .gt("ends_at", now);

        fsQuery = item.variant_id ? fsQuery.eq("variant_id", item.variant_id) : fsQuery.is("variant_id", null);
        const { data: fs } = await fsQuery.maybeSingle();

        if (fs) {
          await adminClient.from("flash_sales").update({ sold_quantity: (fs.sold_quantity || 0) + item.quantity }).eq("id", fs.id);
        }
      }

      // Complete order
      const warrantyExpiry = new Date();
      warrantyExpiry.setDate(warrantyExpiry.getDate() + 7);

      await adminClient.from("orders").update({
        status: "completed",
        payment_status: "paid",
        warranty_expires_at: warrantyExpiry.toISOString(),
      }).eq("id", order.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        order: { id: order.id, order_number: order.order_number },
        message: payment_method === "wallet" ? "تم إتمام الطلب بنجاح" : "تم إنشاء الطلب بنجاح",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Process order error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
