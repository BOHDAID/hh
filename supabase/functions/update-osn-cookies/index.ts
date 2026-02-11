import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const EXTERNAL_URL = Deno.env.get("EXTERNAL_SUPABASE_URL");
    const EXTERNAL_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");

    if (!EXTERNAL_URL || !EXTERNAL_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "External DB not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const externalDb = createClient(EXTERNAL_URL, EXTERNAL_KEY);
    const { cookies, email, session_id } = await req.json();

    if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No valid cookies provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update by session_id or by email
    let query = externalDb.from("osn_sessions").update({
      cookies: cookies,
      is_active: true,
      is_connected: true,
      updated_at: new Date().toISOString(),
      last_activity: new Date().toISOString(),
    });

    if (session_id) {
      query = query.eq("id", session_id);
    } else if (email) {
      query = query.eq("email", email);
    } else {
      // Update all active sessions
      query = query.eq("is_active", true);
    }

    const { data, error } = await query.select();

    if (error) {
      console.error("❌ Update error:", error.message);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`✅ Updated ${data?.length || 0} sessions with ${cookies.length} cookies`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        updated: data?.length || 0,
        cookiesCount: cookies.length 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ Error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
