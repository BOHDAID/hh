import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHash } from "node:crypto";

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

// Cryptomus IP whitelist - ONLY allow requests from this IP
const CRYPTOMUS_IP = "91.227.144.54";

function errorResponse(message: string, status: number = 400): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: allHeaders });
}

function successResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: allHeaders });
}

// Get client IP from request
function getClientIP(req: Request): string {
  // Check various headers for the real IP
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    return cfConnectingIp.trim();
  }
  return "unknown";
}

// MD5 hash (hex). Note: WebCrypto does NOT support MD5 in Edge runtimes.
async function md5Hash(input: string): Promise<string> {
  return createHash("md5").update(input).digest("hex");
}

// Verify Cryptomus signature using: md5(base64(json_with_escaped_slashes) + payment_key)
// IMPORTANT: Cryptomus uses PHP-style JSON encoding which escapes forward slashes
async function verifySignature(body: Record<string, unknown>, signature: string, paymentKey: string): Promise<boolean> {
  try {
    // Remove sign field if present in body
    const dataToVerify = { ...body };
    delete dataToVerify.sign;
    
    // Cryptomus uses PHP's json_encode which escapes forward slashes (/ -> \/)
    // We need to replicate this behavior
    const jsonData = JSON.stringify(dataToVerify);
    const phpStyleJson = jsonData.replace(/\//g, "\\/");
    
    const base64Data = btoa(phpStyleJson);
    const signString = base64Data + paymentKey;
    
    const calculatedSignature = await md5Hash(signString);
    
    console.log("Signature verification:", {
      receivedSignature: signature,
      calculatedSignature: calculatedSignature,
      match: calculatedSignature === signature,
    });
    
    // Also try without PHP-style escaping as fallback
    if (calculatedSignature !== signature) {
      const base64DataNoEscape = btoa(jsonData);
      const signStringNoEscape = base64DataNoEscape + paymentKey;
      const calculatedSignatureNoEscape = await md5Hash(signStringNoEscape);
      
      console.log("Fallback signature (no escape):", {
        calculatedSignature: calculatedSignatureNoEscape,
        match: calculatedSignatureNoEscape === signature,
      });
      
      return calculatedSignatureNoEscape === signature;
    }
    
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
    // SECURITY: Verify IP whitelist
    const clientIP = getClientIP(req);
    console.log("Request IP:", clientIP);
    
    if (clientIP !== CRYPTOMUS_IP && clientIP !== "unknown") {
      console.error(`Unauthorized IP: ${clientIP}. Expected: ${CRYPTOMUS_IP}`);
      return errorResponse("Forbidden: Invalid source IP", 403);
    }

    // External database credentials
    const externalUrl =
      Deno.env.get("EXTERNAL_SUPABASE_URL") ||
      Deno.env.get("VITE_EXTERNAL_SUPABASE_URL") ||
      Deno.env.get("SUPABASE_URL") || "";
    const externalServiceKey = 
      Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!externalUrl || !externalServiceKey) {
      console.error("Missing database credentials");
      return errorResponse("Server configuration error", 500);
    }

    const adminClient = createClient(externalUrl, externalServiceKey);

    // Get Payment Key for signature verification (NOT API Key!)
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

    // Cryptomus payment statuses:
    // - paid: Payment confirmed
    // - paid_over: Paid more than required
    // - wrong_amount: Wrong amount paid
    // - process: Payment is processing
    // - confirm_check: Awaiting confirmation
    // - check: Payment being checked
    // - fail: Payment failed
    // - cancel: Payment cancelled
    // - system_fail: System error
    // - refund_process: Refund in progress
    // - refund_fail: Refund failed
    // - refund_paid: Refund completed

    const successStatuses = ["paid", "paid_over"];
    const failedStatuses = ["fail", "cancel", "wrong_amount", "system_fail"];

    if (successStatuses.includes(status)) {
      console.log(`Payment successful for order ${order_id}`);

      // Update order status to completed for auto-delivery
      await adminClient
        .from("orders")
        .update({
          payment_status: "paid",
          status: "completed",
          received_amount: parseFloat(payer_amount || amount),
        })
        .eq("id", order_id);

      // Trigger delivery via complete-payment function
      try {
        const cloudUrl = Deno.env.get("SUPABASE_URL") || externalUrl;
        const cloudServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || externalServiceKey;

        console.log("Triggering complete-payment for order:", order_id);

        const completeResponse = await fetch(`${cloudUrl}/functions/v1/complete-payment`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${cloudServiceKey}`,
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
        // Don't fail the webhook - order is marked paid and can be delivered manually
      }

      return successResponse({ 
        success: true, 
        message: "Payment completed and delivery triggered",
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
      // Status is pending/processing - just acknowledge
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
