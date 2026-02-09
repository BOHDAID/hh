import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * OxaPay Connection Test
 * Tests if the Merchant API Key is valid by calling the payment history endpoint
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

  try {
    const externalUrl = Deno.env.get("VITE_EXTERNAL_SUPABASE_URL") || Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const externalServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    console.log(`🔗 oxapay-test: Connecting to DB: ${externalUrl}`);

    const adminClient = createClient(externalUrl, externalServiceKey);

    // Get OxaPay API key from settings
    const { data: settings, error: settingsError } = await adminClient
      .from("site_settings")
      .select("key, value")
      .eq("key", "oxapay_merchant_api_key")
      .single();

    if (settingsError || !settings?.value) {
      return jsonResponse({
        success: false,
        error: "OxaPay not configured - no API key found in settings",
        configured: false,
      });
    }

    const merchantApiKey = settings.value.trim();
    const keyLength = merchantApiKey.length;
    const keyPreview = merchantApiKey.substring(0, 6) + "..." + merchantApiKey.substring(merchantApiKey.length - 6);

    console.log(`✅ oxapay-test: API Key - Length: ${keyLength}, Preview: ${keyPreview}`);

    // Test the API key by calling the payment history endpoint
    // This is a read-only endpoint that should work if the key is valid
    const testResponse = await fetch("https://api.oxapay.com/v1/payment?size=1&page=1", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "merchant_api_key": merchantApiKey,
      },
    });

    const testResult = await testResponse.json();
    
    console.log("oxapay-test: API Response", testResult);

    if (testResult.status === 200 || testResult.message?.includes("successfully")) {
      return jsonResponse({
        success: true,
        message: "OxaPay connection successful!",
        configured: true,
        keyLength,
        keyPreview,
        apiResponse: testResult.message,
      });
    } else {
      return jsonResponse({
        success: false,
        error: testResult.message || "Invalid API key or inactive merchant",
        configured: true,
        keyLength,
        keyPreview,
        apiResponse: testResult,
        hint: "تأكد أن حساب المتجر (Merchant) مفعّل في لوحة OxaPay",
      });
    }

  } catch (error) {
    console.error("oxapay-test: Error", error);
    return jsonResponse({
      success: false,
      error: String(error),
    }, 500);
  }
});
