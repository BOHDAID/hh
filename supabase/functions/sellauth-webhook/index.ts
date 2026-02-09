import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.190.0/crypto/mod.ts";

/**
 * SellAuth Webhook Handler
 * استقبال إشعارات الدفع من SellAuth وتحديث الرصيد
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sellauth-signature",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
    const signature = req.headers.get("x-sellauth-signature") || req.headers.get("X-SellAuth-Signature");

    console.log("sellauth-webhook: Received webhook");

    // Get Supabase config
    const externalUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const externalServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!externalUrl || !externalServiceKey) {
      console.error("sellauth-webhook: Missing Supabase config");
      return jsonResponse({ error: "Server error" }, 500);
    }

    const adminClient = createClient(externalUrl, externalServiceKey);

    // Get webhook secret
    const { data: settings } = await adminClient
      .from("site_settings")
      .select("key, value")
      .eq("key", "sellauth_webhook_secret")
      .single();

    const webhookSecret = settings?.value || "";

    // Verify signature if secret is configured
    if (webhookSecret && signature) {
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(webhookSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
      const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      if (signature !== expectedSignature) {
        console.error("sellauth-webhook: Invalid signature");
        return jsonResponse({ error: "Invalid signature" }, 401);
      }
    }

    // Parse webhook payload
    const payload = JSON.parse(rawBody);
    console.log("sellauth-webhook: Payload", JSON.stringify(payload, null, 2));

    // SellAuth webhook events: invoice.completed, invoice.pending, invoice.expired
    const event = payload.event || payload.type;
    const data = payload.data || payload;

    if (event !== "invoice.completed" && event !== "order.completed") {
      console.log("sellauth-webhook: Ignoring event", event);
      return jsonResponse({ received: true });
    }

    // Extract order info - parse metadata if it's a string
    let metadata = data.metadata;
    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch (e) {
        console.log("sellauth-webhook: Could not parse metadata string");
      }
    }

    const orderId = metadata?.internal_order_id || data.order_id || data.metadata?.order_id;
    const userId = metadata?.user_id;
    
    // Use original_amount from metadata (the actual amount user intended to pay)
    // This is more accurate than data.total which might be quantity * $1
    const originalAmount = parseFloat(metadata?.original_amount || 0);
    const fallbackAmount = parseFloat(data.total || data.amount || 0);
    const amountPaid = originalAmount > 0 ? originalAmount : fallbackAmount;

    if (!orderId) {
      console.error("sellauth-webhook: Missing order_id in payload");
      return jsonResponse({ error: "Missing order_id" }, 400);
    }

    console.log("sellauth-webhook: Processing payment", { orderId, amountPaid, originalAmount, fallbackAmount });

    // Get order
    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      console.error("sellauth-webhook: Order not found", orderId);
      return jsonResponse({ error: "Order not found" }, 404);
    }

    // Check if already completed
    if (order.payment_status === "completed") {
      console.log("sellauth-webhook: Order already completed");
      return jsonResponse({ received: true, already_processed: true });
    }

    // Update order status
    await adminClient
      .from("orders")
      .update({
        payment_status: "completed",
        status: "completed",
      })
      .eq("id", orderId);

    // Check if this is a wallet top-up order (no items, wallet_topup flag)
    const { data: orderItems } = await adminClient
      .from("order_items")
      .select("id")
      .eq("order_id", orderId);

    const isWalletTopUp = !orderItems || orderItems.length === 0;

    if (isWalletTopUp && order.user_id) {
      // This is a wallet top-up - add balance to user's wallet
      console.log("sellauth-webhook: Processing wallet top-up", { userId: order.user_id, amount: amountPaid });

      // Get or create wallet
      const { data: wallet, error: walletError } = await adminClient
        .from("wallets")
        .select("id, balance")
        .eq("user_id", order.user_id)
        .maybeSingle();

      if (wallet) {
        // Update existing wallet
        const newBalance = (parseFloat(wallet.balance) || 0) + amountPaid;
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
            type: "topup",
            amount: amountPaid,
            description: `شحن رصيد عبر SellAuth - ${order.order_number}`,
            reference_id: orderId,
            status: "completed",
          });

        console.log("sellauth-webhook: Wallet topped up", { newBalance });
      } else {
        // Create new wallet with balance
        const { data: newWallet } = await adminClient
          .from("wallets")
          .insert({
            user_id: order.user_id,
            balance: amountPaid,
          })
          .select()
          .single();

        if (newWallet) {
          await adminClient
            .from("wallet_transactions")
            .insert({
              wallet_id: newWallet.id,
              type: "topup",
              amount: amountPaid,
              description: `شحن رصيد عبر SellAuth - ${order.order_number}`,
              reference_id: orderId,
              status: "completed",
            });
        }

        console.log("sellauth-webhook: New wallet created with balance", amountPaid);
      }
    } else {
      // Regular order - call complete-payment to deliver accounts
      console.log("sellauth-webhook: Triggering order completion");
      
      try {
        const completeRes = await fetch(`${externalUrl}/functions/v1/complete-payment`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${externalServiceKey}`,
          },
          body: JSON.stringify({ order_id: orderId }),
        });

        const completeData = await completeRes.json();
        console.log("sellauth-webhook: complete-payment response", completeData);
      } catch (e) {
        console.error("sellauth-webhook: complete-payment failed", e);
      }
    }

    console.log("sellauth-webhook: Payment processed successfully");
    return jsonResponse({ success: true });

  } catch (error) {
    console.error("sellauth-webhook: Error", error);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
