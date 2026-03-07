import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, allHeaders, errorResponse, successResponse, isValidUUID } from "../_shared/security.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Missing authorization", 401);

    // External DB for auth verification + all plans/subscriptions/orders/wallets
    const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("VITE_EXTERNAL_SUPABASE_URL") || "";
    const extAnonKey = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") || Deno.env.get("VITE_EXTERNAL_SUPABASE_ANON_KEY") || "";
    const extServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!extUrl || !extAnonKey || !extServiceKey) {
      return errorResponse("External database secrets are not fully configured", 500);
    }

    // Verify user against EXTERNAL database (where the token was issued)
    const userClient = createClient(extUrl, extAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return errorResponse("Unauthorized", 401);

    // External DB admin client for all data writes/reads
    const extDb = createClient(extUrl, extServiceKey);

    const body = await req.json();
    const { plan_id, payment_method, sessions, type } = body;
    const isAddSessions = type === "add_sessions";

    if (!plan_id || !isValidUUID(plan_id)) return errorResponse("Invalid plan_id");
    if (!payment_method) return errorResponse("Missing payment_method");

    const sessionsCount = Math.max(1, Math.min(50, parseInt(sessions) || 1));

    // Fetch plan from external DB
    const { data: plan, error: planError } = await extDb
      .from("telegram_plans")
      .select("*")
      .eq("id", plan_id)
      .eq("is_active", true)
      .single();

    if (planError || !plan) return errorResponse("Plan not found");

    let amount: number;
    if (isAddSessions) {
      // For adding sessions: use price_per_extra_session from plan
      const pricePerSession = Number(plan.price_per_extra_session) || 5;
      amount = Math.round(sessionsCount * pricePerSession * 100) / 100;
    } else {
      // For new subscription: base + 35% for each extra session
      const basePrice = Number(plan.price);
      amount = basePrice;
      for (let i = 2; i <= sessionsCount; i++) {
        amount += basePrice * 0.35;
      }
      amount = Math.round(amount * 100) / 100;
    }

    if (payment_method === "wallet") {
      // Check wallet balance from EXTERNAL DB
      const { data: wallet } = await extDb
        .from("wallets")
        .select("id, balance")
        .eq("user_id", user.id)
        .single();

      if (!wallet || Number(wallet.balance) < amount) {
        return errorResponse("رصيد المحفظة غير كافي");
      }

      // Deduct from wallet in EXTERNAL DB
      const newBalance = Number(wallet.balance) - amount;
      const { error: walletError } = await extDb
        .from("wallets")
        .update({ balance: newBalance })
        .eq("id", wallet.id);

      if (walletError) {
        console.error("Wallet deduct error:", JSON.stringify(walletError));
        return errorResponse("Failed to deduct wallet balance: " + walletError.message);
      }

      // Record wallet transaction in EXTERNAL DB
      await extDb.from("wallet_transactions").insert({
        wallet_id: wallet.id,
        type: "purchase",
        amount: -amount,
        description: isAddSessions 
          ? `إضافة ${sessionsCount} جلسة` 
          : `اشتراك باقة: ${plan.name} (${sessionsCount} جلسة)`,
        status: "completed",
      });

      if (isAddSessions) {
        // Find active subscription and increase max_sessions
        const { data: existingSub } = await extDb
          .from("telegram_subscriptions")
          .select("id, max_sessions")
          .eq("user_id", user.id)
          .eq("status", "active")
          .order("ends_at", { ascending: false })
          .limit(1)
          .single();

        if (!existingSub) {
          return errorResponse("لا يوجد اشتراك نشط لإضافة جلسات إليه");
        }

        const newMax = (existingSub.max_sessions || 1) + sessionsCount;
        const { error: updateErr } = await extDb
          .from("telegram_subscriptions")
          .update({ max_sessions: newMax, updated_at: new Date().toISOString() })
          .eq("id", existingSub.id);

        if (updateErr) return errorResponse("Failed to update sessions: " + updateErr.message);

        return successResponse({
          success: true,
          message: `تم إضافة ${sessionsCount} جلسة بنجاح!`,
          new_max_sessions: newMax,
        });
      }

      // Create new subscription in EXTERNAL DB
      const now = new Date();
      const endsAt = new Date(now.getTime() + plan.duration_days * 24 * 60 * 60 * 1000);

      const { data: subscription, error: subError } = await extDb
        .from("telegram_subscriptions")
        .insert({
          user_id: user.id,
          plan_id: plan.id,
          status: "active",
          starts_at: now.toISOString(),
          ends_at: endsAt.toISOString(),
          max_sessions: sessionsCount,
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

    // For non-wallet payments, create a pending order in EXTERNAL DB
    const orderNumber = `SUB-${Date.now().toString(36).toUpperCase()}`;
    const { data: order, error: orderError } = await extDb
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
      sessions: sessionsCount,
    });

  } catch (err) {
    console.error("process-plan-subscription error:", err);
    return errorResponse("Internal server error", 500);
  }
});
