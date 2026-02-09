import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * SellAuth Create Checkout Session
 * إنشاء جلسة دفع عبر SellAuth API v1
 * يتصل بالسيرفر الخارجي للتحقق من المستخدم والإعدادات
 * 
 * متطلبات SellAuth:
 * - يجب إنشاء منتج في لوحة تحكم SellAuth مع سعر $1 (دولار واحد)
 * - نستخدم quantity لتحديد المبلغ الإجمالي (مثال: $50 = 50 وحدة من منتج $1)
 * - يجب حفظ sellauth_product_id و sellauth_variant_id في الإعدادات
 * - المبلغ الحقيقي يتم حفظه في metadata.original_amount
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

    const token = authHeader.replace("Bearer ", "");

    // استخدام Supabase الخارجي للتحقق من المستخدم وقراءة الإعدادات
    const externalUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("VITE_EXTERNAL_SUPABASE_URL");
    const externalServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
    const externalAnonKey = Deno.env.get("VITE_EXTERNAL_SUPABASE_ANON_KEY");

    if (!externalUrl || !externalServiceKey || !externalAnonKey) {
      console.error("sellauth-create: Missing External Supabase config", {
        hasUrl: !!externalUrl,
        hasServiceKey: !!externalServiceKey,
        hasAnonKey: !!externalAnonKey
      });
      return errorResponse("Server configuration error", 500);
    }

    console.log("sellauth-create: Connecting to external DB:", externalUrl);

    // Validate user session using external Supabase
    const userClient = createClient(externalUrl, externalAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      console.error("sellauth-create: Auth error", authError);
      return errorResponse("Invalid session", 401);
    }

    console.log("sellauth-create: User authenticated:", user.id);

    // Parse request body
    const { order_id, amount, currency = "USD" } = await req.json();

    if (!order_id || !amount) {
      return errorResponse("Missing order_id or amount");
    }

    // Admin client to read settings from external DB
    const adminClient = createClient(externalUrl, externalServiceKey);

    // Get SellAuth settings - now including product_id and variant_id
    const { data: settings, error: settingsError } = await adminClient
      .from("site_settings")
      .select("key, value")
      .in("key", ["sellauth_api_key", "sellauth_shop_id", "sellauth_product_id", "sellauth_variant_id"]);

    if (settingsError || !settings) {
      console.error("sellauth-create: Settings error", settingsError);
      return errorResponse("Failed to load SellAuth settings", 500);
    }

    let apiKey = "";
    let shopId = "";
    let productId = "";
    let variantId = "";

    for (const s of settings) {
      if (s.key === "sellauth_api_key") apiKey = s.value || "";
      if (s.key === "sellauth_shop_id") shopId = s.value || "";
      if (s.key === "sellauth_product_id") productId = s.value || "";
      if (s.key === "sellauth_variant_id") variantId = s.value || "";
    }

    if (!apiKey || !shopId) {
      console.error("sellauth-create: Missing API key or Shop ID");
      return errorResponse("SellAuth not configured", 400);
    }

    // Product ID and Variant ID are required for checkout
    if (!productId || !variantId) {
      console.error("sellauth-create: Missing Product ID or Variant ID. Please create a product in SellAuth dashboard with price $0.01 and save its IDs in settings.");
      return errorResponse("SellAuth product not configured. Please set sellauth_product_id and sellauth_variant_id in admin settings.", 400);
    }

    console.log("sellauth-create: SellAuth configured with shop:", shopId, "product:", productId, "variant:", variantId);

    // Get order details from external DB
    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select("id, order_number, total_amount, user_id")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      console.error("sellauth-create: Order not found", orderError);
      return errorResponse("Order not found", 404);
    }

    // Verify order belongs to user
    if (order.user_id !== user.id) {
      return errorResponse("Unauthorized access to order", 403);
    }

    // Get site URL for callbacks
    const siteUrl = Deno.env.get("SITE_URL") || "https://your-site.com";
    // Use Lovable Cloud URL for webhook (this function is hosted on Cloud)
    const cloudUrl = Deno.env.get("SUPABASE_URL");
    const webhookUrl = cloudUrl ? `${cloudUrl}/functions/v1/sellauth-webhook` : `${externalUrl}/functions/v1/sellauth-webhook`;

    // Calculate quantity based on amount
    // Product price should be $1, so quantity = amount (rounded up)
    // Example: $50.50 = 51 units of $1 product
    const quantity = Math.ceil(parseFloat(Number(amount).toFixed(2)));
    const actualAmount = parseFloat(Number(amount).toFixed(2));

    // Build cart for SellAuth Checkout API
    const cart = [
      {
        productId: parseInt(productId),
        variantId: parseInt(variantId),
        quantity: quantity,
      }
    ];

    // SellAuth requires metadata as an array of strings
    const metadataArray = [
      `internal_order_id:${order_id}`,
      `order_number:${order.order_number}`,
      `user_id:${user.id}`,
      `original_amount:${actualAmount}`,
      `quantity_units:${quantity}`,
    ];

    const checkoutPayload = {
      cart: cart,
      email: user.email,
      return_url: `${siteUrl}/my-orders`,
      webhook_url: webhookUrl,
      metadata: metadataArray,
    };

    console.log("sellauth-create: Creating checkout session", JSON.stringify(checkoutPayload));

    // SellAuth API v1 - Create Checkout Session
    // https://docs.sellauth.com/api-documentation/checkout
    const sellAuthRes = await fetch(`https://api.sellauth.com/v1/shops/${shopId}/checkout`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(checkoutPayload),
    });

    // Check content type before parsing
    const contentType = sellAuthRes.headers.get("content-type") || "";
    let sellAuthData: any;

    if (contentType.includes("application/json")) {
      sellAuthData = await sellAuthRes.json();
    } else {
      // API returned non-JSON (possibly HTML error page)
      const text = await sellAuthRes.text();
      console.error("sellauth-create: Non-JSON response from SellAuth:", text.substring(0, 500));
      return errorResponse("SellAuth API returned an unexpected response", 500);
    }

    console.log("sellauth-create: SellAuth API response", sellAuthRes.status, JSON.stringify(sellAuthData));

    if (!sellAuthRes.ok) {
      console.error("sellauth-create: SellAuth API error", sellAuthData);
      return errorResponse(sellAuthData.message || sellAuthData.error || "Failed to create checkout session", 500);
    }

    // Update order with payment info
    await adminClient
      .from("orders")
      .update({
        payment_method: "sellauth",
        payment_status: "pending",
      })
      .eq("id", order_id);

    // SellAuth returns the invoice URL in the response
    // Response format: { success: true, invoice_id: 632, invoice_url: "https://sellauth.com/..." }
    const paymentUrl = sellAuthData.invoice_url || sellAuthData.data?.invoice_url || sellAuthData.url;
    const invoiceId = sellAuthData.invoice_id || sellAuthData.data?.invoice_id || sellAuthData.id;
    
    if (!paymentUrl) {
      console.error("sellauth-create: No payment URL in response", sellAuthData);
      return errorResponse("Failed to get payment URL from SellAuth", 500);
    }

    console.log("sellauth-create: Checkout created, URL:", paymentUrl, "Invoice ID:", invoiceId);

    return jsonResponse({
      success: true,
      payment_url: paymentUrl,
      invoice_id: invoiceId,
    });

  } catch (error) {
    console.error("sellauth-create: Error", error);
    return errorResponse(error instanceof Error ? error.message : "Internal error", 500);
  }
});
