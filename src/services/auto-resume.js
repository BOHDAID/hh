// ============================================================
// Auto-Resume Service
// يقرأ حالات الأتمتة المحفوظة من قاعدة البيانات
// ويعيد تشغيل المهام تلقائياً بعد إعادة تشغيل السيرفر
// ============================================================

import telegramAuto from './telegram-automation.js';

const EXTERNAL_SUPABASE_URL = process.env.EXTERNAL_SUPABASE_URL || process.env.VITE_EXTERNAL_SUPABASE_URL;
const EXTERNAL_SUPABASE_SERVICE_ROLE_KEY = process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY;

function parseMaybeJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return value;
}

function parseStoredPayload(rawSelectedGroups) {
  const parsed = parseMaybeJson(rawSelectedGroups, []);
  if (Array.isArray(parsed)) return { groups: parsed, automation: {} };
  if (typeof parsed === 'object' && parsed !== null) {
    return {
      groups: Array.isArray(parsed.groups) ? parsed.groups : Array.isArray(parsed.selectedGroups) ? parsed.selectedGroups : [],
      automation: (typeof parsed.automation === 'object' && parsed.automation) || {},
    };
  }
  return { groups: [], automation: {} };
}

async function fetchAllSessions() {
  if (!EXTERNAL_SUPABASE_URL || !EXTERNAL_SUPABASE_SERVICE_ROLE_KEY) {
    console.log('⚠️ Auto-resume: External Supabase not configured, skipping');
    return [];
  }

  try {
    // Try telegram_sessions table first
    const url = `${EXTERNAL_SUPABASE_URL}/rest/v1/telegram_sessions?select=session_string,selected_groups,mentions_channel_id,telegram_user`;
    const res = await fetch(url, {
      headers: {
        'apikey': EXTERNAL_SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${EXTERNAL_SUPABASE_SERVICE_ROLE_KEY}`,
        'Accept': 'application/json',
      },
    });

    if (res.ok) {
      return await res.json();
    }

    // Fallback: site_settings
    console.log('📦 Auto-resume: telegram_sessions not available, trying site_settings fallback...');
    const fallbackUrl = `${EXTERNAL_SUPABASE_URL}/rest/v1/site_settings?category=eq.telegram_automation&select=key,value`;
    const fallbackRes = await fetch(fallbackUrl, {
      headers: {
        'apikey': EXTERNAL_SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${EXTERNAL_SUPABASE_SERVICE_ROLE_KEY}`,
        'Accept': 'application/json',
      },
    });

    if (!fallbackRes.ok) return [];
    const fallbackData = await fallbackRes.json();
    return fallbackData.map(item => {
      const parsed = parseMaybeJson(item.value, null);
      if (!parsed) return null;
      return {
        session_string: parsed.session_string,
        selected_groups: parsed.selected_groups,
        mentions_channel_id: parsed.mentions_channel_id,
        telegram_user: parsed.telegram_user,
      };
    }).filter(Boolean);
  } catch (err) {
    console.error('❌ Auto-resume: Failed to fetch sessions:', err.message);
    return [];
  }
}

async function tryStart(name, fn) {
  try {
    const result = await fn();
    if (result?.success !== false) {
      console.log(`  ✅ ${name} resumed`);
    } else {
      const msg = result?.error || '';
      if (/يعمل بالفعل|already|نشط|active/i.test(msg)) {
        console.log(`  ℹ️ ${name} already running`);
      } else {
        console.warn(`  ⚠️ ${name} failed: ${msg}`);
      }
    }
  } catch (err) {
    const msg = err?.message || '';
    if (/يعمل بالفعل|already|نشط|active/i.test(msg)) {
      console.log(`  ℹ️ ${name} already running`);
    } else {
      console.warn(`  ⚠️ ${name} failed: ${msg}`);
    }
  }
}

export async function autoResumeAllTasks() {
  console.log('🔄 Auto-resume: Checking for saved automation tasks...');

  const sessions = await fetchAllSessions();
  if (!sessions.length) {
    console.log('🔄 Auto-resume: No saved sessions found');
    return;
  }

  console.log(`🔄 Auto-resume: Found ${sessions.length} session(s)`);

  for (const session of sessions) {
    if (!session.session_string) continue;

    const { automation } = parseStoredPayload(session.selected_groups);
    const channelId = session.mentions_channel_id || null;
    const sessionString = session.session_string;

    const userName = (() => {
      const u = parseMaybeJson(session.telegram_user, null);
      return u?.firstName || u?.username || 'unknown';
    })();

    console.log(`📱 Auto-resume for user: ${userName}`);

    // 1. Mentions Monitor
    const mentions = automation.mentions;
    if (mentions?.running && mentions.taskId) {
      const ch = channelId || mentions.channelId;
      if (ch) {
        await tryStart('Mentions Monitor', () =>
          telegramAuto.startMentionsMonitor({ sessionString, channelId: ch, taskId: mentions.taskId })
        );
      }
    }

    // 2. Anti-Delete
    const antiDelete = automation.antiDelete;
    if (antiDelete?.running && antiDelete.taskId) {
      await tryStart('Anti-Delete', () =>
        telegramAuto.startAntiDelete({ sessionString, taskId: antiDelete.taskId, mentionsChannelId: channelId || antiDelete.mentionsChannelId })
      );
    }

    // 3. Auto-Reply
    const autoReply = automation.autoReply;
    if (autoReply?.running && autoReply.taskId && (autoReply.replyMessage || autoReply.media)) {
      await tryStart('Auto-Reply', () =>
        telegramAuto.startAutoReply({
          sessionString,
          replyMessage: autoReply.replyMessage || '',
          taskId: autoReply.taskId,
          mentionsChannelId: channelId || autoReply.mentionsChannelId,
          mediaBase64: autoReply.media?.base64,
          mediaFileName: autoReply.media?.fileName,
          mediaMimeType: autoReply.media?.mimeType,
          mediaSendType: autoReply.media?.sendType,
        })
      );
    }

    // 4. Auto-Publish
    const autoPublish = automation.autoPublish;
    const groupIds = Array.isArray(autoPublish?.groupIds) ? autoPublish.groupIds.filter(id => typeof id === 'string') : [];
    if (autoPublish?.running && autoPublish.taskId && (autoPublish.message || autoPublish.media) && groupIds.length > 0) {
      await tryStart('Auto-Publish', () =>
        telegramAuto.startAutoPublish({
          sessionString,
          groupIds,
          message: autoPublish.message || '',
          intervalMinutes: autoPublish.intervalMinutes || 1,
          taskId: autoPublish.taskId,
          mentionsChannelId: channelId || autoPublish.mentionsChannelId,
          mediaBase64: autoPublish.media?.base64,
          mediaFileName: autoPublish.media?.fileName,
          mediaMimeType: autoPublish.media?.mimeType,
          mediaSendType: autoPublish.media?.sendType,
          forcedSubscription: autoPublish.forcedSubscription ?? true,
        })
      );
    }
  }

  console.log('🔄 Auto-resume: Complete!');
}

export default autoResumeAllTasks;
