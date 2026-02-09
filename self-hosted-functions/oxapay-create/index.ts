import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * نسخة Self-Hosted - للنشر على Supabase الخارجي
 * OxaPay Payment Creation
 * Creates a payment invoice via OxaPay API
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Create client with user's token for auth validation
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getUser(token);
    
    if (claimsError || !claimsData?.user) {
      console.error("oxapay-create: Auth error", claimsError);
      return errorResponse("Unauthorized", 401);
    }

    const userId = claimsData.user.id;

    // Parse request body
    const body = await req.json();
    const { order_id, amount, currency = "USD" } = body;

    if (!order_id || !amount) {
      return errorResponse("Missing order_id or amount");
    }

    // OxaPay has a minimum amount of $1
    const OXAPAY_MIN_AMOUNT = 1;
    if (parseFloat(amount) < OXAPAY_MIN_AMOUNT) {
      return errorResponse(`Minimum payment amount for OxaPay is $${OXAPAY_MIN_AMOUNT}. Your order is $${parseFloat(amount).toFixed(2)}.`);
    }

    console.log("oxapay-create: Creating payment for order", order_id, "amount", amount);

    // Create admin client for DB operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get OxaPay API key from settings
    const { data: settings, error: settingsError } = await adminClient
      .from("site_settings")
      .select("key, value")
      .eq("key", "oxapay_merchant_api_key")
      .single();

    if (settingsError || !settings?.value) {
      console.error("oxapay-create: OxaPay not configured", settingsError);
      return errorResponse("OxaPay not configured", 500);
    }

    const merchantApiKey = settings.value;

    // Verify order exists and belongs to user
    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select("id, order_number, total_amount, user_id, status")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      console.error("oxapay-create: Order not found", orderError);
      return errorResponse("Order not found", 404);
    }

    if (order.user_id !== userId) {
      return errorResponse("Unauthorized access to order", 403);
    }

    if (order.status === "completed") {
      return errorResponse("Order already completed", 400);
    }

    // Get callback URL (for redirecting user after payment)
    const { data: siteSettings } = await adminClient
      .from("site_settings")
      .select("key, value")
      .eq("key", "site_url")
      .single();

    const siteUrl = siteSettings?.value || "https://your-site.com";
    const callbackUrl = `${siteUrl}/order/${order_id}`;

    // Create OxaPay invoice
    // API Docs: https://docs.oxapay.com/api-reference/creating-invoice
    const oxaPayPayload = {
      merchant: merchantApiKey,
      amount: parseFloat(amount).toFixed(2),
      currency: currency,
      orderId: order.order_number,
      description: `Order ${order.order_number}`,
      callbackUrl: callbackUrl,
      returnUrl: callbackUrl,
      email: claimsData.user.email || "",
    };

    console.log("oxapay-create: Calling OxaPay API");

    const oxaPayResponse = await fetch("https://api.oxapay.com/merchants/request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(oxaPayPayload),
    });

    const oxaPayResult = await oxaPayResponse.json();

    console.log("oxapay-create: OxaPay response", oxaPayResult);

    if (oxaPayResult.result !== 100 || !oxaPayResult.payLink) {
      console.error("oxapay-create: OxaPay error", oxaPayResult);
      return errorResponse(oxaPayResult.message || "Failed to create OxaPay payment", 500);
    }

    // Update order with OxaPay track ID
    await adminClient
      .from("orders")
      .update({
        payment_method: "oxapay",
        payment_status: "pending",
        payment_address: oxaPayResult.trackId,
      })
      .eq("id", order_id);

    console.log("oxapay-create: Payment created successfully, trackId:", oxaPayResult.trackId);

    return jsonResponse({
      success: true,
      payment_url: oxaPayResult.payLink,
      track_id: oxaPayResult.trackId,
    });

  } catch (error) {
    console.error("oxapay-create: Unexpected error", error);
    return errorResponse("Internal server error", 500);
  }
});
