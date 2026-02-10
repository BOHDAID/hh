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
  inlineKeyboard?: Array<Array<{ text: string; callback_data: string }>>
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
  inlineKeyboard?: Array<Array<{ text: string; callback_data: string }>>
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
  // تحويل base64 إلى blob
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
  // للتوكن: استخدم المتغير البيئي مباشرة
  if (key === "telegram_bot_token") {
    return Deno.env.get("TELEGRAM_BOT_TOKEN") || null;
  }
  
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return data?.value || null;
}

// جلب بيانات Gmail من osn_sessions (الجلسة النشطة)
async function getGmailCredentials() {
  const { data, error } = await supabase
    .from("osn_sessions")
    .select("gmail_address, gmail_app_password, email, variant_id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error fetching Gmail credentials from osn_sessions:", error);
    return null;
  }

  console.log("📧 Gmail credentials found:", data?.gmail_address || "none");
  return data;
}

// التحقق من كود التفعيل
async function verifyActivationCode(code: string) {
  const { data, error } = await supabase
    .from("activation_codes")
    .select(`
      *,
      products:product_id (name, name_en, image_url)
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

// جلب كود التفعيل بالـ ID
async function getActivationCodeById(codeId: string) {
  const { data, error } = await supabase
    .from("activation_codes")
    .select(`
      *,
      products:product_id (name, name_en, image_url)
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

  // إضافة بيانات الحساب إذا وُجدت
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

// 🔥 جلب OTP من خادم Render (قراءة Gmail)
async function getOTPFromSession(gmailAddress?: string, gmailAppPassword?: string): Promise<{ success: boolean; otp?: string; error?: string }> {
  const renderServerUrl = Deno.env.get("RENDER_SERVER_URL") || "https://angel-store.onrender.com";
  const qrSecret = Deno.env.get("QR_AUTOMATION_SECRET") || "default-qr-secret-key";
  
  try {
    console.log(`🔄 Calling OTP API at ${renderServerUrl}/api/qr/get-otp for ${gmailAddress || 'unknown'}`);
    
    const response = await fetch(`${renderServerUrl}/api/qr/get-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        secret: qrSecret,
        gmailAddress: gmailAddress,
        gmailAppPassword: gmailAppPassword,
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
  activationType: string;
  accountEmail: string;
  step: "choose_type" | "awaiting_login" | "awaiting_otp_request";
  retryCount: number;
}

const userSessions: Record<string, UserSession> = {};

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

      // الرد على الضغطة فوراً
      await answerCallbackQuery(botToken, callbackQuery.id);

      const session = userSessions[chatId];
      
      if (!session) {
        await editTelegramMessage(botToken, chatId, messageId, "❌ انتهت الجلسة. أرسل كود التفعيل مرة أخرى.");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // === اختيار نوع التفعيل ===
      if (data === "choose_qr" || data === "choose_otp") {
        const chosenType = data === "choose_qr" ? "qr" : "otp";
        session.activationType = chosenType;
        session.step = "awaiting_login";
        
        const typeLabel = chosenType === "qr" ? "رمز QR 📺" : "رمز OTP 📱";
        
        await editTelegramMessage(
          botToken, 
          chatId, 
          messageId,
          `✅ اخترت: <b>${typeLabel}</b>\n\n` +
          `📧 البريد: <code>${session.accountEmail}</code>\n\n` +
          `📝 <b>التعليمات:</b>\n` +
          `1️⃣ افتح تطبيق OSN\n` +
          `2️⃣ اختر "تسجيل الدخول"\n` +
          `3️⃣ أدخل البريد أعلاه\n` +
          `4️⃣ بعد الدخول، اضغط الزر أدناه`,
          [[{ text: "✅ سجلت دخول", callback_data: "logged_in" }]]
        );
        
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // === تأكيد تسجيل الدخول ===
      if (data === "logged_in") {
        if (session.activationType === "qr") {
          // === تفعيل QR ===
          await editTelegramMessage(botToken, chatId, messageId, "⏳ جاري توليد رمز QR...");
          
          const qrResult = await getQRFromSession();
          
          if (qrResult.success && qrResult.qrImage) {
            await sendTelegramPhoto(
              botToken, 
              chatId, 
              qrResult.qrImage,
              `✅ <b>رمز QR جاهز!</b>\n\n📺 امسح هذا الرمز من شاشة التلفزيون.`
            );
            
            await markCodeAsUsed(session.activationCodeId);
            delete userSessions[chatId];
            
            await sendTelegramMessage(botToken, chatId, "🎉 تم التفعيل بنجاح! استمتع بالخدمة.\n\n⭐ لا تنسَ تقييم المنتج في الموقع!");
          } else {
            await editTelegramMessage(
              botToken, 
              chatId, 
              messageId,
              `❌ فشل توليد رمز QR\n\n${qrResult.error || "خطأ غير معروف"}\n\nجرب مرة أخرى:`,
              [[{ text: "🔄 إعادة المحاولة", callback_data: "logged_in" }]]
            );
          }
          
        } else {
          // === تفعيل OTP ===
          session.step = "awaiting_otp_request";
          
          await editTelegramMessage(
            botToken, 
            chatId, 
            messageId,
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

      // === طلب OTP ===
      if (data === "get_otp") {
        session.retryCount = (session.retryCount || 0) + 1;
        
        await editTelegramMessage(botToken, chatId, messageId, "⏳ جاري البحث عن رمز التحقق من Gmail...");
        
        // جلب بيانات Gmail من osn_sessions
        const gmailCreds = await getGmailCredentials();
        const gmailAddress = gmailCreds?.gmail_address;
        const gmailAppPassword = gmailCreds?.gmail_app_password;
        
        const otpResult = await getOTPFromSession(gmailAddress, gmailAppPassword);
        
        if (otpResult.success && otpResult.otp) {
          await saveOtpCode(session.activationCodeId, otpResult.otp);
          
          await editTelegramMessage(
            botToken, 
            chatId, 
            messageId,
            `✅ <b>رمز التحقق:</b>\n\n` +
            `<code>${otpResult.otp}</code>\n\n` +
            `📱 أدخل هذا الرمز في تطبيق OSN.\n\n` +
            `⚠️ الرمز صالح لمدة محدودة!`
          );
          
          await markCodeAsUsed(session.activationCodeId);
          delete userSessions[chatId];
          
          await sendTelegramMessage(
            botToken, 
            chatId, 
            "🎉 تم التفعيل بنجاح! استمتع بالخدمة.\n\n⭐ لا تنسَ تقييم المنتج في الموقع!"
          );
        } else {
          // لم يُجد الرمز - زر إعادة المحاولة
          const retryMessage = session.retryCount >= 3 
            ? `❌ لم يُعثر على رمز جديد.\n\n` +
              `📝 <b>تأكد من:</b>\n` +
              `• فتح تطبيق OSN\n` +
              `• طلب رمز التحقق من التطبيق\n` +
              `• الانتظار حتى يصل الرمز للبريد\n\n` +
              `ثم اضغط إعادة المحاولة:`
            : `⏳ لم يُعثر على رمز حديث.\n\n` +
              `📱 تأكد من أن التطبيق طلب الرمز، ثم اضغط:`;
          
          await editTelegramMessage(
            botToken, 
            chatId, 
            messageId,
            retryMessage,
            [[{ text: "🔄 إعادة المحاولة", callback_data: "get_otp" }]]
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

    // أمر البدء
    if (text === "/start") {
      const welcomeMessage = await getSetting("telegram_welcome_message") || 
        "مرحباً بك في بوت المتجر! 🎉\n\nأدخل كود التفعيل الذي حصلت عليه بعد الشراء:";
      
      await sendTelegramMessage(botToken, chatId, welcomeMessage);
      delete userSessions[chatId]; // مسح أي جلسة سابقة
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // التحقق من كود التفعيل
    const activationCode = await verifyActivationCode(text);

    if (activationCode) {
      // كود صالح!
      const productName = activationCode.products?.name || "المنتج";
      const productId = activationCode.product_id;
      
      // جلب بيانات Gmail من osn_sessions
      const gmailCreds = await getGmailCredentials();
      
      if (!gmailCreds || !gmailCreds.gmail_address) {
        await sendTelegramMessage(
          botToken, 
          chatId, 
          `✅ كود صالح للمنتج: <b>${productName}</b>\n\n⚠️ لا توجد جلسة OSN نشطة مع بيانات Gmail.\nتواصل مع الدعم.`
        );
        
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const accountEmail = gmailCreds.gmail_address;
      // دعم QR و OTP معاً
      const activationTypes = ["qr", "otp"];

      // تحديث كود التفعيل
      await updateActivationCode(
        activationCode.id, 
        chatId, 
        username, 
        "in_progress",
        accountEmail
      );

      // حفظ الجلسة
      userSessions[chatId] = {
        activationCodeId: activationCode.id,
        productName: productName,
        productId: productId,
        activationType: activationTypes[0],
        accountEmail: accountEmail,
        step: activationTypes.length > 1 ? "choose_type" : "awaiting_login",
        retryCount: 0,
      };

      // 🔥 إذا يدعم أكثر من نوع - عرض أزرار الاختيار
      if (activationTypes.length > 1 && activationTypes.includes("qr") && activationTypes.includes("otp")) {
        await sendTelegramMessage(
          botToken, 
          chatId, 
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
        // نوع واحد فقط
        const typeLabel = activationTypes[0] === "qr" ? "رمز QR 📺" : "رمز OTP 📱";
        
        await sendTelegramMessage(
          botToken, 
          chatId, 
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
      // كود غير صالح
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
