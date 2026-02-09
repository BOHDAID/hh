import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * ============================================================
 * نسخة Self-Hosted مستقلة 100%
 * sync-settings: مزامنة إعدادات الموقع
 * ============================================================
 * 
 * Secrets المطلوبة في Supabase Dashboard:
 * - SUPABASE_URL
 * - SUPABASE_ANON_KEY
 * - SUPABASE_SERVICE_ROLE_KEY
 * - RESEND_API_KEY (اختياري - لمزامنة مفتاح البريد)
 * - LTC_XPUB (اختياري - لمزامنة مفتاح الكريبتو)
 * ============================================================
 */

// ==================== CORS Headers ====================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ==================== Security Headers ====================
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
};

const allHeaders = {
  ...corsHeaders,
  ...securityHeaders,
  "Content-Type": "application/json",
};

// ==================== Helper Functions ====================
function errorResponse(message: string, status: number = 400): Response {
  return new Response(
    JSON.stringify({ success: false, error: message }),
    { status, headers: allHeaders }
  );
}

function successResponse(data: unknown, status: number = 200): Response {
  return new Response(
    JSON.stringify(data),
    { status, headers: allHeaders }
  );
}

function sanitizeString(input: string): string {
  if (!input || typeof input !== "string") return "";
  return input
    .replace(/[<>]/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+=/gi, "")
    .trim()
    .slice(0, 10000);
}

// ==================== Types ====================
interface SettingItem {
  key: string;
  value: string;
  category: string;
  description?: string;
  is_sensitive?: boolean;
}

// ==================== Main Handler ====================
serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get Supabase credentials
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase credentials");
      return errorResponse("Server configuration error", 500);
    }

    // Create admin client
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const { action, settings } = await req.json();
    console.log(`Processing action: ${action}`);

    // ==================== ACTION: init ====================
    if (action === "init") {
      const defaultSettings: SettingItem[] = [
        // General
        { key: "site_name", value: "متجر رقمي", category: "general", description: "اسم الموقع" },
        { key: "site_description", value: "متجر للمنتجات الرقمية", category: "general", description: "وصف الموقع" },
        { key: "contact_email", value: "", category: "general", description: "بريد التواصل" },
        { key: "contact_phone", value: "", category: "general", description: "رقم التواصل" },
        
        // SMTP
        { key: "smtp_host", value: "", category: "smtp", description: "خادم SMTP", is_sensitive: false },
        { key: "smtp_port", value: "587", category: "smtp", description: "منفذ SMTP" },
        { key: "smtp_user", value: "", category: "smtp", description: "اسم مستخدم SMTP", is_sensitive: true },
        { key: "smtp_password", value: "", category: "smtp", description: "كلمة مرور SMTP", is_sensitive: true },
        { key: "smtp_from_email", value: "", category: "smtp", description: "بريد المرسل" },
        { key: "smtp_from_name", value: "", category: "smtp", description: "اسم المرسل" },
        
        // Payment - PayPal
        { key: "paypal_client_id", value: "", category: "payment", description: "PayPal Client ID", is_sensitive: true },
        { key: "paypal_secret", value: "", category: "payment", description: "PayPal Secret", is_sensitive: true },
        { key: "paypal_mode", value: "sandbox", category: "payment", description: "PayPal Mode (sandbox/live)" },
        
        // Payment - Crypto
        { key: "ltc_xpub", value: "", category: "payment", description: "Litecoin xPub Key", is_sensitive: true },
        { key: "btc_xpub", value: "", category: "payment", description: "Bitcoin xPub Key", is_sensitive: true },
        { key: "enabled_cryptos", value: "LTC", category: "payment", description: "العملات المفعلة (مفصولة بفاصلة)" },
        { key: "crypto_fee_percent", value: "3", category: "payment", description: "نسبة رسوم الكريبتو %" },
        { key: "nowpayments_api_key", value: "", category: "payment", description: "NOWPayments API Key", is_sensitive: true },
        
        // Payment - Lemon Squeezy
        { key: "lemonsqueezy_api_key", value: "", category: "payment", description: "Lemon Squeezy API Key", is_sensitive: true },
        { key: "lemonsqueezy_store_id", value: "", category: "payment", description: "Lemon Squeezy Store ID" },
        
        // Email - Resend
        { key: "resend_api_key", value: Deno.env.get("RESEND_API_KEY") || "", category: "email", description: "Resend API Key", is_sensitive: true },
      ];

      // Upsert each setting
      let successCount = 0;
      for (const setting of defaultSettings) {
        const { error } = await adminClient
          .from("site_settings")
          .upsert({
            key: setting.key,
            value: setting.value,
            category: setting.category,
            description: setting.description,
            is_sensitive: setting.is_sensitive || false,
            updated_at: new Date().toISOString(),
          }, { onConflict: "key" });

        if (error) {
          console.error(`Error upserting ${setting.key}:`, error);
        } else {
          successCount++;
        }
      }

      console.log(`Default settings initialized: ${successCount}/${defaultSettings.length}`);
      return successResponse({ 
        success: true, 
        message: "Settings initialized",
        count: successCount
      });
    }

    // ==================== ACTION: update ====================
    if (action === "update" && settings) {
      const settingsArray = settings as SettingItem[];
      let successCount = 0;

      for (const setting of settingsArray) {
        const { error } = await adminClient
          .from("site_settings")
          .upsert({
            key: sanitizeString(setting.key),
            value: setting.value, // Don't sanitize value as it may contain special characters
            category: sanitizeString(setting.category),
            description: setting.description ? sanitizeString(setting.description) : null,
            is_sensitive: setting.is_sensitive || false,
            updated_at: new Date().toISOString(),
          }, { onConflict: "key" });

        if (error) {
          console.error(`Error updating ${setting.key}:`, error);
        } else {
          successCount++;
        }
      }

      console.log(`Settings updated: ${successCount}/${settingsArray.length}`);
      return successResponse({ 
        success: true, 
        message: "Settings updated",
        count: successCount
      });
    }

    // ==================== ACTION: sync_from_secrets ====================
    if (action === "sync_from_secrets") {
      const secretsToSync = [
        { key: "ltc_xpub", envKey: "LTC_XPUB", category: "payment", is_sensitive: true },
        { key: "resend_api_key", envKey: "RESEND_API_KEY", category: "email", is_sensitive: true },
      ];

      let syncedCount = 0;
      for (const secret of secretsToSync) {
        const value = Deno.env.get(secret.envKey);
        if (value) {
          const { error } = await adminClient
            .from("site_settings")
            .upsert({
              key: secret.key,
              value: value,
              category: secret.category,
              is_sensitive: secret.is_sensitive,
              updated_at: new Date().toISOString(),
            }, { onConflict: "key" });

          if (error) {
            console.error(`Error syncing ${secret.key}:`, error);
          } else {
            console.log(`Synced ${secret.key} from secrets`);
            syncedCount++;
          }
        }
      }

      return successResponse({ 
        success: true, 
        message: "Secrets synced to database",
        synced: syncedCount
      });
    }

    // ==================== ACTION: get ====================
    if (action === "get") {
      const { data, error } = await adminClient
        .from("site_settings")
        .select("*")
        .order("category", { ascending: true });

      if (error) {
        console.error("Error fetching settings:", error);
        return errorResponse("Failed to fetch settings", 500);
      }

      return successResponse({ 
        success: true, 
        settings: data 
      });
    }

    // ==================== Invalid Action ====================
    return errorResponse("Invalid action. Supported: init, update, sync_from_secrets, get");

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in sync-settings:", error);
    return errorResponse(errorMessage, 500);
  }
});
