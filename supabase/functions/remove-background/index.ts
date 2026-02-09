import { createClient } from "npm:@supabase/supabase-js@2";

// ==================== Standalone CORS (no local imports) ====================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// External database configuration (hardcoded for reliability)
const EXTERNAL_SUPABASE_URL = "https://vepwoilxujuyeuutybjp.supabase.co";

/**
 * Background removal edge function
 * Uses EXTERNAL database for auth verification and settings
 */

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ==================== Authentication Check (using EXTERNAL DB) ====================
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - missing token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get external service role key
    const externalServiceRole = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
    if (!externalServiceRole) {
      console.error("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client for EXTERNAL database (where users actually exist)
    const adminClient = createClient(EXTERNAL_SUPABASE_URL, externalServiceRole);
    console.log("remove-background using external DB:", EXTERNAL_SUPABASE_URL);

    // Verify user token against EXTERNAL database
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);

    if (authError || !user) {
      console.error("Auth error:", authError?.message);
      return new Response(
        JSON.stringify({ error: "Unauthorized - invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user has admin access in EXTERNAL database
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    const isAdmin = roleData?.role === "admin" || roleData?.role === "full_access";
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden - admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // ==================== End Authentication ====================

    const { imageUrl } = await req.json();
    if (!imageUrl) {
      throw new Error("imageUrl is required");
    }

    // Fetch API key from EXTERNAL site_settings
    const { data: settingData } = await adminClient
      .from("site_settings")
      .select("value")
      .eq("key", "remove_bg_api_key")
      .single();

    const removeBgApiKey = settingData?.value;
    
    if (removeBgApiKey) {
      // Use remove.bg API for professional background removal
      const formData = new FormData();
      formData.append("image_url", imageUrl);
      formData.append("size", "auto");

      const response = await fetch("https://api.remove.bg/v1.0/removebg", {
        method: "POST",
        headers: {
          "X-Api-Key": removeBgApiKey,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("remove.bg API error:", errorText);
        throw new Error(`Background removal failed: ${response.status}`);
      }

      // Get the image as blob and convert to base64 (chunked to avoid stack overflow)
      const imageBlob = await response.blob();
      const arrayBuffer = await imageBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Convert to base64 in chunks to avoid "Maximum call stack size exceeded"
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, Array.from(chunk));
      }
      const base64 = btoa(binary);
      const processedImageUrl = `data:image/png;base64,${base64}`;

      return new Response(
        JSON.stringify({ processedImageUrl }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If no API key configured, return the original image with a note
    console.log("remove_bg_api_key not configured in site_settings, returning original image");
    
    return new Response(
      JSON.stringify({ 
        processedImageUrl: imageUrl,
        note: "Background removal requires remove_bg_api_key to be configured in site_settings. Get a free API key at https://www.remove.bg/api"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
