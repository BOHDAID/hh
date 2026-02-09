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

interface CapturePaymentRequest {
  order_id: string;
  paypal_order_id: string;
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
    if (!checkRateLimit(`paypal-capture:${clientIP}`, 5, 60000)) {
      return errorResponse("Too many requests. Please try again later.", 429);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Unauthorized", 401);
    }

    const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("VITE_EXTERNAL_SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

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
    const { order_id, paypal_order_id }: CapturePaymentRequest = body;

    // Input validation
    if (!order_id || !isValidUUID(order_id)) {
      return errorResponse("Invalid order ID");
    }

    if (!paypal_order_id || typeof paypal_order_id !== "string") {
      return errorResponse("Invalid PayPal order ID");
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

    // Capture the payment
    const captureResponse = await fetch(`${baseUrl}/v2/checkout/orders/${paypal_order_id}/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const captureData = await captureResponse.json();

    // Log payment capture attempt
    await adminClient.from("payments").insert({
      user_id: userId,
      order_id: order_id,
      payment_method: "paypal",
      amount: order.total_amount,
      currency: "USD",
      status: captureData.status === "COMPLETED" ? "completed" : "failed",
      provider_payment_id: paypal_order_id,
      provider_response: captureData,
      error_message: captureData.status !== "COMPLETED" ? (captureData.message || "Payment capture failed") : null,
    });

    if (!captureResponse.ok || captureData.status !== "COMPLETED") {
      console.error("PayPal capture error:", captureData);
      return new Response(
        JSON.stringify({ error: captureData.message || "Payment capture failed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Payment successful - call complete-payment to handle delivery with proper fallback logic
    // IMPORTANT: Use service role key + internal_user_id to bypass external auth validation
    console.log(`PayPal payment captured successfully for order ${order_id}, calling complete-payment...`);
    
    try {
      const completeResponse = await fetch(`${supabaseUrl}/functions/v1/complete-payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ 
          order_id,
          internal_user_id: userId  // Pass user_id for internal validation
        }),
      });

      const completeResult = await completeResponse.json();
      console.log("complete-payment result:", completeResult);

      if (!completeResponse.ok) {
        console.error("complete-payment failed:", completeResult);
        // Even if delivery fails, payment was successful - don't fail the whole request
      }
    } catch (completeError) {
      console.error("Failed to call complete-payment:", completeError);
    }

    // Handle affiliate commission
    const { data: profile } = await adminClient
      .from("profiles")
      .select("referred_by")
      .eq("user_id", order.user_id)
      .single();

    if (profile?.referred_by) {
      const { data: commissionSetting } = await adminClient
        .from("site_settings")
        .select("value")
        .eq("key", "affiliate_commission")
        .single();

      const commissionRate = commissionSetting?.value
        ? parseFloat(commissionSetting.value) / 100
        : 0.1;

      const commission = order.total_amount * commissionRate;

      const { data: affiliate } = await adminClient
        .from("affiliates")
        .select("id, user_id, total_earnings")
        .eq("id", profile.referred_by)
        .single();

      if (affiliate) {
        await adminClient
          .from("affiliates")
          .update({
            total_earnings: (affiliate.total_earnings || 0) + commission,
          })
          .eq("id", affiliate.id);

        const { data: affiliateWallet } = await adminClient
          .from("wallets")
          .select("id, balance, total_earned")
          .eq("user_id", affiliate.user_id)
          .single();

        if (affiliateWallet) {
          await adminClient
            .from("wallets")
            .update({
              balance: affiliateWallet.balance + commission,
              total_earned: (affiliateWallet.total_earned || 0) + commission,
              updated_at: new Date().toISOString(),
            })
            .eq("id", affiliateWallet.id);

          await adminClient
            .from("wallet_transactions")
            .insert({
              wallet_id: affiliateWallet.id,
              type: "affiliate_commission",
              amount: commission,
              description: `عمولة إحالة من طلب ${order.order_number}`,
              reference_id: order.id,
              status: "completed",
            });
        }
      }
    }

    // Fetch final order
    const { data: finalOrder } = await adminClient
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", order_id)
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        order: finalOrder,
        message: "تم الدفع وتسليم الطلب بنجاح",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("PayPal capture error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
