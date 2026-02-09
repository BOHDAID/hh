import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * نسخة Self-Hosted - للنشر على Supabase الخارجي
 * payment-methods-status: التحقق من طرق الدفع المفعلة
 * هذه دالة عامة (PUBLIC) - لا تتطلب JWT
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

type PaymentStatusResponse = {
  paypalEnabled: boolean;
  cryptoEnabled: boolean;
  lemonSqueezyEnabled: boolean;
  directCryptoEnabled: boolean;
  enabledDirectCryptos: string[];
  cryptomusEnabled: boolean;
  oxaPayEnabled: boolean;
  sellAuthEnabled: boolean;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    // Drain body if POST
    if (req.method === "POST") {
      try { await req.text(); } catch (_) { /* ignore */ }
    }

    // PUBLIC endpoint - no JWT validation required
    // Only returns boolean flags, no sensitive data

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("payment-methods-status: env missing");
      return errorResponse("Backend not configured", 500);
    }

    console.log("payment-methods-status: Connecting to", supabaseUrl);

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: settings, error } = await adminClient
      .from("site_settings")
      .select("key, value")
      .in("key", [
        "paypal_client_id", "nowpayments_api_key", "ltc_xpub", "btc_xpub",
        "enabled_cryptos", "lemonsqueezy_api_key", "lemonsqueezy_store_id",
        "cryptomus_merchant_id", "cryptomus_api_key", "oxapay_merchant_api_key",
        "sellauth_api_key", "sellauth_shop_id",
      ]);

    if (error) {
      console.error("payment-methods-status: DB error", error);
      return errorResponse("Failed to read settings", 500);
    }

    console.log("payment-methods-status: Found", settings?.length || 0, "settings");

    let paypalEnabled = false, cryptoEnabled = false, hasLtcXpub = false, hasBtcXpub = false;
    let hasLsKey = false, hasLsStoreId = false, hasCmMerchant = false, hasCmKey = false;
    let hasOxaPayKey = false, hasSellAuthApiKey = false, hasSellAuthShopId = false;
    let enabledCryptos: string[] = [];

    for (const s of settings || []) {
      const key = String((s as any).key), value = (s as any).value ? String((s as any).value) : "";
      if (key === "paypal_client_id" && value) paypalEnabled = true;
      if (key === "nowpayments_api_key" && value) cryptoEnabled = true;
      if (key === "ltc_xpub" && value) hasLtcXpub = true;
      if (key === "btc_xpub" && value) hasBtcXpub = true;
      if (key === "enabled_cryptos" && value) enabledCryptos = value.split(",").map(c => c.trim().toUpperCase()).filter(Boolean);
      if (key === "lemonsqueezy_api_key" && value) hasLsKey = true;
      if (key === "lemonsqueezy_store_id" && value) hasLsStoreId = true;
      if (key === "cryptomus_merchant_id" && value) hasCmMerchant = true;
      if (key === "cryptomus_api_key" && value) hasCmKey = true;
      if (key === "oxapay_merchant_api_key" && value) hasOxaPayKey = true;
      if (key === "sellauth_api_key" && value) hasSellAuthApiKey = true;
      if (key === "sellauth_shop_id" && value) hasSellAuthShopId = true;
    }

    const enabledDirectCryptos: string[] = [];
    if (hasLtcXpub && enabledCryptos.includes("LTC")) enabledDirectCryptos.push("LTC");
    if (hasBtcXpub && enabledCryptos.includes("BTC")) enabledDirectCryptos.push("BTC");

    const response: PaymentStatusResponse = {
      paypalEnabled, 
      cryptoEnabled,
      lemonSqueezyEnabled: hasLsKey && hasLsStoreId,
      directCryptoEnabled: enabledDirectCryptos.length > 0,
      enabledDirectCryptos,
      cryptomusEnabled: hasCmMerchant && hasCmKey,
      oxaPayEnabled: hasOxaPayKey,
      sellAuthEnabled: hasSellAuthApiKey && hasSellAuthShopId,
    };

    console.log("payment-methods-status: Response", response);

    return jsonResponse(response);
  } catch (e) {
    console.error("payment-methods-status error:", e);
    return errorResponse("Internal error", 500);
  }
});
