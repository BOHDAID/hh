// ============================================================
// Telegram Bot Service - Long Polling Mode
// يعمل مع خادم Express على Render
// Bilingual: Arabic + English
// ============================================================

import { createClient } from '@supabase/supabase-js';
import sessionManager from './session-manager.js';

// إعدادات قاعدة البيانات الخارجية
const EXTERNAL_SUPABASE_URL = process.env.EXTERNAL_SUPABASE_URL;
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

  botToken = tokenData?.value || process.env.TELEGRAM_BOT_TOKEN;

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
  const chatId = update?.message?.chat?.id?.toString() || update?.callback_query?.message?.chat?.id?.toString();
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
    // إرسال رسالة خطأ للعميل حتى لا يبقى بدون رد
    if (chatId) {
      try {
        await sendMessage(chatId, bi(
          '❌ حدث خطأ غير متوقع أثناء المعالجة. حاول مرة أخرى أو أرسل /cancel ثم أعد المحاولة.',
          '❌ An unexpected error occurred. Please try again or send /cancel and retry.'
        ));
      } catch (e) {
        console.error('❌ Failed to send error message to user:', e.message);
      }
    }
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

  // === /cancel - يعمل دائماً حتى لو الجلسة مقفلة ===
  if (text === '/cancel') {
    const cancelSession = userSessions[chatId];
    if (cancelSession) {
      // تحديث حالة الكود في قاعدة البيانات
      if (cancelSession.activationCodeId) {
        try {
          await supabase
            .from('activation_codes')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', cancelSession.activationCodeId);
        } catch (err) {
          console.error('❌ Error updating activation code on cancel:', err.message);
        }
      }
      delete userSessions[chatId];
      await sendMessage(chatId, bi(
        '✅ تم إلغاء العملية الحالية. يمكنك إرسال كود تفعيل جديد.',
        '✅ Current operation cancelled. You can send a new activation code.'
      ));
    } else {
      await sendMessage(chatId, bi(
        '❓ لا توجد عملية نشطة لإلغائها.',
        '❓ No active operation to cancel.'
      ));
    }
    return;
  }

  // === جلسة مقفلة - تحتاج /cancel (قبل أي أمر آخر!) ===
  const session = userSessions[chatId];
  if (session && session.step === 'locked_needs_cancel') {
    await sendMessage(chatId, bi(
      '🔒 الجلسة مقفلة. أرسل /cancel لإلغاء الجلسة الحالية وإعادة المحاولة من البداية.',
      '🔒 Session is locked. Send /cancel to cancel and start over.'
    ));
    return;
  }

  // === فحص الجلسات النشطة - منع /start من مسح جلسة قائمة ===
  if (session && ['awaiting_tv_code', 'confirm_tv_code', 'awaiting_otp_request', 'in_progress', 'choose_type'].includes(session.step)) {
    if (text === '/start') {
      await sendMessage(chatId, bi(
        '⚠️ لديك عملية تفعيل جارية بالفعل! أكمل العملية الحالية أو أرسل /cancel للإلغاء أولاً.',
        '⚠️ You have an ongoing activation! Complete it or send /cancel to cancel first.'
      ));
      return;
    }
  }

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
  if (session && session.step === 'awaiting_tv_code') {
    const tvCode = text.replace(/[\s\-]/g, '').toUpperCase();
    if (tvCode.length < 4 || tvCode.length > 8) {
      await sendMessage(chatId, bi(
        '❌ الكود غير صحيح. أرسل الأرقام/الأحرف المعروضة على شاشة التلفزيون (عادة 5 خانات).',
        '❌ Invalid code. Send the numbers/letters shown on your TV screen (usually 5 characters).'
      ));
      return;
    }

    // حفظ الكود وطلب التأكيد قبل الإدخال
    session.pendingTvCode = tvCode;
    session.step = 'confirm_tv_code';

    await sendMessage(chatId, bi(
      `📺 الكود الذي أرسلته: <code>${tvCode}</code>\n\n⚠️ <b>تأكد أن هذا هو الكود الصحيح المعروض على شاشة التلفزيون!</b>\n\nهل تريد المتابعة؟`,
      `📺 The code you sent: <code>${tvCode}</code>\n\n⚠️ <b>Make sure this is the correct code shown on your TV screen!</b>\n\nDo you want to proceed?`
    ), [
      [
        { text: '✅ نعم، تابع / Yes, proceed', callback_data: 'confirm_tv_yes' },
        { text: '❌ لا، أعد الإدخال / No, re-enter', callback_data: 'confirm_tv_no' }
      ]
    ]);
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

  // === التحقق من أن الكود لم يُفعّل من حساب تيليجرام آخر ===
  if (activationCode.telegram_chat_id && activationCode.telegram_chat_id !== chatId) {
    await sendMessage(chatId, bi(
      `⚠️ <b>هذا الكود مرتبط بحساب آخر!</b>\n\n🔑 الكود: <code>${code}</code>\n❌ تم تفعيل هذا الكود بالفعل من حساب تيليجرام آخر.\n🚫 لا يمكن استخدام الكود من حسابين مختلفين.\n\n📞 إذا كنت تعتقد أن هناك خطأ، تواصل مع الدعم.`,
      `⚠️ <b>This code is linked to another account!</b>\n\n🔑 Code: <code>${code}</code>\n❌ This code has already been activated from another Telegram account.\n🚫 You cannot use the same code from two different accounts.\n\n📞 If you believe this is an error, contact support.`
    ));
    return;
  }

  const productNameAr = activationCode.products?.name || 'المنتج';
  const productNameEn = activationCode.products?.name_en || productNameAr;
  const accountEmail = activationCode.account_email;
  const accountPassword = activationCode.account_password;
  console.log(`🔍 DEBUG Code data: email=${accountEmail}, password=${accountPassword ? '***EXISTS(' + accountPassword.length + ')***' : 'NULL'}, activation_type=${activationCode.products?.activation_type}`);
  const activationType = activationCode.products?.activation_type || 'otp';

  // تحديد نوع المنتج: OSN أو ChatGPT أو غيره
  const isOSN = activationType === 'osn' || productNameAr.toLowerCase().includes('osn') || productNameEn.toLowerCase().includes('osn');
  const isChatGPT = activationType === 'chatgpt' || productNameAr.toLowerCase().includes('chatgpt') || productNameEn.toLowerCase().includes('chatgpt');
  const isCrunchyroll = productNameAr.toLowerCase().includes('crunchyroll') || productNameEn.toLowerCase().includes('crunchyroll');

  // جلب بيانات Gmail من otp_configurations للمنتج
  let gmailAddress = null;
  let gmailAppPassword = null;
  try {
    const { data: otpConfig } = await supabase
      .from('otp_configurations')
      .select('gmail_address, gmail_app_password')
      .eq('product_id', activationCode.product_id)
      .eq('is_active', true)
      .maybeSingle();
    
    if (otpConfig) {
      gmailAddress = otpConfig.gmail_address;
      gmailAppPassword = otpConfig.gmail_app_password;
      console.log(`📧 Gmail config found for product: ${gmailAddress}`);
    } else {
      console.log('⚠️ No active OTP config found for this product');
    }
  } catch (err) {
    console.error('❌ Error fetching OTP config:', err.message);
  }

  // Save session
  userSessions[chatId] = {
    activationCodeId: activationCode.id,
    productNameAr,
    productNameEn,
    productId: activationCode.product_id,
    orderId: activationCode.order_id,
    activationType: activationType,
    productCategory: isOSN ? 'osn' : isChatGPT ? 'chatgpt' : isCrunchyroll ? 'crunchyroll' : 'other',
    accountEmail: accountEmail,
    accountPassword: accountPassword,
    gmailAddress,
    gmailAppPassword,
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

    // تحديد اسم التطبيق بناءً على نوع المنتج
    const isCrunchyroll = session.productCategory === 'crunchyroll' || 
      (session.productNameAr || '').toLowerCase().includes('crunchyroll') ||
      (session.productNameEn || '').toLowerCase().includes('crunchyroll');
    const appNameAr = isCrunchyroll ? 'Crunchyroll' : 'OSN';
    const appNameEn = isCrunchyroll ? 'Crunchyroll' : 'OSN';

    if (chosenType === 'tv') {
      session.step = 'awaiting_tv_code';

      await editMessage(chatId, messageId, bi(
        `✅ اخترت: <b>تلفزيون 📺</b> | 🎬 <b>${appNameAr}</b>${emailLine}\n\n📝 <b>التعليمات:</b>\n1️⃣ افتح تطبيق ${appNameAr} على التلفزيون\n2️⃣ ستظهر لك <b>أرقام/كود</b> على الشاشة\n3️⃣ <b>أرسل لي هذه الأرقام هنا</b>\n\n⌨️ اكتب الأرقام الموجودة على شاشة التلفزيون:`,
        `✅ You chose: <b>TV 📺</b> | 🎬 <b>${appNameEn}</b>${emailLine}\n\n📝 <b>Instructions:</b>\n1️⃣ Open ${appNameEn} app on your TV\n2️⃣ You'll see <b>numbers/code</b> on the screen\n3️⃣ <b>Send me those numbers here</b>\n\n⌨️ Type the numbers shown on your TV screen:`
      ));
    } else {
      // Crunchyroll Phone: إعطاء البريد + الباسورد مباشرة (بدون OTP)
      if (isCrunchyroll) {
        session.step = 'crunchyroll_phone_sent';
        
        await supabase
          .from('activation_codes')
          .update({ status: 'crunchyroll_phone_sent', updated_at: new Date().toISOString() })
          .eq('id', session.activationCodeId);

        console.log(`🔍 DEBUG Crunchyroll phone - session.accountPassword: ${session.accountPassword ? '***EXISTS(' + session.accountPassword.length + ')***' : 'NULL/EMPTY'}`);
        const passLine = session.accountPassword 
          ? `\n🔑 <b>كلمة المرور:</b> <code>${session.accountPassword}</code>` 
          : `\n🔑 <b>كلمة المرور:</b> ⚠️ غير متوفرة`;

        await editMessage(chatId, messageId, bi(
          `✅ <b>مسار Crunchyroll</b>\n📱 <b>تفعيل على الهاتف</b>\n\n📧 البريد: <code>${session.accountEmail}</code>${passLine}\n\n📝 <b>التعليمات:</b>\n1️⃣ افتح تطبيق Crunchyroll\n2️⃣ سجل دخول بالبيانات أعلاه\n3️⃣ بعد الانتهاء، اضغط الزر أدناه\n\n⚠️ <b>لا تقم بتغيير كلمة المرور!</b>`,
          `✅ <b>Crunchyroll Path</b>\n📱 <b>Phone Activation</b>\n\n📧 Email: <code>${session.accountEmail}</code>${passLine}\n\n📝 <b>Instructions:</b>\n1️⃣ Open Crunchyroll app\n2️⃣ Login with the credentials above\n3️⃣ After done, press the button below\n\n⚠️ <b>Do NOT change the password!</b>`
        ), [[{ text: '✅ سجلت دخول / Logged in', callback_data: 'crunchyroll_phone_done' }]]);
      } else {
        // OSN: المسار الأصلي مع OTP
        session.step = 'awaiting_login';

        await editMessage(chatId, messageId, bi(
          `✅ اخترت: <b>هاتف (OTP) 📱</b> | 🎬 <b>${appNameAr}</b>${emailLine}\n\n📝 <b>التعليمات:</b>\n1️⃣ افتح تطبيق ${appNameAr}\n2️⃣ اختر "تسجيل الدخول"\n3️⃣ أدخل البريد أعلاه\n4️⃣ ⚠️ <b>يجب تسجيل الدخول أولاً قبل طلب الرمز</b>\n5️⃣ بعد الدخول، اضغط الزر أدناه`,
          `✅ You chose: <b>Phone (OTP) 📱</b> | 🎬 <b>${appNameEn}</b>${emailLine}\n\n📝 <b>Instructions:</b>\n1️⃣ Open ${appNameEn} app\n2️⃣ Select "Login"\n3️⃣ Enter the email above\n4️⃣ ⚠️ <b>You must login first before requesting the code</b>\n5️⃣ After login, press the button below`
        ), [[{ text: '✅ سجلت دخول / I logged in', callback_data: 'logged_in' }]]);
      }
    }
    return;
  }

  // === Crunchyroll Phone Done: تم تسجيل الدخول - إنهاء التفعيل ===
  if (data === 'crunchyroll_phone_done') {
    await markCodeAsUsed(session.activationCodeId);
    
    try {
      await editMessage(chatId, messageId, bi(
        `✅ <b>تم التفعيل بنجاح!</b>\n\n🎉 استمتع بمشاهدة Crunchyroll!`,
        `✅ <b>Activation complete!</b>\n\n🎉 Enjoy watching Crunchyroll!`
      ));
    } catch (e) {
      console.error('⚠️ Failed to edit message:', e.message);
    }
    
    try {
      await sendSuccessMessage(chatId, session);
    } catch (e) {
      console.error('⚠️ Failed to send success message:', e.message);
      await sendMessage(chatId, bi(
        '✅ تم التفعيل بنجاح! 🎉',
        '✅ Activation complete! 🎉'
      )).catch(() => {});
    }
    delete userSessions[chatId];
    return;
  }

  // === Confirm login (OTP flow only) ===
  if (data === 'logged_in') {
    session.step = 'awaiting_otp_request';

    await supabase
      .from('activation_codes')
      .update({ status: 'awaiting_otp', updated_at: new Date().toISOString() })
      .eq('id', session.activationCodeId);

    const isCrunchyroll2 = session.productCategory === 'crunchyroll' || 
      (session.productNameAr || '').toLowerCase().includes('crunchyroll') ||
      (session.productNameEn || '').toLowerCase().includes('crunchyroll');
    const appName2 = isCrunchyroll2 ? 'Crunchyroll' : 'OSN';

    await editMessage(chatId, messageId, bi(
      `✅ ممتاز!\n\n📱 الآن في تطبيق ${appName2}:\n1️⃣ سيطلب منك رمز تحقق\n2️⃣ بعد أن يُرسل الرمز، اضغط الزر أدناه\n\n⏰ <b>ملاحظة:</b> الرمز يصل خلال ثوانٍ`,
      `✅ Great!\n\n📱 Now in ${appName2} app:\n1️⃣ It will ask for a verification code\n2️⃣ After the code is sent, press the button below\n\n⏰ <b>Note:</b> The code arrives within seconds`
    ), [[{ text: '🔑 أحضر لي الرمز / Get my code', callback_data: 'get_otp' }]]);
    return;
  }

  // === تأكيد كود التلفزيون ===
  if (data === 'confirm_tv_yes') {
    const tvCode = session.pendingTvCode;
    if (!tvCode) {
      await editMessage(chatId, messageId, bi(
        '❌ انتهت الجلسة. أرسل كود التفعيل مرة أخرى.',
        '❌ Session expired. Send your activation code again.'
      ));
      delete userSessions[chatId];
      return;
    }

    const isCR = session.productCategory === 'crunchyroll' || 
      (session.productNameAr || '').toLowerCase().includes('crunchyroll') ||
      (session.productNameEn || '').toLowerCase().includes('crunchyroll');

    if (isCR) {
      // === Crunchyroll TV: استخدام الكوكيز عبر Render (Puppeteer) ===
      await editMessage(chatId, messageId, bi(
        `⏳ جاري الربط مع التلفاز... يرجى الانتظار ⌛\n\n📺 الكود: <code>${tvCode}</code>`,
        `⏳ Linking with TV... Please wait ⌛\n\n📺 Code: <code>${tvCode}</code>`
      ));

      // جلب الكوكيز من قاعدة البيانات - فلترة حسب variant المرتبط بالمنتج
      let crCookies = null;
      try {
        // أولاً: جلب الـ variants المرتبطة بمنتج Crunchyroll
        const { data: variants } = await supabase
          .from('product_variants')
          .select('id')
          .eq('product_id', session.productId)
          .eq('is_active', true);

        const variantIds = (variants || []).map(v => v.id);
        
        let crSession = null;
        if (variantIds.length > 0) {
          const { data: sessionData } = await supabase
            .from('osn_sessions')
            .select('cookies, email, account_password')
            .in('variant_id', variantIds)
            .eq('is_active', true)
            .eq('is_connected', true)
            .limit(1)
            .maybeSingle();
          crSession = sessionData;
        }

        // Fallback: إذا لم نجد بالـ variant، ابحث عن أي جلسة نشطة
        if (!crSession) {
          const { data: fallbackSession } = await supabase
            .from('osn_sessions')
            .select('cookies, email, account_password')
            .eq('is_active', true)
            .eq('is_connected', true)
            .limit(1)
            .maybeSingle();
          crSession = fallbackSession;
        }
        
        if (crSession?.cookies) {
          crCookies = typeof crSession.cookies === 'string' ? JSON.parse(crSession.cookies) : crSession.cookies;
        }
        console.log(`🍪 Crunchyroll cookies loaded: ${crCookies ? crCookies.length + ' cookies' : 'NONE'}, product_id: ${session.productId}, variants: ${variantIds.join(',')}`);
      } catch (dbErr) {
        console.error('❌ DB error loading Crunchyroll cookies:', dbErr.message);
      }

      if (!crCookies || !Array.isArray(crCookies) || crCookies.length === 0) {
        await sendMessage(chatId, bi(
          '❌ لا توجد كوكيز محفوظة لحساب Crunchyroll. يرجى التواصل مع الدعم.',
          '❌ No saved cookies for Crunchyroll account. Please contact support.'
        ));
        session.step = 'awaiting_tv_code';
        delete session.pendingTvCode;
        return;
      }

      // إرسال الطلب لـ Render server
      const renderServerUrl = process.env.RENDER_SERVER_URL || 'https://angel-store.onrender.com';
      const qrSecret = process.env.QR_AUTOMATION_SECRET || 'default-qr-secret-key';

      try {
        const response = await fetch(`${renderServerUrl}/api/qr/crunchyroll-activate-tv`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            secret: qrSecret,
            tvCode: tvCode,
            cookies: crCookies,
          }),
        });

        const tvResult = await response.json();
        console.log(`📺 Crunchyroll TV result:`, JSON.stringify(tvResult));

        if (tvResult.success && tvResult.paired) {
          await markCodeAsUsed(session.activationCodeId);
          // حذف رسالة الانتظار وإرسال رسالة النجاح النهائية مباشرة
          try { await deleteMessage(chatId, messageId); } catch(e) {}
          try {
            await sendSuccessMessage(chatId, session);
          } catch (msgErr) {
            console.error('⚠️ Failed to send success message:', msgErr.message);
            await sendMessage(chatId, bi(
              '✅ تم تفعيل التلفاز بنجاح! 🎉',
              '✅ TV activated successfully! 🎉'
            )).catch(() => {});
          }
          delete userSessions[chatId];
        } else {
          const errorMsg = tvResult.error || tvResult.message || 'سبب غير معروف';
          try {
            await editMessage(chatId, messageId, bi(
              `❌ <b>فشل ربط التلفزيون</b>\n\n📋 السبب: ${errorMsg}`,
              `❌ <b>TV linking failed</b>\n\n📋 Reason: ${errorMsg}`
            ));
          } catch (editErr) {
            console.error('⚠️ Failed to edit message:', editErr.message);
            await sendMessage(chatId, bi(
              `❌ فشل ربط التلفزيون: ${errorMsg}`,
              `❌ TV linking failed: ${errorMsg}`
            )).catch(() => {});
          }
          // قفل الجلسة - المستخدم لازم يرسل /cancel لإعادة المحاولة
          session.step = 'locked_needs_cancel';
          delete session.pendingTvCode;
          await sendMessage(chatId, bi(
            '🔒 تم قفل الجلسة. لإعادة المحاولة أرسل /cancel ثم أعد إدخال الكود من البداية.',
            '🔒 Session locked. To retry, send /cancel then re-enter your code.'
          )).catch(() => {});
        }
      } catch (fetchErr) {
        console.error('❌ Crunchyroll TV fetch error:', fetchErr.message);
        await sendMessage(chatId, bi(
          `❌ حدث خطأ أثناء التفعيل: ${fetchErr.message}`,
          `❌ Error during activation: ${fetchErr.message}`
        ));
        session.step = 'awaiting_tv_code';
        delete session.pendingTvCode;
      }
      return;
    }

    // === OSN TV: المسار الأصلي ===
    const tvAppName = 'OSN';

    await editMessage(chatId, messageId, bi(
      `⏳ جاري إدخال الكود <code>${tvCode}</code> في موقع ${tvAppName}...\n\n⌛ انتظر قليلاً...`,
      `⏳ Entering code <code>${tvCode}</code> on ${tvAppName} website...\n\n⌛ Please wait...`
    ));

    const tvResult = await enterTVCodeFromSession(tvCode, session.productId);
    console.log(`📺 OSN TV result: success=${tvResult.success}, paired=${tvResult.paired}, error=${tvResult.error || 'none'}`);

    if (tvResult.success && tvResult.paired) {
      await markCodeAsUsed(session.activationCodeId);
      // إرسال السكرينشوت بدون نص نجاح مكرر
      try {
        if (tvResult.screenshot) {
          await sendPhoto(chatId, tvResult.screenshot, '📺');
        }
      } catch (photoErr) {
        console.error('⚠️ Failed to send screenshot:', photoErr.message);
      }
      // إرسال رسالة نجاح واضحة دائماً
      let successSent = false;
      try {
        await sendSuccessMessage(chatId, session);
        successSent = true;
      } catch (msgErr) {
        console.error('⚠️ Failed to send branded success message:', msgErr.message);
      }
      if (!successSent) {
        try {
          await sendMessage(chatId, bi(
            '✅ <b>تم تفعيل التلفاز بنجاح!</b> 🎉\n\n📺 استمتع بالمشاهدة!',
            '✅ <b>TV activated successfully!</b> 🎉\n\n📺 Enjoy watching!'
          ));
        } catch (fallbackErr) {
          console.error('❌ Even fallback success message failed:', fallbackErr.message);
        }
      }
      delete userSessions[chatId];
    } else {
      const errorDetail = tvResult.error || tvResult.message || 'سبب غير معروف';
      console.log(`❌ TV code failed: ${errorDetail}, hasScreenshot: ${!!tvResult.screenshot}`);
      
      // إرسال رسالة خطأ واضحة دائماً
      let errorSent = false;
      try {
        if (tvResult.screenshot) {
          await sendPhoto(chatId, tvResult.screenshot, bi(
            `❌ <b>فشل ربط التلفزيون</b>\n\n📋 السبب: ${errorDetail}`,
            `❌ <b>TV linking failed</b>\n\n📋 Reason: ${errorDetail}`
          ));
          errorSent = true;
        }
      } catch (photoErr) {
        console.error('⚠️ Failed to send error screenshot:', photoErr.message);
      }
      if (!errorSent) {
        try {
          await sendMessage(chatId, bi(
            `❌ <b>فشل ربط التلفزيون</b>\n\n📋 السبب: ${errorDetail}`,
            `❌ <b>TV linking failed</b>\n\n📋 Reason: ${errorDetail}`
          ));
        } catch (errMsgErr) {
          console.error('❌ Failed to send error message:', errMsgErr.message);
        }
      }
      session.step = 'awaiting_tv_code';
      delete session.pendingTvCode;
      await sendMessage(chatId, bi(
        '📝 أرسل الكود الصحيح المعروض على شاشة التلفزيون مرة أخرى:',
        '📝 Send the correct code shown on your TV screen again:'
      )).catch(() => {});
    }
    return;
  }

  if (data === 'confirm_tv_no') {
    session.step = 'awaiting_tv_code';
    delete session.pendingTvCode;
    await editMessage(chatId, messageId, bi(
      '📝 حسناً، أرسل الكود الصحيح المعروض على شاشة التلفزيون:',
      '📝 OK, send the correct code shown on your TV screen:'
    ));
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
        try {
          await sendSuccessMessage(chatId, session);
        } catch (msgErr) {
          console.error('⚠️ Failed to send success message after OTP:', msgErr.message);
          await sendMessage(chatId, bi(
            '✅ <b>تم التفعيل بنجاح!</b> 🎉',
            '✅ <b>Activation completed successfully!</b> 🎉'
          )).catch(() => {});
        }
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
      `❌ لم يُعثر على رمز حديث من ${appNameAr} (خلال آخر 5 دقائق).\n\n📝 <b>تأكد من:</b>\n• سجّلت دخول في ${appNameAr} أولاً\n• طلبت رمز التحقق قبل الضغط على هذا الزر\n• الرمز يجب أن يصل خلال 5 دقائق\n\n⚠️ الرموز القديمة (أكثر من 5 دقائق) يتم تجاهلها تلقائياً!\n\nاضغط للمحاولة مرة أخرى:`,
      `❌ No recent ${appNameEn} code found (within last 5 minutes).\n\n📝 <b>Make sure:</b>\n• You logged in to ${appNameEn} first\n• You requested the verification code before pressing this button\n• The code must arrive within 5 minutes\n\n⚠️ Old codes (more than 5 minutes) are automatically ignored!\n\nPress to try again:`
    ), [[{ text: '🔄 إعادة المحاولة / Retry', callback_data: 'get_otp' }]]);
    return;
  }
}

// ============================================================
// Success message with receipt link + rating
// ============================================================
function escapeTelegramHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendSuccessMessage(chatId, session) {
  const storeUrl = await getStoreUrl();
  const orderId = session.orderId;
  const productId = session.productId;

  // جلب اسم المنتج لبناء رابط التقييم
  let productName = '';
  if (productId) {
    try {
      const { data: product } = await supabase
        .from('products')
        .select('name')
        .eq('id', productId)
        .single();
      if (product) productName = product.name;
    } catch (e) {
      console.error('⚠️ Could not fetch product name:', e.message);
    }
  }

  // بناء الأزرار
  let inlineButtons = [];

  // زر الإيصال
  if (storeUrl && orderId) {
    const receiptUrl = `${storeUrl}/order/${orderId}`;
    inlineButtons.push([{ text: '🧾 عرض الإيصال / View Receipt', url: receiptUrl }]);
  }

  // زر التقييم - رابط المنتج في الموقع
  if (storeUrl && productId) {
    const reviewUrl = `${storeUrl}/?review=${productId}`;
    inlineButtons.push([{ text: '⭐ قيّم الخدمة / Rate Service', url: reviewUrl }]);
  }

  const productLabel = productName || 'الخدمة';
  const safeProductLabel = escapeTelegramHtml(productLabel);

  const messageResult = await sendMessage(chatId, bi(
    `✅ <b>تم تفعيل اشتراكك بنجاح!</b> 🎉\n\n📺 الحساب الآن مرتبط بجهازك، استمتع بالمشاهدة!\n\n⭐ نقدر لك ثقتك في Angel Store، يسعدنا جداً أن تشاركنا تقييمك لـ <b>${safeProductLabel}</b> عبر الزر أدناه 👇`,
    `✅ <b>Your subscription has been activated successfully!</b> 🎉\n\n📺 Your account is now linked to your device, enjoy watching!\n\n⭐ We appreciate your trust in Angel Store. We'd love for you to rate <b>${safeProductLabel}</b> using the button below 👇`
  ), inlineButtons.length > 0 ? inlineButtons : null);

  if (!messageResult?.ok) {
    throw new Error(messageResult?.description || 'Telegram sendMessage failed');
  }
}

// ============================================================
// Session Manager Integration
// ============================================================
async function enterTVCodeFromSession(tvCode, productId = null) {
  try {
    // تحميل بيانات الجلسة من قاعدة البيانات - مع فلترة حسب variant_id للمنتج
    console.log(`🔄 Loading OSN session from database... (productId: ${productId})`);
    
    let session = null;
    let dbError = null;

    // أولاً: محاولة الفلترة حسب variant_id المرتبط بالمنتج
    if (productId) {
      try {
        const { data: variants } = await supabase
          .from('product_variants')
          .select('id')
          .eq('product_id', productId)
          .eq('is_active', true);

        const variantIds = (variants || []).map(v => v.id);
        console.log(`🔍 OSN variants for product ${productId}: ${variantIds.join(', ') || 'none'}`);

        if (variantIds.length > 0) {
          const { data: sessionData, error: err } = await supabase
            .from('osn_sessions')
            .select('cookies, email, gmail_address, gmail_app_password, account_password')
            .in('variant_id', variantIds)
            .eq('is_active', true)
            .eq('is_connected', true)
            .limit(1)
            .maybeSingle();
          session = sessionData;
          dbError = err;
        }
      } catch (e) {
        console.log(`⚠️ Variant lookup failed: ${e.message}`);
      }
    }

    // Fallback: إذا لم نجد بالـ variant، ابحث عن أي جلسة OSN نشطة
    if (!session && !dbError) {
      console.log('🔄 Fallback: loading any active OSN session...');
      const { data: fallbackSession, error: fallbackErr } = await supabase
        .from('osn_sessions')
        .select('cookies, email, gmail_address, gmail_app_password, account_password')
        .eq('is_active', true)
        .eq('is_connected', true)
        .limit(1)
        .maybeSingle();
      session = fallbackSession;
      dbError = fallbackErr;
    }

    if (dbError) {
      console.error('❌ DB Error:', dbError.message);
      return { success: false, error: 'خطأ في قراءة الجلسة: ' + dbError.message };
    }

    if (!session) {
      return { success: false, error: 'لا توجد جلسة OSN نشطة. يرجى إضافة جلسة في لوحة الإدارة.' };
    }

    console.log(`✅ Session loaded: email=${session.email}, hasGmail=${!!session.gmail_address}, hasCookies=${!!session.cookies}`);

    // تحميل الكوكيز المحفوظة (إن وُجدت)
    if (session.cookies) {
      let cookies;
      if (typeof session.cookies === 'string') {
        try { cookies = JSON.parse(session.cookies); } catch (e) { cookies = []; }
      } else if (Array.isArray(session.cookies)) {
        cookies = session.cookies;
      } else {
        cookies = [];
      }
      
      if (cookies.length > 0) {
        sessionManager.storedCookies = cookies;
        sessionManager.isLoggedIn = true;
        sessionManager.currentEmail = session.email;
        console.log(`🍪 Loaded ${cookies.length} cached cookies`);
      }
    }

    // تمرير بيانات تسجيل الدخول للـ auto-login
    const credentials = {
      email: session.email,
      gmailAddress: session.gmail_address,
      gmailAppPassword: session.gmail_app_password,
    };

    const result = await sessionManager.enterTVCode(tvCode, credentials);
    
    // حفظ الكوكيز الجديدة (من auto-login) في قاعدة البيانات
    if (result.newSessionCookies && sessionManager.storedCookies?.length > 0) {
      console.log('💾 Saving new session cookies to database...');
      try {
        const { error: updateErr } = await supabase
          .from('osn_sessions')
          .update({ 
            cookies: sessionManager.storedCookies,
            is_connected: true,
            last_activity: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('is_active', true);
        if (updateErr) {
          console.error('⚠️ Failed to save cookies:', updateErr.message);
        } else {
          console.log('✅ New cookies saved to DB!');
        }
      } catch (e) {
        console.error('⚠️ Error saving cookies:', e.message);
      }
    }
    
    return result;
  } catch (error) {
    console.error('❌ TV code entry error:', error.message);
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
  try {
    // 1️⃣ تحديث كود التفعيل
    await supabase
      .from('activation_codes')
      .update({
        status: 'used',
        is_used: true,
        used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', codeId);

    // 2️⃣ تحديث حالة الطلب إلى "مكتمل"
    const { data: codeData } = await supabase
      .from('activation_codes')
      .select('order_id')
      .eq('id', codeId)
      .maybeSingle();

    if (codeData?.order_id) {
      const { error: orderErr } = await supabase
        .from('orders')
        .update({
          status: 'completed',
          payment_status: 'completed',
        })
        .eq('id', codeData.order_id);

      if (orderErr) {
        console.error('❌ Failed to update order status:', orderErr.message);
      } else {
        console.log(`✅ Order ${codeData.order_id} marked as completed`);
      }
    }
  } catch (err) {
    console.error('❌ markCodeAsUsed error:', err.message);
  }
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

async function deleteMessage(chatId, messageId) {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    });
  } catch (e) {
    console.log('⚠️ Could not delete message:', e.message);
  }
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
