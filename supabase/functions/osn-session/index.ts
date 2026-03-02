import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ACCOUNT_SESSION_ACTIONS = new Set([
  "tg-save-account-session",
  "tg-get-account-session",
  "tg-delete-account-session",
]);

const getBearerToken = (req: Request): string | null => {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.replace("Bearer ", "").trim();
};

const serializeMaybeJson = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

const getAuthenticatedUserId = async (req: Request): Promise<string | null> => {
  const token = getBearerToken(req);
  if (!token) return null;

  const externalUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("VITE_EXTERNAL_SUPABASE_URL");
  const externalAnonKey = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") || Deno.env.get("VITE_EXTERNAL_SUPABASE_ANON_KEY");
  if (!externalUrl || !externalAnonKey) {
    throw new Error("External auth configuration missing");
  }

  const authClient = createClient(externalUrl, externalAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
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
    let body: Record<string, unknown> = { secret: QR_AUTOMATION_SECRET };

    const EXTERNAL_SUPABASE_URL = Deno.env.get("EXTERNAL_SUPABASE_URL");
    const EXTERNAL_SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");

    const needsAccountSessionAccess = ACCOUNT_SESSION_ACTIONS.has(action);
    let accountUserId: string | null = null;
    let sessionClient: ReturnType<typeof createClient> | null = null;

    if (needsAccountSessionAccess) {
      accountUserId = await getAuthenticatedUserId(req);
      if (!accountUserId) {
        return new Response(
          JSON.stringify({ success: false, error: "يجب تسجيل الدخول أولاً لحفظ الجلسة في الحساب" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Use Lovable Cloud DB (where telegram_sessions table exists)
      const cloudUrl = Deno.env.get("SUPABASE_URL");
      const cloudServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!cloudUrl || !cloudServiceKey) {
        return new Response(
          JSON.stringify({ success: false, error: "إعدادات قاعدة بيانات Cloud غير مكتملة" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      sessionClient = createClient(cloudUrl, cloudServiceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }

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

      case "tg-connect-session":
        endpoint = "/api/telegram-session/connect-session";
        body.sessionString = reqBody.sessionString;
        break;

      // === Telegram Automation ===
      case "tg-fetch-groups":
        endpoint = "/api/telegram-auto/fetch-groups";
        body.sessionString = reqBody.sessionString;
        break;

      case "tg-fetch-contacts":
        endpoint = "/api/telegram-auto/fetch-contacts";
        body.sessionString = reqBody.sessionString;
        break;

      case "tg-start-auto-publish":
        endpoint = "/api/telegram-auto/start-auto-publish";
        body.sessionString = reqBody.sessionString;
        body.groupIds = reqBody.groupIds;
        body.message = reqBody.message;
        body.intervalMinutes = reqBody.intervalMinutes;
        body.taskId = reqBody.taskId;
        break;

      case "tg-stop-auto-publish":
        endpoint = "/api/telegram-auto/stop-auto-publish";
        body.taskId = reqBody.taskId;
        break;

      case "tg-auto-publish-status":
        endpoint = "/api/telegram-auto/auto-publish-status";
        body.taskId = reqBody.taskId;
        break;

      case "tg-broadcast":
        endpoint = "/api/telegram-auto/broadcast";
        body.sessionString = reqBody.sessionString;
        body.message = reqBody.message;
        body.blacklistIds = reqBody.blacklistIds;
        body.includeContacts = reqBody.includeContacts;
        body.taskId = reqBody.taskId;
        break;

      // === Telegram Dialogs ===
      case "tg-fetch-dialogs":
        endpoint = "/api/telegram-auto/fetch-dialogs";
        body.sessionString = reqBody.sessionString;
        break;

      // === Telegram Profile ===
      case "tg-get-profile":
        endpoint = "/api/telegram-auto/get-profile";
        body.sessionString = reqBody.sessionString;
        break;

      case "tg-update-profile":
        endpoint = "/api/telegram-auto/update-profile";
        body.sessionString = reqBody.sessionString;
        body.firstName = reqBody.firstName;
        body.lastName = reqBody.lastName;
        body.about = reqBody.about;
        break;

      case "tg-update-profile-photo":
        endpoint = "/api/telegram-auto/update-profile-photo";
        body.sessionString = reqBody.sessionString;
        body.photoBase64 = reqBody.photoBase64;
        break;

      case "tg-delete-profile-photo":
        endpoint = "/api/telegram-auto/delete-profile-photo";
        body.sessionString = reqBody.sessionString;
        break;

      case "tg-save-account-session": {
        const sessionString = typeof reqBody.sessionString === "string" ? reqBody.sessionString.trim() : "";
        if (!sessionString) {
          return new Response(
            JSON.stringify({ success: false, error: "sessionString مطلوب" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { error } = await sessionClient!
          .from("telegram_sessions")
          .upsert(
            {
              user_id: accountUserId,
              session_string: sessionString,
              telegram_user: serializeMaybeJson(reqBody.telegramUser),
              selected_groups: serializeMaybeJson(reqBody.selectedGroups),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );

        if (error) {
          console.error("❌ Save account session failed:", error);
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "tg-get-account-session": {
        const { data, error } = await sessionClient!
          .from("telegram_sessions")
          .select("session_string, telegram_user, selected_groups, updated_at")
          .eq("user_id", accountUserId)
          .maybeSingle();

        if (error) {
          console.error("❌ Get account session failed:", error);
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, session: data || null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "tg-delete-account-session": {
        const { error } = await sessionClient!
          .from("telegram_sessions")
          .delete()
          .eq("user_id", accountUserId);

        if (error) {
          console.error("❌ Delete account session failed:", error);
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

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
