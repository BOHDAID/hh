import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as hexEncode } from "https://deno.land/std@0.190.0/encoding/hex.ts";

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

/**
 * نسخة Self-Hosted - للنشر على Supabase الخارجي
 * lemonsqueezy-webhook: معالجة إشعارات Lemon Squeezy
 */

interface LemonSqueezyWebhookEvent {
  meta: {
    event_name: string;
    custom_data?: {
      order_id?: string;
      user_id?: string;
    };
  };
  data: {
    id: string;
    type: string;
    attributes: {
      store_id: number;
      customer_id: number;
      order_number: number;
      user_name: string;
      user_email: string;
      status: string;
      status_formatted: string;
      refunded: boolean;
      refunded_at: string | null;
      subtotal: number;
      discount_total: number;
      tax: number;
      total: number;
      subtotal_usd: number;
      discount_total_usd: number;
      tax_usd: number;
      total_usd: number;
      created_at: string;
      updated_at: string;
      test_mode: boolean;
    };
  };
}

interface SiteSettings {
  [key: string]: string;
}

async function getSettings(supabase: any): Promise<SiteSettings> {
  const { data, error } = await supabase
    .from("site_settings")
    .select("key, value")
    .in("key", ["lemonsqueezy_webhook_secret", "store_name", "sender_email"]);

  if (error) {
    throw new Error("Failed to fetch site settings");
  }

  const settings: SiteSettings = {};
  data?.forEach((item: { key: string; value: string | null }) => {
    settings[item.key] = item.value || "";
  });

  return settings;
}

async function verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  if (!signature || !secret) {
    console.warn("Missing signature or secret - skipping verification for test mode");
    return true;
  }

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    const computedSignature = new TextDecoder().decode(hexEncode(new Uint8Array(signatureBuffer)));

    return computedSignature === signature;
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    // استخدام المتغيرات المتاحة تلقائياً في Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Supabase not configured");
      return errorResponse("Backend not configured", 500);
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const settings = await getSettings(adminClient);
    const webhookSecret = settings.lemonsqueezy_webhook_secret;

    const rawPayload = await req.text();
    const signature = req.headers.get("x-signature") || "";

    if (webhookSecret) {
      const isValid = await verifySignature(rawPayload, signature, webhookSecret);
      if (!isValid) {
        console.error("Invalid webhook signature");
        return errorResponse("Invalid signature", 401);
      }
    }

    const event: LemonSqueezyWebhookEvent = JSON.parse(rawPayload);
    const eventName = event.meta?.event_name;
    const customData = event.meta?.custom_data;
    const orderData = event.data?.attributes;

    console.log(`Received Lemon Squeezy webhook: ${eventName}`, JSON.stringify(event, null, 2));

    if (eventName === "order_created" || eventName === "order_refunded") {
      const orderId = customData?.order_id;

      if (!orderId) {
        console.error("No order_id in custom_data");
        return errorResponse("Missing order_id");
      }

      const { data: order, error: orderError } = await adminClient
        .from("orders")
        .select("id, order_number, user_id, total_amount")
        .eq("id", orderId)
        .single();

      if (orderError || !order) {
        console.error("Order not found:", orderId, orderError);
        return errorResponse("Order not found");
      }

      if (eventName === "order_created" && orderData.status === "paid") {
        // التحقق من الاحتيال - مقارنة المبلغ المدفوع بالمتوقع
        const paidAmountCents = orderData.total;
        const paidAmountUSD = paidAmountCents / 100;
        const expectedAmount = Number(order.total_amount);
        
        const tolerance = 0.01;
        
        console.log(`💰 Price Validation: Paid=$${paidAmountUSD.toFixed(2)}, Expected=$${expectedAmount.toFixed(2)}`);
        
        if (paidAmountUSD < expectedAmount - tolerance) {
          console.error(`🚨 FRAUD ALERT: Order ${orderId} - Paid $${paidAmountUSD.toFixed(2)} but expected $${expectedAmount.toFixed(2)}`);
          
          await adminClient
            .from("orders")
            .update({
              payment_status: "failed",
              status: "fraud",
            })
            .eq("id", orderId);

          console.error(`🚫 Order ${orderId} rejected - Underpayment detected`);
          
          return successResponse({ 
            success: false, 
            message: "Payment rejected - insufficient amount",
            paid: paidAmountUSD,
            expected: expectedAmount
          });
        }

        console.log(`✅ Order ${orderId} payment validated - Amount OK`);

        await adminClient
          .from("orders")
          .update({
            payment_status: "paid",
            status: "processing",
          })
          .eq("id", orderId);

        // استدعاء complete-payment لتسليم المنتجات
        try {
          const deliveryResponse = await fetch(`${supabaseUrl}/functions/v1/complete-payment`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({ order_id: orderId }),
          });

          const deliveryResult = await deliveryResponse.json();
          console.log("Delivery result:", deliveryResult);
        } catch (deliveryError) {
          console.error("Failed to deliver order:", deliveryError);
        }

        return successResponse({ success: true, message: "Order processed and validated" });
      }

      if (eventName === "order_refunded") {
        console.log(`Order ${orderId} refunded`);

        await adminClient
          .from("orders")
          .update({
            payment_status: "refunded",
            status: "refunded",
          })
          .eq("id", orderId);

        return successResponse({ success: true, message: "Refund processed" });
      }
    }

    if (eventName?.startsWith("subscription_")) {
      console.log(`Subscription event: ${eventName}`);
    }

    return successResponse({ success: true, message: "Webhook received" });
  } catch (error) {
    console.error("Webhook error:", error);
    return errorResponse(error instanceof Error ? error.message : "Unknown error", 500);
  }
});
