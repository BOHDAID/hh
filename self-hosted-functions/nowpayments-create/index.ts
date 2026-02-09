import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * ============================================================
 * نسخة Self-Hosted مستقلة 100%
 * nowpayments-create: إنشاء دفعة NOWPayments
 * ============================================================
 * 
 * Secrets المطلوبة في Supabase Dashboard:
 * - SUPABASE_URL
 * - SUPABASE_ANON_KEY
 * - SUPABASE_SERVICE_ROLE_KEY
 * - NOWPAYMENTS_API_KEY
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
interface CreatePaymentRequest {
  order_id: string;
  pay_currency?: string;
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
    const nowpaymentsApiKey = Deno.env.get("NOWPAYMENTS_API_KEY");

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      return errorResponse("Server configuration error", 500);
    }

    if (!nowpaymentsApiKey) {
      return errorResponse("NOWPayments not configured", 500);
    }

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
    const { order_id, pay_currency = "ltc" }: CreatePaymentRequest = body;

    if (!order_id || !isValidUUID(order_id)) {
      return errorResponse("Invalid order ID");
    }

    // Get order
    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .eq("user_id", userId)
      .single();

    if (orderError || !order) {
      return errorResponse("Order not found", 404);
    }

    // Create NOWPayments invoice
    const invoiceResponse = await fetch("https://api.nowpayments.io/v1/invoice", {
      method: "POST",
      headers: {
        "x-api-key": nowpaymentsApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        price_amount: order.total_amount,
        price_currency: "usd",
        pay_currency: pay_currency.toLowerCase(),
        order_id: order_id,
        order_description: `Order #${order.order_number}`,
        ipn_callback_url: `${supabaseUrl}/functions/v1/nowpayments-webhook`,
        success_url: `${req.headers.get("origin") || ""}/my-orders`,
        cancel_url: `${req.headers.get("origin") || ""}/checkout/${order_id}`,
      }),
    });

    if (!invoiceResponse.ok) {
      const errorData = await invoiceResponse.text();
      console.error("NOWPayments error:", errorData);
      return errorResponse("Failed to create payment", 500);
    }

    const invoiceData = await invoiceResponse.json();

    // Update order with payment info
    await adminClient
      .from("orders")
      .update({
        payment_method: "nowpayments",
        payment_status: "awaiting_payment",
      })
      .eq("id", order_id);

    return successResponse({
      success: true,
      invoice_url: invoiceData.invoice_url,
      invoice_id: invoiceData.id,
    });

  } catch (error) {
    console.error("NOWPayments create error:", error);
    return errorResponse(error instanceof Error ? error.message : "Unknown error", 500);
  }
});
