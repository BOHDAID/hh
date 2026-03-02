// ============================================================
// Telegram Session Generator using GramJS
// يولّد Session String مباشرة من السيرفر
// ============================================================

import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

// تخزين مؤقت للعمليات الجارية (apiId+phone → client)
const pendingClients = new Map();

function getClientKey(apiId, phone) {
  return `${apiId}:${phone}`;
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
      await old.client.disconnect();
    } catch {}
    pendingClients.delete(key);
  }

  const stringSession = new StringSession('');
  const client = new TelegramClient(stringSession, parseInt(apiId), apiHash, {
    connectionRetries: 3,
    deviceModel: 'Angel Store Bot',
    systemVersion: 'Linux',
    appVersion: '1.0.0',
  });

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

  const { client, apiHash } = pending;
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

  console.log(`✅ Session generated for ${phone} (with 2FA)`);

  return {
    success: true,
    sessionString,
  };
}

// تنظيف الجلسات المعلقة بعد 10 دقائق
setInterval(() => {
  const now = Date.now();
  const TEN_MINUTES = 10 * 60 * 1000;
  
  for (const [key, val] of pendingClients.entries()) {
    if (now - val.createdAt > TEN_MINUTES) {
      console.log(`🧹 Cleaning expired session: ${key}`);
      try { val.client.disconnect(); } catch {}
      pendingClients.delete(key);
    }
  }
}, 60000);

export default {
  sendCode,
  verifyCode,
  verify2FA,
};
