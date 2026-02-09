import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * ============================================================
 * نسخة Self-Hosted مستقلة 100%
 * paypal-capture: إكمال دفعة PayPal
 * ============================================================
 * 
 * Secrets المطلوبة في Supabase Dashboard:
 * - SUPABASE_URL
 * - SUPABASE_ANON_KEY
 * - SUPABASE_SERVICE_ROLE_KEY
 * - PAYPAL_CLIENT_ID
 * - PAYPAL_SECRET
 * - PAYPAL_MODE (sandbox أو live)
 * ============================================================
 */

// ==================== CORS Headers ====================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const allHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

// ==================== Helper Functions ====================
function errorResponse(message: string, status: number = 400): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: allHeaders }
  );
}

function successResponse(data: unknown, status: number = 200): Response {
  return new Response(
    JSON.stringify(data),
    { status, headers: allHeaders }
  );
}

function isValidUUID(uuid: string): boolean {
  if (!uuid || typeof uuid !== "string") return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// ==================== Types ====================
interface CapturePaymentRequest {
  paypal_order_id: string;
  order_id: string;
}

// ==================== Main Handler ====================
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Unauthorized", 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const paypalClientId = Deno.env.get("PAYPAL_CLIENT_ID");
    const paypalSecret = Deno.env.get("PAYPAL_SECRET");
    const paypalMode = Deno.env.get("PAYPAL_MODE") || "sandbox";

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      return errorResponse("Server configuration error", 500);
    }

    if (!paypalClientId || !paypalSecret) {
      return errorResponse("PayPal not configured", 500);
    }

    const paypalBaseUrl = paypalMode === "live" 
      ? "https://api-m.paypal.com" 
      : "https://api-m.sandbox.paypal.com";

    // Verify user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return errorResponse("Unauthorized", 401);
    }

    const userId = userData.user.id;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { paypal_order_id, order_id }: CapturePaymentRequest = body;

    if (!paypal_order_id) {
      return errorResponse("Missing PayPal order ID");
    }

    if (!order_id || !isValidUUID(order_id)) {
      return errorResponse("Invalid order ID");
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

    // Get PayPal access token
    const authResponse = await fetch(`${paypalBaseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${paypalClientId}:${paypalSecret}`)}`,
      },
      body: "grant_type=client_credentials",
    });

    if (!authResponse.ok) {
      console.error("PayPal auth error:", await authResponse.text());
      return errorResponse("Failed to authenticate with PayPal", 500);
    }

    const authData = await authResponse.json();
    const accessToken = authData.access_token;

    // Capture PayPal order
    const captureResponse = await fetch(
      `${paypalBaseUrl}/v2/checkout/orders/${paypal_order_id}/capture`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const captureData = await captureResponse.json();

    if (!captureResponse.ok || captureData.status !== "COMPLETED") {
      console.error("PayPal capture error:", captureData);
      
      await adminClient
        .from("orders")
        .update({ payment_status: "failed" })
        .eq("id", order_id);

      return errorResponse("Payment capture failed", 400);
    }

    // Payment successful - update order
    await adminClient
      .from("orders")
      .update({
        payment_status: "paid",
        status: "processing",
      })
      .eq("id", order_id);

    // Trigger order completion
    try {
      await fetch(`${supabaseUrl}/functions/v1/complete-payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ order_id }),
      });
    } catch (completeError) {
      console.error("Failed to complete payment:", completeError);
    }

    return successResponse({
      success: true,
      message: "Payment captured successfully",
      paypal_status: captureData.status,
    });

  } catch (error) {
    console.error("PayPal capture error:", error);
    return errorResponse(error instanceof Error ? error.message : "Unknown error", 500);
  }
});
