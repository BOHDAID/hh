import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  paypalClientId?: string; // Public key - safe to expose for SDK initialization
  cryptoEnabled: boolean; // NOWPayments
  lemonSqueezyEnabled: boolean;
  directCryptoEnabled: boolean;
  enabledDirectCryptos: string[]; // e.g. ["LTC","BTC"]
  cryptomusEnabled: boolean;
  oxaPayEnabled: boolean;
  sellAuthEnabled: boolean;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // Support both GET and POST
  if (req.method !== "GET" && req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    // Drain body (if any) to avoid issues with some runtimes/clients; body is not used.
    if (req.method === "POST") {
      try {
        await req.text();
      } catch (_) {
        // ignore
      }
    }

    // This is a PUBLIC endpoint - no JWT required
    // It only returns boolean flags about which payment methods are enabled
    // No sensitive data is exposed

    const externalUrl = Deno.env.get("VITE_EXTERNAL_SUPABASE_URL") || Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const externalServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!externalUrl || !externalServiceKey) {
      console.error("payment-methods-status: External DB env missing", { externalUrl: !!externalUrl, externalServiceKey: !!externalServiceKey });
      return errorResponse("Backend not configured", 500);
    }

    console.log("payment-methods-status: Connecting to", externalUrl);

    const adminClient = createClient(externalUrl, externalServiceKey);

    // IMPORTANT: do NOT expose any secret values; only booleans.
    const { data: settings, error } = await adminClient
      .from("site_settings")
      .select("key, value")
      .in("key", [
        "paypal_client_id",
        "nowpayments_api_key",
        "ltc_xpub",
        "btc_xpub",
        "enabled_cryptos",
        "lemonsqueezy_api_key",
        "lemonsqueezy_store_id",
        "cryptomus_merchant_id",
        "cryptomus_api_key",
        "oxapay_merchant_api_key",
        "sellauth_api_key",
        "sellauth_shop_id",
      ]);

    if (error) {
      console.error("payment-methods-status: failed to fetch settings", error);
      return errorResponse("Failed to read settings", 500);
    }

    console.log("payment-methods-status: Found", settings?.length || 0, "settings");

    let paypalClientId = "";
    let paypalEnabled = false;
    let cryptoEnabled = false;
    let hasLtcXpub = false;
    let hasBtcXpub = false;
    let hasLsKey = false;
    let hasLsStoreId = false;
    let hasCryptomusMerchantId = false;
    let hasCryptomusApiKey = false;
    let hasOxaPayKey = false;
    let hasSellAuthApiKey = false;
    let hasSellAuthShopId = false;
    let enabledCryptos: string[] = [];

    for (const s of settings || []) {
      const key = String((s as any).key);
      const value = (s as any).value ? String((s as any).value) : "";

      if (key === "paypal_client_id" && value) {
        paypalEnabled = true;
        paypalClientId = value; // Public key - safe to expose
      }
      if (key === "nowpayments_api_key" && value) cryptoEnabled = true;
      if (key === "ltc_xpub" && value) hasLtcXpub = true;
      if (key === "btc_xpub" && value) hasBtcXpub = true;
      if (key === "enabled_cryptos" && value) {
        enabledCryptos = value
          .split(",")
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean);
      }
      if (key === "lemonsqueezy_api_key" && value) hasLsKey = true;
      if (key === "lemonsqueezy_store_id" && value) hasLsStoreId = true;
      if (key === "cryptomus_merchant_id" && value) hasCryptomusMerchantId = true;
      if (key === "cryptomus_api_key" && value) hasCryptomusApiKey = true;
      if (key === "oxapay_merchant_api_key" && value) hasOxaPayKey = true;
      if (key === "sellauth_api_key" && value) hasSellAuthApiKey = true;
      if (key === "sellauth_shop_id" && value) hasSellAuthShopId = true;
    }

    const enabledDirectCryptos: string[] = [];
    if (hasLtcXpub && enabledCryptos.includes("LTC")) enabledDirectCryptos.push("LTC");
    if (hasBtcXpub && enabledCryptos.includes("BTC")) enabledDirectCryptos.push("BTC");

    const res: PaymentStatusResponse = {
      paypalEnabled,
      paypalClientId: paypalClientId || undefined, // Include for SDK initialization
      cryptoEnabled,
      lemonSqueezyEnabled: hasLsKey && hasLsStoreId,
      directCryptoEnabled: enabledDirectCryptos.length > 0,
      enabledDirectCryptos,
      cryptomusEnabled: hasCryptomusMerchantId && hasCryptomusApiKey,
      oxaPayEnabled: hasOxaPayKey,
      sellAuthEnabled: hasSellAuthApiKey && hasSellAuthShopId,
    };

    console.log("payment-methods-status: Response", res);

    return jsonResponse(res);
  } catch (e) {
    console.error("payment-methods-status: runtime error", e);
    return errorResponse("Internal error", 500);
  }
});
