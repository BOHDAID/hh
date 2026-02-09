// ============================================================
// order-invoice - Standalone for External Supabase
// يستخدم SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY القياسية
// ============================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface OrderInvoiceRequest {
  order_id: string;
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

    // Standard Supabase environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured");
    }

    console.log("order-invoice host:", new URL(supabaseUrl).host);

    // Validate user token
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", details: userError?.message }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const userId = userData.user.id;

    // Admin client to bypass RLS
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { order_id }: OrderInvoiceRequest = await req.json();

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: "Order ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get order - handle missing columns gracefully
    // deno-lint-ignore no-explicit-any
    let order: any = null;
    let orderError: Error | null = null;

    // Try with warranty_expires_at first
    const { data: orderFull, error: errFull } = await adminClient
      .from("orders")
      .select(`
        id,
        order_number,
        total_amount,
        status,
        payment_status,
        payment_method,
        warranty_expires_at,
        created_at,
        user_id
      `)
      .eq("id", order_id)
      .single();

    if (!errFull && orderFull) {
      order = orderFull;
    } else if (errFull?.message?.includes("warranty_expires_at")) {
      // Fallback without warranty_expires_at
      console.log("warranty_expires_at column not found, fetching without it");
      const { data: orderBasic, error: errBasic } = await adminClient
        .from("orders")
        .select(`
          id,
          order_number,
          total_amount,
          status,
          payment_status,
          payment_method,
          created_at,
          user_id
        `)
        .eq("id", order_id)
        .single();

      if (errBasic) {
        orderError = errBasic;
      } else {
        order = { ...orderBasic, warranty_expires_at: null };
      }
    } else {
      orderError = errFull;
    }

    if (orderError || !order) {
      console.error("Order not found:", orderError);
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only the owner should be able to view their order
    if (order.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get order items - handle missing delivered_data column
    // deno-lint-ignore no-explicit-any
    let orderItems: any[] = [];

    try {
      // Try with delivered_data first
      const { data: itemsWithDelivered, error: itemsError1 } = await adminClient
        .from("order_items")
        .select(`
          id,
          product_id,
          quantity,
          price,
          delivered_data,
          product_account_id,
          products (
            name,
            image_url,
            product_type,
            warranty_days
          )
        `)
        .eq("order_id", order_id);

      if (!itemsError1 && itemsWithDelivered) {
        orderItems = itemsWithDelivered;
      } else if (itemsError1?.message?.includes("delivered_data")) {
        // Fallback without delivered_data column
        console.log("delivered_data column not found, fetching without it");
        const { data: itemsBasic, error: itemsError2 } = await adminClient
          .from("order_items")
          .select(`
            id,
            product_id,
            quantity,
            price,
            product_account_id,
            products (
              name,
              image_url,
              product_type,
              warranty_days
            )
          `)
          .eq("order_id", order_id);

        if (!itemsError2 && itemsBasic) {
          orderItems = itemsBasic.map(item => ({ ...item, delivered_data: null }));
        }
      }
    } catch (e) {
      console.error("Error fetching order items:", e);
    }

    // Attach order_items to order object
    const orderWithItems = { ...order, order_items: orderItems };

    // Remove user_id from response
    const { user_id: _, ...orderWithoutUserId } = orderWithItems;

    return new Response(
      JSON.stringify({
        success: true,
        order: orderWithoutUserId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Order invoice error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
