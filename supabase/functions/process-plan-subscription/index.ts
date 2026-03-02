import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, allHeaders, errorResponse, successResponse, isValidUUID } from "../_shared/security.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Missing authorization", 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return errorResponse("Unauthorized", 401);

    const body = await req.json();
    const { plan_id, payment_method } = body;

    if (!plan_id || !isValidUUID(plan_id)) return errorResponse("Invalid plan_id");
    if (!payment_method) return errorResponse("Missing payment_method");

    // Fetch plan
    const { data: plan, error: planError } = await supabase
      .from("telegram_plans")
      .select("*")
      .eq("id", plan_id)
      .eq("is_active", true)
      .single();

    if (planError || !plan) return errorResponse("Plan not found");

    const amount = Number(plan.price);

    if (payment_method === "wallet") {
      // Check wallet balance
      const { data: wallet } = await supabase
        .from("wallets")
        .select("id, balance")
        .eq("user_id", user.id)
        .single();

      if (!wallet || Number(wallet.balance) < amount) {
        return errorResponse("رصيد المحفظة غير كافي");
      }

      // Deduct from wallet
      const newBalance = Number(wallet.balance) - amount;
      const { error: walletError } = await supabase
        .from("wallets")
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq("id", wallet.id);

      if (walletError) return errorResponse("Failed to deduct wallet balance");

      // Record wallet transaction
      await supabase.from("wallet_transactions").insert({
        wallet_id: wallet.id,
        type: "purchase",
        amount: -amount,
        description: `اشتراك باقة: ${plan.name}`,
        status: "completed",
      });

      // Create subscription
      const now = new Date();
      const endsAt = new Date(now.getTime() + plan.duration_days * 24 * 60 * 60 * 1000);

      const { data: subscription, error: subError } = await supabase
        .from("telegram_subscriptions")
        .insert({
          user_id: user.id,
          plan_id: plan.id,
          status: "active",
          starts_at: now.toISOString(),
          ends_at: endsAt.toISOString(),
          max_sessions: plan.max_sessions,
          is_trial: false,
          trial_used: true,
        })
        .select()
        .single();

      if (subError) return errorResponse("Failed to create subscription: " + subError.message);

      return successResponse({
        success: true,
        subscription,
        message: "تم تفعيل الاشتراك بنجاح!",
      });
    }

    // For non-wallet payments, create a pending order
    const orderNumber = `SUB-${Date.now().toString(36).toUpperCase()}`;
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_id: user.id,
        order_number: orderNumber,
        total_amount: amount,
        payment_method: payment_method,
        status: "pending",
        payment_status: "pending",
      })
      .select()
      .single();

    if (orderError) return errorResponse("Failed to create order: " + orderError.message);

    return successResponse({
      success: true,
      order: { id: order.id, order_number: order.order_number },
      plan_id: plan.id,
      amount,
    });

  } catch (err) {
    console.error("process-plan-subscription error:", err);
    return errorResponse("Internal server error", 500);
  }
});
