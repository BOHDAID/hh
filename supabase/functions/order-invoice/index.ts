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
      console.log("order-invoice external host:", host);
    } catch {
      console.log("order-invoice externalUrl is not a valid URL");
    }

    // Validate user token against external auth
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
    const userId = userData.user.id;

    // Admin client to bypass RLS for reading order data
    const adminClient = createClient(externalUrl, externalServiceKey);

    const { order_id }: OrderInvoiceRequest = await req.json();

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: "Order ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get order first - use flexible query that handles missing columns
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

    // Get order items separately - handle missing delivered_data column gracefully
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
          ),
          product_accounts:product_account_id (
            variant_id,
            product_variants:variant_id (
              name,
              name_en,
              warranty_days
            )
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

    // For items without product_accounts (unlimited/activation products),
    // try to find the matching variant by product_id + price
    for (let i = 0; i < orderItems.length; i++) {
      const item = orderItems[i];
      const hasVariantInfo = item.product_accounts?.product_variants?.warranty_days != null;
      
      if (!hasVariantInfo) {
        try {
          const { data: matchingVariant } = await adminClient
            .from("product_variants")
            .select("name, name_en, warranty_days")
            .eq("product_id", item.product_id)
            .eq("price", item.price)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();

          if (matchingVariant) {
            orderItems[i] = {
              ...item,
              product_accounts: {
                variant_id: null,
                product_variants: matchingVariant,
              },
            };
          } else {
            // If no price match, get the first active variant for this product
            const { data: firstVariant } = await adminClient
              .from("product_variants")
              .select("name, name_en, warranty_days")
              .eq("product_id", item.product_id)
              .eq("is_active", true)
              .order("display_order", { ascending: true })
              .limit(1)
              .maybeSingle();

            if (firstVariant) {
              orderItems[i] = {
                ...item,
                product_accounts: {
                  variant_id: null,
                  product_variants: firstVariant,
                },
              };
            }
          }
        } catch (e) {
          console.warn("Failed to find variant for item:", item.id, e);
        }
      }
    }

    // Attach order_items to order object
    const orderWithItems = { ...order, order_items: orderItems };

    // Remove user_id from response (not needed by frontend)
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
