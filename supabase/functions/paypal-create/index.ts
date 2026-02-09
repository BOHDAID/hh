import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ==================== Standalone security helpers (no local imports) ====================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "default-src 'none'",
};

const allHeaders = {
  ...corsHeaders,
  ...securityHeaders,
  "Content-Type": "application/json",
};

function errorResponse(message: string, status: number = 400): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: allHeaders });
}

function successResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: allHeaders });
}

function isValidUUID(uuid: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return typeof uuid === "string" && uuidRegex.test(uuid);
}

function isValidAmount(amount: number): boolean {
  return typeof amount === "number" && amount > 0 && amount < 1_000_000;
}

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
function checkRateLimit(identifier: string, maxRequests = 10, windowMs = 60000): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);
  if (!record || now > record.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }
  if (record.count >= maxRequests) return false;
  record.count++;
  return true;
}

function getClientIP(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

interface CreatePaymentRequest {
  order_id: string;
  amount: number;
  currency?: string;
}

async function getPayPalAccessToken(clientId: string, clientSecret: string, isSandbox: boolean): Promise<string> {
  const baseUrl = isSandbox 
    ? "https://api-m.sandbox.paypal.com" 
    : "https://api-m.paypal.com";

  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: "grant_type=client_credentials",
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || "Failed to get PayPal access token");
  }

  return data.access_token;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting
    const clientIP = getClientIP(req);
    if (!checkRateLimit(`paypal:${clientIP}`, 5, 60000)) {
      return errorResponse("Too many requests. Please try again later.", 429);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Unauthorized", 401);
    }

    // Use EXTERNAL Supabase for auth validation (tokens are issued by external DB)
    const externalUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("VITE_EXTERNAL_SUPABASE_URL");
    const externalServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
    const externalAnonKey = Deno.env.get("VITE_EXTERNAL_SUPABASE_ANON_KEY");

    if (!externalUrl || !externalServiceKey || !externalAnonKey) {
      console.error("External database not configured");
      return errorResponse("Server configuration error", 500);
    }

    // Validate token against EXTERNAL Supabase (where it was issued)
    const userClient = createClient(externalUrl, externalAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();

    if (userError || !userData?.user) {
      console.error("Auth error:", userError);
      return errorResponse("Unauthorized", 401);
    }

    const userId = userData.user.id;
    const adminClient = createClient(externalUrl, externalServiceKey);

    // Get PayPal settings
    const { data: settings } = await adminClient
      .from("site_settings")
      .select("key, value")
      .in("key", ["paypal_client_id", "paypal_client_secret", "paypal_mode"]);

    const settingsMap: Record<string, string> = {};
    settings?.forEach((s) => {
      settingsMap[s.key] = s.value || "";
    });

    if (!settingsMap.paypal_client_id || !settingsMap.paypal_client_secret) {
      return errorResponse("PayPal not configured");
    }

    const body = await req.json();
    const { order_id, amount, currency = "USD" }: CreatePaymentRequest = body;

    // Input validation
    if (!order_id || !isValidUUID(order_id)) {
      return errorResponse("Invalid order ID");
    }

    if (!amount || !isValidAmount(amount)) {
      return errorResponse("Invalid amount");
    }

    // Note: Minimum amount validation for wallet top-ups is handled on the frontend
    // Regular product purchases can be any valid amount

    // Verify order belongs to user
    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .eq("user_id", userId)
      .single();

    if (orderError || !order) {
      return errorResponse("Order not found", 404);
    }

    const isSandbox = settingsMap.paypal_mode !== "live";
    const baseUrl = isSandbox 
      ? "https://api-m.sandbox.paypal.com" 
      : "https://api-m.paypal.com";

    // Get access token
    const accessToken = await getPayPalAccessToken(
      settingsMap.paypal_client_id,
      settingsMap.paypal_client_secret,
      isSandbox
    );

    const origin = req.headers.get("origin") || "";

    // Create PayPal order
    const createOrderResponse = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: order_id,
            description: `Order ${order.order_number}`,
            amount: {
              currency_code: currency,
              value: amount.toFixed(2),
            },
          },
        ],
        application_context: {
          return_url: `${origin}/order/${order_id}?paypal=success`,
          cancel_url: `${origin}/checkout/${order_id}?paypal=cancelled`,
          brand_name: "Digital Store",
          user_action: "PAY_NOW",
        },
      }),
    });

    const paypalOrder = await createOrderResponse.json();

    // Log payment attempt in payments table
    await adminClient.from("payments").insert({
      user_id: userId,
      order_id: order_id,
      payment_method: "paypal",
      amount: amount,
      currency: currency,
      status: createOrderResponse.ok ? "pending" : "failed",
      provider_payment_id: paypalOrder.id || null,
      provider_response: paypalOrder,
      error_message: !createOrderResponse.ok ? (paypalOrder.message || "Payment creation failed") : null,
    });

    if (!createOrderResponse.ok) {
      console.error("PayPal error:", paypalOrder);
      return errorResponse(paypalOrder.message || "Payment creation failed");
    }

    // Update order with PayPal order ID
    await adminClient
      .from("orders")
      .update({ 
        payment_method: "paypal",
        payment_status: "awaiting_payment",
      })
      .eq("id", order_id);

    // Find approval URL
    const approvalUrl = paypalOrder.links?.find((link: any) => link.rel === "approve")?.href;

    return successResponse({
      success: true,
      paypal_order_id: paypalOrder.id,
      approval_url: approvalUrl,
    });
  } catch (error) {
    console.error("PayPal create error:", error);
    return errorResponse(error instanceof Error ? error.message : "Unknown error", 500);
  }
});
