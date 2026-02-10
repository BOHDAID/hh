// ============================================================
// Telegram Bot Service - Long Polling Mode
// يعمل مع خادم Express على Render
// Bilingual: Arabic + English
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

// ============================================================
// Bilingual message helper
// ============================================================
const bi = (ar, en) => `${ar}\n\n─────────\n\n${en}`;

// ============================================================
// Initialize Bot
// ============================================================
export async function initializeBot() {
  if (!EXTERNAL_SERVICE_ROLE_KEY) {
    console.log('⚠️ EXTERNAL_SUPABASE_SERVICE_ROLE_KEY not set. Bot disabled.');
    return { success: false, error: 'Service role key not configured' };
  }

  supabase = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SERVICE_ROLE_KEY);

  const { data: tokenData } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'telegram_bot_token')
    .maybeSingle();

  botToken = process.env.TELEGRAM_BOT_TOKEN || tokenData?.value;

  if (!botToken) {
    console.log('⚠️ TELEGRAM_BOT_TOKEN not configured. Bot disabled.');
    return { success: false, error: 'Bot token not configured' };
  }

  console.log('🤖 Telegram Bot initialized');
  return { success: true };
}

// ============================================================
// Polling
// ============================================================
export async function startPolling() {
  if (isRunning) {
    console.log('⚠️ Bot already running');
    return;
  }

  const initResult = await initializeBot();
  if (!initResult.success) return;

  console.log('🔄 Clearing any existing bot sessions...');
  try {
    const deleteResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/deleteWebhook?drop_pending_updates=true`,
      { method: 'POST' }
    );
    const deleteResult = await deleteResponse.json();
    console.log('✅ Webhook cleared:', deleteResult.ok ? 'Success' : deleteResult.description);
    await sleep(2000);
  } catch (err) {
    console.log('⚠️ Could not clear webhook:', err.message);
  }

  isRunning = true;
  console.log('🚀 Telegram Bot started (Long Polling Mode)');
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
    return data.ok ? (data.result || []) : [];
  } catch (error) {
    console.error('❌ Fetch error:', error.message);
    return [];
  }
}

async function processUpdate(update) {
  try {
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
      return;
    }
    if (update.message) {
      await handleMessage(update.message);
    }
  } catch (error) {
    console.error('❌ Error processing update:', error.message);
  }
}

// ============================================================
// Get store URL from settings
// ============================================================
async function getStoreUrl() {
  const { data } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'store_url')
    .maybeSingle();
  return data?.value || null;
}

// ============================================================
// Handle Messages
// ============================================================
async function handleMessage(message) {
  const chatId = message.chat.id.toString();
  const text = message.text?.trim() || '';
  const username = message.from?.username || null;

  console.log(`📩 Message from @${username || chatId}: ${text}`);

  if (text === '/start') {
    await sendMessage(chatId, bi(
      `🎉 <b>مرحباً بك في بوت التفعيل!</b>\n\n📝 أرسل لي <b>كود التفعيل</b> الذي استلمته بعد الشراء.\n\n⏰ الكود صالح لمدة 24 ساعة فقط.`,
      `🎉 <b>Welcome to the Activation Bot!</b>\n\n📝 Send me your <b>activation code</b> that you received after purchase.\n\n⏰ The code is valid for 24 hours only.`
    ));
    delete userSessions[chatId];
    return;
  }

  if (text === '/help') {
    await sendMessage(chatId, bi(
      `📖 <b>كيفية الاستخدام:</b>\n\n1️⃣ اشترِ المنتج من الموقع\n2️⃣ ستستلم كود تفعيل (8 أحرف)\n3️⃣ أرسل الكود هنا\n4️⃣ اتبع التعليمات للتفعيل\n\n❓ للمساعدة: تواصل مع الدعم`,
      `📖 <b>How to use:</b>\n\n1️⃣ Buy the product from the website\n2️⃣ You'll receive an activation code (8 characters)\n3️⃣ Send the code here\n4️⃣ Follow the instructions\n\n❓ Need help? Contact support`
    ));
    return;
  }

  // التحقق من كود التفعيل (6-10 أحرف/أرقام)
  if (/^[A-Z0-9]{6,10}$/i.test(text)) {
    await handleActivationCode(chatId, text.toUpperCase(), username);
    return;
  }

  await sendMessage(chatId, bi(
    `❓ لم أفهم رسالتك.\n\n📝 أرسل <b>كود التفعيل</b> أو اكتب /help للمساعدة.`,
    `❓ I didn't understand your message.\n\n📝 Send your <b>activation code</b> or type /help for help.`
  ));
}

// ============================================================
// Handle Activation Code
// ============================================================
async function handleActivationCode(chatId, code, username) {
  await sendMessage(chatId, bi('⏳ جاري التحقق من الكود...', '⏳ Verifying code...'));

  // 1️⃣ Check if code exists but is already used
  const { data: usedCode } = await supabase
    .from('activation_codes')
    .select('id, code, is_used, used_at')
    .eq('code', code)
    .eq('is_used', true)
    .maybeSingle();

  if (usedCode) {
    await sendMessage(chatId, bi(
      `⚠️ <b>الكود صحيح لكن تم استخدامه!</b>\n\n🔑 الكود: <code>${code}</code>\n❌ تم استخدام هذا الكود مرة واحدة فقط وانتهت صلاحيته.\n\n📞 إذا كنت تعتقد أن هناك خطأ، تواصل مع الدعم.`,
      `⚠️ <b>Code is correct but already used!</b>\n\n🔑 Code: <code>${code}</code>\n❌ This code has been used once and is now expired.\n\n📞 If you believe this is an error, contact support.`
    ));
    return;
  }

  // 2️⃣ Check if code exists but expired
  const { data: expiredCode } = await supabase
    .from('activation_codes')
    .select('id, code, expires_at')
    .eq('code', code)
    .eq('is_used', false)
    .lte('expires_at', new Date().toISOString())
    .maybeSingle();

  if (expiredCode) {
    await sendMessage(chatId, bi(
      `⏰ <b>الكود منتهي الصلاحية!</b>\n\n🔑 الكود: <code>${code}</code>\n❌ انتهت صلاحية هذا الكود. تواصل مع الدعم للحصول على كود جديد.`,
      `⏰ <b>Code has expired!</b>\n\n🔑 Code: <code>${code}</code>\n❌ This code has expired. Contact support for a new code.`
    ));
    return;
  }

  // 3️⃣ Search for valid code
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
    await sendMessage(chatId, bi(
      `❌ <b>كود غير صالح!</b>\n\nتأكد من:\n• الكود صحيح\n• لم يتم استخدامه من قبل\n• لم تنتهِ صلاحيته (24 ساعة)`,
      `❌ <b>Invalid code!</b>\n\nMake sure:\n• The code is correct\n• It hasn't been used before\n• It hasn't expired (24 hours)`
    ));
    return;
  }

  const productNameAr = activationCode.products?.name || 'المنتج';
  const productNameEn = activationCode.products?.name_en || productNameAr;
  const accountEmail = activationCode.account_email;

  // Save session
  userSessions[chatId] = {
    activationCodeId: activationCode.id,
    productNameAr,
    productNameEn,
    productId: activationCode.product_id,
    orderId: activationCode.order_id,
    activationType: activationCode.products?.activation_type || 'otp',
    accountEmail: accountEmail,
    step: 'choose_type',
    retryCount: 0,
  };

  // Update code in DB
  await supabase
    .from('activation_codes')
    .update({
      telegram_chat_id: chatId,
      telegram_username: username,
      status: 'in_progress',
      updated_at: new Date().toISOString(),
    })
    .eq('id', activationCode.id);

  // Show activation type choices
  const emailLine = accountEmail 
    ? `\n📧 ${accountEmail}` 
    : '';

  await sendMessage(chatId, bi(
    `✅ <b>كود صالح!</b>\n\n📦 المنتج: <b>${productNameAr}</b>${emailLine}\n\n📱 اختر طريقة التفعيل:`,
    `✅ <b>Valid code!</b>\n\n📦 Product: <b>${productNameEn}</b>${emailLine}\n\n📱 Choose activation method:`
  ), [
    [
      { text: '📺 تلفزيون / TV (QR)', callback_data: 'choose_qr' },
      { text: '📱 هاتف / Phone (OTP)', callback_data: 'choose_otp' }
    ]
  ]);
}

// ============================================================
// Handle Callback Queries (Buttons)
// ============================================================
async function handleCallbackQuery(callbackQuery) {
  const chatId = callbackQuery.message.chat.id.toString();
  const messageId = callbackQuery.message.message_id;
  const data = callbackQuery.data;
  const username = callbackQuery.from?.username || null;

  await answerCallbackQuery(callbackQuery.id);

  const session = userSessions[chatId];

  if (!session) {
    await editMessage(chatId, messageId, bi(
      '❌ انتهت الجلسة. أرسل كود التفعيل مرة أخرى.',
      '❌ Session expired. Send your activation code again.'
    ));
    return;
  }

  // === Choose activation type ===
  if (data === 'choose_qr' || data === 'choose_otp') {
    const chosenType = data === 'choose_qr' ? 'qr' : 'otp';
    session.activationType = chosenType;
    session.step = 'awaiting_login';

    const emailLine = session.accountEmail 
      ? `\n📧 <code>${session.accountEmail}</code>` 
      : '';

    if (chosenType === 'qr') {
      await editMessage(chatId, messageId, bi(
        `✅ اخترت: <b>تلفزيون (QR) 📺</b>${emailLine}\n\n📝 <b>التعليمات:</b>\n1️⃣ افتح تطبيق OSN على التلفزيون\n2️⃣ اختر "تسجيل الدخول بـ QR"\n3️⃣ اضغط الزر أدناه وسأرسل لك رمز QR`,
        `✅ You chose: <b>TV (QR) 📺</b>${emailLine}\n\n📝 <b>Instructions:</b>\n1️⃣ Open OSN app on your TV\n2️⃣ Select "Login with QR"\n3️⃣ Press the button below and I'll send you the QR code`
      ), [[{ text: '📺 أرسل لي QR / Send me QR', callback_data: 'logged_in' }]]);
    } else {
      await editMessage(chatId, messageId, bi(
        `✅ اخترت: <b>هاتف (OTP) 📱</b>${emailLine}\n\n📝 <b>التعليمات:</b>\n1️⃣ افتح تطبيق OSN\n2️⃣ اختر "تسجيل الدخول"\n3️⃣ أدخل البريد أعلاه\n4️⃣ ⚠️ <b>يجب تسجيل الدخول أولاً قبل طلب الرمز</b>\n5️⃣ بعد الدخول، اضغط الزر أدناه`,
        `✅ You chose: <b>Phone (OTP) 📱</b>${emailLine}\n\n📝 <b>Instructions:</b>\n1️⃣ Open OSN app\n2️⃣ Select "Login"\n3️⃣ Enter the email above\n4️⃣ ⚠️ <b>You must login first before requesting the code</b>\n5️⃣ After login, press the button below`
      ), [[{ text: '✅ سجلت دخول / I logged in', callback_data: 'logged_in' }]]);
    }
    return;
  }

  // === Confirm login ===
  if (data === 'logged_in') {
    if (session.activationType === 'qr') {
      // QR activation
      await editMessage(chatId, messageId, bi(
        '⏳ جاري توليد رمز QR...',
        '⏳ Generating QR code...'
      ));

      const qrResult = await getQRFromSession();

      if (qrResult.success && qrResult.qrImage) {
        await sendPhoto(chatId, qrResult.qrImage, bi(
          '✅ <b>رمز QR جاهز!</b>\n\n📺 امسح هذا الرمز من شاشة التلفزيون.',
          '✅ <b>QR Code ready!</b>\n\n📺 Scan this code from your TV screen.'
        ));
        await markCodeAsUsed(session.activationCodeId);
        await sendSuccessMessage(chatId, session);
        delete userSessions[chatId];
      } else {
        await editMessage(chatId, messageId, bi(
          `❌ فشل توليد رمز QR\n\n${qrResult.error || 'خطأ غير معروف'}\n\nجرب مرة أخرى:`,
          `❌ Failed to generate QR code\n\n${qrResult.error || 'Unknown error'}\n\nTry again:`
        ), [[{ text: '🔄 إعادة / Retry', callback_data: 'logged_in' }]]);
      }
    } else {
      // OTP activation
      session.step = 'awaiting_otp_request';

      await supabase
        .from('activation_codes')
        .update({ status: 'awaiting_otp', updated_at: new Date().toISOString() })
        .eq('id', session.activationCodeId);

      await editMessage(chatId, messageId, bi(
        `✅ ممتاز!\n\n📱 الآن في تطبيق OSN:\n1️⃣ سيطلب منك رمز تحقق\n2️⃣ بعد أن يُرسل الرمز، اضغط الزر أدناه\n\n⏰ <b>ملاحظة:</b> الرمز يصل خلال ثوانٍ`,
        `✅ Great!\n\n📱 Now in OSN app:\n1️⃣ It will ask for a verification code\n2️⃣ After the code is sent, press the button below\n\n⏰ <b>Note:</b> The code arrives within seconds`
      ), [[{ text: '🔑 أحضر لي الرمز / Get my code', callback_data: 'get_otp' }]]);
    }
    return;
  }

  // === Get OTP ===
  if (data === 'get_otp') {
    session.retryCount = (session.retryCount || 0) + 1;

    await editMessage(chatId, messageId, bi(
      '⏳ جاري البحث عن رمز التحقق...',
      '⏳ Searching for verification code...'
    ));

    const otpResult = await getOTPFromSession();

    if (otpResult.success && otpResult.otp) {
      // Save OTP
      await supabase.from('otp_codes').insert({
        activation_code_id: session.activationCodeId,
        otp_code: otpResult.otp,
        source: 'auto',
        is_delivered: true,
        delivered_at: new Date().toISOString(),
      });

      await editMessage(chatId, messageId, bi(
        `✅ <b>رمز التحقق:</b>\n\n<code>${otpResult.otp}</code>\n\n📱 أدخل هذا الرمز في تطبيق OSN.\n\n⚠️ الرمز صالح لمدة محدودة!`,
        `✅ <b>Verification code:</b>\n\n<code>${otpResult.otp}</code>\n\n📱 Enter this code in the OSN app.\n\n⚠️ The code is valid for a limited time!`
      ));

      await markCodeAsUsed(session.activationCodeId);
      await sendSuccessMessage(chatId, session);
      delete userSessions[chatId];
    } else {
      const retryMsg = session.retryCount >= 3
        ? bi(
            `❌ لم يُعثر على رمز جديد.\n\n📝 <b>تأكد من:</b>\n• فتح تطبيق OSN\n• طلب رمز التحقق من التطبيق\n• الانتظار حتى يصل الرمز\n\nثم اضغط إعادة المحاولة:`,
            `❌ No new code found.\n\n📝 <b>Make sure:</b>\n• OSN app is open\n• You requested the code from the app\n• Wait for the code to arrive\n\nThen press retry:`
          )
        : bi(
            `⏳ لم يُعثر على رمز حديث.\n\n📱 تأكد من أن التطبيق طلب الرمز، ثم اضغط:`,
            `⏳ No recent code found.\n\n📱 Make sure the app requested the code, then press:`
          );

      await editMessage(chatId, messageId, retryMsg,
        [[{ text: '🔄 إعادة المحاولة / Retry', callback_data: 'get_otp' }]]
      );
    }
    return;
  }
}

// ============================================================
// Success message with receipt link + rating
// ============================================================
async function sendSuccessMessage(chatId, session) {
  const storeUrl = await getStoreUrl();
  const orderId = session.orderId;

  let receiptLine = '';
  if (storeUrl && orderId) {
    receiptLine = `\n\n🧾 <a href="${storeUrl}/order/${orderId}">عرض الإيصال / View Receipt</a>`;
  }

  await sendMessage(chatId, bi(
    `🎉 <b>تم التفعيل بنجاح!</b>\n\nاستمتع بالخدمة! 🎬${receiptLine}\n\n⭐ <b>قيّم تجربتك:</b>\nساعدنا بتقييم المنتج في الموقع لنحسّن خدماتنا.`,
    `🎉 <b>Activation successful!</b>\n\nEnjoy the service! 🎬${receiptLine}\n\n⭐ <b>Rate your experience:</b>\nHelp us by rating the product on our website.`
  ));
}

// ============================================================
// Session Manager Integration
// ============================================================
async function getQRFromSession() {
  try {
    const qrData = await sessionManager.getQRCode();
    return qrData;
  } catch (error) {
    console.error('❌ QR fetch error:', error.message);
    return { success: false, error: error.message };
  }
}

async function getOTPFromSession() {
  try {
    const otpData = await sessionManager.getOTP();
    return otpData;
  } catch (error) {
    console.error('❌ OTP fetch error:', error.message);
    return { success: false, error: error.message };
  }
}

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
    disable_web_page_preview: true,
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
    disable_web_page_preview: true,
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

// ============================================================
// Bot Control
// ============================================================
export function stopPolling() {
  isRunning = false;
  console.log('🛑 Telegram Bot stopped');
}

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
