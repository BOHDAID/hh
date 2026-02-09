import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// استخدام قاعدة البيانات الخارجية
const EXTERNAL_SUPABASE_URL = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
const EXTERNAL_SERVICE_ROLE_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
const CLOUD_URL = Deno.env.get("SUPABASE_URL")!;

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
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // استخراج user_id من التوكن
    const token = authHeader.replace("Bearer ", "");
    const tokenPayload = JSON.parse(atob(token.split(".")[1]));
    const userId = tokenPayload.sub;

    if (!await isAdmin(userId)) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // جلب Bot Token
    const botToken = await getSetting("telegram_bot_token");
    if (!botToken) {
      return new Response(JSON.stringify({ error: "Bot token not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // رابط الـ Webhook
    const webhookUrl = `${CLOUD_URL}/functions/v1/telegram-bot-webhook`;

    // إعداد الـ Webhook
    const setWebhookUrl = `https://api.telegram.org/bot${botToken}/setWebhook`;
    const response = await fetch(setWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message"],
      }),
    });

    const result = await response.json();

    if (!result.ok) {
      return new Response(JSON.stringify({ 
        error: "Failed to set webhook", 
        details: result 
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // جلب معلومات البوت
    const getMeUrl = `https://api.telegram.org/bot${botToken}/getMe`;
    const meResponse = await fetch(getMeUrl);
    const meResult = await meResponse.json();

    return new Response(JSON.stringify({ 
      success: true,
      message: "Webhook configured successfully",
      webhook_url: webhookUrl,
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
