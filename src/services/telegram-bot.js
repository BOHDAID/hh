// ============================================================
// Telegram Bot Service - Long Polling Mode
// يعمل مع خادم Express على Render
// ============================================================

import { createClient } from '@supabase/supabase-js';
import sessionManager from './session-manager.js';

// إعدادات قاعدة البيانات الخارجية
const EXTERNAL_SUPABASE_URL = process.env.EXTERNAL_SUPABASE_URL || 'https://vepwoilxujuyeuutybjp.supabase.co';
const EXTERNAL_SERVICE_ROLE_KEY = process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
let botToken = null;
let isRunning = false;
let pollingOffset = 0;

// جلسات المستخدمين
const userSessions = {};

// تهيئة البوت
export async function initializeBot() {
  if (!EXTERNAL_SERVICE_ROLE_KEY) {
    console.log('⚠️ EXTERNAL_SUPABASE_SERVICE_ROLE_KEY not set. Bot disabled.');
    return { success: false, error: 'Service role key not configured' };
  }

  supabase = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SERVICE_ROLE_KEY);

  // جلب توكن البوت من قاعدة البيانات
  const { data: tokenData } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'telegram_bot_token')
    .maybeSingle();

  // أو من المتغيرات البيئية
  botToken = process.env.TELEGRAM_BOT_TOKEN || tokenData?.value;

  if (!botToken) {
    console.log('⚠️ TELEGRAM_BOT_TOKEN not configured. Bot disabled.');
    return { success: false, error: 'Bot token not configured' };
  }

  console.log('🤖 Telegram Bot initialized');
  return { success: true };
}

// بدء الـ Polling
export async function startPolling() {
  if (isRunning) {
    console.log('⚠️ Bot already running');
    return;
  }

  const initResult = await initializeBot();
  if (!initResult.success) {
    return;
  }

  // 🔥 إيقاف أي جلسة قديمة قبل البدء
  console.log('🔄 Clearing any existing bot sessions...');
  try {
    // حذف الـ webhook وإسقاط التحديثات المعلقة
    const deleteResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/deleteWebhook?drop_pending_updates=true`,
      { method: 'POST' }
    );
    const deleteResult = await deleteResponse.json();
    console.log('✅ Webhook cleared:', deleteResult.ok ? 'Success' : deleteResult.description);
    
    // انتظار قليلاً للتأكد من إغلاق الجلسات القديمة
    await sleep(2000);
  } catch (err) {
    console.log('⚠️ Could not clear webhook:', err.message);
  }

  isRunning = true;
  console.log('🚀 Telegram Bot started (Long Polling Mode)');

  // حلقة الاستقبال
  pollLoop();
}

async function pollLoop() {
  while (isRunning) {
    try {
      const updates = await getUpdates();
      
      for (const update of updates) {
        pollingOffset = update.update_id + 1;
        await processUpdate(update);
      }
    } catch (error) {
      console.error('❌ Polling error:', error.message);
      // انتظار قبل إعادة المحاولة
      await sleep(5000);
    }
  }
}

async function getUpdates() {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/getUpdates?offset=${pollingOffset}&timeout=30`,
      { method: 'GET' }
    );
    
    const data = await response.json();
    
    if (data.ok) {
      return data.result || [];
    } else {
      console.error('❌ getUpdates error:', data.description);
      return [];
    }
  } catch (error) {
    console.error('❌ Fetch error:', error.message);
    return [];
  }
}

// معالجة التحديثات
async function processUpdate(update) {
  try {
    // معالجة Callback Query (الأزرار)
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
      return;
    }

    // معالجة الرسائل النصية
    if (update.message) {
      await handleMessage(update.message);
    }
  } catch (error) {
    console.error('❌ Error processing update:', error.message);
  }
}

// معالجة الرسائل
async function handleMessage(message) {
  const chatId = message.chat.id.toString();
  const text = message.text?.trim() || '';
  const username = message.from?.username || null;

  console.log(`📩 Message from @${username || chatId}: ${text}`);

  // أمر البدء
  if (text === '/start') {
    await sendMessage(chatId, 
      `🎉 <b>مرحباً بك في بوت التفعيل!</b>\n\n` +
      `📝 أرسل لي <b>كود التفعيل</b> الذي استلمته بعد الشراء.\n\n` +
      `⏰ الكود صالح لمدة 24 ساعة فقط.`
    );
    return;
  }

  // أمر المساعدة
  if (text === '/help') {
    await sendMessage(chatId,
      `📖 <b>كيفية الاستخدام:</b>\n\n` +
      `1️⃣ اشترِ المنتج من الموقع\n` +
      `2️⃣ ستستلم كود تفعيل (8 أحرف)\n` +
      `3️⃣ أرسل الكود هنا\n` +
      `4️⃣ اتبع التعليمات للتفعيل\n\n` +
      `❓ للمساعدة: تواصل مع الدعم`
    );
    return;
  }

  // التحقق من كود التفعيل (8 أحرف/أرقام)
  if (/^[A-Z0-9]{6,10}$/i.test(text)) {
    await handleActivationCode(chatId, text.toUpperCase(), username);
    return;
  }

  // رسالة غير مفهومة
  await sendMessage(chatId,
    `❓ لم أفهم رسالتك.\n\n` +
    `📝 أرسل <b>كود التفعيل</b> أو اكتب /help للمساعدة.`
  );
}

// معالجة كود التفعيل
async function handleActivationCode(chatId, code, username) {
  await sendMessage(chatId, '⏳ جاري التحقق من الكود...');

  // البحث عن الكود في قاعدة البيانات
  const { data: activationCode, error } = await supabase
    .from('activation_codes')
    .select(`
      *,
      products:product_id (name, name_en, image_url, activation_type)
    `)
    .eq('code', code)
    .eq('is_used', false)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error || !activationCode) {
    await sendMessage(chatId,
      `❌ <b>كود غير صالح!</b>\n\n` +
      `تأكد من:\n` +
      `• الكود صحيح\n` +
      `• لم يتم استخدامه من قبل\n` +
      `• لم تنتهِ صلاحيته (24 ساعة)`
    );
    return;
  }

  // حفظ الجلسة
  userSessions[chatId] = {
    activationCodeId: activationCode.id,
    productName: activationCode.products?.name || 'Unknown',
    productId: activationCode.product_id,
    activationType: activationCode.products?.activation_type || 'otp',
    accountEmail: activationCode.account_email,
    accountPassword: activationCode.account_password,
    step: 'choose_type',
    retryCount: 0,
  };

  // تحديث الكود في قاعدة البيانات
  await supabase
    .from('activation_codes')
    .update({
      telegram_chat_id: chatId,
      telegram_username: username,
      status: 'in_progress',
      updated_at: new Date().toISOString(),
    })
    .eq('id', activationCode.id);

  // عرض خيارات التفعيل
  await sendMessage(chatId,
    `✅ <b>كود صالح!</b>\n\n` +
    `📦 المنتج: <b>${activationCode.products?.name}</b>\n` +
    `📧 البريد: <code>${activationCode.account_email}</code>\n\n` +
    `📱 اختر طريقة التفعيل:`,
    [
      [
        { text: '📺 رمز QR (للتلفزيون)', callback_data: 'choose_qr' },
        { text: '📱 رمز OTP (للموبايل)', callback_data: 'choose_otp' }
      ]
    ]
  );
}

// معالجة الأزرار
async function handleCallbackQuery(callbackQuery) {
  const chatId = callbackQuery.message.chat.id.toString();
  const messageId = callbackQuery.message.message_id;
  const data = callbackQuery.data;
  const username = callbackQuery.from?.username || null;

  // الرد على الضغطة
  await answerCallbackQuery(callbackQuery.id);

  const session = userSessions[chatId];

  if (!session) {
    await editMessage(chatId, messageId, '❌ انتهت الجلسة. أرسل كود التفعيل مرة أخرى.');
    return;
  }

  // اختيار نوع التفعيل
  if (data === 'choose_qr' || data === 'choose_otp') {
    const chosenType = data === 'choose_qr' ? 'qr' : 'otp';
    session.activationType = chosenType;
    session.step = 'awaiting_login';

    const typeLabel = chosenType === 'qr' ? 'رمز QR 📺' : 'رمز OTP 📱';

    await editMessage(chatId, messageId,
      `✅ اخترت: <b>${typeLabel}</b>\n\n` +
      `📧 البريد: <code>${session.accountEmail}</code>\n` +
      `🔑 كلمة المرور: <code>${session.accountPassword || 'راجع البريد'}</code>\n\n` +
      `📝 <b>التعليمات:</b>\n` +
      `1️⃣ افتح تطبيق OSN\n` +
      `2️⃣ اختر "تسجيل الدخول"\n` +
      `3️⃣ أدخل البريد وكلمة المرور\n` +
      `4️⃣ بعد الدخول، اضغط الزر أدناه`,
      [[{ text: '✅ سجلت دخول', callback_data: 'logged_in' }]]
    );
    return;
  }

  // تأكيد تسجيل الدخول
  if (data === 'logged_in') {
    if (session.activationType === 'qr') {
      // تفعيل QR
      await editMessage(chatId, messageId, '⏳ جاري توليد رمز QR...');

      const qrResult = await getQRFromSession();

      if (qrResult.success && qrResult.qrImage) {
        await sendPhoto(chatId, qrResult.qrImage, '✅ <b>رمز QR جاهز!</b>\n\n📺 امسح هذا الرمز من شاشة التلفزيون.');
        await markCodeAsUsed(session.activationCodeId);
        delete userSessions[chatId];
        await sendMessage(chatId, '🎉 تم التفعيل بنجاح! استمتع بالخدمة.\n\n⭐ لا تنسَ تقييم المنتج!');
      } else {
        await editMessage(chatId, messageId,
          `❌ فشل توليد رمز QR\n\n${qrResult.error || 'خطأ غير معروف'}\n\nجرب مرة أخرى:`,
          [[{ text: '🔄 إعادة المحاولة', callback_data: 'logged_in' }]]
        );
      }
    } else {
      // تفعيل OTP
      session.step = 'awaiting_otp_request';

      await supabase
        .from('activation_codes')
        .update({ status: 'awaiting_otp', updated_at: new Date().toISOString() })
        .eq('id', session.activationCodeId);

      await editMessage(chatId, messageId,
        `✅ ممتاز!\n\n` +
        `📱 الآن في تطبيق OSN:\n` +
        `1️⃣ سيطلب منك رمز تحقق\n` +
        `2️⃣ بعد أن يُرسل الرمز، اضغط الزر أدناه\n\n` +
        `⏰ الرمز يصل خلال ثوانٍ`,
        [[{ text: '🔑 أحضر لي الرمز', callback_data: 'get_otp' }]]
      );
    }
    return;
  }

  // طلب OTP
  if (data === 'get_otp') {
    session.retryCount = (session.retryCount || 0) + 1;

    await editMessage(chatId, messageId, '⏳ جاري البحث عن رمز التحقق...');

    const otpResult = await getOTPFromSession();

    if (otpResult.success && otpResult.otp) {
      // حفظ OTP
      await supabase.from('otp_codes').insert({
        activation_code_id: session.activationCodeId,
        otp_code: otpResult.otp,
        source: 'auto',
        is_delivered: true,
        delivered_at: new Date().toISOString(),
      });

      await editMessage(chatId, messageId,
        `✅ <b>رمز التحقق:</b>\n\n` +
        `<code>${otpResult.otp}</code>\n\n` +
        `📱 أدخل هذا الرمز في تطبيق OSN.\n\n` +
        `⚠️ الرمز صالح لمدة محدودة!`
      );

      await markCodeAsUsed(session.activationCodeId);
      delete userSessions[chatId];

      await sendMessage(chatId, '🎉 تم التفعيل بنجاح! استمتع بالخدمة.\n\n⭐ لا تنسَ تقييم المنتج!');
    } else {
      const retryMessage = session.retryCount >= 3
        ? `❌ لم يُعثر على رمز جديد.\n\n` +
          `📝 <b>تأكد من:</b>\n` +
          `• فتح تطبيق OSN\n` +
          `• طلب رمز التحقق من التطبيق\n` +
          `• الانتظار حتى يصل الرمز\n\n` +
          `ثم اضغط إعادة المحاولة:`
        : `⏳ لم يُعثر على رمز حديث.\n\n` +
          `📱 تأكد من أن التطبيق طلب الرمز، ثم اضغط:`;

      await editMessage(chatId, messageId, retryMessage,
        [[{ text: '🔄 إعادة المحاولة', callback_data: 'get_otp' }]]
      );
    }
    return;
  }
}

// جلب QR من الجلسة
async function getQRFromSession() {
  try {
    const qrData = await sessionManager.getQRCode();
    return qrData;
  } catch (error) {
    console.error('❌ QR fetch error:', error.message);
    return { success: false, error: error.message };
  }
}

// جلب OTP من الجلسة
async function getOTPFromSession() {
  try {
    const otpData = await sessionManager.getOTP();
    return otpData;
  } catch (error) {
    console.error('❌ OTP fetch error:', error.message);
    return { success: false, error: error.message };
  }
}

// تحديد الكود كمستخدم
async function markCodeAsUsed(codeId) {
  await supabase
    .from('activation_codes')
    .update({
      status: 'used',
      is_used: true,
      used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', codeId);
}

// ============================================================
// Telegram API Helpers
// ============================================================

async function sendMessage(chatId, text, inlineKeyboard = null) {
  const body = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML',
  };

  if (inlineKeyboard) {
    body.reply_markup = { inline_keyboard: inlineKeyboard };
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return response.json();
}

async function editMessage(chatId, messageId, text, inlineKeyboard = null) {
  const body = {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: 'HTML',
  };

  if (inlineKeyboard) {
    body.reply_markup = { inline_keyboard: inlineKeyboard };
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return response.json();
}

async function answerCallbackQuery(callbackQueryId, text = null) {
  const body = { callback_query_id: callbackQueryId };
  if (text) {
    body.text = text;
    body.show_alert = false;
  }

  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function sendPhoto(chatId, photoBase64, caption) {
  try {
    const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, '');
    const binaryData = Buffer.from(base64Data, 'base64');

    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('caption', caption);
    formData.append('parse_mode', 'HTML');
    formData.append('photo', new Blob([binaryData], { type: 'image/png' }), 'qr-code.png');

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: 'POST',
      body: formData,
    });

    return response.json();
  } catch (error) {
    console.error('❌ Send photo error:', error.message);
    return { ok: false, error: error.message };
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// إيقاف البوت
export function stopPolling() {
  isRunning = false;
  console.log('🛑 Telegram Bot stopped');
}

// حالة البوت
export function getBotStatus() {
  return {
    isRunning,
    sessionsCount: Object.keys(userSessions).length,
  };
}

export default {
  startPolling,
  stopPolling,
  getBotStatus,
  initializeBot,
};
