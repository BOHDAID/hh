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

// إرسال رسالة تيليجرام
async function sendTelegramMessage(botToken: string, chatId: string, text: string) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: "HTML",
    }),
  });
  return response.json();
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

    const { activation_code_id, otp_code } = await req.json();

    if (!activation_code_id || !otp_code) {
      return new Response(JSON.stringify({ error: "Missing activation_code_id or otp_code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // جلب كود التفعيل
    const { data: activationCode, error } = await supabase
      .from("activation_codes")
      .select("*")
      .eq("id", activation_code_id)
      .maybeSingle();

    if (error || !activationCode) {
      return new Response(JSON.stringify({ error: "Activation code not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!activationCode.telegram_chat_id) {
      return new Response(JSON.stringify({ error: "No Telegram chat associated with this code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // جلب Bot Token
    const botToken = await getSetting("telegram_bot_token");
    if (!botToken) {
      return new Response(JSON.stringify({ error: "Bot token not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // جلب قالب الرسالة
    let otpMessage = await getSetting("telegram_otp_success") || 
      "🔐 رمز التحقق: <code>{otp}</code>\n\n⚠️ صالح لمدة 5 دقائق فقط!";
    
    otpMessage = otpMessage.replace("{otp}", otp_code);

    // إرسال الرسالة
    const result = await sendTelegramMessage(botToken, activationCode.telegram_chat_id, otpMessage);

    if (!result.ok) {
      console.error("Failed to send Telegram message:", result);
      return new Response(JSON.stringify({ error: "Failed to send message", details: result }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // حفظ رمز OTP في قاعدة البيانات
    await supabase.from("otp_codes").insert({
      activation_code_id: activation_code_id,
      otp_code: otp_code,
      source: "manual",
      is_delivered: true,
      delivered_at: new Date().toISOString(),
    });

    // تحديث حالة الكود
    await supabase
      .from("activation_codes")
      .update({
        status: "used",
        is_used: true,
        used_at: new Date().toISOString(),
      })
      .eq("id", activation_code_id);

    return new Response(JSON.stringify({ 
      success: true, 
      message: "OTP sent successfully" 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in telegram-send-otp:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
