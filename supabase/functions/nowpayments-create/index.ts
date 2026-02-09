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
  pay_currency?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting
    const clientIP = getClientIP(req);
    if (!checkRateLimit(`nowpayments:${clientIP}`, 5, 60000)) {
      return errorResponse("Too many requests. Please try again later.", 429);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Unauthorized", 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return errorResponse("Unauthorized", 401);
    }

    const userId = claimsData.claims.sub as string;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get NOWPayments API key from settings
    const { data: apiKeySetting } = await adminClient
      .from("site_settings")
      .select("value")
      .eq("key", "nowpayments_api_key")
      .single();

    if (!apiKeySetting?.value) {
      return errorResponse("NOWPayments not configured");
    }

    const body = await req.json();
    const { order_id, amount, currency = "usd", pay_currency }: CreatePaymentRequest = body;

    if (!pay_currency) {
      return errorResponse("pay_currency is required");
    }

    // Input validation
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

    // Create payment with NOWPayments API
    const callbackUrl = `${supabaseUrl}/functions/v1/nowpayments-webhook`;
    
    const paymentResponse = await fetch("https://api.nowpayments.io/v1/invoice", {
      method: "POST",
      headers: {
        "x-api-key": apiKeySetting.value,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        price_amount: amount,
        price_currency: currency.toUpperCase(),
        pay_currency: pay_currency.toUpperCase(),
        order_id: order_id,
        order_description: `Order ${order.order_number}`,
        ipn_callback_url: callbackUrl,
        success_url: `${req.headers.get("origin") || ""}/order/${order_id}`,
        cancel_url: `${req.headers.get("origin") || ""}/checkout/${order_id}`,
        is_fixed_rate: true,
        is_fee_paid_by_user: false,
      }),
    });

    const paymentData = await paymentResponse.json();

    if (!paymentResponse.ok) {
      console.error("NOWPayments error:", paymentData);
      
      // Handle specific error messages with user-friendly responses
      let userMessage = paymentData.message || "Payment creation failed";
      
      if (paymentData.message?.includes("too small") || paymentData.message?.includes("minimum")) {
        userMessage = `المبلغ أقل من الحد الأدنى المطلوب للعملة ${pay_currency.toUpperCase()}. يرجى زيادة الكمية أو اختيار عملة أخرى.`;
      } else if (paymentData.message?.includes("unavailable")) {
        userMessage = `العملة ${pay_currency.toUpperCase()} غير متاحة حالياً. يرجى اختيار عملة أخرى.`;
      }
      
      return errorResponse(userMessage);
    }

    // Store payment ID in order
    await adminClient
      .from("orders")
      .update({ 
        payment_method: "nowpayments",
        payment_status: "awaiting_payment",
      })
      .eq("id", order_id);

    return successResponse({
      success: true,
      invoice_id: paymentData.id,
      invoice_url: paymentData.invoice_url,
    });
  } catch (error) {
    console.error("NOWPayments create error:", error);
    return errorResponse(error instanceof Error ? error.message : "Unknown error", 500);
  }
});
