import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// استخدام قاعدة البيانات الخارجية
const EXTERNAL_SUPABASE_URL = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
const EXTERNAL_SERVICE_ROLE_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SERVICE_ROLE_KEY);

// إرسال رسالة للمستخدم مع Inline Keyboard
async function sendTelegramMessage(
  botToken: string, 
  chatId: string, 
  text: string, 
  inlineKeyboard?: Array<Array<{ text: string; callback_data?: string; url?: string }>>
) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML",
  };
  
  if (inlineKeyboard) {
    body.reply_markup = {
      inline_keyboard: inlineKeyboard,
    };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return response.json();
}

// تعديل رسالة موجودة
async function editTelegramMessage(
  botToken: string, 
  chatId: string, 
  messageId: number,
  text: string, 
  inlineKeyboard?: Array<Array<{ text: string; callback_data?: string; url?: string }>>
) {
  const url = `https://api.telegram.org/bot${botToken}/editMessageText`;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: "HTML",
  };
  
  if (inlineKeyboard) {
    body.reply_markup = {
      inline_keyboard: inlineKeyboard,
    };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return response.json();
}

// الرد على callback query
async function answerCallbackQuery(botToken: string, callbackQueryId: string, text?: string) {
  const url = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;
  const body: Record<string, unknown> = {
    callback_query_id: callbackQueryId,
  };
  
  if (text) {
    body.text = text;
    body.show_alert = false;
  }

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// إرسال صورة للمستخدم
async function sendTelegramPhoto(botToken: string, chatId: string, photoBase64: string, caption: string) {
  const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, '');
  const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  
  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('caption', caption);
  formData.append('parse_mode', 'HTML');
  formData.append('photo', new Blob([binaryData], { type: 'image/png' }), 'qr-code.png');

  const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;
  const response = await fetch(url, {
    method: "POST",
    body: formData,
  });

  return response.json();
}

// جلب إعداد من قاعدة البيانات أو المتغيرات البيئية
async function getSetting(key: string): Promise<string | null> {
  // جلب من قاعدة البيانات أولاً
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  
  if (data?.value) return data.value;
  
  // fallback للمتغيرات البيئية
  if (key === "telegram_bot_token") {
    return Deno.env.get("TELEGRAM_BOT_TOKEN") || null;
  }
  
  return null;
}

// جلب بيانات Gmail من osn_sessions (الجلسة النشطة) - يدعم تحديد المنتج
async function getSessionForProduct(productId?: string): Promise<{
  gmail_address: string | null;
  gmail_app_password: string | null;
  email: string | null;
  variant_id: string;
  account_password: string | null;
} | null> {
  if (productId) {
    // البحث عن جلسة مرتبطة بمنتج فرعي ينتمي لهذا المنتج
    const { data: variants } = await supabase
      .from("product_variants")
      .select("id")
      .eq("product_id", productId)
      .eq("is_active", true);

    if (variants && variants.length > 0) {
      const variantIds = variants.map(v => v.id);
      const { data: session } = await supabase
        .from("osn_sessions")
        .select("gmail_address, gmail_app_password, email, variant_id, account_password")
        .in("variant_id", variantIds)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (session) {
        console.log(`📧 Found session for product ${productId}: ${session.email}`);
        return session;
      }
    }
  }

  // Fallback: أول جلسة نشطة
  const { data, error } = await supabase
    .from("osn_sessions")
    .select("gmail_address, gmail_app_password, email, variant_id, account_password")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error fetching session:", error);
    return null;
  }

  console.log("📧 Fallback session found:", data?.email || "none");
  return data;
}

// التحقق من كود التفعيل - مع جلب activation_type من المنتج
// يُرجع الكود حتى لو مربوط بمستخدم آخر (للتحقق من الاحتيال)
async function verifyActivationCode(code: string) {
  const { data, error } = await supabase
    .from("activation_codes")
    .select(`
      *,
      products:product_id (name, name_en, image_url, activation_type)
    `)
    .eq("code", code.toUpperCase())
    .eq("is_used", false)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

// 🛡️ التحقق من وجود جلسة نشطة للمستخدم (مضاد احتيال)
async function hasActiveSession(chatId: string): Promise<{ active: boolean; productName?: string }> {
  // أولاً: التحقق من الذاكرة
  if (userSessions[chatId]) {
    return { active: true, productName: userSessions[chatId].productName };
  }
  
  // ثانياً: التحقق من قاعدة البيانات
  const { data } = await supabase
    .from("activation_codes")
    .select(`
      id, status, product_id,
      products:product_id (name)
    `)
    .eq("telegram_chat_id", chatId)
    .eq("is_used", false)
    .in("status", ["in_progress", "awaiting_otp", "chatgpt_awaiting_otp", "crunchyroll_choosing", "crunchyroll_awaiting_tv_code", "crunchyroll_phone_sent"])
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();

  if (data) {
    return { active: true, productName: (data as any).products?.name || "المنتج" };
  }
  
  return { active: false };
}

// جلب كود التفعيل بالـ ID
async function getActivationCodeById(codeId: string) {
  const { data, error } = await supabase
    .from("activation_codes")
    .select(`
      *,
      products:product_id (name, name_en, image_url, activation_type)
    `)
    .eq("id", codeId)
    .eq("is_used", false)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

// تحديث كود التفعيل بمعلومات تيليجرام
async function updateActivationCode(
  codeId: string, 
  telegramChatId: string, 
  telegramUsername: string | null, 
  status: string,
  accountEmail?: string,
  accountPassword?: string
) {
  const updateData: Record<string, unknown> = {
    telegram_chat_id: telegramChatId,
    telegram_username: telegramUsername,
    status: status,
    updated_at: new Date().toISOString(),
  };

  if (accountEmail) updateData.account_email = accountEmail;
  if (accountPassword) updateData.account_password = accountPassword;

  await supabase
    .from("activation_codes")
    .update(updateData)
    .eq("id", codeId);
}

// استخدام الكود (نهائي)
async function markCodeAsUsed(codeId: string) {
  await supabase
    .from("activation_codes")
    .update({
      status: "used",
      is_used: true,
      used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", codeId);
}

// حفظ رمز OTP
async function saveOtpCode(activationCodeId: string, otpCode: string) {
  await supabase
    .from("otp_codes")
    .insert({
      activation_code_id: activationCodeId,
      otp_code: otpCode,
      source: "auto",
      is_delivered: true,
      delivered_at: new Date().toISOString(),
    });
}

// جلب رابط الإيصال من كود التفعيل
async function getInvoiceUrl(activationCodeId: string): Promise<string | null> {
  const { data: code } = await supabase
    .from("activation_codes")
    .select("order_id")
    .eq("id", activationCodeId)
    .maybeSingle();

  if (!code?.order_id) return null;

  const { data: setting } = await supabase
    .from("site_settings")
    .select("value")
    .in("key", ["store_url", "site_url"])
    .limit(1)
    .maybeSingle();

  const siteUrl = setting?.value || "https://id-preview--67cd80b3-ced1-482c-8caf-99d63ed5b92f.lovable.app";
  return `${siteUrl}/order/${code.order_id}`;
}

// 🔥 جلب QR من خادم Render (الجلسة المستمرة)
async function getQRFromSession(): Promise<{ success: boolean; qrImage?: string; error?: string }> {
  const renderServerUrl = Deno.env.get("RENDER_SERVER_URL") || "https://angel-store.onrender.com";
  const qrSecret = Deno.env.get("QR_AUTOMATION_SECRET") || "default-qr-secret-key";
  
  try {
    console.log(`🔄 Calling QR API at ${renderServerUrl}/api/qr/get-qr`);
    
    const response = await fetch(`${renderServerUrl}/api/qr/get-qr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: qrSecret }),
    });

    const data = await response.json();
    
    if (data.success && data.qrImage) {
      console.log("✅ QR Code fetched successfully");
      return { success: true, qrImage: data.qrImage };
    } else {
      console.error("❌ QR fetch failed:", data.error);
      return { success: false, error: data.error || "Unknown error" };
    }
  } catch (error) {
    console.error("❌ QR API call failed:", error);
    return { success: false, error: error.message };
  }
}

// 🔥 جلب OTP مباشرة عبر Edge Function (بدون Render)
async function getOTPFromSession(gmailAddress?: string, gmailAppPassword?: string): Promise<{ success: boolean; otp?: string; error?: string }> {
  try {
    if (!gmailAddress || !gmailAppPassword) {
      console.error("❌ Gmail credentials missing!");
      return { success: false, error: "بيانات Gmail غير متوفرة" };
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || EXTERNAL_SUPABASE_URL;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || EXTERNAL_SERVICE_ROLE_KEY;

    console.log(`📧 Calling gmail-read-otp for: ${gmailAddress}`);
    
    const response = await fetch(`${supabaseUrl}/functions/v1/gmail-read-otp`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ 
        gmailAddress,
        gmailAppPassword,
        maxAgeMinutes: 10,
      }),
    });

    const data = await response.json();
    
    if (data.success && data.otp) {
      console.log("✅ OTP fetched successfully:", data.otp);
      return { success: true, otp: data.otp };
    } else {
      console.error("❌ OTP fetch failed:", data.error);
      return { success: false, error: data.error || "Unknown error" };
    }
  } catch (error) {
    console.error("❌ OTP API call failed:", error);
    return { success: false, error: error.message };
  }
}

// جلسات المستخدمين (في الذاكرة)
interface UserSession {
  activationCodeId: string;
  productName: string;
  productId: string;
  activationType: string; // "qr" | "otp" | "chatgpt" | "crunchyroll"
  accountEmail: string;
  accountPassword?: string;
  step: "choose_type" | "awaiting_login" | "awaiting_otp_request" | "chatgpt_awaiting_otp" | "crunchyroll_choose" | "crunchyroll_awaiting_tv_code" | "crunchyroll_phone_sent";
  retryCount: number;
  gmailAddress?: string;
  gmailAppPassword?: string;
}

const userSessions: Record<string, UserSession> = {};

// 🔥 إعادة بناء الجلسة من قاعدة البيانات إذا ضاعت من الذاكرة
async function reconstructSession(chatId: string): Promise<UserSession | null> {
  try {
    // البحث عن كود تفعيل نشط مرتبط بهذا المستخدم
    const { data: code, error } = await supabase
      .from("activation_codes")
      .select(`
        id, product_id, account_email, account_password, status,
        products:product_id (name, name_en, activation_type)
      `)
      .eq("telegram_chat_id", chatId)
      .eq("is_used", false)
      .in("status", ["in_progress", "awaiting_otp", "chatgpt_awaiting_otp", "crunchyroll_choosing", "crunchyroll_awaiting_tv_code", "crunchyroll_phone_sent"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !code) {
      console.log(`🔍 No active activation code found for chat ${chatId}`);
      return null;
    }

    const productName = (code as any).products?.name || "المنتج";
    const activationType = (code as any).products?.activation_type || "otp";
    const productId = code.product_id;

    // جلب بيانات Gmail من الجلسة
    const sessionData = await getSessionForProduct(productId);

    // تحديد الخطوة بناءً على الحالة
    let step: UserSession["step"] = "awaiting_login";
    if (activationType === "chatgpt") {
      step = "chatgpt_awaiting_otp";
    } else if (activationType === "crunchyroll") {
      if (code.status === "crunchyroll_awaiting_tv_code") step = "crunchyroll_awaiting_tv_code";
      else if (code.status === "crunchyroll_phone_sent") step = "crunchyroll_phone_sent";
      else step = "crunchyroll_choose";
    } else if (code.status === "awaiting_otp") {
      step = "awaiting_otp_request";
    }

    const reconstructed: UserSession = {
      activationCodeId: code.id,
      productName,
      productId,
      activationType,
      accountEmail: code.account_email || sessionData?.email || sessionData?.gmail_address || "",
      accountPassword: code.account_password || sessionData?.account_password || "",
      step,
      retryCount: 0,
      gmailAddress: sessionData?.gmail_address || undefined,
      gmailAppPassword: sessionData?.gmail_app_password || undefined,
    };

    console.log(`✅ Session reconstructed for chat ${chatId}: ${productName} (${activationType})`);
    userSessions[chatId] = reconstructed;
    return reconstructed;
  } catch (err) {
    console.error("❌ Failed to reconstruct session:", err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const botToken = await getSetting("telegram_bot_token");
    
    if (!botToken) {
      console.error("Bot token not configured");
      return new Response(JSON.stringify({ error: "Bot not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const update = await req.json();
    console.log("Telegram update:", JSON.stringify(update));

    // ============================================
    // 🔥 معالجة Callback Query (الأزرار)
    // ============================================
    const callbackQuery = update.callback_query;
    if (callbackQuery) {
      const chatId = callbackQuery.message.chat.id.toString();
      const messageId = callbackQuery.message.message_id;
      const data = callbackQuery.data;
      const username = callbackQuery.from?.username || null;

      await answerCallbackQuery(botToken, callbackQuery.id);

      // محاولة استعادة الجلسة من الذاكرة أو من قاعدة البيانات
      let session = userSessions[chatId];
      
      if (!session) {
        console.log(`⚠️ Session lost for ${chatId}, attempting reconstruction...`);
        session = await reconstructSession(chatId);
      }
      
      if (!session) {
        await editTelegramMessage(botToken, chatId, messageId, "❌ انتهت الجلسة. أرسل كود التفعيل مرة أخرى.");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // === اختيار نوع التفعيل (OSN فقط) ===
      if (data === "choose_qr" || data === "choose_otp") {
        const chosenType = data === "choose_qr" ? "qr" : "otp";
        session.activationType = chosenType;
        session.step = "awaiting_login";
        
        if (chosenType === "qr") {
          // QR: تلفزيون
          await editTelegramMessage(
            botToken, chatId, messageId,
            `✅ اخترت: تلفزيون (QR) 📺\n` +
            `─────────\n` +
            `✅ You chose: TV (QR) 📺\n\n` +
            `📧 البريد / Email: <code>${session.accountEmail}</code>\n\n` +
            `📝 <b>التعليمات:</b>\n` +
            `1️⃣ افتح تطبيق OSN على التلفزيون\n` +
            `2️⃣ اختر "تسجيل الدخول"\n` +
            `3️⃣ أدخل البريد أعلاه\n` +
            `4️⃣ بعد الدخول، اضغط الزر أدناه\n` +
            `─────────\n` +
            `📝 <b>Instructions:</b>\n` +
            `1️⃣ Open OSN app on TV\n` +
            `2️⃣ Select "Login"\n` +
            `3️⃣ Enter the email above\n` +
            `4️⃣ After login, press the button below`,
            [[{ text: "✅ سجلت دخول | Logged in", callback_data: "logged_in" }]]
          );
        } else {
          // OTP: هاتف
          await editTelegramMessage(
            botToken, chatId, messageId,
            `✅ اخترت: هاتف (OTP) 📱\n` +
            `─────────\n` +
            `✅ You chose: Phone (OTP) 📱\n\n` +
            `📧 البريد / Email: <code>${session.accountEmail}</code>\n\n` +
            `📝 <b>التعليمات:</b>\n` +
            `1️⃣ افتح تطبيق OSN\n` +
            `2️⃣ اختر "تسجيل الدخول"\n` +
            `3️⃣ أدخل البريد أعلاه\n` +
            `4️⃣ ⚠️ يجب تسجيل الدخول أولاً قبل طلب الرمز\n` +
            `5️⃣ بعد الدخول، اضغط الزر أدناه\n` +
            `─────────\n` +
            `📝 <b>Instructions:</b>\n` +
            `1️⃣ Open OSN app\n` +
            `2️⃣ Select "Login"\n` +
            `3️⃣ Enter the email above\n` +
            `4️⃣ ⚠️ You must login first before requesting the code\n` +
            `5️⃣ After login, press the button below`,
            [[{ text: "🔑 أحضر لي الرمز | Get OTP", callback_data: "get_otp" }]]
          );
          session.step = "awaiting_otp_request";
          await updateActivationCode(session.activationCodeId, chatId, username, "awaiting_otp");
        }
        
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // === تأكيد تسجيل الدخول (OSN) ===
      if (data === "logged_in") {
        if (session.activationType === "qr") {
          // === تفعيل QR ===
          await editTelegramMessage(botToken, chatId, messageId, "⏳ جاري توليد رمز QR...");
          
          const qrResult = await getQRFromSession();
          
          if (qrResult.success && qrResult.qrImage) {
            await sendTelegramPhoto(
              botToken, chatId, qrResult.qrImage,
              `✅ <b>رمز QR جاهز!</b>\n\n📺 امسح هذا الرمز من شاشة التلفزيون.`
            );
            
            await markCodeAsUsed(session.activationCodeId);
            const invoiceUrl = await getInvoiceUrl(session.activationCodeId);
            const siteUrl = await getSetting("store_url") || await getSetting("site_url") || "";
            delete userSessions[chatId];
            
            const ratingButtons: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];
            if (siteUrl) ratingButtons.push([{ text: "⭐ قيّمنا في الموقع | Rate us", url: siteUrl }]);
            if (invoiceUrl) ratingButtons.push([{ text: "🧾 عرض الإيصال / View Receipt", url: invoiceUrl }]);
            
            const successMsg = `🎉 تم التفعيل بنجاح! استمتع بالخدمة.\n\n⭐ <b>مرجو تقييمنا في موقعنا!</b>\nساعدنا بتقييم المنتج لنحسّن خدماتنا.`;
            await sendTelegramMessage(botToken, chatId, successMsg, ratingButtons.length > 0 ? ratingButtons : undefined);
          } else {
            await editTelegramMessage(
              botToken, chatId, messageId,
              `❌ فشل توليد رمز QR\n\n${qrResult.error || "خطأ غير معروف"}\n\nجرب مرة أخرى:`,
              [[{ text: "🔄 إعادة المحاولة", callback_data: "logged_in" }]]
            );
          }
          
        } else {
          // === تفعيل OTP (OSN) ===
          session.step = "awaiting_otp_request";
          
          await editTelegramMessage(
            botToken, chatId, messageId,
            `✅ ممتاز!\n\n` +
            `📱 الآن في تطبيق OSN:\n` +
            `1️⃣ سيطلب منك رمز تحقق\n` +
            `2️⃣ بعد أن يُرسل الرمز، اضغط الزر أدناه\n\n` +
            `⏰ <b>ملاحظة:</b> الرمز يصل خلال ثوانٍ`,
            [[{ text: "🔑 أحضر لي الرمز", callback_data: "get_otp" }]]
          );
          
          await updateActivationCode(session.activationCodeId, chatId, username, "awaiting_otp");
        }
        
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // === طلب OTP (OSN أو ChatGPT) ===
      if (data === "get_otp" || data === "chatgpt_get_otp") {
        // 🔥 تحديد النوع من callback_data مباشرة (لا نعتمد على الجلسة فقط)
        const isChatGPT = data === "chatgpt_get_otp" || session.activationType === "chatgpt";
        if (isChatGPT) session.activationType = "chatgpt";
        
        session.retryCount = (session.retryCount || 0) + 1;
        
        await editTelegramMessage(botToken, chatId, messageId, "⏳ جاري البحث عن رمز التحقق من Gmail...");
        
        // استخدام بيانات Gmail المخزنة في الجلسة أو من osn_sessions
        let gmailAddress = session.gmailAddress;
        let gmailAppPassword = session.gmailAppPassword;
        let accountPassword = session.accountPassword;
        let accountEmail = session.accountEmail;

        if (!gmailAddress || !gmailAppPassword) {
          const sessionData = await getSessionForProduct(session.productId);
          gmailAddress = sessionData?.gmail_address || undefined;
          gmailAppPassword = sessionData?.gmail_app_password || undefined;
          if (!accountEmail) accountEmail = sessionData?.email || sessionData?.gmail_address || "";
          if (!accountPassword) accountPassword = sessionData?.account_password || "";
          session.accountEmail = accountEmail;
          session.accountPassword = accountPassword;
          session.gmailAddress = gmailAddress;
          session.gmailAppPassword = gmailAppPassword;
        }
        
        const otpResult = await getOTPFromSession(gmailAddress, gmailAppPassword);
        
        if (otpResult.success && otpResult.otp) {
          await saveOtpCode(session.activationCodeId, otpResult.otp);
          
          if (isChatGPT) {
            // ChatGPT: إرسال البريد + كلمة المرور + الرمز
            await editTelegramMessage(
              botToken, chatId, messageId,
              `✅ <b>بيانات الحساب ورمز التحقق:</b>\n\n` +
              `📧 البريد: <code>${accountEmail}</code>\n` +
              `🔑 كلمة المرور: <code>${accountPassword || "غير محدد"}</code>\n` +
              `🔢 رمز التحقق: <code>${otpResult.otp}</code>\n\n` +
              `📝 <b>التعليمات:</b>\n` +
              `1️⃣ افتح ChatGPT\n` +
              `2️⃣ سجل الدخول بالبريد وكلمة المرور\n` +
              `3️⃣ أدخل رمز التحقق أعلاه\n\n` +
              `⚠️ الرمز صالح لمدة محدودة!`
            );
          } else {
            // OSN: إرسال الرمز فقط
            await editTelegramMessage(
              botToken, chatId, messageId,
              `✅ <b>رمز التحقق:</b>\n\n` +
              `<code>${otpResult.otp}</code>\n\n` +
              `📱 أدخل هذا الرمز في تطبيق OSN.\n\n` +
              `⚠️ الرمز صالح لمدة محدودة!`
            );
          }
          
          await markCodeAsUsed(session.activationCodeId);
          const invoiceUrl = await getInvoiceUrl(session.activationCodeId);
          const siteUrl = await getSetting("store_url") || await getSetting("site_url") || "";
          delete userSessions[chatId];
          
          const ratingButtons: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];
          if (siteUrl) ratingButtons.push([{ text: "⭐ قيّمنا في الموقع | Rate us", url: siteUrl }]);
          if (invoiceUrl) ratingButtons.push([{ text: "🧾 عرض الإيصال / View Receipt", url: invoiceUrl }]);
          
          const successMsg = `🎉 تم التفعيل بنجاح! استمتع بالخدمة.\n\n⭐ <b>مرجو تقييمنا في موقعنا!</b>\nساعدنا بتقييم المنتج لنحسّن خدماتنا.`;
          await sendTelegramMessage(botToken, chatId, successMsg, ratingButtons.length > 0 ? ratingButtons : undefined);
        } else {
          const retryCallbackData = isChatGPT ? "chatgpt_get_otp" : "get_otp";
          const appName = isChatGPT ? "ChatGPT" : "OSN";
          
          const retryMessage = session.retryCount >= 3 
            ? `❌ لم يُعثر على رمز جديد.\n\n` +
              `📝 <b>تأكد من:</b>\n` +
              `• فتح ${appName}\n` +
              `• طلب رمز التحقق\n` +
              `• الانتظار حتى يصل الرمز للبريد\n\n` +
              `ثم اضغط إعادة المحاولة:`
            : `⏳ لم يُعثر على رمز حديث.\n\nتأكد أن ${appName} طلب الرمز، ثم اضغط:`;
          
          await editTelegramMessage(
            botToken, chatId, messageId,
            retryMessage,
            [[{ text: "🔄 إعادة المحاولة", callback_data: retryCallbackData }]]
          );
        }
        
      // === Crunchyroll: اختيار تلفزيون أو هاتف ===
      if (data === "crunchyroll_tv" || data === "crunchyroll_phone") {
        if (data === "crunchyroll_tv") {
          session.step = "crunchyroll_awaiting_tv_code";
          await updateActivationCode(session.activationCodeId, chatId, username, "crunchyroll_awaiting_tv_code");
          
          await editTelegramMessage(
            botToken, chatId, messageId,
            `📺 <b>تفعيل Crunchyroll على التلفزيون</b>\n\n` +
            `📝 <b>التعليمات:</b>\n` +
            `1️⃣ افتح تطبيق Crunchyroll على تلفزيونك\n` +
            `2️⃣ اختر "تسجيل الدخول"\n` +
            `3️⃣ سيظهر لك كود مكون من 6 أرقام\n` +
            `4️⃣ أرسل الكود هنا في الرسالة\n\n` +
            `⏳ أرسل الكود المكون من 6 أرقام:`
          );
        } else {
          // Phone: إرسال البريد + الباسورد
          session.step = "crunchyroll_phone_sent";
          await updateActivationCode(session.activationCodeId, chatId, username, "crunchyroll_phone_sent", session.accountEmail, session.accountPassword);
          
          await editTelegramMessage(
            botToken, chatId, messageId,
            `📱 <b>تفعيل Crunchyroll على الهاتف</b>\n\n` +
            `📧 البريد: <code>${session.accountEmail}</code>\n` +
            `🔑 كلمة المرور: <code>${session.accountPassword || "غير محدد"}</code>\n\n` +
            `📝 <b>التعليمات:</b>\n` +
            `1️⃣ افتح تطبيق Crunchyroll\n` +
            `2️⃣ سجل دخول بالبيانات أعلاه\n` +
            `3️⃣ بعد الانتهاء، اضغط الزر أدناه\n\n` +
            `⚠️ لا تقم بتغيير كلمة المرور!\n\n` +
            `─────────\n\n` +
            `📱 <b>Phone Activation</b>\n\n` +
            `📧 Email: <code>${session.accountEmail}</code>\n` +
            `🔑 Password: <code>${session.accountPassword || "N/A"}</code>\n\n` +
            `Login with the credentials above, then press the button below.`,
            [[{ text: "✅ سجلت دخول | Logged in", callback_data: "crunchyroll_phone_done" }]]
          );
        }
        
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // === Crunchyroll Phone: تم تسجيل الدخول - تغيير الباسورد ===
      if (data === "crunchyroll_phone_done") {
        await editTelegramMessage(botToken, chatId, messageId, "⏳ جاري تغيير كلمة المرور...");
        
        // استدعاء السيرفر لتغيير الباسورد
        const renderServerUrl = Deno.env.get("RENDER_SERVER_URL") || "https://angel-store.onrender.com";
        const qrSecret = Deno.env.get("QR_AUTOMATION_SECRET") || "default-qr-secret-key";
        
        try {
          const response = await fetch(`${renderServerUrl}/api/qr/crunchyroll-change-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              secret: qrSecret,
              email: session.accountEmail,
              gmailAddress: session.gmailAddress,
              gmailAppPassword: session.gmailAppPassword,
            }),
          });
          
          const result = await response.json();
          
          if (result.success && result.newPassword) {
            // حفظ الباسورد الجديد في الجلسة
            const sessionData = await getSessionForProduct(session.productId);
            if (sessionData) {
              await supabase
                .from("osn_sessions")
                .update({ account_password: result.newPassword, last_activity: new Date().toISOString() })
                .eq("variant_id", sessionData.variant_id);
            }
            
            await markCodeAsUsed(session.activationCodeId);
            const invoiceUrl = await getInvoiceUrl(session.activationCodeId);
            const siteUrl = await getSetting("store_url") || await getSetting("site_url") || "";
            delete userSessions[chatId];
            
            await editTelegramMessage(botToken, chatId, messageId,
              `✅ <b>تم التفعيل بنجاح!</b>\n\n` +
              `🔐 تم تغيير كلمة المرور تلقائياً.\n` +
              `استمتع بالخدمة! 🎉`
            );
            
            const ratingButtons: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];
            if (siteUrl) ratingButtons.push([{ text: "⭐ قيّمنا في الموقع | Rate us", url: siteUrl }]);
            if (invoiceUrl) ratingButtons.push([{ text: "🧾 عرض الإيصال | View Receipt", url: invoiceUrl }]);
            
            await sendTelegramMessage(botToken, chatId,
              `🎉 شكراً لك! استمتع بالخدمة.\n\n⭐ <b>مرجو تقييمنا في موقعنا!</b>\nساعدنا بتقييم المنتج لنحسّن خدماتنا.`,
              ratingButtons.length > 0 ? ratingButtons : undefined
            );
          } else {
            // فشل تغيير الباسورد - لكن التفعيل تم
            await markCodeAsUsed(session.activationCodeId);
            const invoiceUrl = await getInvoiceUrl(session.activationCodeId);
            const siteUrl = await getSetting("store_url") || await getSetting("site_url") || "";
            delete userSessions[chatId];
            
            await editTelegramMessage(botToken, chatId, messageId,
              `✅ <b>تم التفعيل!</b>\n\n` +
              `⚠️ لم نتمكن من تغيير كلمة المرور تلقائياً.\n` +
              `${result.error || "خطأ غير معروف"}`
            );
            
            const ratingButtons: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];
            if (siteUrl) ratingButtons.push([{ text: "⭐ قيّمنا في الموقع | Rate us", url: siteUrl }]);
            if (invoiceUrl) ratingButtons.push([{ text: "🧾 عرض الإيصال | View Receipt", url: invoiceUrl }]);
            
            await sendTelegramMessage(botToken, chatId,
              `🎉 شكراً لك!\n\n⭐ <b>مرجو تقييمنا في موقعنا!</b>`,
              ratingButtons.length > 0 ? ratingButtons : undefined
            );
          }
        } catch (error) {
          await editTelegramMessage(botToken, chatId, messageId,
            `❌ خطأ في الاتصال بالسيرفر: ${error.message}\n\nجرب مرة أخرى:`,
            [[{ text: "🔄 إعادة المحاولة", callback_data: "crunchyroll_phone_done" }]]
          );
        }
        
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============================================
    // معالجة الرسائل النصية
    // ============================================
    const message = update.message;
    if (!message) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chatId = message.chat.id.toString();
    const text = message.text?.trim() || "";
    const username = message.from?.username || null;

    // أمر البدء - 🛡️ منع /start أثناء جلسة نشطة
    if (text === "/start" || text.startsWith("/start ")) {
      const activeCheck = await hasActiveSession(chatId);
      if (activeCheck.active) {
        await sendTelegramMessage(
          botToken, chatId,
          `⚠️ <b>لديك عملية تفعيل جارية!</b>\n\n` +
          `📦 المنتج: <b>${activeCheck.productName}</b>\n\n` +
          `❌ لا يمكنك بدء عملية جديدة حتى تُنهي التفعيل الحالي.\n` +
          `أكمل الخطوات المطلوبة أولاً.\n\n` +
          `─────────\n\n` +
          `⚠️ <b>You have an active activation!</b>\n\n` +
          `📦 Product: <b>${activeCheck.productName}</b>\n\n` +
          `❌ You cannot start a new process until you finish the current one.`
        );
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      const welcomeMessage = await getSetting("telegram_welcome_message") || 
        "مرحباً بك في بوت المتجر! 🎉\n\nأدخل كود التفعيل الذي حصلت عليه بعد الشراء:";
      
      await sendTelegramMessage(botToken, chatId, welcomeMessage);
      delete userSessions[chatId];
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === Crunchyroll TV Code Handler ===
    // إذا المستخدم في انتظار كود تلفزيون Crunchyroll وأرسل 6 أرقام
    let textSession = userSessions[chatId];
    if (!textSession) textSession = await reconstructSession(chatId) || undefined;
    
    if (textSession && textSession.step === "crunchyroll_awaiting_tv_code" && /^\d{6}$/.test(text)) {
      await sendTelegramMessage(botToken, chatId, "⏳ جاري تفعيل الكود على التلفزيون...");
      
      const renderServerUrl = Deno.env.get("RENDER_SERVER_URL") || "https://angel-store.onrender.com";
      const qrSecret = Deno.env.get("QR_AUTOMATION_SECRET") || "default-qr-secret-key";
      
      try {
        const response = await fetch(`${renderServerUrl}/api/qr/crunchyroll-activate-tv`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            secret: qrSecret,
            tvCode: text,
            email: textSession.accountEmail,
            password: textSession.accountPassword,
          }),
        });
        
        const result = await response.json();
        
        if (result.success) {
          await markCodeAsUsed(textSession.activationCodeId);
          const invoiceUrl = await getInvoiceUrl(textSession.activationCodeId);
          const siteUrl = await getSetting("store_url") || await getSetting("site_url") || "";
          delete userSessions[chatId];
          
          await sendTelegramMessage(botToken, chatId,
            `✅ <b>تم تفعيل Crunchyroll على التلفزيون بنجاح!</b>\n\n` +
            `🎉 استمتع بالمشاهدة!`
          );
          
          const ratingButtons: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];
          if (siteUrl) ratingButtons.push([{ text: "⭐ قيّمنا في الموقع | Rate us", url: siteUrl }]);
          if (invoiceUrl) ratingButtons.push([{ text: "🧾 عرض الإيصال | View Receipt", url: invoiceUrl }]);
          
          await sendTelegramMessage(botToken, chatId,
            `🎉 شكراً لك! استمتع بالخدمة.\n\n⭐ <b>مرجو تقييمنا في موقعنا!</b>\nساعدنا بتقييم المنتج لنحسّن خدماتنا.`,
            ratingButtons.length > 0 ? ratingButtons : undefined
          );
        } else {
          await sendTelegramMessage(botToken, chatId,
            `❌ ${result.error || "فشل التفعيل"}\n\n` +
            `تأكد من الكود وأرسله مرة أخرى (6 أرقام):`
          );
        }
      } catch (error) {
        await sendTelegramMessage(botToken, chatId,
          `❌ خطأ في الاتصال بالسيرفر.\nجرب مرة أخرى وأرسل الكود:`
        );
      }
      
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // التحقق من كود التفعيل
    const activationCode = await verifyActivationCode(text);

    if (activationCode) {
      // 🛡️ مضاد احتيال: التحقق من أن الكود غير مربوط بمستخدم آخر
      if (activationCode.telegram_chat_id && activationCode.telegram_chat_id !== chatId) {
        await sendTelegramMessage(
          botToken, chatId,
          `🚫 <b>هذا الكود مستخدم بالفعل!</b>\n\n` +
          `تم ربط هذا الكود بحساب تيليجرام آخر.\n` +
          `لا يمكن استخدام نفس الكود من حسابين مختلفين.\n\n` +
          `─────────\n\n` +
          `🚫 <b>This code is already in use!</b>\n\n` +
          `This code is linked to another Telegram account.\n` +
          `You cannot use the same code from two different accounts.`
        );
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 🛡️ مضاد احتيال: منع إرسال كود جديد أثناء تفعيل جاري
      const activeCheck = await hasActiveSession(chatId);
      if (activeCheck.active) {
        await sendTelegramMessage(
          botToken, chatId,
          `⚠️ <b>لديك عملية تفعيل جارية!</b>\n\n` +
          `📦 المنتج: <b>${activeCheck.productName}</b>\n\n` +
          `❌ أكمل التفعيل الحالي أولاً قبل إدخال كود جديد.\n\n` +
          `─────────\n\n` +
          `⚠️ <b>You have an active activation!</b>\n\n` +
          `❌ Complete the current activation first before entering a new code.`
        );
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const productName = activationCode.products?.name || "المنتج";
      const productId = activationCode.product_id;
      const productActivationType = activationCode.products?.activation_type || null;
      
      console.log(`🔍 Product: ${productName}, activation_type: ${productActivationType}`);

      // جلب الجلسة المناسبة لهذا المنتج
      const sessionData = await getSessionForProduct(productId);
      
      if (!sessionData || !sessionData.gmail_address) {
        await sendTelegramMessage(
          botToken, chatId,
          `✅ كود صالح للمنتج: <b>${productName}</b>\n\n⚠️ لا توجد جلسة نشطة مع بيانات Gmail لهذا المنتج.\nتواصل مع الدعم.`
        );
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============================================
      // 🔥 ChatGPT Flow - مختلف تماماً عن OSN
      // ============================================
      if (productActivationType === "chatgpt") {
        const accountEmail = sessionData.email || sessionData.gmail_address || activationCode.account_email || "";
        const accountPassword = sessionData.account_password || activationCode.account_password || "";

        console.log(`🔍 ChatGPT credentials: email=${accountEmail}, password=${accountPassword ? "***" : "EMPTY"}`);
        console.log(`🔍 sessionData: email=${sessionData.email}, gmail=${sessionData.gmail_address}, pass=${sessionData.account_password ? "***" : "null"}`);
        console.log(`🔍 activationCode: email=${activationCode.account_email}, pass=${activationCode.account_password ? "***" : "null"}`);

        // تحديث كود التفعيل
        await updateActivationCode(
          activationCode.id, chatId, username, "chatgpt_awaiting_otp",
          accountEmail, accountPassword
        );

        // حفظ الجلسة
        userSessions[chatId] = {
          activationCodeId: activationCode.id,
          productName: productName,
          productId: productId,
          activationType: "chatgpt",
          accountEmail: accountEmail,
          accountPassword: accountPassword,
          step: "chatgpt_awaiting_otp",
          retryCount: 0,
          gmailAddress: sessionData.gmail_address,
          gmailAppPassword: sessionData.gmail_app_password || undefined,
        };

        // إرسال البيانات الأساسية وزر جلب OTP
        const emailDisplay = accountEmail || "⚠️ غير متوفر - تواصل مع الدعم";
        const passwordDisplay = accountPassword || "⚠️ غير متوفر - تواصل مع الدعم";
        
        await sendTelegramMessage(
          botToken, chatId,
          `✅ <b>كود صالح!</b>\n\n` +
          `📦 المنتج: <b>${productName}</b>\n\n` +
          `📧 البريد: <code>${emailDisplay}</code>\n` +
          `🔑 كلمة المرور: <code>${passwordDisplay}</code>\n\n` +
          `📝 <b>التعليمات:</b>\n` +
          `1️⃣ سجّل دخول بالبيانات أعلاه\n` +
          `2️⃣ إذا طلب رمز تحقق، اضغط الزر أدناه\n\n` +
          `⚠️ سجّل دخول أولاً ثم اطلب الرمز!\n\n` +
          `─────────\n\n` +
          `✅ <b>Valid code!</b>\n\n` +
          `📦 Product: <b>${productName}</b>\n\n` +
          `📧 Email: <code>${emailDisplay}</code>\n` +
          `🔑 Password: <code>${passwordDisplay}</code>\n\n` +
          `📝 <b>Instructions:</b>\n` +
          `1️⃣ Login with the credentials above\n` +
          `2️⃣ If it asks for a verification code, press the button below\n\n` +
          `⚠️ Login first, then request the code!`,
          [[{ text: "🔑 أحضر لي رمز التحقق | Get OTP", callback_data: "chatgpt_get_otp" }]]
        );

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============================================
      // 🔥 Crunchyroll Flow
      // ============================================
      if (productActivationType === "crunchyroll") {
        const accountEmail = sessionData.email || sessionData.gmail_address || activationCode.account_email || "";
        const accountPassword = sessionData.account_password || activationCode.account_password || "";

        await updateActivationCode(
          activationCode.id, chatId, username, "crunchyroll_choosing",
          accountEmail, accountPassword
        );

        userSessions[chatId] = {
          activationCodeId: activationCode.id,
          productName: productName,
          productId: productId,
          activationType: "crunchyroll",
          accountEmail: accountEmail,
          accountPassword: accountPassword,
          step: "crunchyroll_choose",
          retryCount: 0,
          gmailAddress: sessionData.gmail_address,
          gmailAppPassword: sessionData.gmail_app_password || undefined,
        };

        await sendTelegramMessage(
          botToken, chatId,
          `✅ <b>كود صالح!</b>\n\n` +
          `📦 المنتج: <b>${productName}</b>\n\n` +
          `اختر طريقة التفعيل:\n\n` +
          `─────────\n\n` +
          `✅ <b>Valid code!</b>\n\n` +
          `📦 Product: <b>${productName}</b>\n\n` +
          `Choose activation method:`,
          [
            [
              { text: "📺 تلفزيون | TV", callback_data: "crunchyroll_tv" },
              { text: "📱 هاتف | Phone", callback_data: "crunchyroll_phone" }
            ]
          ]
        );

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============================================
      // 🔥 OSN Flow - التدفق الحالي
      // ============================================
      const accountEmail = sessionData.gmail_address;
      const activationTypes = ["qr", "otp"];

      await updateActivationCode(
        activationCode.id, chatId, username, "in_progress", accountEmail
      );

      userSessions[chatId] = {
        activationCodeId: activationCode.id,
        productName: productName,
        productId: productId,
        activationType: activationTypes[0],
        accountEmail: accountEmail,
        step: activationTypes.length > 1 ? "choose_type" : "awaiting_login",
        retryCount: 0,
        gmailAddress: sessionData.gmail_address,
        gmailAppPassword: sessionData.gmail_app_password || undefined,
      };

      if (activationTypes.length > 1) {
        await sendTelegramMessage(
          botToken, chatId,
          `✅ <b>كود صالح!</b>\n\n` +
          `📦 المنتج: <b>${productName}</b>\n\n` +
          `📧 البريد: <code>${accountEmail}</code>\n\n` +
          `اختر طريقة التفعيل:`,
          [
            [
              { text: "📺 QR للتلفزيون", callback_data: "choose_qr" },
              { text: "📱 OTP للجوال", callback_data: "choose_otp" }
            ]
          ]
        );
      } else {
        const typeLabel = activationTypes[0] === "qr" ? "رمز QR 📺" : "رمز OTP 📱";
        
        await sendTelegramMessage(
          botToken, chatId,
          `✅ <b>كود صالح!</b>\n\n` +
          `📦 المنتج: <b>${productName}</b>\n` +
          `🔐 نوع التفعيل: <b>${typeLabel}</b>\n\n` +
          `📧 البريد: <code>${accountEmail}</code>\n\n` +
          `📝 <b>التعليمات:</b>\n` +
          `1️⃣ افتح تطبيق OSN\n` +
          `2️⃣ اختر "تسجيل الدخول"\n` +
          `3️⃣ أدخل البريد أعلاه\n` +
          `4️⃣ بعد الدخول، اضغط الزر أدناه`,
          [[{ text: "✅ سجلت دخول", callback_data: "logged_in" }]]
        );
      }
    } else {
      const invalidMessage = await getSetting("telegram_invalid_code_message") || 
        "❌ كود التفعيل غير صحيح أو منتهي الصلاحية.\n\nتأكد من الكود وحاول مرة أخرى.";
      
      await sendTelegramMessage(botToken, chatId, invalidMessage);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in telegram-bot-webhook:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
