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

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha512Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return toHex(sig);
}

function sortObjectDeep(value: any): any {
  if (Array.isArray(value)) return value.map(sortObjectDeep);
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    const out: Record<string, any> = {};
    for (const k of keys) out[k] = sortObjectDeep(value[k]);
    return out;
  }
  return value;
}

const webhookCorsHeaders = {
  ...corsHeaders,
  "Access-Control-Allow-Headers": corsHeaders["Access-Control-Allow-Headers"] + ", x-nowpayments-sig",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: webhookCorsHeaders });
  }

  try {
    // Rate limiting for webhooks
    const clientIP = getClientIP(req);
    if (!checkRateLimit(`webhook:${clientIP}`, 30, 60000)) {
      return errorResponse("Too many requests", 429);
    }

    const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get IPN secret from settings
    const { data: ipnSecretSetting } = await adminClient
      .from("site_settings")
      .select("value")
      .eq("key", "nowpayments_ipn_secret")
      .single();

    const body = await req.text();
    const payload = JSON.parse(body);

    // Verify signature if IPN secret is configured
    if (ipnSecretSetting?.value) {
      const signature = req.headers.get("x-nowpayments-sig");
      if (signature) {
        const sortedPayload = sortObjectDeep(payload);
        const calculatedSignature = await hmacSha512Hex(
          ipnSecretSetting.value,
          JSON.stringify(sortedPayload)
        );

        if (signature !== calculatedSignature) {
          console.error("Invalid signature");
          return new Response(
            JSON.stringify({ error: "Invalid signature" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    const { order_id, payment_status, payment_id, actually_paid } = payload;

    console.log("NOWPayments webhook:", { order_id, payment_status, payment_id });

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: "Missing order_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get order
    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      console.error("Order not found:", order_id);
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle payment status
    if (payment_status === "finished" || payment_status === "confirmed") {
      // Payment successful - complete the order
      
      // Get order items
      const { data: orderItems } = await adminClient
        .from("order_items")
        .select("*, products(product_type, warranty_days)")
        .eq("order_id", order_id);

      // Process delivery for each item
      if (orderItems) {
        for (const item of orderItems) {
          const productType = item.products?.product_type || "account";

          if (productType === "account" && !item.delivered_data) {
            // Get available account
            const { data: account } = await adminClient
              .from("product_accounts")
              .select("id, account_data")
              .eq("product_id", item.product_id)
              .eq("is_sold", false)
              .limit(1)
              .single();

            if (account) {
              // Mark as sold
              await adminClient
                .from("product_accounts")
                .update({ is_sold: true, sold_at: new Date().toISOString() })
                .eq("id", account.id);

              // Update order item
              await adminClient
                .from("order_items")
                .update({
                  product_account_id: account.id,
                  delivered_data: account.account_data,
                })
                .eq("id", item.id);
            }
          }

          // Update sales count
          const { data: product } = await adminClient
            .from("products")
            .select("sales_count")
            .eq("id", item.product_id)
            .single();

          if (product) {
            await adminClient
              .from("products")
              .update({ sales_count: (product.sales_count || 0) + (item.quantity || 1) })
              .eq("id", item.product_id);
          }
        }

        // Calculate warranty expiry
        const maxWarrantyDays = Math.max(
          ...orderItems.map(item => item.products?.warranty_days || 7)
        );
        const warrantyExpiry = new Date();
        warrantyExpiry.setDate(warrantyExpiry.getDate() + maxWarrantyDays);

        // Update order
        await adminClient
          .from("orders")
          .update({
            status: "completed",
            payment_status: "completed",
            warranty_expires_at: warrantyExpiry.toISOString(),
          })
          .eq("id", order_id);
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
    } else if (payment_status === "failed" || payment_status === "expired") {
      // Payment failed
      await adminClient
        .from("orders")
        .update({
          payment_status: "failed",
        })
        .eq("id", order_id);
    } else {
      // Other statuses (waiting, confirming, sending)
      await adminClient
        .from("orders")
        .update({
          payment_status: payment_status,
        })
        .eq("id", order_id);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("NOWPayments webhook error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
