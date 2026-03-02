// ============================================================
// Telegram Session Generation Routes
// POST /api/telegram-session/send-code
// POST /api/telegram-session/verify-code
// POST /api/telegram-session/verify-2fa
// ============================================================

import { Router } from 'express';
import telegramSession from '../services/telegram-session.js';

const router = Router();

// Middleware: JSON parsing + secret verification
router.use((req, res, next) => {
  // التحقق من السر
  const secret = req.body?.secret;
  const serverSecret = process.env.QR_AUTOMATION_SECRET;

  if (!serverSecret) {
    return res.status(500).json({ success: false, error: 'QR_AUTOMATION_SECRET not configured on server' });
  }

  if (secret !== serverSecret) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  next();
});

// إرسال رمز التحقق
router.post('/send-code', async (req, res) => {
  try {
    const { apiId, apiHash, phone } = req.body;

    if (!apiId || !apiHash || !phone) {
      return res.status(400).json({ success: false, error: 'apiId, apiHash, phone مطلوبة' });
    }

    const result = await telegramSession.sendCode({ apiId, apiHash, phone });
    res.json(result);
  } catch (err) {
    console.error('❌ Send code error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// التحقق من الرمز
router.post('/verify-code', async (req, res) => {
  try {
    const { apiId, phone, code, phoneCodeHash } = req.body;

    if (!apiId || !phone || !code) {
      return res.status(400).json({ success: false, error: 'apiId, phone, code مطلوبة' });
    }

    const result = await telegramSession.verifyCode({ apiId, phone, code, phoneCodeHash });
    res.json(result);
  } catch (err) {
    console.error('❌ Verify code error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// التحقق بخطوتين
router.post('/verify-2fa', async (req, res) => {
  try {
    const { apiId, phone, password } = req.body;

    if (!apiId || !phone || !password) {
      return res.status(400).json({ success: false, error: 'apiId, phone, password مطلوبة' });
    }

    const result = await telegramSession.verify2FA({ apiId, phone, password });
    res.json(result);
  } catch (err) {
    console.error('❌ Verify 2FA error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
