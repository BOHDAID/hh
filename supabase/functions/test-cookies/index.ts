import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { session_id } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id مطلوب" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use external DB priority
    const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
    const extKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
    const url = extUrl || Deno.env.get("SUPABASE_URL")!;
    const key = extKey || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(url, key);

    // Fetch session
    const { data: session, error } = await supabase
      .from("osn_sessions")
      .select("id, cookies, email, variant_id")
      .eq("id", session_id)
      .single();

    if (error || !session) {
      return new Response(JSON.stringify({ error: "الجلسة غير موجودة" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cookies = session.cookies;
    if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
      return new Response(
        JSON.stringify({ valid: false, reason: "لا توجد كوكيز في هذه الجلسة", cookie_count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Detect platform from cookies
    const hasCrunchyroll = cookies.some((c: any) => c.domain?.includes("crunchyroll"));
    const hasOsn = cookies.some((c: any) => c.domain?.includes("osn") || c.domain?.includes("starz"));

    const cookieString = cookies.map((c: any) => `${c.name}=${c.value}`).join("; ");
    const commonHeaders = {
      Cookie: cookieString,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    };

    if (hasCrunchyroll) {
      const response = await fetch("https://www.crunchyroll.com/", {
        headers: commonHeaders,
        redirect: "follow",
      });

      const html = await response.text();
      const snippet = html.substring(0, 8000);
      const isLoggedIn =
        !snippet.includes("Log In") &&
        !snippet.includes("Create Account") &&
        !snippet.includes("Start a Free Trial");
      const hasUserId = cookies.some((c: any) => c.name === "ajs_user_id" && c.value);

      return new Response(
        JSON.stringify({
          valid: isLoggedIn,
          platform: "crunchyroll",
          cookie_count: cookies.length,
          has_user_id: hasUserId,
          reason: isLoggedIn
            ? "✅ الكوكيز صالحة - الحساب مسجل دخول"
            : "❌ الكوكيز منتهية - الصفحة تعرض 'Log In'",
          status_code: response.status,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (hasOsn) {
      const response = await fetch("https://www.osn.com/", {
        headers: commonHeaders,
        redirect: "follow",
      });

      return new Response(
        JSON.stringify({
          valid: response.ok,
          platform: "osn",
          cookie_count: cookies.length,
          reason: response.ok ? "✅ الكوكيز تبدو صالحة" : "❌ فشل الاتصال",
          status_code: response.status,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        valid: null,
        platform: "unknown",
        cookie_count: cookies.length,
        reason: "⚠️ لم يتم التعرف على المنصة من الكوكيز",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
