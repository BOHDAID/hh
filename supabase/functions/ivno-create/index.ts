import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { order_id, amount, currency = "USD" } = await req.json();

    if (!order_id || !amount) {
      return new Response(JSON.stringify({ success: false, error: "Missing order_id or amount" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get external DB credentials
    const externalUrl = Deno.env.get("VITE_EXTERNAL_SUPABASE_URL") || Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const externalServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(externalUrl, externalServiceKey);

    // Fetch Ivno API credentials from site_settings
    const { data: settings } = await adminClient
      .from("site_settings")
      .select("key, value")
      .in("key", ["ivno_api_key", "ivno_api_secret"]);

    let apiKey = "";
    let apiSecret = "";

    for (const s of settings || []) {
      if (s.key === "ivno_api_key" && s.value) apiKey = s.value;
      if (s.key === "ivno_api_secret" && s.value) apiSecret = s.value;
    }

    if (!apiKey || !apiSecret) {
      return new Response(JSON.stringify({ success: false, error: "Ivno API credentials not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the site URL for return_url and webhook_url
    const siteUrl = Deno.env.get("VITE_SITE_URL") || Deno.env.get("SITE_URL") || "";
    const cloudUrl = Deno.env.get("SUPABASE_URL")!;

    // Build return URL - redirect to order invoice page after payment
    const returnUrl = siteUrl
      ? `${siteUrl}/order/${order_id}`
      : `https://id-preview--67cd80b3-ced1-482c-8caf-99d63ed5b92f.lovable.app/order/${order_id}`;

    // Webhook URL points to our ivno-webhook edge function
    const webhookUrl = `${cloudUrl}/functions/v1/ivno-webhook`;

    // Get store domain for tracking
    let domain = "";
    if (siteUrl) {
      try {
        domain = new URL(siteUrl).hostname;
      } catch (_) { /* ignore */ }
    }

    // Create payment via Ivno API
    const ivnoResponse = await fetch("https://app.ivno.io/api/ivno/v1/payments/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
        "X-Api-Secret": apiSecret,
      },
      body: JSON.stringify({
        amount: Number(amount),
        currency: currency.toUpperCase(),
        order_id: order_id,
        return_url: returnUrl,
        webhook_url: webhookUrl,
        include_fee: true, // Customer pays the processing fee
        domain: domain || undefined,
      }),
    });

    const ivnoData = await ivnoResponse.json();
    console.log("Ivno create response:", ivnoData);

    if (!ivnoResponse.ok || !ivnoData.payment_url) {
      console.error("Ivno API error:", ivnoData);
      return new Response(JSON.stringify({
        success: false,
        error: ivnoData?.message || ivnoData?.error || "Failed to create Ivno payment",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update order with payment method info
    await adminClient
      .from("orders")
      .update({
        payment_method: "ivno",
        payment_status: "pending",
        status: "pending",
      })
      .eq("id", order_id);

    return new Response(JSON.stringify({
      success: true,
      payment_url: ivnoData.payment_url,
      transaction_id: ivnoData.transaction_id,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("ivno-create error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Internal error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
