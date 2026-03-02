import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { type, data } = await req.json();

    const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const extServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(extUrl, extServiceKey);

    // Get bot token from site_settings first, fallback to env
    let botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
    const { data: settings } = await db
      .from("site_settings")
      .select("key, value")
      .in("key", ["telegram_bot_token", "admin_telegram_chat_id"]);

    let adminChatId = "";

    for (const s of settings || []) {
      if (s.key === "telegram_bot_token" && s.value) botToken = s.value;
      if (s.key === "admin_telegram_chat_id" && s.value) adminChatId = s.value;
    }

    if (!botToken || !adminChatId) {
      console.log("Telegram admin notifications not configured (missing bot token or admin chat ID)");
      return new Response(JSON.stringify({ success: false, reason: "not_configured" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let message = "";

    if (type === "new_order") {
      const { order_number, total_amount, payment_method, items_count, customer_email } = data;
      message = `🛒 <b>طلب جديد!</b>\n\n` +
        `📋 رقم الطلب: <code>${order_number || "—"}</code>\n` +
        `💰 المبلغ: <b>$${total_amount || 0}</b>\n` +
        `💳 طريقة الدفع: ${payment_method || "—"}\n` +
        `📦 عدد المنتجات: ${items_count || 0}\n` +
        `👤 العميل: ${customer_email || "—"}\n` +
        `🕐 الوقت: ${new Date().toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}`;
    } else if (type === "new_ticket") {
      const { ticket_number, subject, customer_email, priority } = data;
      const priorityEmoji = priority === "urgent" ? "🔴" : priority === "high" ? "🟠" : "🟢";
      message = `🎫 <b>تذكرة دعم جديدة!</b>\n\n` +
        `📋 رقم التذكرة: <code>${ticket_number || "—"}</code>\n` +
        `📝 الموضوع: ${subject || "—"}\n` +
        `${priorityEmoji} الأولوية: ${priority || "عادية"}\n` +
        `👤 العميل: ${customer_email || "—"}\n` +
        `🕐 الوقت: ${new Date().toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}`;
    } else if (type === "new_contact") {
      const { name, email, message: msg } = data;
      message = `📩 <b>رسالة تواصل جديدة!</b>\n\n` +
        `👤 الاسم: ${name || "—"}\n` +
        `📧 الإيميل: ${email || "—"}\n` +
        `💬 الرسالة: ${(msg || "").substring(0, 200)}${(msg || "").length > 200 ? "..." : ""}\n` +
        `🕐 الوقت: ${new Date().toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}`;
    } else {
      return new Response(JSON.stringify({ success: false, reason: "unknown_type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send to admin
    const telegramRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: adminChatId,
        text: message,
        parse_mode: "HTML",
      }),
    });

    const result = await telegramRes.json();
    console.log("Telegram notification sent:", result.ok);

    return new Response(JSON.stringify({ success: result.ok }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("notify-admin-telegram error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
