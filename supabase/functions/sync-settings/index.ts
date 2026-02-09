import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SettingItem {
  key: string;
  value: string;
  category: string;
  description?: string;
  is_sensitive?: boolean;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get external Supabase credentials from secrets
    const externalUrl = Deno.env.get("VITE_EXTERNAL_SUPABASE_URL");
    const externalAnonKey = Deno.env.get("VITE_EXTERNAL_SUPABASE_ANON_KEY");

    if (!externalUrl || !externalAnonKey) {
      console.error("External Supabase credentials not configured");
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "External database not configured" 
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Create external Supabase client with service role for admin operations
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const externalClient = createClient(externalUrl, externalAnonKey);

    const { action, settings } = await req.json();
    console.log(`Processing action: ${action}`);

    if (action === "init") {
      // Initialize default settings
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
        
        // Resend
        { key: "resend_api_key", value: Deno.env.get("RESEND_API_KEY") || "", category: "email", description: "Resend API Key", is_sensitive: true },
      ];

      // Upsert each setting
      for (const setting of defaultSettings) {
        const { error } = await externalClient
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
        }
      }

      console.log("Default settings initialized successfully");
      return new Response(
        JSON.stringify({ success: true, message: "Settings initialized" }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (action === "update" && settings) {
      // Update specific settings
      for (const setting of settings as SettingItem[]) {
        const { error } = await externalClient
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
          console.error(`Error updating ${setting.key}:`, error);
          throw error;
        }
      }

      console.log("Settings updated successfully");
      return new Response(
        JSON.stringify({ success: true, message: "Settings updated" }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (action === "sync_from_secrets") {
      // Sync secrets to database
      const secretsToSync = [
        { key: "ltc_xpub", envKey: "LTC_XPUB", category: "payment", is_sensitive: true },
        { key: "resend_api_key", envKey: "RESEND_API_KEY", category: "email", is_sensitive: true },
      ];

      for (const secret of secretsToSync) {
        const value = Deno.env.get(secret.envKey);
        if (value) {
          const { error } = await externalClient
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
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: "Secrets synced to database" }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid action" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in sync-settings:", error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
