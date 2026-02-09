import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const externalUrl = Deno.env.get("VITE_EXTERNAL_SUPABASE_URL")!;
    const externalAnonKey = Deno.env.get("VITE_EXTERNAL_SUPABASE_ANON_KEY")!;
    const externalServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;

    if (!externalUrl || !externalServiceKey) {
      console.error("External DB env missing");
      return new Response(
        JSON.stringify({ error: "Backend not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the user is admin using their token
    const userClient = createClient(externalUrl, externalAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is admin
    const { data: roleData } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .single();

    if (!roleData || roleData.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role to bypass RLS and get all wallets
    const adminClient = createClient(externalUrl, externalServiceKey);
    
    const { data: wallets, error: walletsError } = await adminClient
      .from("wallets")
      .select("id, user_id, balance, total_earned");

    if (walletsError) {
      console.error("Error fetching wallets:", walletsError);
      return new Response(
        JSON.stringify({ error: walletsError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ wallets }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Runtime error:", e);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
