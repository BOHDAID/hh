// ============================================================
// Telegram Automation Routes
// /api/telegram-auto/*
// ============================================================

import express, { Router } from 'express';
import telegramAuto from '../services/telegram-automation.js';

const router = Router();
router.use(express.json({ limit: '10mb' }));

// Middleware: التحقق من السر
router.use((req, res, next) => {
  const incomingSecret = typeof req.body?.secret === 'string' ? req.body.secret.trim() : '';
  const serverSecret = (process.env.QR_AUTOMATION_SECRET || '').trim();

  if (!serverSecret) return res.status(500).json({ success: false, error: 'QR_AUTOMATION_SECRET not configured' });
  if (!incomingSecret) return res.status(400).json({ success: false, error: 'Secret missing' });
  if (incomingSecret !== serverSecret) return res.status(401).json({ success: false, error: 'Unauthorized' });

  next();
});

// جلب المجموعات
router.post('/fetch-groups', async (req, res) => {
  try {
    const { sessionString } = req.body;
    if (!sessionString) return res.status(400).json({ success: false, error: 'sessionString مطلوب' });
    const result = await telegramAuto.fetchGroups({ sessionString });
    res.json(result);
  } catch (err) {
    console.error('❌ Fetch groups error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// جلب جهات الاتصال
router.post('/fetch-contacts', async (req, res) => {
  try {
    const { sessionString } = req.body;
    if (!sessionString) return res.status(400).json({ success: false, error: 'sessionString مطلوب' });
    const result = await telegramAuto.fetchContacts({ sessionString });
    res.json(result);
  } catch (err) {
    console.error('❌ Fetch contacts error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// بدء النشر التلقائي
router.post('/start-auto-publish', async (req, res) => {
  try {
    const { sessionString, groupIds, message, intervalMinutes, taskId, mentionsChannelId, mediaBase64, mediaFileName, mediaMimeType } = req.body;
    if (!sessionString || !groupIds?.length || (!message && !mediaBase64)) {
      return res.status(400).json({ success: false, error: 'sessionString, groupIds, (message أو media) مطلوبة' });
    }
    const result = await telegramAuto.startAutoPublish({ sessionString, groupIds, message, intervalMinutes, taskId, mentionsChannelId, mediaBase64, mediaFileName, mediaMimeType });
    res.json(result);
  } catch (err) {
    console.error('❌ Auto-publish error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// إيقاف النشر التلقائي
router.post('/stop-auto-publish', async (req, res) => {
  try {
    const { taskId } = req.body;
    if (!taskId) return res.status(400).json({ success: false, error: 'taskId مطلوب' });
    const result = await telegramAuto.stopAutoPublish({ taskId });
    res.json(result);
  } catch (err) {
    console.error('❌ Stop auto-publish error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// حالة النشر التلقائي
router.post('/auto-publish-status', async (req, res) => {
  try {
    const { taskId } = req.body;
    if (!taskId) return res.status(400).json({ success: false, error: 'taskId مطلوب' });
    const result = await telegramAuto.getAutoPublishStatus({ taskId });
    res.json(result);
  } catch (err) {
    console.error('❌ Auto-publish status error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// جلب الأشخاص من المحادثات (الذين كلموني)
router.post('/fetch-dialogs', async (req, res) => {
  try {
    const { sessionString } = req.body;
    if (!sessionString) return res.status(400).json({ success: false, error: 'sessionString مطلوب' });
    const result = await telegramAuto.fetchDialogs({ sessionString });
    res.json(result);
  } catch (err) {
    console.error('❌ Fetch dialogs error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// البث
router.post('/broadcast', async (req, res) => {
  try {
    const { sessionString, message, blacklistIds, includeContacts, taskId, mediaBase64, mediaFileName, mediaMimeType } = req.body;
    if (!sessionString || (!message && !mediaBase64)) {
      return res.status(400).json({ success: false, error: 'sessionString, (message أو media) مطلوبة' });
    }
    const result = await telegramAuto.broadcast({ sessionString, message, blacklistIds, includeContacts, taskId, mediaBase64, mediaFileName, mediaMimeType });
    res.json(result);
  } catch (err) {
    console.error('❌ Broadcast error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// جلب البروفايل
router.post('/get-profile', async (req, res) => {
  try {
    const { sessionString } = req.body;
    if (!sessionString) return res.status(400).json({ success: false, error: 'sessionString مطلوب' });
    const result = await telegramAuto.getProfile({ sessionString });
    res.json(result);
  } catch (err) {
    console.error('❌ Get profile error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// تحديث البروفايل
router.post('/update-profile', async (req, res) => {
  try {
    const { sessionString, firstName, lastName, about } = req.body;
    if (!sessionString) return res.status(400).json({ success: false, error: 'sessionString مطلوب' });
    const result = await telegramAuto.updateProfile({ sessionString, firstName, lastName, about });
    res.json(result);
  } catch (err) {
    console.error('❌ Update profile error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// تحديث صورة البروفايل
router.post('/update-profile-photo', async (req, res) => {
  try {
    const { sessionString, photoBase64 } = req.body;
    if (!sessionString || !photoBase64) return res.status(400).json({ success: false, error: 'sessionString, photoBase64 مطلوبة' });
    const result = await telegramAuto.updateProfilePhoto({ sessionString, photoBase64 });
    res.json(result);
  } catch (err) {
    console.error('❌ Update profile photo error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// حذف صورة البروفايل
router.post('/delete-profile-photo', async (req, res) => {
  try {
    const { sessionString } = req.body;
    if (!sessionString) return res.status(400).json({ success: false, error: 'sessionString مطلوب' });
    const result = await telegramAuto.deleteProfilePhoto({ sessionString });
    res.json(result);
  } catch (err) {
    console.error('❌ Delete profile photo error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// إنشاء قناة منشنات جديدة
router.post('/create-mentions-channel', async (req, res) => {
  try {
    const { sessionString } = req.body;
    if (!sessionString) return res.status(400).json({ success: false, error: 'sessionString مطلوب' });
    const result = await telegramAuto.createMentionsChannel({ sessionString });
    res.json(result);
  } catch (err) {
    console.error('❌ Create mentions channel error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// جلب القنوات
router.post('/fetch-channels', async (req, res) => {
  try {
    const { sessionString } = req.body;
    if (!sessionString) return res.status(400).json({ success: false, error: 'sessionString مطلوب' });
    const result = await telegramAuto.fetchChannels({ sessionString });
    res.json(result);
  } catch (err) {
    console.error('❌ Fetch channels error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// بدء مراقبة المنشنات
router.post('/start-mentions-monitor', async (req, res) => {
  try {
    const { sessionString, channelId, taskId } = req.body;
    if (!sessionString || !channelId || !taskId) {
      return res.status(400).json({ success: false, error: 'sessionString, channelId, taskId مطلوبة' });
    }
    const result = await telegramAuto.startMentionsMonitor({ sessionString, channelId, taskId });
    res.json(result);
  } catch (err) {
    console.error('❌ Start mentions monitor error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// إيقاف مراقبة المنشنات
router.post('/stop-mentions-monitor', async (req, res) => {
  try {
    const { taskId } = req.body;
    if (!taskId) return res.status(400).json({ success: false, error: 'taskId مطلوب' });
    const result = await telegramAuto.stopMentionsMonitor({ taskId });
    res.json(result);
  } catch (err) {
    console.error('❌ Stop mentions monitor error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// جلب المنشنات
router.post('/get-mentions', async (req, res) => {
  try {
    const { taskId } = req.body;
    if (!taskId) return res.status(400).json({ success: false, error: 'taskId مطلوب' });
    const result = await telegramAuto.getMentions({ taskId });
    res.json(result);
  } catch (err) {
    console.error('❌ Get mentions error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// إحصائيات وتقارير
router.post('/get-stats', async (req, res) => {
  try {
    const result = telegramAuto.getStats();
    res.json(result);
  } catch (err) {
    console.error('❌ Get stats error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// بدء الرد التلقائي في الخاص
router.post('/start-auto-reply', async (req, res) => {
  try {
    const { sessionString, replyMessage, taskId, mentionsChannelId, mediaBase64, mediaFileName, mediaMimeType } = req.body;
    if (!sessionString || (!replyMessage && !mediaBase64) || !taskId) {
      return res.status(400).json({ success: false, error: 'sessionString, (replyMessage أو media), taskId مطلوبة' });
    }
    const result = await telegramAuto.startAutoReply({ sessionString, replyMessage, taskId, mentionsChannelId, mediaBase64, mediaFileName, mediaMimeType });
    res.json(result);
  } catch (err) {
    console.error('❌ Start auto-reply error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// إيقاف الرد التلقائي
router.post('/stop-auto-reply', async (req, res) => {
  try {
    const { taskId } = req.body;
    if (!taskId) return res.status(400).json({ success: false, error: 'taskId مطلوب' });
    const result = await telegramAuto.stopAutoReply({ taskId });
    res.json(result);
  } catch (err) {
    console.error('❌ Stop auto-reply error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// حالة الرد التلقائي
router.post('/auto-reply-status', async (req, res) => {
  try {
    const { taskId } = req.body;
    if (!taskId) return res.status(400).json({ success: false, error: 'taskId مطلوب' });
    const result = telegramAuto.getAutoReplyStatus({ taskId });
    res.json(result);
  } catch (err) {
    console.error('❌ Auto-reply status error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// بدء مراقب الرسائل المحذوفة
router.post('/start-anti-delete', async (req, res) => {
  try {
    const { sessionString, taskId, mentionsChannelId } = req.body;
    if (!sessionString || !taskId) {
      return res.status(400).json({ success: false, error: 'sessionString, taskId مطلوبة' });
    }
    const result = await telegramAuto.startAntiDelete({ sessionString, taskId, mentionsChannelId });
    res.json(result);
  } catch (err) {
    console.error('❌ Start anti-delete error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// إيقاف مراقب الحذف
router.post('/stop-anti-delete', async (req, res) => {
  try {
    const { taskId } = req.body;
    if (!taskId) return res.status(400).json({ success: false, error: 'taskId مطلوب' });
    const result = await telegramAuto.stopAntiDelete({ taskId });
    res.json(result);
  } catch (err) {
    console.error('❌ Stop anti-delete error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// حالة مراقب الحذف
router.post('/anti-delete-status', async (req, res) => {
  try {
    const { taskId } = req.body;
    if (!taskId) return res.status(400).json({ success: false, error: 'taskId مطلوب' });
    const result = telegramAuto.getAntiDeleteStatus({ taskId });
    res.json(result);
  } catch (err) {
    console.error('❌ Anti-delete status error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
