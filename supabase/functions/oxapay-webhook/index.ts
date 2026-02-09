import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * OxaPay Webhook Handler
 * Receives payment notifications from OxaPay and updates order status
 * PUBLIC endpoint - no JWT required (verify_jwt = false)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, hmac, x-supabase-client-platform",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// HMAC-SHA512 signature verification
async function verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"]
    );
    
    const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    const computedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    
    return computedSignature.toLowerCase() === signature.toLowerCase();
  } catch (error) {
    console.error("oxapay-webhook: Signature verification error", error);
    return false;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const rawBody = await req.text();
    console.log("oxapay-webhook: Received webhook");

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      console.error("oxapay-webhook: Invalid JSON");
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }

    const {
      trackId,
      status,
      orderId,
      amount,
      payAmount,
      payCurrency,
      type,
    } = payload;

    console.log("oxapay-webhook: Processing", { trackId, status, orderId, type });

    // Connect to external Supabase
    const externalUrl = Deno.env.get("VITE_EXTERNAL_SUPABASE_URL") || Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const externalServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!externalUrl || !externalServiceKey) {
      console.error("oxapay-webhook: DB config missing");
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    const adminClient = createClient(externalUrl, externalServiceKey);

    // Get OxaPay merchant key for signature verification
    const { data: apiKeySettings } = await adminClient
      .from("site_settings")
      .select("value")
      .eq("key", "oxapay_merchant_api_key")
      .single();

    const merchantKey = apiKeySettings?.value;

    // Verify HMAC signature if present
    const hmacHeader = req.headers.get("hmac");
    if (hmacHeader && merchantKey) {
      const isValid = await verifySignature(rawBody, hmacHeader, merchantKey);
      if (!isValid) {
        console.error("oxapay-webhook: Invalid signature");
        return jsonResponse({ error: "Invalid signature" }, 401);
      }
      console.log("oxapay-webhook: Signature verified");
    } else {
      console.warn("oxapay-webhook: No HMAC signature provided, proceeding with caution");
    }

    // Find order by order_number (orderId from OxaPay is our order_number)
    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select("id, user_id, total_amount, status, payment_method")
      .eq("order_number", orderId)
      .single();

    if (orderError || !order) {
      // Try finding by trackId stored in payment_address
      const { data: orderByTrack, error: trackError } = await adminClient
        .from("orders")
        .select("id, user_id, total_amount, status, payment_method")
        .eq("payment_address", trackId)
        .single();

      if (trackError || !orderByTrack) {
        console.error("oxapay-webhook: Order not found", { orderId, trackId });
        return jsonResponse({ error: "Order not found" }, 404);
      }
      
      // Use the order found by trackId
      Object.assign(order || {}, orderByTrack);
    }

    if (!order) {
      console.error("oxapay-webhook: Order not found");
      return jsonResponse({ error: "Order not found" }, 404);
    }

    // Check if already processed
    if (order.status === "completed") {
      console.log("oxapay-webhook: Order already completed");
      return jsonResponse({ success: true, message: "Already processed" });
    }

    // Process based on OxaPay status
    // OxaPay statuses: Waiting, Confirming, Paid, Expired, Failed, Refunded
    console.log("oxapay-webhook: OxaPay status:", status);

    if (status === "Paid") {
      // Payment successful - complete the order
      console.log("oxapay-webhook: Payment successful, completing order");

      // Update order status
      await adminClient
        .from("orders")
        .update({
          status: "completed",
          payment_status: "paid",
          received_amount: parseFloat(payAmount || amount),
        })
        .eq("id", order.id);

      // Check if this is a wallet top-up order
      const { data: orderItems } = await adminClient
        .from("order_items")
        .select("id")
        .eq("order_id", order.id);

      const isWalletTopUp = !orderItems || orderItems.length === 0;

      if (isWalletTopUp) {
        // This is a wallet top-up - add funds to user's wallet
        console.log("oxapay-webhook: Processing wallet top-up");

        // Get or create wallet
        let { data: wallet } = await adminClient
          .from("wallets")
          .select("id, balance")
          .eq("user_id", order.user_id)
          .single();

        if (!wallet) {
          const { data: newWallet } = await adminClient
            .from("wallets")
            .insert({ user_id: order.user_id, balance: 0 })
            .select()
            .single();
          wallet = newWallet;
        }

        if (wallet) {
          // Add funds to wallet
          const newBalance = (wallet.balance || 0) + order.total_amount;
          await adminClient
            .from("wallets")
            .update({ 
              balance: newBalance,
              updated_at: new Date().toISOString()
            })
            .eq("id", wallet.id);

          // Record transaction
          await adminClient
            .from("wallet_transactions")
            .insert({
              wallet_id: wallet.id,
              type: "deposit",
              amount: order.total_amount,
              description: `شحن رصيد عبر OxaPay - ${orderId}`,
              reference_id: order.id,
              status: "completed",
            });

          console.log("oxapay-webhook: Wallet topped up, new balance:", newBalance);
        }
      } else {
        // Regular product order - trigger delivery
        console.log("oxapay-webhook: Triggering product delivery");

        // Call complete-payment to handle delivery
        try {
          const completeUrl = `${externalUrl}/functions/v1/complete-payment`;
          const completeRes = await fetch(completeUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${externalServiceKey}`,
            },
            body: JSON.stringify({ order_id: order.id }),
          });

          const completeResult = await completeRes.text();
          console.log("oxapay-webhook: complete-payment result:", completeResult);
        } catch (e) {
          console.error("oxapay-webhook: complete-payment error:", e);
          // Don't fail the webhook - order is marked as completed
        }
      }

      return jsonResponse({ success: true, message: "Payment processed" });

    } else if (status === "Confirming" || status === "Waiting") {
      // Payment in progress
      await adminClient
        .from("orders")
        .update({
          payment_status: "confirming",
        })
        .eq("id", order.id);

      console.log("oxapay-webhook: Payment confirming");
      return jsonResponse({ success: true, message: "Payment confirming" });

    } else if (status === "Expired" || status === "Failed") {
      // Payment failed
      await adminClient
        .from("orders")
        .update({
          status: "cancelled",
          payment_status: "failed",
        })
        .eq("id", order.id);

      console.log("oxapay-webhook: Payment failed/expired");
      return jsonResponse({ success: true, message: "Payment failed" });
    }

    // Unknown status - log and acknowledge
    console.log("oxapay-webhook: Unknown status:", status);
    return jsonResponse({ success: true, message: "Webhook received" });

  } catch (error) {
    console.error("oxapay-webhook: Unexpected error", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
