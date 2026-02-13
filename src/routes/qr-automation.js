import express from 'express';
import sessionManager from '../services/session-manager.js';
import { getQrSecret, supabaseBackend } from '../services/supabase-backend.js';

const router = express.Router();

// كاش للسر من قاعدة البيانات (يتجدد كل 5 دقائق)
let cachedSecret = null;
let secretLastFetch = 0;
const SECRET_CACHE_TTL = 5 * 60 * 1000; // 5 دقائق

async function getExpectedSecret() {
  const now = Date.now();
  if (cachedSecret && (now - secretLastFetch) < SECRET_CACHE_TTL) {
    return cachedSecret;
  }
  try {
    cachedSecret = await getQrSecret();
    secretLastFetch = now;
    console.log('🔑 QR secret loaded from database');
  } catch (err) {
    console.error('❌ Failed to load secret from DB, using env fallback:', err.message);
    cachedSecret = process.env.QR_AUTOMATION_SECRET || 'default-qr-secret-key';
  }
  return cachedSecret;
}

/**
 * POST /api/qr/generate
 * يستقبل بيانات الحساب ويرجع QR Code (للتوافق مع الكود القديم)
 * @deprecated استخدم /get-qr بدلاً منها
 */
router.post('/generate', express.json(), async (req, res) => {
  try {
    const { email, password, secret } = req.body;

    // التحقق من المفتاح السري من قاعدة البيانات
    const expectedSecret = await getExpectedSecret();
    if (secret !== expectedSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // التحقق من البيانات
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    console.log(`🔄 QR Generation request for: ${email}`);

    // التحقق من حالة الجلسة
    const status = sessionManager.getStatus();
    
    if (!status.isLoggedIn) {
      return res.status(503).json({
        success: false,
        error: 'الجلسة غير متصلة. يرجى تهيئة الجلسة أولاً.',
      });
    }

    // جلب QR
    const result = await sessionManager.getQRCode();

    if (result.success) {
      console.log(`✅ QR generated successfully`);
      return res.json({
        success: true,
        qrImage: result.qrImage,
        note: result.note,
      });
    } else {
      console.error(`❌ QR generation failed:`, result.error);
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }

  } catch (error) {
    console.error('❌ QR Route Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/qr/get-qr
 * جلب QR Code من الجلسة المستمرة
 */
router.post('/get-qr', express.json(), async (req, res) => {
  try {
    const { secret } = req.body;

    // التحقق من المفتاح السري من قاعدة البيانات
    const expectedSecret = await getExpectedSecret();
    if (secret !== expectedSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('📱 Get QR request received');

    // التأكد من تسجيل الدخول
    await sessionManager.ensureLoggedIn();

    // جلب QR
    const result = await sessionManager.getQRCode();

    if (result.success) {
      console.log('✅ QR fetched successfully');
      return res.json({
        success: true,
        qrImage: result.qrImage,
        note: result.note,
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }

  } catch (error) {
    console.error('❌ Get QR Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/qr/get-otp
 * جلب آخر OTP من Gmail للعميل
 */
router.post('/get-otp', express.json(), async (req, res) => {
  try {
    const { secret, gmailAddress, gmailAppPassword } = req.body;

    // التحقق من المفتاح السري من قاعدة البيانات
    const expectedSecret = await getExpectedSecret();
    if (secret !== expectedSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('🔑 Get OTP request received for:', gmailAddress || 'unknown');

    // جلب OTP مع بيانات Gmail
    const result = await sessionManager.getClientOTP(gmailAddress, gmailAppPassword);

    if (result.success) {
      console.log('✅ OTP fetched successfully:', result.otp);
      return res.json({
        success: true,
        otp: result.otp,
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }

  } catch (error) {
    console.error('❌ Get OTP Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/qr/session-status
 * حالة الجلسة المستمرة
 */
router.get('/session-status', (req, res) => {
  const status = sessionManager.getStatus();
  res.json(status);
});

/**
 * POST /api/qr/session-init
 * تهيئة جلسة جديدة (للأدمن فقط)
 */
router.post('/session-init', express.json(), async (req, res) => {
  try {
    const { email, gmailAppPassword, secret } = req.body;

    // التحقق من المفتاح السري من قاعدة البيانات
    const expectedSecret = await getExpectedSecret();
    if (secret !== expectedSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!email || !gmailAppPassword) {
      return res.status(400).json({ error: 'Email and Gmail App Password are required' });
    }

    console.log('🚀 Initializing new session for:', email);

    const result = await sessionManager.initialize(email, gmailAppPassword);

    if (result.success) {
      return res.json({
        success: true,
        message: result.message,
        status: sessionManager.getStatus(),
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }

  } catch (error) {
    console.error('❌ Session Init Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/qr/session-logout
 * إغلاق الجلسة الحالية
 */
router.post('/session-logout', express.json(), async (req, res) => {
  try {
    const { secret } = req.body;

    // التحقق من المفتاح السري
    const expectedSecret = await getExpectedSecret();
    if (secret !== expectedSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('👋 Closing session...');

    await sessionManager.closeBrowser();

    return res.json({
      success: true,
      message: 'تم إغلاق الجلسة',
    });

  } catch (error) {
    console.error('❌ Session Logout Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/qr/reset-counter
 * إعادة تعيين عداد محاولات الدخول
 */
router.post('/reset-counter', express.json(), async (req, res) => {
  try {
    const { secret } = req.body;

    // التحقق من المفتاح السري
    const expectedSecret = await getExpectedSecret();
    if (secret !== expectedSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('🔄 Resetting login attempts counter...');

    // إعادة تعيين العداد
    sessionManager.loginAttempts = 0;

    return res.json({
      success: true,
      message: 'تم إعادة تعيين عداد المحاولات',
    });

  } catch (error) {
    console.error('❌ Reset Counter Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/qr/import-cookies
 * استيراد كوكيز OSN لتهيئة الجلسة بدون تسجيل دخول
 */
router.post('/import-cookies', express.json({ limit: '5mb' }), async (req, res) => {
  try {
    const { cookies, email, secret } = req.body;

    const expectedSecret = await getExpectedSecret();
    if (secret !== expectedSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
      return res.status(400).json({ error: 'Cookies array is required' });
    }

    console.log(`🍪 Import cookies request - ${cookies.length} cookies for: ${email || 'unknown'}`);

    const result = await sessionManager.importCookies(cookies, email);

    if (result.success) {
      console.log('✅ Cookies imported successfully');
      return res.json({
        success: true,
        message: result.message,
        status: sessionManager.getStatus(),
      });
    } else {
      console.error('❌ Cookie import failed:', result.error);
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('❌ Import Cookies Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/qr/enter-tv-code
 * إدخال كود التلفزيون وربطه بالحساب (للبوت الخارجي)
 */
router.post('/enter-tv-code', express.json(), async (req, res) => {
  try {
    const { secret, tvCode, email } = req.body;

    const expectedSecret = await getExpectedSecret();
    if (secret !== expectedSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!tvCode) {
      return res.status(400).json({ success: false, error: 'tvCode is required' });
    }

    console.log(`📺 Enter TV Code request: ${tvCode} for ${email || sessionManager.currentEmail || 'current session'}`);

    // التأكد من وجود كوكيز محملة
    if (!sessionManager.storedCookies || sessionManager.storedCookies.length === 0) {
      return res.status(503).json({
        success: false,
        error: 'لا توجد جلسة نشطة. يرجى استيراد الكوكيز أولاً عبر /import-cookies',
      });
    }

    const result = await sessionManager.enterTVCode(tvCode, {
      email: email || sessionManager.currentEmail,
    });

    console.log(`📺 TV Code result:`, JSON.stringify({ success: result.success, paired: result.paired, method: result.method }));

    return res.json(result);
  } catch (error) {
    console.error('❌ Enter TV Code Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/qr/crunchyroll-activate-tv
 * تفعيل Crunchyroll على التلفزيون باستخدام الكوكيز المخزنة
 */
router.post('/crunchyroll-activate-tv', express.json(), async (req, res) => {
  try {
    const { secret, tvCode, cookies } = req.body;

    const expectedSecret = await getExpectedSecret();
    if (secret !== expectedSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!tvCode) {
      return res.status(400).json({ success: false, error: 'tvCode is required' });
    }

    if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
      return res.status(400).json({ success: false, error: 'cookies array is required' });
    }

    console.log(`📺 Crunchyroll TV activation: code=${tvCode}, cookies=${cookies.length}`);

    const result = await sessionManager.crunchyrollActivateTV(tvCode, cookies, { supabase: supabaseBackend });
    return res.json(result);
  } catch (error) {
    console.error('❌ Crunchyroll TV Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/qr/health
 * التحقق من صحة الخدمة
 */
router.get('/health', (req, res) => {
  const status = sessionManager.getStatus();
  res.json({
    status: 'ok',
    service: 'QR Automation',
    sessionLoggedIn: status.isLoggedIn,
    sessionEmail: status.email,
    lastActivity: status.lastActivity,
    timestamp: new Date().toISOString(),
  });
});

export default router;
