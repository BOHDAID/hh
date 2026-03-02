import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RENDER_SERVER_URL = Deno.env.get("RENDER_SERVER_URL");
    const QR_AUTOMATION_SECRET = Deno.env.get("QR_AUTOMATION_SECRET");

    // Debug: Log first 6 chars of secret for debugging (safe partial reveal)
    const secretPreview = QR_AUTOMATION_SECRET ? QR_AUTOMATION_SECRET.substring(0, 6) + "..." : "NOT_SET";
    console.log("🔧 Config check:", { 
      hasRenderUrl: !!RENDER_SERVER_URL, 
      hasSecret: !!QR_AUTOMATION_SECRET,
      secretPreview,
      renderUrlPrefix: RENDER_SERVER_URL?.substring(0, 30) + "..."
    });

    if (!RENDER_SERVER_URL || !QR_AUTOMATION_SECRET) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "لم يتم تكوين RENDER_SERVER_URL أو QR_AUTOMATION_SECRET في Cloud Secrets",
          debug: {
            hasRenderUrl: !!RENDER_SERVER_URL,
            hasSecret: !!QR_AUTOMATION_SECRET
          }
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reqBody = await req.json();
    const { action, email, gmailAppPassword, cookies } = reqBody;
    console.log(`📡 Action: ${action}`);

    let endpoint = "";
    let method = "POST";
    let body: any = { secret: QR_AUTOMATION_SECRET };

    switch (action) {
      case "status":
        endpoint = "/api/qr/session-status";
        method = "GET";
        break;

      case "init":
        endpoint = "/api/qr/session-init";
        body.email = email;
        body.gmailAppPassword = gmailAppPassword;
        break;

      case "logout":
        endpoint = "/api/qr/session-logout";
        break;

      case "get-qr":
        endpoint = "/api/qr/get-qr";
        break;

      case "get-otp":
        endpoint = "/api/qr/get-otp";
        break;

      case "enter-tv-code":
        endpoint = "/api/qr/enter-tv-code";
        body.tvCode = reqBody.tvCode;
        body.email = email;
        break;

      case "reset-counter":
        endpoint = "/api/qr/reset-counter";
        break;

      case "import-cookies":
        endpoint = "/api/qr/import-cookies";
        body.cookies = cookies;
        body.email = email;
        break;

      case "health":
        endpoint = "/health";
        method = "GET";
        break;

      // === Telegram Session Generation ===
      case "tg-send-code":
        endpoint = "/api/telegram-session/send-code";
        body.apiId = reqBody.apiId;
        body.apiHash = reqBody.apiHash;
        body.phone = reqBody.phone;
        break;

      case "tg-verify-code":
        endpoint = "/api/telegram-session/verify-code";
        body.apiId = reqBody.apiId;
        body.phone = reqBody.phone;
        body.code = reqBody.code;
        body.phoneCodeHash = reqBody.phoneCodeHash;
        break;

      case "tg-verify-2fa":
        endpoint = "/api/telegram-session/verify-2fa";
        body.apiId = reqBody.apiId;
        body.phone = reqBody.phone;
        body.password = reqBody.password;
        break;

      default:
        return new Response(
          JSON.stringify({ success: false, error: `إجراء غير معروف: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // إزالة الـ / المكرر
    const baseUrl = RENDER_SERVER_URL.replace(/\/$/, '');
    const fullUrl = `${baseUrl}${endpoint}`;
    console.log(`📡 Calling: ${method} ${fullUrl}`);

    const fetchOptions: RequestInit = {
      method,
      headers: { "Content-Type": "application/json" },
    };

    if (method === "POST") {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(fullUrl, fetchOptions);
    const responseText = await response.text();

    console.log(`📬 Response status: ${response.status}`);
    console.log(`📬 Response preview: ${responseText.substring(0, 200)}`);

    // التحقق من أن الرد JSON وليس HTML
    if (responseText.startsWith("<!") || responseText.startsWith("<html")) {
      console.error("❌ Received HTML instead of JSON - server might be sleeping or URL is wrong");
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "السيرفر قد يكون في وضع النوم أو الرابط غير صحيح. جرب مرة أخرى بعد دقيقة.",
          hint: "Render free tier servers sleep after inactivity. The first request wakes them up.",
          serverUrl: RENDER_SERVER_URL
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // التحقق من رد فارغ (غالباً 502 من Render بسبب Chrome)
    if (!responseText || responseText.trim() === "") {
      console.error("❌ Empty response from server - status:", response.status);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `السيرفر أرجع رد فارغ (${response.status}). غالباً Chrome/Puppeteer لا يعمل. تأكد أن خدمة Render تستخدم بيئة Docker.`,
          hint: "أعد إنشاء خدمة Render واختر Docker كـ Environment"
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // محاولة تحويل الرد لـ JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error("❌ Failed to parse JSON:", responseText.substring(0, 500));
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "استجابة غير صالحة من السيرفر",
          rawResponse: responseText.substring(0, 200)
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`✅ Success:`, data);

    // إذا كان الخطأ Unauthorized، نعطي تلميح واضح
    if (data.error === "Unauthorized" || response.status === 401) {
      console.error("❌ Secret mismatch! Check QR_AUTOMATION_SECRET in Lovable Cloud matches Render");
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "فشل المصادقة - تأكد أن QR_AUTOMATION_SECRET في Lovable Cloud يتطابق مع نفس القيمة في Render",
          hint: "قم بتحديث QR_AUTOMATION_SECRET في كلا المكانين بنفس القيمة بالضبط",
          secretPreview
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: data.success !== false, ...data }),
      { 
        status: response.ok ? 200 : 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error("❌ OSN Session Error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        type: error.name
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
