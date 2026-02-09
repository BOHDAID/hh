import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * PayPal Connection Test - Tests API credentials
 * يعمل على Lovable Cloud ويقرأ الإعدادات من External Supabase
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const allHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

function errorResponse(message: string, status: number = 400): Response {
  return new Response(JSON.stringify({ success: false, error: message }), { status, headers: allHeaders });
}

function successResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: allHeaders });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Unauthorized", 401);
    }

    // External Supabase (where data is stored)
    const externalUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("VITE_EXTERNAL_SUPABASE_URL");
    const externalServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
    const externalAnonKey = Deno.env.get("VITE_EXTERNAL_SUPABASE_ANON_KEY");

    console.log("🔍 External URL configured:", !!externalUrl);
    console.log("🔍 External Service Key configured:", !!externalServiceKey);
    console.log("🔍 External Anon Key configured:", !!externalAnonKey);

    if (!externalUrl || !externalServiceKey) {
      console.error("❌ External database not configured");
      console.error("EXTERNAL_SUPABASE_URL:", externalUrl);
      console.error("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY:", externalServiceKey ? "[SET]" : "[NOT SET]");
      return errorResponse("External database not configured", 500);
    }

    // Use external anon key for user verification
    const userClient = createClient(externalUrl, externalAnonKey || externalServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      console.error("❌ Auth error:", claimsError);
      return errorResponse("Unauthorized", 401);
    }

    const userId = claimsData.claims.sub as string;
    console.log("✅ User authenticated:", userId);
    
    // Admin client for external DB
    const adminClient = createClient(externalUrl, externalServiceKey);

    // Check if user is admin
    const { data: role, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    console.log("🔍 User role:", role?.role, "Error:", roleError?.message);

    if (!role || (role.role !== "admin" && role.role !== "full_access")) {
      return errorResponse("Forbidden: Admin access required", 403);
    }

    // Get PayPal settings from external DB
    const { data: settings, error: settingsError } = await adminClient
      .from("site_settings")
      .select("key, value")
      .in("key", ["paypal_client_id", "paypal_client_secret", "paypal_mode"]);

    console.log("🔍 Settings fetched:", settings?.length || 0, "Error:", settingsError?.message);

    if (settingsError) {
      console.error("Settings fetch error:", settingsError);
      return errorResponse("Failed to fetch settings", 500);
    }

    const settingsMap: Record<string, string> = {};
    settings?.forEach((s) => {
      settingsMap[s.key] = s.value || "";
      console.log(`🔍 Setting ${s.key}:`, s.value ? `[${s.value.length} chars]` : "[EMPTY]");
    });

    if (!settingsMap.paypal_client_id || !settingsMap.paypal_client_secret) {
      console.log("❌ PayPal credentials missing");
      console.log("  - paypal_client_id:", settingsMap.paypal_client_id ? "SET" : "MISSING");
      console.log("  - paypal_client_secret:", settingsMap.paypal_client_secret ? "SET" : "MISSING");
      return successResponse({
        success: false,
        status: "not_configured",
        message: "بيانات PayPal غير مكتملة - يرجى إدخال Client ID و Client Secret",
      });
    }

    const isSandbox = settingsMap.paypal_mode !== "live";
    const baseUrl = isSandbox
      ? "https://api-m.sandbox.paypal.com"
      : "https://api-m.paypal.com";

    console.log(`🔍 Testing PayPal connection to ${baseUrl} (${isSandbox ? "sandbox" : "live"})`);

    // Try to get access token to verify credentials
    const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${settingsMap.paypal_client_id}:${settingsMap.paypal_client_secret}`)}`,
      },
      body: "grant_type=client_credentials",
    });

    const data = await response.json();
    console.log("🔍 PayPal response status:", response.status);

    if (response.ok && data.access_token) {
      console.log("✅ PayPal connected successfully");
      return successResponse({
        success: true,
        status: "connected",
        mode: isSandbox ? "sandbox" : "live",
        message: `PayPal API متصل بنجاح (${isSandbox ? "وضع تجريبي" : "وضع حقيقي"})`,
        token_type: data.token_type,
        app_id: data.app_id,
        expires_in: data.expires_in,
      });
    } else {
      console.error("❌ PayPal auth failed:", data);
      return successResponse({
        success: false,
        status: "invalid_credentials",
        message: data.error_description || "فشل التحقق من بيانات PayPal - تأكد من صحة Client ID و Client Secret",
        error_details: data.error,
      });
    }
  } catch (error) {
    console.error("PayPal test connection error:", error);
    return errorResponse(error instanceof Error ? error.message : "Unknown error", 500);
  }
});
