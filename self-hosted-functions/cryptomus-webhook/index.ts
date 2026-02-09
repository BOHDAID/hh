import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHash } from "node:crypto";

// MD5 hash (hex). Note: WebCrypto does NOT support MD5 in Edge runtimes.
async function md5Hash(input: string): Promise<string> {
  return createHash("md5").update(input).digest("hex");
}

// ==================== CORS & Security Headers ====================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, sign, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const allHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

function errorResponse(message: string, status: number = 400): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: allHeaders });
}

function successResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: allHeaders });
}

// Verify Cryptomus signature using: md5(base64_payload + payment_key)
async function verifySignature(body: Record<string, unknown>, signature: string, paymentKey: string): Promise<boolean> {
  try {
    // Remove sign field if present in body
    const dataToVerify = { ...body };
    delete dataToVerify.sign;
    
    // Cryptomus signature: md5(base64(json_payload) + payment_key)
    const jsonData = JSON.stringify(dataToVerify);
    const base64Data = btoa(jsonData);
    const signString = base64Data + paymentKey;
    
    const calculatedSignature = await md5Hash(signString);
    
    console.log("Signature verification:", {
      receivedSignature: signature,
      calculatedSignature: calculatedSignature,
      match: calculatedSignature === signature,
    });
    
    return calculatedSignature === signature;
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("=== Cryptomus Webhook Received ===");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get Payment Key for signature verification (NOT API Key)
    const { data: paymentKeySetting } = await adminClient
      .from("site_settings")
      .select("value")
      .eq("key", "cryptomus_payment_key")
      .single();

    if (!paymentKeySetting?.value) {
      console.error("Cryptomus Payment Key not configured");
      return errorResponse("Cryptomus Payment Key not configured", 500);
    }

    const paymentKey = paymentKeySetting.value;

    // Parse body
    const body = await req.json();
    console.log("Webhook body:", JSON.stringify(body, null, 2));

    // Get signature from header or body
    const signatureHeader = req.headers.get("sign");
    const signature = signatureHeader || body.sign;

    if (!signature) {
      console.error("No signature provided");
      return errorResponse("Missing signature", 401);
    }

    // Verify signature using: md5(base64_payload + payment_key)
    if (!await verifySignature(body, signature, paymentKey)) {
      console.error("Invalid signature");
      return errorResponse("Invalid signature", 401);
    }

    console.log("Signature verified successfully");

    // Extract payment info
    const {
      order_id,
      uuid: paymentUuid,
      status,
      amount,
      currency,
      payer_amount,
      payer_currency,
    } = body;

    if (!order_id) {
      console.error("No order_id in webhook");
      return errorResponse("Missing order_id");
    }

    console.log(`Processing payment for order ${order_id}, status: ${status}`);

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

    // Check if already completed
    if (order.status === "completed") {
      console.log("Order already completed, skipping");
      return successResponse({ success: true, message: "Order already completed" });
    }

    // Cryptomus payment statuses
    const successStatuses = ["paid", "paid_over"];
    const failedStatuses = ["fail", "cancel", "wrong_amount", "system_fail"];

    if (successStatuses.includes(status)) {
      console.log(`Payment successful for order ${order_id}`);

      // Update order status
      await adminClient
        .from("orders")
        .update({
          payment_status: "paid",
          received_amount: parseFloat(payer_amount || amount),
        })
        .eq("id", order_id);

      // Trigger delivery via complete-payment function
      try {
        console.log("Triggering complete-payment for order:", order_id);

        const completeResponse = await fetch(`${supabaseUrl}/functions/v1/complete-payment`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ order_id }),
        });

        const completeResult = await completeResponse.json();
        console.log("Complete-payment result:", JSON.stringify(completeResult));

        if (!completeResponse.ok) {
          console.error("Complete-payment failed:", completeResult);
        }
      } catch (deliveryError) {
        console.error("Delivery error:", deliveryError);
      }

      return successResponse({ 
        success: true, 
        message: "Payment completed",
        order_id,
      });

    } else if (failedStatuses.includes(status)) {
      console.log(`Payment failed for order ${order_id}: ${status}`);

      await adminClient
        .from("orders")
        .update({
          payment_status: "failed",
          status: "cancelled",
        })
        .eq("id", order_id);

      return successResponse({ 
        success: true, 
        message: "Payment failed recorded",
        status,
      });

    } else {
      console.log(`Payment status update for order ${order_id}: ${status}`);

      await adminClient
        .from("orders")
        .update({
          payment_status: status === "process" ? "processing" : "awaiting_payment",
        })
        .eq("id", order_id);

      return successResponse({ 
        success: true, 
        message: "Status updated",
        status,
      });
    }

  } catch (error) {
    console.error("Cryptomus webhook error:", error);
    return errorResponse(error instanceof Error ? error.message : "Unknown error", 500);
  }
});
