// ============================================================
// Telegram Session Generator using GramJS
// يولّد Session String مباشرة من السيرفر
// ============================================================

import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { Logger, LogLevel } from 'telegram/extensions/Logger.js';

const createTelegramClientOptions = () => ({
  connectionRetries: 10,
  retryDelay: 2000,
  autoReconnect: true,
  timeout: 20,
  deviceModel: 'ninto Store Bot',
  systemVersion: 'Linux',
  appVersion: '1.0.0',
  baseLogger: new Logger(LogLevel.NONE),
});

// تخزين مؤقت للعمليات الجارية (apiId+phone → client)
const pendingClients = new Map();

function getClientKey(apiId, phone) {
  return `${apiId}:${phone}`;
}

async function shutdownClient(client) {
  if (!client) return;
  try { await client.disconnect(); } catch {}
  try { await client.destroy(); } catch {}
}

/**
 * الخطوة 1: إرسال رمز التحقق
 */
async function sendCode({ apiId, apiHash, phone }) {
  const key = getClientKey(apiId, phone);
  
  // إغلاق أي عميل سابق
  if (pendingClients.has(key)) {
    try {
      const old = pendingClients.get(key);
      await shutdownClient(old.client);
    } catch {}
    pendingClients.delete(key);
  }

  const stringSession = new StringSession('');
  const client = new TelegramClient(
    stringSession,
    parseInt(apiId),
    apiHash,
    createTelegramClientOptions()
  );

  await client.connect();

  const result = await client.sendCode(
    { apiId: parseInt(apiId), apiHash },
    phone
  );

  // تخزين العميل والنتيجة
  pendingClients.set(key, {
    client,
    phoneCodeHash: result.phoneCodeHash,
    phone,
    apiId,
    apiHash,
    createdAt: Date.now(),
  });

  console.log(`✅ Code sent to ${phone}`);

  return {
    success: true,
    phoneCodeHash: result.phoneCodeHash,
  };
}

/**
 * الخطوة 2: التحقق من الرمز
 */
async function verifyCode({ apiId, phone, code, phoneCodeHash }) {
  const key = getClientKey(apiId, phone);
  const pending = pendingClients.get(key);

  if (!pending) {
    throw new Error('لا توجد جلسة معلقة. أعد إرسال الرمز.');
  }

  const { client } = pending;
  const hash = phoneCodeHash || pending.phoneCodeHash;

  try {
    await client.invoke(
      new Api.auth.SignIn({
        phoneNumber: phone,
        phoneCodeHash: hash,
        phoneCode: code,
      })
    );

    // نجح بدون 2FA
    const sessionString = client.session.save();
    
    // تنظيف
    pendingClients.delete(key);
    await shutdownClient(client);

    console.log(`✅ Session generated for ${phone} (no 2FA)`);

    return {
      success: true,
      needs2FA: false,
      sessionString,
    };
  } catch (err) {
    if (err.errorMessage === 'SESSION_PASSWORD_NEEDED') {
      console.log(`🔒 2FA required for ${phone}`);
      return {
        success: true,
        needs2FA: true,
        sessionString: null,
      };
    }

    pendingClients.delete(key);
    await shutdownClient(client);
    throw err;
  }
}

/**
 * الخطوة 3: التحقق بخطوتين (2FA)
 */
async function verify2FA({ apiId, phone, password }) {
  const key = getClientKey(apiId, phone);
  const pending = pendingClients.get(key);

  if (!pending) {
    throw new Error('لا توجد جلسة معلقة. أعد العملية من البداية.');
  }

  const { client } = pending;

  await client.signInWithPassword(
    { apiId: parseInt(apiId), apiHash: pending.apiHash },
    {
      password: async () => password,
      onError: (err) => { throw err; },
    }
  );

  const sessionString = client.session.save();

  // تنظيف
  pendingClients.delete(key);
  await shutdownClient(client);

  console.log(`✅ Session generated for ${phone} (with 2FA)`);

  return {
    success: true,
    sessionString,
  };
}

/**
 * التحقق من Session String عبر الاتصال الفعلي بتليجرام
 * Session String يحتوي كل شيء — لا حاجة لـ API ID/Hash حقيقية
 */
async function connectSession({ sessionString }) {
  const stringSession = new StringSession(sessionString);
  // قيم افتراضية — Session String يكفي للاتصال
  const client = new TelegramClient(
    stringSession,
    2040,
    'b18441a1ff607e10a989891a5462e627',
    createTelegramClientOptions()
  );

  await client.connect();

  const me = await client.getMe();
  await shutdownClient(client);

  console.log(`✅ Session validated for ${me.phone || me.username || me.id}`);

  return {
    success: true,
    user: {
      id: me.id?.toString(),
      firstName: me.firstName || '',
      lastName: me.lastName || '',
      username: me.username || '',
      phone: me.phone || '',
    },
  };
}

// تنظيف الجلسات المعلقة بعد 10 دقائق
setInterval(async () => {
  const now = Date.now();
  const TEN_MINUTES = 10 * 60 * 1000;
  
  for (const [key, val] of pendingClients.entries()) {
    if (now - val.createdAt > TEN_MINUTES) {
      console.log(`🧹 Cleaning expired session: ${key}`);
      await shutdownClient(val.client);
      pendingClients.delete(key);
    }
  }
}, 60000);

export default {
  sendCode,
  verifyCode,
  verify2FA,
  connectSession,
};
