import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Create external Supabase client to fetch store data
function getExternalClient() {
  const url = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("VITE_EXTERNAL_SUPABASE_URL");
  const key = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY");
  if (!url || !key) return null;
  return createClient(url, key);
}

async function fetchStoreContext(): Promise<string> {
  const db = getExternalClient();
  if (!db) return "";

  try {
    const [productsRes, categoriesRes, settingsRes, reviewsRes] = await Promise.all([
      db.from("products").select("name, name_en, price, platform, warranty_days, description, description_en, product_type, category_id, is_active").eq("is_active", true).limit(50),
      db.from("categories").select("id, name, name_en"),
      db.from("site_settings").select("key, value").in("key", [
        "store_name", "store_description", "payment_methods_enabled",
        "currency_symbol", "currency_code", "support_email", "support_phone",
        "whatsapp_number", "telegram_channel", "refund_policy_summary",
      ]).eq("is_sensitive", false),
      db.from("reviews").select("rating, comment, reviewer_name, product_id").eq("is_approved", true).order("created_at", { ascending: false }).limit(10),
    ]);

    // Build category map
    const catMap: Record<string, string> = {};
    if (categoriesRes.data) {
      for (const c of categoriesRes.data) {
        catMap[c.id] = `${c.name}${c.name_en ? ` (${c.name_en})` : ""}`;
      }
    }

    // Build settings map
    const settings: Record<string, string> = {};
    if (settingsRes.data) {
      for (const s of settingsRes.data) {
        if (s.value) settings[s.key] = s.value;
      }
    }

    // Format products
    let productsText = "";
    if (productsRes.data && productsRes.data.length > 0) {
      productsText = productsRes.data.map((p: any) => {
        const cat = p.category_id ? catMap[p.category_id] || "" : "";
        return `- ${p.name}${p.name_en ? ` (${p.name_en})` : ""} | السعر: ${p.price} ${settings.currency_symbol || "$"} | ${cat ? `التصنيف: ${cat} | ` : ""}${p.platform ? `المنصة: ${p.platform} | ` : ""}${p.warranty_days ? `ضمان: ${p.warranty_days} يوم` : ""}`;
      }).join("\n");
    }

    // Format reviews
    let reviewsText = "";
    if (reviewsRes.data && reviewsRes.data.length > 0) {
      reviewsText = reviewsRes.data.map((r: any) => 
        `- ${r.reviewer_name}: ${r.rating}/5${r.comment ? ` "${r.comment}"` : ""}`
      ).join("\n");
    }

    // Build context
    let ctx = "";
    if (settings.store_name) ctx += `اسم المتجر: ${settings.store_name}\n`;
    if (settings.store_description) ctx += `وصف المتجر: ${settings.store_description}\n`;
    if (settings.currency_code) ctx += `العملة: ${settings.currency_code} (${settings.currency_symbol || ""})\n`;
    if (settings.support_email) ctx += `بريد الدعم: ${settings.support_email}\n`;
    if (settings.whatsapp_number) ctx += `واتساب: ${settings.whatsapp_number}\n`;
    if (settings.telegram_channel) ctx += `تليجرام: ${settings.telegram_channel}\n`;

    if (productsText) {
      ctx += `\n--- المنتجات المتوفرة حالياً (${productsRes.data!.length} منتج) ---\n${productsText}\n`;
    }

    if (reviewsText) {
      ctx += `\n--- آخر تقييمات العملاء ---\n${reviewsText}\n`;
    }

    // Categories list
    if (categoriesRes.data && categoriesRes.data.length > 0) {
      ctx += `\n--- التصنيفات ---\n${categoriesRes.data.map((c: any) => `- ${c.name}${c.name_en ? ` (${c.name_en})` : ""}`).join("\n")}\n`;
    }

    return ctx;
  } catch (e) {
    console.error("Failed to fetch store context:", e);
    return "";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Fetch live store data
    const storeContext = await fetchStoreContext();

    const systemPrompt = `أنت المساعد الذكي الرسمي لهذا المتجر الإلكتروني. لديك معرفة كاملة ببيانات المتجر الحالية.

=== بيانات المتجر الحية ===
${storeContext || "لم يتم تحميل بيانات المتجر"}
=== نهاية البيانات ===

تعليماتك:
1. أنت تعرف كل المنتجات المتوفرة وأسعارها - أجب بدقة عنها
2. إذا سأل العميل عن منتج موجود في القائمة، أعطه المعلومات الكاملة (السعر، الضمان، المنصة)
3. إذا سأل عن منتج غير موجود، قل له أنه غير متوفر حالياً واقترح عليه تصفح المنتجات أو طلبه عبر صفحة "طلب منتج"
4. إذا سأل عن طريقة الدفع أو الشحن، وجهه حسب المعلومات المتوفرة
5. إذا كانت المشكلة معقدة (مشكلة بطلب، استرجاع، حساب لا يعمل)، وجهه لصفحة الدعم /support
6. استخدم اللغة العربية بشكل افتراضي، وإذا كتب العميل بالإنجليزية أجب بالإنجليزية
7. كن مختصراً وودياً ولا تكتب ردود طويلة
8. لا تخترع أسعار أو منتجات غير موجودة في البيانات أعلاه`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "تم تجاوز الحد المسموح، حاول لاحقاً" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "رصيد AI غير كافي" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "خطأ في الاتصال بالذكاء الاصطناعي" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
