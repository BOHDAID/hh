import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHash } from "node:crypto";

// ==================== CORS & Security Headers ====================
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
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return typeof uuid === "string" && uuidRegex.test(uuid);
}

function isValidAmount(amount: number): boolean {
  return typeof amount === "number" && amount > 0 && amount < 1_000_000;
}

// Rate limiting
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

// Generate Cryptomus MD5 signature (hex) using Deno std hash (WebCrypto doesn't support MD5)
function generateSignature(data: Record<string, unknown>, apiKey: string): string {
  const jsonData = JSON.stringify(data);
  const base64Data = btoa(jsonData);
  const signString = base64Data + apiKey;
  return createHash("md5").update(signString).digest("hex");
}

interface CreatePaymentRequest {
  order_id: string;
  amount: number;
  currency?: string;
}

// Fixed webhook URL - External Supabase server
const WEBHOOK_URL = "https://vepwoilxujuyeuutybjp.supabase.co/functions/v1/cryptomus-webhook";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting
    const clientIP = getClientIP(req);
    if (!checkRateLimit(`cryptomus:${clientIP}`, 5, 60000)) {
      return errorResponse("Too many requests. Please try again later.", 429);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Unauthorized", 401);
    }

    // External database credentials
    const externalUrl =
      Deno.env.get("EXTERNAL_SUPABASE_URL") ||
      Deno.env.get("VITE_EXTERNAL_SUPABASE_URL") ||
      Deno.env.get("SUPABASE_URL") || "";
    const externalAnonKey =
      Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") ||
      Deno.env.get("VITE_EXTERNAL_SUPABASE_ANON_KEY") ||
      Deno.env.get("SUPABASE_ANON_KEY") || "";
    const externalServiceKey = 
      Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!externalUrl || !externalAnonKey || !externalServiceKey) {
      return errorResponse("Database credentials not configured", 500);
    }

    // Validate user
    const userClient = createClient(externalUrl, externalAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return errorResponse("Unauthorized", 401);
    }
    const userId = userData.user.id;

    const adminClient = createClient(externalUrl, externalServiceKey);

    // Get Cryptomus credentials from settings
    const { data: merchantIdSetting } = await adminClient
      .from("site_settings")
      .select("value")
      .eq("key", "cryptomus_merchant_id")
      .single();

    const { data: apiKeySetting } = await adminClient
      .from("site_settings")
      .select("value")
      .eq("key", "cryptomus_api_key")
      .single();

    if (!merchantIdSetting?.value || !apiKeySetting?.value) {
      return errorResponse("Cryptomus not configured");
    }

    const merchantId = merchantIdSetting.value;
    const apiKey = apiKeySetting.value;

    const body = await req.json();
    const { order_id, amount, currency = "USD" }: CreatePaymentRequest = body;

    // Validation
    if (!order_id || !isValidUUID(order_id)) {
      return errorResponse("Invalid order ID");
    }
    if (!amount || !isValidAmount(amount)) {
      return errorResponse("Invalid amount");
    }

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

    // Get origin for success/fail URLs
    const origin = req.headers.get("origin") || "";

    // Create payment request data according to Cryptomus API
    const paymentData: Record<string, unknown> = {
      amount: amount.toString(),
      currency: currency.toUpperCase(),
      order_id: order_id,
      url_return: `${origin}/order/${order_id}`,
      url_success: `${origin}/order/${order_id}?status=success`,
      url_callback: WEBHOOK_URL,
      is_payment_multiple: false,
      lifetime: 3600, // 1 hour
      subtract: 0, // Fees paid by merchant
    };

    // Generate signature
    const signature = generateSignature(paymentData, apiKey);

    console.log("Creating Cryptomus payment:", { order_id, amount, currency, callback: WEBHOOK_URL });

    // Call Cryptomus API
    const response = await fetch("https://api.cryptomus.com/v1/payment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "merchant": merchantId,
        "sign": signature,
      },
      body: JSON.stringify(paymentData),
    });

    const responseData = await response.json();

    if (!response.ok || responseData.state !== 0) {
      console.error("Cryptomus error:", responseData);
      const errorMessage = responseData.message || responseData.error || "Payment creation failed";
      return errorResponse(errorMessage);
    }

    const paymentResult = responseData.result;

    // Update order with payment info
    await adminClient
      .from("orders")
      .update({
        payment_method: "cryptomus",
        payment_status: "awaiting_payment",
        payment_address: paymentResult.uuid,
      })
      .eq("id", order_id);

    console.log("Cryptomus payment created:", paymentResult.uuid);

    return successResponse({
      success: true,
      payment_id: paymentResult.uuid,
      payment_url: paymentResult.url,
      amount: paymentResult.amount,
      currency: paymentResult.currency,
    });

  } catch (error) {
    console.error("Cryptomus create error:", error);
    return errorResponse(error instanceof Error ? error.message : "Unknown error", 500);
  }
});
