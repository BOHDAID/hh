import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// استخدام قاعدة البيانات الخارجية
const EXTERNAL_SUPABASE_URL = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
const EXTERNAL_SERVICE_ROLE_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SERVICE_ROLE_KEY);

// جلب إعداد
async function getSetting(key: string): Promise<string | null> {
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return data?.value || null;
}

// التحقق من أن المستخدم أدمن
async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.role === "admin" || data?.role === "full_access";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // التحقق من الصلاحيات
    const authHeader = req.headers.get("Authorization");
    const url = new URL(req.url);
    const secretParam = url.searchParams.get("secret");
    const expectedSecret = Deno.env.get("QR_AUTOMATION_SECRET");
    
    const hasValidSecret = secretParam && expectedSecret && secretParam === expectedSecret;
    
    if (!hasValidSecret) {
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const token = authHeader.replace("Bearer ", "");
      const tokenPayload = JSON.parse(atob(token.split(".")[1]));
      const userId = tokenPayload.sub;

      if (!await isAdmin(userId)) {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // جلب Bot Token
    const botToken = await getSetting("telegram_bot_token") || Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!botToken) {
      return new Response(JSON.stringify({ error: "Bot token not configured. Set TELEGRAM_BOT_TOKEN in Cloud Secrets." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ====== الفرق الرئيسي: البوت يعمل بوضع Polling على Render ======
    // لذلك نحذف أي webhook موجود بدلاً من إنشاء واحد جديد
    // هذا يضمن أن Render polling يعمل بدون تعارض
    
    const RENDER_SERVER_URL = Deno.env.get("RENDER_SERVER_URL");
    
    // حذف أي webhook قديم لتفعيل وضع Long Polling
    const deleteWebhookUrl = `https://api.telegram.org/bot${botToken}/deleteWebhook`;
    const deleteResponse = await fetch(deleteWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: false }),
    });
    const deleteResult = await deleteResponse.json();
    
    if (!deleteResult.ok) {
      return new Response(JSON.stringify({ 
        error: "Failed to clear webhook", 
        details: deleteResult 
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // جلب معلومات البوت
    const getMeUrl = `https://api.telegram.org/bot${botToken}/getMe`;
    const meResponse = await fetch(getMeUrl);
    const meResult = await meResponse.json();

    // إيقاظ سيرفر Render إذا كان متوفراً
    let renderStatus = "not configured";
    if (RENDER_SERVER_URL) {
      try {
        const healthUrl = `${RENDER_SERVER_URL.replace(/\/$/, '')}/health`;
        const healthRes = await fetch(healthUrl, { signal: AbortSignal.timeout(10000) });
        const healthData = await healthRes.json();
        renderStatus = healthData.telegramBot?.isRunning ? "running" : "starting...";
      } catch {
        renderStatus = "waking up (may take 30s)";
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: "✅ تم تفعيل وضع Long Polling بنجاح! البوت يعمل على Render.",
      mode: "long_polling",
      render_url: RENDER_SERVER_URL || "not set",
      render_status: renderStatus,
      bot_info: meResult.result,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in telegram-setup-webhook:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
