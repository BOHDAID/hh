import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getExternalClient() {
  const url = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("VITE_EXTERNAL_SUPABASE_URL");
  const key = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY");
  if (!url || !key) return null;
  return createClient(url, key);
}

// Fetch user-specific data if authenticated
async function fetchUserContext(db: any, authHeader: string | null): Promise<string> {
  if (!authHeader || !db) return "";

  try {
    const anonKey = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") || Deno.env.get("VITE_EXTERNAL_SUPABASE_ANON_KEY");
    const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("VITE_EXTERNAL_SUPABASE_URL");
    if (!anonKey || !extUrl) return "";

    const userClient = createClient(extUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await userClient.auth.getUser(token);
    if (!userData?.user) return "";

    const userId = userData.user.id;

    // Fetch user data in parallel
    const [ordersRes, cartRes, walletRes, profileRes, wishlistRes] = await Promise.all([
      db.from("orders").select("id, order_number, total_amount, status, payment_status, created_at, payment_method")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
      db.from("cart_items").select("id, quantity, product_id, products(name, name_en, price)")
        .eq("user_id", userId),
      db.from("wallets").select("balance").eq("user_id", userId).maybeSingle(),
      db.from("profiles").select("full_name, email").eq("user_id", userId).maybeSingle(),
      db.from("wishlist_items").select("product_id, products(name, name_en, price)")
        .eq("user_id", userId).limit(10),
    ]);

    let ctx = "\n=== بيانات العميل الحالي ===\n";
    ctx += `مسجل دخول: نعم\n`;
    if (profileRes.data) {
      ctx += `الاسم: ${profileRes.data.full_name || "غير محدد"}\n`;
      ctx += `البريد: ${profileRes.data.email || userData.user.email || "—"}\n`;
    }
    if (walletRes.data) {
      ctx += `رصيد المحفظة: $${walletRes.data.balance || 0}\n`;
    }

    if (ordersRes.data && ordersRes.data.length > 0) {
      ctx += `\nآخر ${ordersRes.data.length} طلبات:\n`;
      for (const o of ordersRes.data) {
        const statusAr = o.status === "completed" ? "✅ مكتمل" : o.status === "pending" ? "⏳ قيد الانتظار" : o.status === "processing" ? "🔄 قيد المعالجة" : o.status === "cancelled" ? "❌ ملغي" : o.status;
        ctx += `  - ${o.order_number} | $${o.total_amount} | ${statusAr} | ${new Date(o.created_at).toLocaleDateString("ar-SA")}\n`;
      }
    } else {
      ctx += `لا توجد طلبات سابقة\n`;
    }

    if (cartRes.data && cartRes.data.length > 0) {
      ctx += `\nالسلة (${cartRes.data.length} عناصر):\n`;
      for (const c of cartRes.data) {
        const prod = (c as any).products;
        ctx += `  - ${prod?.name || "منتج"} × ${c.quantity} | $${prod?.price || 0}\n`;
      }
    }

    if (wishlistRes.data && wishlistRes.data.length > 0) {
      ctx += `\nقائمة الأمنيات (${wishlistRes.data.length}):\n`;
      for (const w of wishlistRes.data) {
        const prod = (w as any).products;
        ctx += `  - ${prod?.name || "منتج"} | $${prod?.price || 0}\n`;
      }
    }

    ctx += "=== نهاية بيانات العميل ===\n";
    return ctx;
  } catch (e) {
    console.error("Failed to fetch user context:", e);
    return "";
  }
}

async function fetchStoreContext(db: any): Promise<string> {
  if (!db) return "";

  try {
    const [productsRes, categoriesRes, settingsRes, reviewsRes, flashSalesRes, couponsRes, variantsRes] = await Promise.all([
      db.from("products").select("id, name, name_en, price, platform, warranty_days, description, description_en, product_type, category_id, is_active, average_rating, sales_count")
        .eq("is_active", true).limit(100),
      db.from("categories").select("id, name, name_en, icon"),
      db.from("site_settings").select("key, value").in("key", [
        "store_name", "store_description", "payment_methods_enabled",
        "currency_symbol", "currency_code", "support_email", "support_phone",
        "whatsapp_number", "telegram_channel", "telegram_username",
        "refund_policy_summary", "instagram_username", "twitter_username",
      ]).eq("is_sensitive", false),
      db.from("reviews").select("rating, comment, reviewer_name, product_id")
        .eq("is_approved", true).order("created_at", { ascending: false }).limit(15),
      db.from("flash_sales").select("product_id, variant_id, original_price, sale_price, ends_at, max_quantity, sold_quantity")
        .eq("is_active", true).gte("ends_at", new Date().toISOString()),
      db.from("coupons").select("code, discount_type, discount_value, min_order_amount, expires_at")
        .eq("is_active", true).limit(5),
      db.from("product_variants").select("id, product_id, name, name_en, price, is_active, description, warranty_days, is_unlimited")
        .eq("is_active", true),
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

    // Build variants map
    const variantsMap: Record<string, any[]> = {};
    if (variantsRes.data) {
      for (const v of variantsRes.data) {
        if (!variantsMap[v.product_id]) variantsMap[v.product_id] = [];
        variantsMap[v.product_id].push(v);
      }
    }

    // Count stock per product
    const productIds = productsRes.data?.map((p: any) => p.id) || [];
    let stockMap: Record<string, number> = {};
    if (productIds.length > 0) {
      // Check for unlimited variants first
      const unlimitedProducts = new Set<string>();
      if (variantsRes.data) {
        for (const v of variantsRes.data) {
          if (v.is_unlimited) unlimitedProducts.add(v.product_id);
        }
      }

      const { data: stockData } = await db.from("product_accounts")
        .select("product_id")
        .in("product_id", productIds)
        .eq("is_sold", false);

      if (stockData) {
        for (const s of stockData) {
          stockMap[s.product_id] = (stockMap[s.product_id] || 0) + 1;
        }
      }

      // Mark unlimited as always in stock
      for (const pid of unlimitedProducts) {
        stockMap[pid] = 999;
      }
    }

    // Flash sales map
    const flashMap: Record<string, any> = {};
    if (flashSalesRes.data) {
      for (const fs of flashSalesRes.data) {
        flashMap[fs.product_id] = fs;
      }
    }

    // Format products with rich info
    let productsText = "";
    if (productsRes.data && productsRes.data.length > 0) {
      // Sort: best sellers first
      const sorted = [...productsRes.data].sort((a: any, b: any) => (b.sales_count || 0) - (a.sales_count || 0));

      productsText = sorted.map((p: any) => {
        const cat = p.category_id ? catMap[p.category_id] || "" : "";
        const stock = stockMap[p.id] || 0;
        const stockLabel = stock >= 999 ? "♾️ غير محدود" : stock > 20 ? "✅ متوفر" : stock > 0 ? `⚠️ ${stock} فقط` : "❌ نفذ";
        const rating = p.average_rating ? `⭐ ${p.average_rating}/5` : "";
        const sales = p.sales_count ? `🔥 ${p.sales_count} عملية بيع` : "";
        const flash = flashMap[p.id] ? `🏷️ عرض خاص: $${flashMap[p.id].sale_price} بدل $${flashMap[p.id].original_price}` : "";
        const variants = variantsMap[p.id];
        let variantInfo = "";
        if (variants && variants.length > 0) {
          variantInfo = `\n    الباقات: ${variants.map((v: any) => `${v.name}${v.name_en ? ` (${v.name_en})` : ""}: $${v.price}`).join(" | ")}`;
        }

        return `- ${p.name}${p.name_en ? ` (${p.name_en})` : ""} | $${p.price} | ${cat ? `${cat} | ` : ""}${p.platform ? `${p.platform} | ` : ""}${p.warranty_days ? `ضمان ${p.warranty_days} يوم | ` : ""}${stockLabel} | ${rating} ${sales} ${flash}${variantInfo}${p.description ? `\n    الوصف: ${(p.description || "").substring(0, 100)}` : ""}`;
      }).join("\n");
    }

    // Format reviews
    let reviewsText = "";
    if (reviewsRes.data && reviewsRes.data.length > 0) {
      reviewsText = reviewsRes.data.map((r: any) =>
        `- ${r.reviewer_name}: ${r.rating}/5${r.comment ? ` "${(r.comment).substring(0, 80)}"` : ""}`
      ).join("\n");
    }

    // Active coupons
    let couponsText = "";
    if (couponsRes.data && couponsRes.data.length > 0) {
      couponsText = couponsRes.data.map((c: any) => {
        const type = c.discount_type === "percentage" ? `${c.discount_value}%` : `$${c.discount_value}`;
        const min = c.min_order_amount ? ` (حد أدنى $${c.min_order_amount})` : "";
        return `- كود: ${c.code} → خصم ${type}${min}`;
      }).join("\n");
    }

    // Build context
    let ctx = "";
    if (settings.store_name) ctx += `اسم المتجر: ${settings.store_name}\n`;
    if (settings.store_description) ctx += `وصف: ${settings.store_description}\n`;
    if (settings.currency_code) ctx += `العملة: ${settings.currency_code} (${settings.currency_symbol || "$"})\n`;
    if (settings.support_email) ctx += `بريد الدعم: ${settings.support_email}\n`;
    if (settings.whatsapp_number) ctx += `واتساب: ${settings.whatsapp_number}\n`;
    if (settings.telegram_username) ctx += `تليجرام: @${settings.telegram_username}\n`;
    if (settings.instagram_username) ctx += `انستجرام: @${settings.instagram_username}\n`;

    if (productsText) {
      ctx += `\n--- المنتجات (${productsRes.data!.length} منتج) ---\n${productsText}\n`;
    }

    if (couponsText) {
      ctx += `\n--- كوبونات خصم متاحة ---\n${couponsText}\n`;
    }

    if (reviewsText) {
      ctx += `\n--- آخر تقييمات العملاء ---\n${reviewsText}\n`;
    }

    if (categoriesRes.data && categoriesRes.data.length > 0) {
      ctx += `\n--- التصنيفات ---\n${categoriesRes.data.map((c: any) => `- ${c.icon || "📁"} ${c.name}${c.name_en ? ` (${c.name_en})` : ""}`).join("\n")}\n`;
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
    const { messages, storeUrl } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const baseUrl = storeUrl || "";
    const authHeader = req.headers.get("Authorization");
    const db = getExternalClient();

    // Fetch store + user data in parallel
    const [storeContext, userContext] = await Promise.all([
      fetchStoreContext(db),
      fetchUserContext(db, authHeader),
    ]);

    const systemPrompt = `أنت مساعد ذكي محترف لمتجر إلكتروني. لديك وصول كامل لجميع بيانات المتجر والعميل الحالي.

🔗 رابط المتجر: ${baseUrl}

${storeContext || "⚠️ لم يتم تحميل بيانات المتجر"}
${userContext}

=== خريطة الصفحات ===
🏠 الرئيسية: ${baseUrl}/
🛍️ المنتجات: ${baseUrl}/#products
📦 طلباتي: ${baseUrl}/my-orders
💰 المحفظة: ${baseUrl}/wallet
🛒 السلة: ${baseUrl}/cart
❤️ الأمنيات: ${baseUrl}/wishlist
📝 طلب منتج: ${baseUrl}/product-requests
🎧 الدعم: ${baseUrl}/support
👤 الملف: ${baseUrl}/profile
📞 اتصل بنا: ${baseUrl}/contact
🔐 دخول: ${baseUrl}/login
📋 إنشاء حساب: ${baseUrl}/register
📜 سياسة الاسترجاع: ${baseUrl}/refund-policy
📜 الشروط: ${baseUrl}/terms

=== قواعد الذكاء ===

🎯 **الشخصية**: أنت مساعد ودود، ذكي، وسريع البديهة. تتحدث بلغة العميل (عربي/إنجليزي).

📊 **المعرفة السياقية**:
- تعرف كل منتج: اسمه، سعره، المنصة، الضمان، الستوك، التقييم
- تعرف بيانات العميل: طلباته، سلته، رصيده، أمنياته
- تعرف العروض الحالية والكوبونات المتاحة

🧠 **السلوك الذكي**:
1. إذا سأل عن منتج → أعطه كل التفاصيل + رابط الشراء
2. إذا سأل عن طلب → تحقق من بياناته وأخبره بحالته مع رابط [طلباتي](${baseUrl}/my-orders)
3. إذا سلته فيها عناصر → ذكّره بإكمال الشراء: [أكمل الطلب](${baseUrl}/cart)
4. إذا عنده رصيد → نبّهه عند الشراء إن يقدر يستخدمه
5. إذا سأل عن توصية → رشّح حسب مشترياته السابقة أو الأكثر مبيعاً
6. إذا المنتج نفذ → وجّهه لـ [تنبيه التوفر](${baseUrl}/#products) أو اقترح بدائل
7. إذا في عرض/كوبون → اذكره بالمناسبة عند الحديث عن المنتج
8. إذا مشكلة تقنية → وجّهه لـ [الدعم](${baseUrl}/support)
9. إذا غير مسجل → شجعه: [سجل الآن](${baseUrl}/register) للحصول على مميزات

💬 **التنسيق**:
- استخدم روابط Markdown قابلة للنقر دائماً
- استخدم إيموجي بشكل معتدل
- ردود مختصرة (3-5 أسطر) إلا إذا طُلب تفصيل
- لا تخترع بيانات غير موجودة

🚫 **ممنوعات**:
- لا تذكر أسعار أو منتجات غير موجودة في البيانات
- لا تشارك بيانات حساسة (كلمات مرور، بيانات دفع)
- لا تتظاهر بأنك إنسان
- لا تناقش مواضيع خارج نطاق المتجر`;


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
