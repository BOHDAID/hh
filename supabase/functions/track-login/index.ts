import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getExternalClient() {
  const url = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("VITE_EXTERNAL_SUPABASE_URL");
  const key = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY");
  if (!url || !key) return null;
  return createClient(url, key);
}

function parseUserAgent(ua: string) {
  let browser = "Unknown";
  let os = "Unknown";
  let deviceType = "desktop";

  // Browser detection
  if (ua.includes("Firefox/")) browser = "Firefox";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("OPR/") || ua.includes("Opera")) browser = "Opera";
  else if (ua.includes("Chrome/") && !ua.includes("Edg/")) browser = "Chrome";
  else if (ua.includes("Safari/") && !ua.includes("Chrome")) browser = "Safari";

  // OS detection
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS")) os = "macOS";
  else if (ua.includes("Linux") && !ua.includes("Android")) os = "Linux";
  else if (ua.includes("Android")) { os = "Android"; deviceType = "mobile"; }
  else if (ua.includes("iPhone") || ua.includes("iPad")) { os = "iOS"; deviceType = "mobile"; }

  return { browser, os, deviceType };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { user_id, user_agent } = await req.json();
    if (!user_id) throw new Error("user_id required");

    const db = getExternalClient();
    if (!db) throw new Error("DB not configured");

    const ua = user_agent || req.headers.get("user-agent") || "";
    const { browser, os, deviceType } = parseUserAgent(ua);

    // Get IP from headers
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() 
      || req.headers.get("cf-connecting-ip") 
      || "unknown";

    // Try to get location from IP using free API
    let country = null;
    let city = null;
    try {
      if (ip && ip !== "unknown" && ip !== "127.0.0.1") {
        const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=country,city`, {
          signal: AbortSignal.timeout(3000),
        });
        if (geoRes.ok) {
          const geo = await geoRes.json();
          country = geo.country || null;
          city = geo.city || null;
        }
      }
    } catch { /* ignore geo errors */ }

    // Mark all previous sessions as not current
    await db.from("login_sessions")
      .update({ is_current: false })
      .eq("user_id", user_id);

    // Insert new session
    const { error } = await db.from("login_sessions").insert({
      user_id,
      device_type: deviceType,
      browser,
      os,
      ip_address: ip,
      country,
      city,
      is_current: true,
      is_suspicious: false,
    });

    if (error) {
      console.error("Insert error:", error);
      throw error;
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("track-login error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
