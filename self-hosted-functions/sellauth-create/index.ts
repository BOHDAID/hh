import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * نسخة Self-Hosted - SellAuth Create Invoice
 * إنشاء فاتورة دفع عبر SellAuth API
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ success: false, error: message }, status);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    // Validate JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Unauthorized", 401);
    }

    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("sellauth-create: Missing Supabase config");
      return errorResponse("Server configuration error", 500);
    }

    // Validate user session
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      console.error("sellauth-create: Auth error", authError);
      return errorResponse("Invalid session", 401);
    }

    // Parse request body
    const { order_id, amount, currency = "USD" } = await req.json();

    if (!order_id || !amount) {
      return errorResponse("Missing order_id or amount");
    }

    // Admin client to read settings
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get SellAuth settings
    const { data: settings, error: settingsError } = await adminClient
      .from("site_settings")
      .select("key, value")
      .in("key", ["sellauth_api_key", "sellauth_shop_id"]);

    if (settingsError || !settings) {
      console.error("sellauth-create: Settings error", settingsError);
      return errorResponse("Failed to load SellAuth settings", 500);
    }

    let apiKey = "";
    let shopId = "";

    for (const s of settings) {
      if (s.key === "sellauth_api_key") apiKey = s.value || "";
      if (s.key === "sellauth_shop_id") shopId = s.value || "";
    }

    if (!apiKey || !shopId) {
      return errorResponse("SellAuth not configured", 400);
    }

    // Get order details
    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select("id, order_number, total_amount, user_id")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return errorResponse("Order not found", 404);
    }

    // Verify order belongs to user
    if (order.user_id !== user.id) {
      return errorResponse("Unauthorized access to order", 403);
    }

    // Get site URL for callbacks
    const siteUrl = Deno.env.get("SITE_URL") || "https://your-site.com";
    const functionUrl = `${supabaseUrl}/functions/v1`;

    // Create SellAuth invoice
    const invoicePayload = {
      shop_id: shopId,
      amount: parseFloat(amount.toFixed(2)),
      currency: currency.toUpperCase(),
      order_id: order_id,
      description: `Order ${order.order_number}`,
      return_url: `${siteUrl}/order/${order_id}`,
      callback_url: `${functionUrl}/sellauth-webhook`,
      metadata: {
        internal_order_id: order_id,
        order_number: order.order_number,
        user_id: user.id,
      },
    };

    console.log("sellauth-create: Creating invoice", { order_id, amount });

    const sellAuthRes = await fetch("https://api.sellauth.com/v1/invoices", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(invoicePayload),
    });

    const sellAuthData = await sellAuthRes.json();

    if (!sellAuthRes.ok || !sellAuthData.success) {
      console.error("sellauth-create: SellAuth API error", sellAuthData);
      return errorResponse(sellAuthData.message || "Failed to create invoice", 500);
    }

    // Update order with payment info
    await adminClient
      .from("orders")
      .update({
        payment_method: "sellauth",
        payment_status: "pending",
      })
      .eq("id", order_id);

    console.log("sellauth-create: Invoice created", sellAuthData.data?.url);

    return jsonResponse({
      success: true,
      payment_url: sellAuthData.data?.url || sellAuthData.url,
      invoice_id: sellAuthData.data?.id || sellAuthData.id,
    });

  } catch (error) {
    console.error("sellauth-create: Error", error);
    return errorResponse(error instanceof Error ? error.message : "Internal error", 500);
  }
});
