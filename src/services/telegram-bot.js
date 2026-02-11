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

  // === انتظار كود التلفزيون ===
  const session = userSessions[chatId];
  if (session && session.step === 'awaiting_tv_code') {
    // المستخدم أرسل كود التلفزيون
    const tvCode = text.replace(/[\s\-]/g, '').toUpperCase();
    if (tvCode.length < 4 || tvCode.length > 8) {
      await sendMessage(chatId, bi(
        '❌ الكود غير صحيح. أرسل الأرقام/الأحرف المعروضة على شاشة التلفزيون (عادة 5 خانات).',
        '❌ Invalid code. Send the numbers/letters shown on your TV screen (usually 5 characters).'
      ));
      return;
    }

    await sendMessage(chatId, bi(
      `⏳ جاري إدخال الكود <code>${tvCode}</code> في موقع OSN...\n\n⌛ انتظر قليلاً...`,
      `⏳ Entering code <code>${tvCode}</code> on OSN website...\n\n⌛ Please wait...`
    ));

    const tvResult = await enterTVCodeFromSession(tvCode);

    if (tvResult.success) {
      // إرسال صورة النتيجة
      if (tvResult.screenshot) {
        await sendPhoto(chatId, tvResult.screenshot, bi(
          tvResult.paired
            ? '✅ <b>تم ربط التلفزيون بنجاح!</b>\n\n📺 يمكنك الآن مشاهدة المحتوى على تلفزيونك.'
            : '📺 <b>تم إدخال الكود.</b>\n\n✅ تحقق من شاشة التلفزيون - يجب أن يكون متصلاً الآن.',
          tvResult.paired
            ? '✅ <b>TV linked successfully!</b>\n\n📺 You can now watch content on your TV.'
            : '📺 <b>Code entered.</b>\n\n✅ Check your TV screen - it should be connected now.'
        ));
      }

      await markCodeAsUsed(session.activationCodeId);
      await sendSuccessMessage(chatId, session);
      delete userSessions[chatId];
    } else {
      await sendMessage(chatId, bi(
        `❌ فشل إدخال الكود\n\n${tvResult.error || 'خطأ غير معروف'}\n\n📝 تأكد أن الكود صحيح وأرسله مرة أخرى:`,
        `❌ Failed to enter the code\n\n${tvResult.error || 'Unknown error'}\n\n📝 Make sure the code is correct and send it again:`
      ));
    }
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
  const accountPassword = activationCode.account_password;
  const activationType = activationCode.products?.activation_type || 'otp';

  // تحديد نوع المنتج: OSN أو ChatGPT أو غيره
  const isOSN = activationType === 'osn' || productNameAr.toLowerCase().includes('osn') || productNameEn.toLowerCase().includes('osn');
  const isChatGPT = activationType === 'chatgpt' || productNameAr.toLowerCase().includes('chatgpt') || productNameEn.toLowerCase().includes('chatgpt');

  // Save session
  userSessions[chatId] = {
    activationCodeId: activationCode.id,
    productNameAr,
    productNameEn,
    productId: activationCode.product_id,
    orderId: activationCode.order_id,
    activationType: activationType,
    productCategory: isOSN ? 'osn' : isChatGPT ? 'chatgpt' : 'other',
    accountEmail: accountEmail,
    accountPassword: accountPassword,
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

  // === تدفق ChatGPT: إيميل + باسورد فوراً ثم زر OTP ===
  if (isChatGPT) {
    const emailLine = accountEmail ? `\n📧 <b>الإيميل:</b> <code>${accountEmail}</code>` : '';
    const passLine = accountPassword ? `\n🔑 <b>كلمة المرور:</b> <code>${accountPassword}</code>` : '';

    userSessions[chatId].step = 'awaiting_otp_request';

    await sendMessage(chatId, bi(
      `✅ <b>كود صالح!</b>\n\n📦 المنتج: <b>${productNameAr}</b>${emailLine}${passLine}\n\n📝 <b>التعليمات:</b>\n1️⃣ سجّل دخول بالبيانات أعلاه\n2️⃣ إذا طلب رمز تحقق، اضغط الزر أدناه\n\n⚠️ <b>سجّل دخول أولاً ثم اطلب الرمز!</b>`,
      `✅ <b>Valid code!</b>\n\n📦 Product: <b>${productNameEn}</b>${emailLine}${passLine}\n\n📝 <b>Instructions:</b>\n1️⃣ Login with the credentials above\n2️⃣ If it asks for a verification code, press the button below\n\n⚠️ <b>Login first, then request the code!</b>`
    ), [[{ text: '🔑 أحضر لي الرمز / Get my code', callback_data: 'get_otp' }]]);
    return;
  }

  // === تدفق OSN: تلفزيون أو هاتف ===
  const emailLine = accountEmail 
    ? `\n📧 ${accountEmail}` 
    : '';

  await sendMessage(chatId, bi(
    `✅ <b>كود صالح!</b>\n\n📦 المنتج: <b>${productNameAr}</b>${emailLine}\n\n📱 أين تريد تفعيل الخدمة؟`,
    `✅ <b>Valid code!</b>\n\n📦 Product: <b>${productNameEn}</b>${emailLine}\n\n📱 Where do you want to activate the service?`
  ), [
    [
      { text: '📺 تلفزيون / TV', callback_data: 'choose_tv' },
      { text: '📱 هاتف / Phone', callback_data: 'choose_otp' }
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
  if (data === 'choose_tv' || data === 'choose_otp') {
    const chosenType = data === 'choose_tv' ? 'tv' : 'otp';
    session.activationType = chosenType;

    const emailLine = session.accountEmail 
      ? `\n📧 <code>${session.accountEmail}</code>` 
      : '';

    if (chosenType === 'tv') {
      session.step = 'awaiting_tv_code';

      await editMessage(chatId, messageId, bi(
        `✅ اخترت: <b>تلفزيون 📺</b>${emailLine}\n\n📝 <b>التعليمات:</b>\n1️⃣ افتح تطبيق OSN على التلفزيون\n2️⃣ ستظهر لك <b>أرقام/كود</b> على الشاشة\n3️⃣ <b>أرسل لي هذه الأرقام هنا</b>\n\n⌨️ اكتب الأرقام الموجودة على شاشة التلفزيون:`,
        `✅ You chose: <b>TV 📺</b>${emailLine}\n\n📝 <b>Instructions:</b>\n1️⃣ Open OSN app on your TV\n2️⃣ You'll see <b>numbers/code</b> on the screen\n3️⃣ <b>Send me those numbers here</b>\n\n⌨️ Type the numbers shown on your TV screen:`
      ));
    } else {
      session.step = 'awaiting_login';

      await editMessage(chatId, messageId, bi(
        `✅ اخترت: <b>هاتف (OTP) 📱</b>${emailLine}\n\n📝 <b>التعليمات:</b>\n1️⃣ افتح تطبيق OSN\n2️⃣ اختر "تسجيل الدخول"\n3️⃣ أدخل البريد أعلاه\n4️⃣ ⚠️ <b>يجب تسجيل الدخول أولاً قبل طلب الرمز</b>\n5️⃣ بعد الدخول، اضغط الزر أدناه`,
        `✅ You chose: <b>Phone (OTP) 📱</b>${emailLine}\n\n📝 <b>Instructions:</b>\n1️⃣ Open OSN app\n2️⃣ Select "Login"\n3️⃣ Enter the email above\n4️⃣ ⚠️ <b>You must login first before requesting the code</b>\n5️⃣ After login, press the button below`
      ), [[{ text: '✅ سجلت دخول / I logged in', callback_data: 'logged_in' }]]);
    }
    return;
  }

  // === Confirm login (OTP flow only) ===
  if (data === 'logged_in') {
    session.step = 'awaiting_otp_request';

    await supabase
      .from('activation_codes')
      .update({ status: 'awaiting_otp', updated_at: new Date().toISOString() })
      .eq('id', session.activationCodeId);

    await editMessage(chatId, messageId, bi(
      `✅ ممتاز!\n\n📱 الآن في تطبيق OSN:\n1️⃣ سيطلب منك رمز تحقق\n2️⃣ بعد أن يُرسل الرمز، اضغط الزر أدناه\n\n⏰ <b>ملاحظة:</b> الرمز يصل خلال ثوانٍ`,
      `✅ Great!\n\n📱 Now in OSN app:\n1️⃣ It will ask for a verification code\n2️⃣ After the code is sent, press the button below\n\n⏰ <b>Note:</b> The code arrives within seconds`
    ), [[{ text: '🔑 أحضر لي الرمز / Get my code', callback_data: 'get_otp' }]]);
    return;
  }

  // === Get OTP (Auto-polling) ===
  if (data === 'get_otp') {
    const category = session.productCategory || 'osn';
    const appNameAr = category === 'chatgpt' ? 'ChatGPT' : 'OSN';
    const appNameEn = appNameAr;

    await editMessage(chatId, messageId, bi(
      `⏳ جاري البحث عن رمز التحقق من ${appNameAr} تلقائياً...\n\n🔄 سأحاول عدة مرات خلال 60 ثانية.`,
      `⏳ Searching for ${appNameEn} verification code automatically...\n\n🔄 I will retry multiple times over 60 seconds.`
    ));

    // تحديد فلتر المرسل حسب نوع المنتج
    let senderFilter = null;
    if (category === 'chatgpt') {
      senderFilter = ['openai.com', 'chatgpt.com', 'openai'];
    } else if (category === 'osn') {
      senderFilter = ['osn', 'osnplus'];
    }

    // محاولة تلقائية: 6 محاولات × 10 ثواني = 60 ثانية
    const maxAttempts = 6;
    const delayBetween = 10000; // 10 ثواني

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`🔍 OTP attempt ${attempt}/${maxAttempts} for ${category}...`);

      const otpResult = await getOTPFromSession(senderFilter);

      if (otpResult.success && otpResult.otp) {
        // تم العثور على الرمز!
        await supabase.from('otp_codes').insert({
          activation_code_id: session.activationCodeId,
          otp_code: otpResult.otp,
          source: 'auto',
          is_delivered: true,
          delivered_at: new Date().toISOString(),
        });

        await editMessage(chatId, messageId, bi(
          `✅ <b>رمز التحقق:</b>\n\n<code>${otpResult.otp}</code>\n\n📱 أدخل هذا الرمز في ${appNameAr}.\n\n⚠️ الرمز صالح لمدة محدودة!`,
          `✅ <b>Verification code:</b>\n\n<code>${otpResult.otp}</code>\n\n📱 Enter this code in ${appNameEn}.\n\n⚠️ The code is valid for a limited time!`
        ));

        await markCodeAsUsed(session.activationCodeId);
        await sendSuccessMessage(chatId, session);
        delete userSessions[chatId];
        return;
      }

      // لم يُعثر عليه بعد - تحديث الرسالة وانتظار
      if (attempt < maxAttempts) {
        await editMessage(chatId, messageId, bi(
          `⏳ جاري البحث... (محاولة ${attempt}/${maxAttempts})\n\n🔄 الانتظار ${delayBetween / 1000} ثوانٍ ثم إعادة المحاولة...`,
          `⏳ Searching... (attempt ${attempt}/${maxAttempts})\n\n🔄 Waiting ${delayBetween / 1000} seconds then retrying...`
        ));
        await sleep(delayBetween);
      }
    }

    // فشلت كل المحاولات
    await editMessage(chatId, messageId, bi(
      `❌ لم يُعثر على رمز من ${appNameAr} بعد ${maxAttempts} محاولات.\n\n📝 <b>تأكد من:</b>\n• سجّلت دخول في ${appNameAr} أولاً\n• طلبت رمز التحقق\n• الرمز وصل للبريد من ${appNameAr}\n\n⚠️ يجب تسجيل الدخول أولاً قبل طلب الرمز!\n\nاضغط للمحاولة مرة أخرى:`,
      `❌ No ${appNameEn} code found after ${maxAttempts} attempts.\n\n📝 <b>Make sure:</b>\n• You logged in to ${appNameEn} first\n• You requested the verification code\n• The code arrived from ${appNameEn}\n\n⚠️ You must login first before requesting the code!\n\nPress to try again:`
    ), [[{ text: '🔄 إعادة المحاولة / Retry', callback_data: 'get_otp' }]]);
    return;
  }
}

// ============================================================
// Success message with receipt link + rating
// ============================================================
async function sendSuccessMessage(chatId, session) {
  const storeUrl = await getStoreUrl();
  const orderId = session.orderId;

  // استخدام زر Inline Keyboard للرابط بدلاً من HTML link
  let inlineButtons = null;
  if (storeUrl && orderId) {
    const receiptUrl = `${storeUrl}/order/${orderId}`;
    inlineButtons = [[{ text: '🧾 عرض الإيصال / View Receipt', url: receiptUrl }]];
  }

  await sendMessage(chatId, bi(
    `🎉 <b>تم التفعيل بنجاح!</b>\n\nاستمتع بالخدمة! 🎬\n\n⭐ <b>قيّم تجربتك:</b>\nساعدنا بتقييم المنتج في الموقع لنحسّن خدماتنا.`,
    `🎉 <b>Activation successful!</b>\n\nEnjoy the service! 🎬\n\n⭐ <b>Rate your experience:</b>\nHelp us by rating the product on our website.`
  ), inlineButtons);
}

// ============================================================
// Session Manager Integration
// ============================================================
async function enterTVCodeFromSession(tvCode) {
  try {
    const result = await sessionManager.enterTVCode(tvCode);
    return result;
  } catch (error) {
    console.error('❌ TV code entry error:', error.message);
    return { success: false, error: error.message };
  }
}

async function getQRFromSession() {
  try {
    const qrData = await sessionManager.getQRCode();
    return qrData;
  } catch (error) {
    console.error('❌ QR fetch error:', error.message);
    return { success: false, error: error.message };
  }
}

async function getOTPFromSession(senderFilter = null) {
  try {
    // osn_sessions مخزن في قاعدة البيانات الخارجية
    const { data: sessions, error: dbError } = await supabase
      .from('osn_sessions')
      .select('gmail_address, gmail_app_password, variant_id, email')
      .eq('is_active', true)
      .eq('is_connected', true)
      .limit(5);

    if (dbError) {
      console.error('❌ DB Error fetching osn_sessions:', dbError.message);
      return { success: false, error: 'خطأ في قراءة جلسات قاعدة البيانات: ' + dbError.message };
    }

    console.log(`📊 Found ${sessions?.length || 0} active connected sessions`);

    // البحث في كل الجلسات النشطة التي لديها بيانات Gmail
    const validSessions = (sessions || []).filter(s => s.gmail_address && s.gmail_app_password);
    
    if (validSessions.length === 0) {
      console.error('❌ No sessions with Gmail credentials found');
      return { success: false, error: 'لا توجد جلسة نشطة ببيانات Gmail. تأكد من إضافة عنوان Gmail وكلمة مرور التطبيق في إعدادات الجلسة.' };
    }

    console.log(`📧 Trying ${validSessions.length} sessions with Gmail credentials, senderFilter: ${JSON.stringify(senderFilter)}`);

    // Edge Function في Lovable Cloud
    const CLOUD_URL = process.env.SUPABASE_URL || 'https://wueacwqzafxsvowlqbwh.supabase.co';
    const CLOUD_ANON = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

    // جرب كل جلسة حتى يُعثر على OTP
    for (const session of validSessions) {
      console.log(`📧 Trying Gmail: ${session.gmail_address}`);
      
      try {
        const requestBody = {
          gmailAddress: session.gmail_address,
          gmailAppPassword: session.gmail_app_password,
          maxAgeMinutes: 5,
        };

        // إضافة فلتر المرسل إذا موجود
        if (senderFilter) {
          requestBody.senderFilter = senderFilter;
        }

        const response = await fetch(`${CLOUD_URL}/functions/v1/gmail-read-otp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${CLOUD_ANON}`,
          },
          body: JSON.stringify(requestBody),
        });

        const result = await response.json();
        console.log(`📧 Gmail OTP result for ${session.gmail_address}:`, JSON.stringify(result));

        if (result.success && result.otp) {
          return { success: true, otp: result.otp };
        }
      } catch (fetchErr) {
        console.error(`❌ Edge function error for ${session.gmail_address}:`, fetchErr.message);
      }
    }

    return { success: false, error: 'لم يُعثر على رمز OTP في أي من الجلسات النشطة' };
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
