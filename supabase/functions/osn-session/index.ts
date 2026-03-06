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
  "tg-save-mentions-channel",
  "tg-get-mentions-channel",
  "tg-save-automation-state",
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

const parseMaybeJson = <T>(value: unknown, fallback: T): T => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const parseStoredSessionPayload = (rawSelectedGroups: unknown) => {
  const parsed = parseMaybeJson<unknown>(rawSelectedGroups, []);

  if (Array.isArray(parsed)) {
    return {
      groups: parsed,
      automation: {},
    };
  }

  if (isRecord(parsed)) {
    const groups = Array.isArray(parsed.groups)
      ? parsed.groups
      : Array.isArray(parsed.selectedGroups)
        ? parsed.selectedGroups
        : [];

    const automation = isRecord(parsed.automation) ? parsed.automation : {};

    return {
      groups,
      automation,
    };
  }

  return {
    groups: [],
    automation: {},
  };
};

type AccountSessionRecord = {
  session_string: string;
  telegram_user: unknown;
  selected_groups: unknown;
  mentions_channel_id: string | null;
  updated_at?: string | null;
};

const TELEGRAM_SESSION_FALLBACK_CATEGORY = "telegram_automation";

const getFallbackSessionKey = (userId: string): string => `telegram_session_${userId}`;

const isTableMissingError = (error: any, tableName: string): boolean => {
  if (!error) return false;
  return error.code === "PGRST205"
    && typeof error.message === "string"
    && error.message.includes(`'public.${tableName}'`);
};

const loadFallbackAccountSession = async (
  sessionClient: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ session: AccountSessionRecord | null; error: any }> => {
  const key = getFallbackSessionKey(userId);
  const { data, error } = await sessionClient
    .from("site_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) return { session: null, error };

  const parsed = parseMaybeJson<Record<string, unknown> | null>(data?.value, null);
  if (!parsed || typeof parsed.session_string !== "string") {
    return { session: null, error: null };
  }

  return {
    session: {
      session_string: parsed.session_string,
      telegram_user: parsed.telegram_user ?? null,
      selected_groups: parsed.selected_groups ?? null,
      mentions_channel_id: typeof parsed.mentions_channel_id === "string" ? parsed.mentions_channel_id : null,
      updated_at: typeof parsed.updated_at === "string" ? parsed.updated_at : null,
    },
    error: null,
  };
};

const saveFallbackAccountSession = async (
  sessionClient: ReturnType<typeof createClient>,
  userId: string,
  session: AccountSessionRecord,
): Promise<{ error: any }> => {
  const key = getFallbackSessionKey(userId);
  const value = JSON.stringify(session);
  const nowIso = new Date().toISOString();

  const { data: existing, error: loadError } = await sessionClient
    .from("site_settings")
    .select("id")
    .eq("key", key)
    .limit(1);

  if (loadError) return { error: loadError };

  const existingId = existing?.[0]?.id;
  if (existingId) {
    const { error } = await sessionClient
      .from("site_settings")
      .update({
        value,
        is_sensitive: true,
        category: TELEGRAM_SESSION_FALLBACK_CATEGORY,
        updated_at: nowIso,
      })
      .eq("id", existingId);

    return { error };
  }

  const { error } = await sessionClient
    .from("site_settings")
    .insert({
      key,
      value,
      is_sensitive: true,
      category: TELEGRAM_SESSION_FALLBACK_CATEGORY,
      description: "Fallback Telegram automation session storage",
      updated_at: nowIso,
    });

  return { error };
};

const deleteFallbackAccountSession = async (
  sessionClient: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ error: any }> => {
  const key = getFallbackSessionKey(userId);
  const { error } = await sessionClient
    .from("site_settings")
    .delete()
    .eq("key", key);

  return { error };
};

const loadAccountSession = async (
  sessionClient: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ session: AccountSessionRecord | null; error: any; source: "telegram_sessions" | "site_settings" }> => {
  const { data, error } = await sessionClient
    .from("telegram_sessions")
    .select("session_string, telegram_user, selected_groups, mentions_channel_id, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isTableMissingError(error, "telegram_sessions")) {
      const fallback = await loadFallbackAccountSession(sessionClient, userId);
      return { session: fallback.session, error: fallback.error, source: "site_settings" };
    }
    return { session: null, error, source: "telegram_sessions" };
  }

  return { session: data as AccountSessionRecord | null, error: null, source: "telegram_sessions" };
};

const upsertAccountSession = async (
  sessionClient: ReturnType<typeof createClient>,
  userId: string,
  session: AccountSessionRecord,
): Promise<{ error: any; source: "telegram_sessions" | "site_settings" }> => {
  const { error } = await sessionClient
    .from("telegram_sessions")
    .upsert(
      {
        user_id: userId,
        session_string: session.session_string,
        telegram_user: serializeMaybeJson(session.telegram_user),
        selected_groups: serializeMaybeJson(session.selected_groups),
        mentions_channel_id: session.mentions_channel_id,
        updated_at: session.updated_at ?? new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) {
    if (isTableMissingError(error, "telegram_sessions")) {
      const fallback = await saveFallbackAccountSession(sessionClient, userId, {
        ...session,
        updated_at: session.updated_at ?? new Date().toISOString(),
      });
      return { error: fallback.error, source: "site_settings" };
    }
    return { error, source: "telegram_sessions" };
  }

  return { error: null, source: "telegram_sessions" };
};

const deleteAccountSession = async (
  sessionClient: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ error: any; source: "telegram_sessions" | "site_settings" }> => {
  const { error } = await sessionClient
    .from("telegram_sessions")
    .delete()
    .eq("user_id", userId);

  if (error) {
    if (isTableMissingError(error, "telegram_sessions")) {
      const fallback = await deleteFallbackAccountSession(sessionClient, userId);
      return { error: fallback.error, source: "site_settings" };
    }
    return { error, source: "telegram_sessions" };
  }

  return { error: null, source: "telegram_sessions" };
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

    const EXTERNAL_SUPABASE_URL = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("VITE_EXTERNAL_SUPABASE_URL");
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

      if (!EXTERNAL_SUPABASE_URL || !EXTERNAL_SUPABASE_SERVICE_ROLE_KEY) {
        return new Response(
          JSON.stringify({ success: false, error: "إعدادات قاعدة البيانات الخارجية غير مكتملة" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      sessionClient = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_SERVICE_ROLE_KEY, {
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
      case "tg-send-code": {
        endpoint = "/api/telegram-session/send-code";
        body.apiId = reqBody.apiId;
        body.apiHash = reqBody.apiHash;
        // تنظيف رقم الهاتف - إزالة المسافات وإضافة + إذا لم تكن موجودة
        let phoneNum = String(reqBody.phone || "").replace(/[\s\-\(\)]/g, '');
        if (!phoneNum.startsWith('+')) phoneNum = '+' + phoneNum;
        body.phone = phoneNum;
        console.log(`📱 Phone number (sanitized): ${phoneNum.substring(0, 4)}***`);
        break;
      }

      case "tg-verify-code": {
        endpoint = "/api/telegram-session/verify-code";
        body.apiId = reqBody.apiId;
        let phoneNum = String(reqBody.phone || "").replace(/[\s\-\(\)]/g, "");
        if (!phoneNum.startsWith("+")) phoneNum = `+${phoneNum}`;
        body.phone = phoneNum;
        body.code = reqBody.code;
        body.phoneCodeHash = reqBody.phoneCodeHash;
        break;
      }

      case "tg-verify-2fa": {
        endpoint = "/api/telegram-session/verify-2fa";
        body.apiId = reqBody.apiId;
        let phoneNum = String(reqBody.phone || "").replace(/[\s\-\(\)]/g, "");
        if (!phoneNum.startsWith("+")) phoneNum = `+${phoneNum}`;
        body.phone = phoneNum;
        body.password = reqBody.password;
        break;
      }

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
        body.mentionsChannelId = reqBody.mentionsChannelId;
        body.mediaBase64 = reqBody.mediaBase64;
        body.mediaFileName = reqBody.mediaFileName;
        body.mediaMimeType = reqBody.mediaMimeType;
        body.mediaSendType = reqBody.mediaSendType;
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
        body.mediaBase64 = reqBody.mediaBase64;
        body.mediaFileName = reqBody.mediaFileName;
        body.mediaMimeType = reqBody.mediaMimeType;
        body.mediaSendType = reqBody.mediaSendType;
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

      // === Telegram Channels & Mentions Monitor ===
      case "tg-fetch-channels":
        endpoint = "/api/telegram-auto/fetch-channels";
        body.sessionString = reqBody.sessionString;
        break;

      case "tg-create-mentions-channel":
        endpoint = "/api/telegram-auto/create-mentions-channel";
        body.sessionString = reqBody.sessionString;
        break;

      case "tg-start-mentions-monitor":
        endpoint = "/api/telegram-auto/start-mentions-monitor";
        body.sessionString = reqBody.sessionString;
        body.channelId = reqBody.channelId;
        body.taskId = reqBody.taskId;
        break;

      case "tg-stop-mentions-monitor":
        endpoint = "/api/telegram-auto/stop-mentions-monitor";
        body.taskId = reqBody.taskId;
        break;

      case "tg-get-mentions":
        endpoint = "/api/telegram-auto/get-mentions";
        body.taskId = reqBody.taskId;
        break;

      case "tg-get-stats":
        endpoint = "/api/telegram-auto/get-stats";
        break;

      case "tg-start-auto-reply":
        endpoint = "/api/telegram-auto/start-auto-reply";
        body.sessionString = reqBody.sessionString;
        body.replyMessage = reqBody.replyMessage;
        body.taskId = reqBody.taskId;
        body.mentionsChannelId = reqBody.mentionsChannelId;
        body.mediaBase64 = reqBody.mediaBase64;
        body.mediaFileName = reqBody.mediaFileName;
        body.mediaMimeType = reqBody.mediaMimeType;
        body.mediaSendType = reqBody.mediaSendType;
        break;

      case "tg-stop-auto-reply":
        endpoint = "/api/telegram-auto/stop-auto-reply";
        body.taskId = reqBody.taskId;
        break;

      case "tg-auto-reply-status":
        endpoint = "/api/telegram-auto/auto-reply-status";
        body.taskId = reqBody.taskId;
        break;

      case "tg-start-anti-delete":
        endpoint = "/api/telegram-auto/start-anti-delete";
        body.sessionString = reqBody.sessionString;
        body.taskId = reqBody.taskId;
        body.mentionsChannelId = reqBody.mentionsChannelId;
        break;

      case "tg-stop-anti-delete":
        endpoint = "/api/telegram-auto/stop-anti-delete";
        body.taskId = reqBody.taskId;
        break;

      case "tg-anti-delete-status":
        endpoint = "/api/telegram-auto/anti-delete-status";
        body.taskId = reqBody.taskId;
        break;

      case "tg-get-premium-emojis":
        endpoint = "/api/telegram-auto/get-premium-emojis";
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

        const loaded = await loadAccountSession(sessionClient!, accountUserId!);
        if (loaded.error) {
          console.error("❌ Load existing account session failed:", loaded.error);
          return new Response(
            JSON.stringify({ success: false, error: loaded.error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const existingPayload = parseStoredSessionPayload(loaded.session?.selected_groups);
        const incomingGroups = Array.isArray(reqBody.selectedGroups)
          ? reqBody.selectedGroups
          : existingPayload.groups;
        const incomingAutomation = isRecord(reqBody.automationState)
          ? reqBody.automationState
          : {};
        const mergedAutomation = {
          ...existingPayload.automation,
          ...incomingAutomation,
        };

        const mergedTelegramUser = reqBody.telegramUser !== undefined
          ? reqBody.telegramUser
          : parseMaybeJson(loaded.session?.telegram_user, null);

        const selectedGroupsPayload = {
          groups: incomingGroups,
          automation: mergedAutomation,
        };

        const saveResult = await upsertAccountSession(sessionClient!, accountUserId!, {
          session_string: sessionString,
          telegram_user: mergedTelegramUser,
          selected_groups: selectedGroupsPayload,
          mentions_channel_id: loaded.session?.mentions_channel_id ?? null,
          updated_at: new Date().toISOString(),
        });

        if (saveResult.error) {
          console.error("❌ Save account session failed:", saveResult.error);
          return new Response(
            JSON.stringify({ success: false, error: saveResult.error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "tg-get-account-session": {
        const loaded = await loadAccountSession(sessionClient!, accountUserId!);

        if (loaded.error) {
          console.error("❌ Get account session failed:", loaded.error);
          return new Response(
            JSON.stringify({ success: false, error: loaded.error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, session: loaded.session || null, storage_source: loaded.source }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "tg-delete-account-session": {
        const deleted = await deleteAccountSession(sessionClient!, accountUserId!);

        if (deleted.error) {
          console.error("❌ Delete account session failed:", deleted.error);
          return new Response(
            JSON.stringify({ success: false, error: deleted.error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, storage_source: deleted.source }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "tg-save-mentions-channel": {
        const channelId = reqBody.mentionsChannelId || null;
        const loaded = await loadAccountSession(sessionClient!, accountUserId!);

        if (loaded.error) {
          console.error("❌ Load session for mentions channel failed:", loaded.error);
          return new Response(
            JSON.stringify({ success: false, error: loaded.error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!loaded.session?.session_string) {
          return new Response(
            JSON.stringify({ success: false, error: "يجب حفظ الجلسة أولاً قبل تحديد قناة الإشعارات" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const saveResult = await upsertAccountSession(sessionClient!, accountUserId!, {
          ...loaded.session,
          mentions_channel_id: channelId,
          updated_at: new Date().toISOString(),
        });

        if (saveResult.error) {
          console.error("❌ Save mentions channel failed:", saveResult.error);
          return new Response(
            JSON.stringify({ success: false, error: saveResult.error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, storage_source: saveResult.source }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "tg-get-mentions-channel": {
        const loaded = await loadAccountSession(sessionClient!, accountUserId!);

        if (loaded.error) {
          console.error("❌ Get mentions channel failed:", loaded.error);
          return new Response(
            JSON.stringify({ success: false, error: loaded.error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            mentionsChannelId: loaded.session?.mentions_channel_id || null,
            storage_source: loaded.source,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "tg-save-automation-state": {
        if (!isRecord(reqBody.automationState)) {
          return new Response(
            JSON.stringify({ success: false, error: "automationState غير صالح" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const loaded = await loadAccountSession(sessionClient!, accountUserId!);

        if (loaded.error) {
          console.error("❌ Load session for automation state failed:", loaded.error);
          return new Response(
            JSON.stringify({ success: false, error: loaded.error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!loaded.session?.session_string) {
          return new Response(
            JSON.stringify({ success: false, error: "يجب حفظ الجلسة أولاً قبل حفظ حالة الأتمتة" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const existingPayload = parseStoredSessionPayload(loaded.session.selected_groups);
        const mergedPayload = {
          groups: existingPayload.groups,
          automation: {
            ...existingPayload.automation,
            ...reqBody.automationState,
          },
        };

        const saveResult = await upsertAccountSession(sessionClient!, accountUserId!, {
          ...loaded.session,
          selected_groups: mergedPayload,
          updated_at: new Date().toISOString(),
        });

        if (saveResult.error) {
          console.error("❌ Save automation state failed:", saveResult.error);
          return new Response(
            JSON.stringify({ success: false, error: saveResult.error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, storage_source: saveResult.source }),
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
