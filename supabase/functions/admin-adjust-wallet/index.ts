import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const externalUrl = Deno.env.get("VITE_EXTERNAL_SUPABASE_URL") || Deno.env.get("EXTERNAL_SUPABASE_URL");
    const externalAnonKey = Deno.env.get("VITE_EXTERNAL_SUPABASE_ANON_KEY") || Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY");
    const externalServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");

    if (!externalUrl || !externalServiceKey || !externalAnonKey) {
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

    // Check if user has wallet-management access (admin or full_access)
    const { data: roleRows, error: roleError } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .in("role", ["admin", "full_access"])
      .limit(1);

    if (roleError || !roleRows || roleRows.length === 0) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { target_user_id, type, amount } = await req.json();

    if (!target_user_id || !type || !amount) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: target_user_id, type, amount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (typeof amount !== "number" || amount <= 0 || amount > 1000000) {
      return new Response(
        JSON.stringify({ error: "Invalid amount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["add", "subtract"].includes(type)) {
      return new Response(
        JSON.stringify({ error: "Invalid type. Must be 'add' or 'subtract'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role to bypass RLS
    const adminClient = createClient(externalUrl, externalServiceKey);

    // Get current wallet
    const { data: wallet, error: walletError } = await adminClient
      .from("wallets")
      .select("id, balance, total_earned")
      .eq("user_id", target_user_id)
      .maybeSingle();

    if (walletError) {
      return new Response(
        JSON.stringify({ error: walletError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!wallet) {
      // Create wallet if it doesn't exist
      const { data: newWallet, error: createError } = await adminClient
        .from("wallets")
        .insert({ user_id: target_user_id, balance: 0, total_earned: 0 })
        .select("id, balance, total_earned")
        .single();

      if (createError) {
        return new Response(
          JSON.stringify({ error: "Failed to create wallet: " + createError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Use the newly created wallet
      Object.assign(wallet || {}, newWallet);
    }

    const currentBalance = wallet?.balance || 0;
    const newBalance = type === "add" 
      ? currentBalance + amount 
      : Math.max(0, currentBalance - amount);

    const totalEarned = type === "add" 
      ? (wallet?.total_earned || 0) + amount 
      : wallet?.total_earned || 0;

    // Update wallet
    const { data: updatedWallet, error: updateError } = await adminClient
      .from("wallets")
      .update({ balance: newBalance, total_earned: totalEarned, updated_at: new Date().toISOString() })
      .eq("user_id", target_user_id)
      .select("id, balance, total_earned")
      .single();

    if (updateError) {
      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log transaction
    await adminClient.from("wallet_transactions").insert({
      wallet_id: updatedWallet.id,
      type: type === "add" ? "admin_credit" : "admin_debit",
      amount: type === "add" ? amount : -amount,
      description: `تعديل إداري: ${type === "add" ? "إضافة" : "خصم"} $${amount}`,
      status: "completed",
    });

    return new Response(
      JSON.stringify({ wallet: updatedWallet }),
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
