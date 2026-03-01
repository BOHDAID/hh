import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as hexEncode } from "https://deno.land/std@0.190.0/encoding/hex.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ivno-signature, user-agent",
};

async function hmacSHA256(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const msgData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  return new TextDecoder().decode(hexEncode(new Uint8Array(signature)));
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-ivno-signature") || "";

    console.log("ivno-webhook: Received webhook");

    // Get external DB credentials
    const externalUrl = Deno.env.get("VITE_EXTERNAL_SUPABASE_URL") || Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const externalServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(externalUrl, externalServiceKey);

    // Get Ivno API Secret for signature verification
    const { data: settings } = await adminClient
      .from("site_settings")
      .select("key, value")
      .eq("key", "ivno_api_secret")
      .maybeSingle();

    const apiSecret = settings?.value || "";

    // Verify signature if we have the secret
    if (apiSecret && signature) {
      const expectedSignature = await hmacSHA256(apiSecret, rawBody);
      if (signature !== expectedSignature) {
        console.error("ivno-webhook: Invalid signature");
        return new Response("Invalid signature", { status: 401, headers: corsHeaders });
      }
      console.log("ivno-webhook: Signature verified ✓");
    } else {
      console.warn("ivno-webhook: Skipping signature verification (no secret or signature)");
    }

    // Parse webhook payload
    const payload = JSON.parse(rawBody);
    console.log("ivno-webhook: Payload:", payload);

    // Expected payload:
    // { event: "payment.status_updated", transaction_id, order_id, amount, currency, status, txid_out, value_coin, timestamp }

    const { order_id, status, transaction_id, txid_out, value_coin } = payload;

    if (!order_id || !status) {
      console.error("ivno-webhook: Missing order_id or status");
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    console.log(`ivno-webhook: Order ${order_id} status: ${status}`);

    if (status === "completed") {
      // Update order to completed
      await adminClient
        .from("orders")
        .update({
          payment_status: "paid",
          status: "completed",
          payment_method: "ivno",
        })
        .eq("id", order_id);

      // Record payment
      const { data: orderData } = await adminClient
        .from("orders")
        .select("user_id, total_amount")
        .eq("id", order_id)
        .maybeSingle();

      if (orderData) {
        await adminClient.from("payments").insert({
          user_id: orderData.user_id,
          order_id: order_id,
          amount: orderData.total_amount,
          payment_method: "ivno",
          status: "completed",
          provider_payment_id: String(transaction_id || ""),
          currency: "USD",
          provider_response: payload,
        });
      }

      // Trigger order completion (delivery)
      try {
        const cloudUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        await fetch(`${cloudUrl}/functions/v1/complete-payment`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
          },
          body: JSON.stringify({ order_id }),
        });
        console.log("ivno-webhook: Triggered complete-payment for", order_id);
      } catch (e) {
        console.error("ivno-webhook: Failed to trigger complete-payment:", e);
      }
    } else if (status === "failed") {
      await adminClient
        .from("orders")
        .update({
          payment_status: "failed",
          status: "cancelled",
        })
        .eq("id", order_id);
    }

    return new Response("OK", { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error("ivno-webhook error:", error);
    return new Response("OK", { status: 200, headers: corsHeaders });
  }
});
