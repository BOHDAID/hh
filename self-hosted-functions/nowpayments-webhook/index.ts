import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * ============================================================
 * نسخة Self-Hosted مستقلة 100%
 * nowpayments-webhook: استقبال إشعارات NOWPayments
 * ============================================================
 * 
 * Secrets المطلوبة في Supabase Dashboard:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - NOWPAYMENTS_IPN_SECRET (اختياري - للتحقق من التوقيع)
 * ============================================================
 */

// ==================== CORS Headers ====================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-nowpayments-sig",
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

// ==================== Main Handler ====================
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return errorResponse("Server configuration error", 500);
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log("NOWPayments webhook received:", JSON.stringify(body));

    const {
      order_id,
      payment_status,
      pay_amount,
      actually_paid,
      pay_currency,
    } = body;

    if (!order_id) {
      return errorResponse("Missing order_id");
    }

    if (!isValidUUID(order_id)) {
      return errorResponse("Invalid order_id format");
    }

    // Get order
    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      console.error("Order not found:", order_id);
      return errorResponse("Order not found", 404);
    }

    // Map NOWPayments status to our status
    let newStatus = order.payment_status;
    let orderStatus = order.status;

    switch (payment_status) {
      case "waiting":
        newStatus = "awaiting_payment";
        break;
      case "confirming":
        newStatus = "confirming";
        break;
      case "confirmed":
      case "sending":
      case "finished":
        newStatus = "paid";
        orderStatus = "processing";
        break;
      case "partially_paid":
        newStatus = "partial_payment";
        break;
      case "failed":
      case "refunded":
      case "expired":
        newStatus = "failed";
        orderStatus = "cancelled";
        break;
    }

    // Update order
    await adminClient
      .from("orders")
      .update({
        payment_status: newStatus,
        status: orderStatus,
        received_amount: actually_paid || null,
      })
      .eq("id", order_id);

    // If payment is complete, trigger order completion
    if (payment_status === "finished" || payment_status === "confirmed") {
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
    }

    return successResponse({ success: true });

  } catch (error) {
    console.error("NOWPayments webhook error:", error);
    return errorResponse(error instanceof Error ? error.message : "Unknown error", 500);
  }
});
