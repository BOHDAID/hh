// ============================================================
// Telegram Automation Services
// جلب المجموعات، النشر التلقائي، البث، Blacklist
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

// تخزين مؤقت للعملاء المتصلين (sessionHash → client)
const activeClients = new Map();
// تخزين مؤقت للنشر التلقائي الجاري (taskId → interval)
const activeAutoPublish = new Map();
// تخزين مؤقت للقنوات المنضمة إجبارياً (channelId → { leaveAt, sessionString })
const forcedJoins = new Map();
// الرد التلقائي في الخاص (taskId → { handler, client, repliedUsers, reconnectInterval })
const activeAutoReply = new Map();
// مراقب الرسائل المحذوفة (taskId → { handlers, client, messageCache, reconnectInterval })
const activeAntiDelete = new Map();
// قناة المنشنات للإشعارات
let notificationChannelEntity = null;
let notificationClient = null;

// ============================================================
// نظام الإحصائيات والتقارير
// ============================================================
const stats = {
  autoPublish: {
    totalSent: 0,
    totalFailed: 0,
    totalRetries: 0,
    forcedJoins: 0,
    forcedLeaves: 0,
    sessionStartedAt: null,
    history: [],
  },
  broadcast: {
    totalSent: 0,
    totalFailed: 0,
    lastRunAt: null,
    history: [],
  },
  mentions: {
    totalDetected: 0,
    totalForwarded: 0,
    history: [],
  },
  autoReply: {
    totalReplied: 0,
    totalIgnored: 0,
    history: [],
  },
  connection: {
    connectedAt: null,
    reconnects: 0,
    lastActivity: null,
  },
};

function recordStat(category, entry) {
  if (!stats[category]) return;
  stats[category].history.push({ ...entry, timestamp: Date.now() });
  // الاحتفاظ بآخر 200 فقط
  if (stats[category].history.length > 200) {
    stats[category].history = stats[category].history.slice(-200);
  }
  stats[category].lastActivity = Date.now();
  stats.connection.lastActivity = Date.now();
}

function getStats() {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  const apHistory = stats.autoPublish.history;
  const lastHourAP = apHistory.filter(h => h.timestamp > oneHourAgo);
  const lastDayAP = apHistory.filter(h => h.timestamp > oneDayAgo);

  const bcHistory = stats.broadcast.history;
  const lastDayBC = bcHistory.filter(h => h.timestamp > oneDayAgo);

  const mnHistory = stats.mentions.history;
  const lastDayMN = mnHistory.filter(h => h.timestamp > oneDayAgo);

  // أكثر المجموعات نشاطاً
  const groupCounts = {};
  for (const h of lastDayAP) {
    const key = h.groupTitle || h.groupId || 'unknown';
    groupCounts[key] = (groupCounts[key] || 0) + 1;
  }
  const topGroups = Object.entries(groupCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  // معدل النجاح
  const totalAttempts = stats.autoPublish.totalSent + stats.autoPublish.totalFailed;
  const successRate = totalAttempts > 0 ? Math.round((stats.autoPublish.totalSent / totalAttempts) * 100) : 0;

  // النشر النشط الحالي
  const activeTasks = [];
  for (const [taskId, task] of activeAutoPublish.entries()) {
    activeTasks.push({
      taskId,
      groupsCount: task.groupIds?.length || 0,
      intervalMinutes: task.intervalMinutes,
      sentCount: typeof task.sentCount === 'function' ? task.sentCount() : 0,
      startedAt: task.startedAt,
      runningMinutes: Math.round((now - task.startedAt) / 60000),
    });
  }

  return {
    success: true,
    autoPublish: {
      totalSent: stats.autoPublish.totalSent,
      totalFailed: stats.autoPublish.totalFailed,
      successRate,
      forcedJoins: stats.autoPublish.forcedJoins,
      forcedLeaves: stats.autoPublish.forcedLeaves,
      lastHour: { sent: lastHourAP.filter(h => h.status === 'sent').length, failed: lastHourAP.filter(h => h.status === 'failed').length },
      lastDay: { sent: lastDayAP.filter(h => h.status === 'sent').length, failed: lastDayAP.filter(h => h.status === 'failed').length },
      topGroups,
      activeTasks,
      recentHistory: apHistory.slice(-20).reverse(),
    },
    broadcast: {
      totalSent: stats.broadcast.totalSent,
      totalFailed: stats.broadcast.totalFailed,
      lastRunAt: stats.broadcast.lastRunAt,
      lastDay: { sent: lastDayBC.filter(h => h.status === 'sent').length, failed: lastDayBC.filter(h => h.status === 'failed').length },
    },
    mentions: {
      totalDetected: stats.mentions.totalDetected,
      totalForwarded: stats.mentions.totalForwarded,
      lastDay: { detected: lastDayMN.length },
    },
    connection: {
      ...stats.connection,
      activeClients: activeClients.size,
      forcedJoinsActive: forcedJoins.size,
    },
  };
}

function getSessionHash(sessionString) {
  return sessionString.substring(0, 20);
}

function markClientAsUsed(client) {
  for (const entry of activeClients.values()) {
    if (entry.client === client) {
      entry.lastUsed = Date.now();
      return;
    }
  }
}

async function shutdownClient(client, reason = '') {
  if (!client) return;
  try {
    await client.disconnect();
  } catch (err) {
    if (reason) console.warn(`⚠️ Disconnect warning (${reason}):`, err.message);
  }
  try {
    await client.destroy();
  } catch (err) {
    if (reason) console.warn(`⚠️ Destroy warning (${reason}):`, err.message);
  }
}

function isClientProtected(client) {
  if (!client) return false;

  for (const task of activeAutoPublish.values()) {
    if (task.client === client) return true;
  }
  for (const task of activeMentionsMonitors.values()) {
    if (task.client === client) return true;
  }
  for (const task of activeAutoReply.values()) {
    if (task.client === client) return true;
  }
  for (const task of activeAntiDelete.values()) {
    if (task.client === client) return true;
  }

  return false;
}

async function releaseClientIfUnused(client, reason = '') {
  if (!client || isClientProtected(client)) return;

  let hashToDelete = null;
  for (const [hash, entry] of activeClients.entries()) {
    if (entry.client === client) {
      hashToDelete = hash;
      break;
    }
  }

  await shutdownClient(client, reason);
  if (hashToDelete) {
    activeClients.delete(hashToDelete);
  }
}

async function getOrCreateClient(sessionString) {
  const hash = getSessionHash(sessionString);

  if (activeClients.has(hash)) {
    const existing = activeClients.get(hash);
    if (existing.client.connected) {
      existing.lastUsed = Date.now();
      return existing.client;
    }
    await shutdownClient(existing.client, `stale client ${hash}`);
    activeClients.delete(hash);
  }

  const client = new TelegramClient(
    new StringSession(sessionString),
    2040,
    'b18441a1ff607e10a989891a5462e627',
    createTelegramClientOptions()
  );

  await client.connect();
  activeClients.set(hash, { client, lastUsed: Date.now() });
  return client;
}

/**
 * جلب جميع المجموعات والقنوات
 */
async function fetchGroups({ sessionString }) {
  const client = await getOrCreateClient(sessionString);
  
  const dialogs = await client.getDialogs({ limit: 500 });
  
  // المرحلة 1: جمع المجموعات بدون صور (سريع جداً)
  const groups = [];
  const entities = [];
  for (const dialog of dialogs) {
    const entity = dialog.entity;
    if (!entity) continue;
    
    const isGroup = entity.className === 'Channel' || entity.className === 'Chat';
    const isSupergroup = entity.megagroup === true;
    const isChannel = entity.className === 'Channel' && !entity.megagroup;
    
    if (!isGroup || isChannel) continue;

    groups.push({
      id: entity.id?.toString(),
      title: entity.title || 'بدون اسم',
      username: entity.username || null,
      participantsCount: entity.participantsCount || 0,
      photo: null,
      type: isSupergroup ? 'supergroup' : 'group',
    });
    entities.push(entity);
  }

  // المرحلة 2: تحميل الصور بالتوازي (دفعات من 5)
  const BATCH = 5;
  for (let i = 0; i < entities.length; i += BATCH) {
    const batch = entities.slice(i, i + BATCH);
    const photos = await Promise.allSettled(
      batch.map(async (entity) => {
        if (!entity.photo) return null;
        const buf = await client.downloadProfilePhoto(entity, { isBig: false });
        return buf ? `data:image/jpeg;base64,${Buffer.from(buf).toString('base64')}` : null;
      })
    );
    photos.forEach((result, j) => {
      if (result.status === 'fulfilled' && result.value) {
        groups[i + j].photo = result.value;
      }
    });
  }

  console.log(`✅ Fetched ${groups.length} groups with photos`);
  return { success: true, groups };
}

/**
 * جلب جميع جهات الاتصال
 */
async function fetchContacts({ sessionString }) {
  const client = await getOrCreateClient(sessionString);
  
  const result = await client.invoke(new Api.contacts.GetContacts({ hash: BigInt(0) }));
  
  const contacts = [];
  if (result.users) {
    for (const user of result.users) {
      if (user.bot || user.deleted || user.self) continue;
      
      let photoUrl = null;
      try {
        if (user.photo) {
          const photoBuffer = await client.downloadProfilePhoto(user, { isBig: false });
          if (photoBuffer) {
            photoUrl = `data:image/jpeg;base64,${Buffer.from(photoBuffer).toString('base64')}`;
          }
        }
      } catch {}

      contacts.push({
        id: user.id?.toString(),
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        username: user.username || null,
        phone: user.phone || null,
        photo: photoUrl,
      });
    }
  }

  console.log(`✅ Fetched ${contacts.length} contacts`);
  return { success: true, contacts };
}

/**
 * النشر التلقائي - إرسال رسالة لكل المجموعات المختارة بفاصل زمني
 */
/**
 * محاولة الانضمام التلقائي للقنوات الإجبارية عند فشل الإرسال
 * يكتشف القنوات المطلوبة من الرسائل/الأزرار ويشترك فيها ثم يجدول الخروج بعد 24 ساعة
 */
function extractJoinLinksFromText(text = '') {
  const links = new Set();
  if (!text) return links;

  const normalized = String(text).replace(/\n/g, ' ');

  // روابط t.me المباشرة
  const tMeMatches = normalized.match(/(?:https?:\/\/)?(?:www\.)?t\.me\/(?:\+|joinchat\/)?[a-zA-Z0-9_]+(?:\?[\w=&-]+)?/g);
  if (tMeMatches) {
    for (const link of tMeMatches) links.add(link.trim());
  }

  // روابط tg://
  const tgResolveMatches = normalized.match(/tg:\/\/resolve\?domain=[a-zA-Z][a-zA-Z0-9_]{3,}/g);
  if (tgResolveMatches) {
    for (const link of tgResolveMatches) links.add(link.trim());
  }

  const tgInviteMatches = normalized.match(/tg:\/\/join\?invite=[a-zA-Z0-9_-]+/g);
  if (tgInviteMatches) {
    for (const link of tgInviteMatches) links.add(link.trim());
  }

  // @username
  const usernameMatches = normalized.match(/@([a-zA-Z][a-zA-Z0-9_]{3,})/g);
  if (usernameMatches) {
    for (const mention of usernameMatches) {
      const username = mention.replace('@', '');
      if (!username.toLowerCase().endsWith('bot')) {
        links.add(`t.me/${username}`);
      }
    }
  }

  return links;
}

function normalizeJoinLink(rawLink) {
  if (!rawLink) return null;
  const link = String(rawLink).trim();

  // linked channel marker
  if (link.startsWith('linked:')) return link;

  // tg://resolve
  if (link.startsWith('tg://resolve?domain=')) {
    const username = link.replace('tg://resolve?domain=', '').trim();
    if (!username) return null;
    return `t.me/${username}`;
  }

  // tg://join
  if (link.startsWith('tg://join?invite=')) {
    const hash = link.replace('tg://join?invite=', '').trim();
    if (!hash) return null;
    return `t.me/+${hash}`;
  }

  // تنظيف عام
  let cleaned = link
    .replace(/^https?:\/\/(www\.)?/i, '')
    .replace(/^t\.me\//i, 't.me/')
    .replace(/[),.;]$/g, '')
    .trim();

  if (!cleaned.startsWith('t.me/')) {
    return null;
  }

  return cleaned;
}

function collectJoinLinksFromMessage(msg) {
  const links = new Set();
  const callbackButtons = [];

  if (!msg) return { links, callbackButtons };

  // نص الرسالة
  if (msg.message) {
    const textLinks = extractJoinLinksFromText(msg.message);
    for (const l of textLinks) links.add(l);
  }

  // entities (روابط مخفية / @mentions)
  if (msg.entities && msg.message) {
    for (const entity of msg.entities) {
      if (entity.className === 'MessageEntityMention') {
        const mention = msg.message.substring(entity.offset, entity.offset + entity.length);
        const mentionLinks = extractJoinLinksFromText(mention);
        for (const l of mentionLinks) links.add(l);
      }

      if (entity.className === 'MessageEntityUrl') {
        const urlText = msg.message.substring(entity.offset, entity.offset + entity.length);
        const urlLinks = extractJoinLinksFromText(urlText);
        for (const l of urlLinks) links.add(l);
      }

      if (entity.className === 'MessageEntityTextUrl' && entity.url) {
        const entityLinks = extractJoinLinksFromText(entity.url);
        for (const l of entityLinks) links.add(l);
      }
    }
  }

  // الأزرار (الرابط / callback)
  if (msg.replyMarkup?.rows) {
    for (const row of msg.replyMarkup.rows) {
      for (const btn of (row.buttons || [])) {
        if (btn.url) {
          const btnLinks = extractJoinLinksFromText(btn.url);
          for (const l of btnLinks) links.add(l);
        }

        if (btn.text) {
          const textLinks = extractJoinLinksFromText(btn.text);
          for (const l of textLinks) links.add(l);
        }

        // هذا هو "الضغط" الفعلي على زر callback
        if (btn.data && msg.id) {
          callbackButtons.push({ msgId: msg.id, button: btn });
        }
      }
    }
  }

  return { links, callbackButtons };
}

async function pressCallbackButtonsForJoinLinks({ client, peer, callbackButtons }) {
  const discoveredLinks = new Set();

  for (const item of callbackButtons) {
    try {
      const answer = await client.invoke(new Api.messages.GetBotCallbackAnswer({
        peer,
        msgId: item.msgId,
        data: item.button.data,
      }));

      if (answer?.message) {
        const links = extractJoinLinksFromText(answer.message);
        for (const l of links) discoveredLinks.add(l);
      }

      if (answer?.url) {
        const links = extractJoinLinksFromText(answer.url);
        for (const l of links) discoveredLinks.add(l);
      }
    } catch {
      // بعض الأزرار ليست callback قابل للضغط عبر API
    }
  }

  return discoveredLinks;
}

async function handleForcedSubscription({ client, peer, groupId, channelId }) {
  try {
    // جلب معلومات المجموعة الكاملة للبحث عن القنوات المرتبطة
    const fullChat = await client.invoke(new Api.channels.GetFullChannel({ channel: peer }));
    const linkedChatId = fullChat?.fullChat?.linkedChatId;

    // جلب رسائل أكثر لرفع دقة اكتشاف الاشتراك الإجباري
    const messages = await client.getMessages(peer, { limit: 50 });
    const joinLinks = new Set();
    const callbackButtons = [];

    for (const msg of messages) {
      const { links, callbackButtons: msgButtons } = collectJoinLinksFromMessage(msg);
      for (const link of links) joinLinks.add(link);
      callbackButtons.push(...msgButtons);
    }

    if (linkedChatId) {
      joinLinks.add(`linked:${linkedChatId}`);
    }

    // لو ما لقينا روابط مباشرة، نجرب "ضغط" أزرار callback
    if (joinLinks.size === 0 && callbackButtons.length > 0) {
      const discovered = await pressCallbackButtonsForJoinLinks({ client, peer, callbackButtons });
      for (const link of discovered) joinLinks.add(link);
    }

    if (joinLinks.size === 0) {
      console.log(`⚠️ No forced subscription channels found for group ${groupId}`);
      return { joined: false, channels: [] };
    }

    const normalizedLinks = Array.from(new Set(
      Array.from(joinLinks)
        .map(normalizeJoinLink)
        .filter(Boolean)
    ));

    const joinedChannels = [];

    for (const link of normalizedLinks) {
      try {
        let targetEntity;
        let channelTitle = '';

        if (link.startsWith('linked:')) {
          const id = link.replace('linked:', '');
          targetEntity = await client.getEntity(BigInt(id));
          channelTitle = targetEntity.title || id;
        } else {
          const path = link.replace(/^https?:\/\/(www\.)?/i, '').replace(/^t\.me\//i, '');
          if (!path) continue;

          const isInvite = path.startsWith('+') || path.startsWith('joinchat/') || link.includes('joinchat/');
          if (!isInvite && path.includes('/')) continue;

          const token = path.replace(/^\+/, '').replace(/^joinchat\//, '').replace(/\?.*$/, '').trim();
          if (!token) continue;

          if (isInvite) {
            try {
              const inviteResult = await client.invoke(new Api.messages.ImportChatInvite({ hash: token }));
              const joinedChat = inviteResult?.chats?.[0];
              if (!joinedChat?.id) continue;

              const joinedId = joinedChat.id.toString();
              channelTitle = joinedChat.title || token;

              if (!forcedJoins.has(joinedId)) {
                scheduleForcedLeave(client, joinedChat, joinedId, channelTitle);
              }

              joinedChannels.push({ id: joinedId, title: channelTitle, link, method: 'invite' });
              continue;
            } catch (invErr) {
              console.log(`⚠️ Can't join via invite ${link}: ${invErr.message}`);
              continue;
            }
          }

          try {
            targetEntity = await client.getEntity(token);
            channelTitle = targetEntity.title || token;
          } catch {
            continue;
          }
        }

        if (!targetEntity) continue;
        const targetId = targetEntity.id?.toString();
        if (!targetId) continue;

        // لو سبق الانضمام المجدول لنفس القناة، لا نعيد الانضمام
        if (forcedJoins.has(targetId)) {
          joinedChannels.push({ id: targetId, title: channelTitle, link, method: 'already_joined' });
          continue;
        }

        // التحقق هل مشتركين بالفعل
        let alreadySubscribed = false;
        try {
          await client.invoke(new Api.channels.GetParticipant({
            channel: targetEntity,
            participant: new Api.InputPeerSelf(),
          }));
          alreadySubscribed = true;
        } catch {
          alreadySubscribed = false;
        }

        if (!alreadySubscribed) {
          await client.invoke(new Api.channels.JoinChannel({ channel: targetEntity }));
          console.log(`✅ Force-joined: ${channelTitle}`);
        }

        scheduleForcedLeave(client, targetEntity, targetId, channelTitle);
        joinedChannels.push({ id: targetId, title: channelTitle, link, method: alreadySubscribed ? 'already_member' : 'join' });
      } catch (joinErr) {
        console.error(`❌ Failed to join ${link}: ${joinErr.message}`);
      }
    }

    return { joined: joinedChannels.length > 0, channels: joinedChannels };
  } catch (err) {
    console.error(`❌ handleForcedSubscription error:`, err.message);
    return { joined: false, channels: [] };
  }
}

/**
 * جدولة الخروج التلقائي من قناة بعد 24 ساعة
 */
function scheduleForcedLeave(client, entity, channelId, channelTitle) {
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  // لا نكرر الجدولة لنفس القناة
  if (forcedJoins.has(channelId)) {
    return;
  }

  const leaveAt = Date.now() + TWENTY_FOUR_HOURS;

  const timeoutId = setTimeout(async () => {
    try {
      if (entity) {
        await client.invoke(new Api.channels.LeaveChannel({ channel: entity }));
        console.log(`👋 Auto-left forced channel: ${channelTitle} (after 24h)`);
      }
      forcedJoins.delete(channelId);

      // إرسال إشعار للقناة
      if (notificationClient && notificationChannelEntity) {
        try {
          const notif = [
            `📤 **خروج تلقائي**`,
            `━━━━━━━━━━━━━━━`,
            ``,
            `🚪 **القناة:** ${channelTitle}`,
            `📌 **السبب:** انتهاء مدة 24 ساعة`,
            `⏱ **النوع:** اشتراك إجباري`,
            ``,
            `━━━━━━━━━━━━━━━`,
            `🕐 ${new Date().toLocaleString('ar-u-nu-latn')}`,
          ].join('\n');
          await notificationClient.sendMessage(notificationChannelEntity, { message: notif, parseMode: 'md' });
        } catch {}
      }
    } catch (err) {
      console.error(`❌ Auto-leave failed for ${channelTitle}:`, err.message);
      forcedJoins.delete(channelId);
    }
  }, TWENTY_FOUR_HOURS);

  forcedJoins.set(channelId, {
    joinedAt: Date.now(),
    leaveAt,
    title: channelTitle,
    timeoutId,
  });

  console.log(`⏰ Scheduled auto-leave for ${channelTitle} in 24h`);
}

/**
 * إرسال إشعار اشتراك إجباري للقناة
 */
async function notifyForcedJoin(client, channelEntity, groupTitle, joinedChannels) {
  if (!channelEntity) return;
  try {
    const channelsList = joinedChannels.map((c, i) => `  ${i + 1}. ${c.title}`).join('\n');
    const notif = [
      `🔐 **اشتراك إجباري تلقائي**`,
      `━━━━━━━━━━━━━━━`,
      ``,
      `💬 **المجموعة:** ${groupTitle}`,
      ``,
      `📋 **القنوات المنضمة:**`,
      channelsList,
      ``,
      `⏳ **الخروج التلقائي:** بعد 24 ساعة`,
      ``,
      `━━━━━━━━━━━━━━━`,
      `🕐 ${new Date().toLocaleString('ar-u-nu-latn')}`,
    ].join('\n');
    await client.sendMessage(channelEntity, { message: notif, parseMode: 'md' });
  } catch (err) {
    console.error(`❌ Notify forced join error:`, err.message);
  }
}

/**
 * النشر التلقائي - إرسال رسالة لكل المجموعات المختارة بفاصل زمني
 */
async function startAutoPublish({ sessionString, groupIds, message, intervalMinutes, taskId, mentionsChannelId, mediaBase64, mediaFileName, mediaMimeType }) {
  // إيقاف أي نشر سابق لنفس المهمة
  if (activeAutoPublish.has(taskId)) {
    clearInterval(activeAutoPublish.get(taskId).interval);
    activeAutoPublish.delete(taskId);
  }

  const client = await getOrCreateClient(sessionString);
  markClientAsUsed(client);
  
  // تجهيز الملف المرفق
  let mediaBuffer = null;
  if (mediaBase64) {
    mediaBuffer = Buffer.from(mediaBase64, 'base64');
  }

  // تجهيز قناة الإشعارات إن وجدت
  let notifChannelEntity = null;
  if (mentionsChannelId) {
    try {
      notifChannelEntity = await client.getEntity(BigInt(mentionsChannelId));
      notificationClient = client;
      notificationChannelEntity = notifChannelEntity;
    } catch {}
  }

  const intervalMs = (intervalMinutes || 1) * 60 * 1000;
  let sentCount = 0;
  let currentIndex = 0;

  // إرسال لمجموعة واحدة كل فترة
  async function sendNext() {
    markClientAsUsed(client);

    if (currentIndex >= groupIds.length) {
      currentIndex = 0;
    }

    const groupId = groupIds[currentIndex];
    try {
      const peer = await client.getEntity(BigInt(groupId));
      if (mediaBuffer) {
        await client.sendFile(peer, {
          file: mediaBuffer,
          caption: message || '',
          fileName: mediaFileName || 'file',
        });
      } else {
        await client.sendMessage(peer, { message });
      }
      sentCount++;
      currentIndex++;
      stats.autoPublish.totalSent++;
      recordStat('autoPublish', { groupId, groupTitle: peer.title || groupId, status: 'sent' });
      console.log(`📤 Auto-publish [${taskId}]: Sent to group ${groupId} (${sentCount} total)`);
    } catch (err) {
      const errMsg = err.message || '';
      console.error(`❌ Auto-publish [${taskId}]: Failed for group ${groupId}:`, errMsg);
      stats.autoPublish.totalFailed++;
      recordStat('autoPublish', { groupId, status: 'failed', error: errMsg.substring(0, 100) });
      // التعامل مع الاشتراك الإجباري
      if (errMsg.includes('CHAT_WRITE_FORBIDDEN') || errMsg.includes('CHANNEL_PRIVATE') || 
          errMsg.includes('cannot write') || errMsg.includes('not subscribed') ||
          errMsg.includes('غير مشترك')) {
        console.log(`🔐 Detected forced subscription for group ${groupId}, attempting auto-join...`);
        
        try {
          const peer = await client.getEntity(BigInt(groupId));
          const result = await handleForcedSubscription({ client, peer, groupId });
          
          if (result.joined && result.channels.length > 0) {
            // إرسال إشعار
            const groupTitle = peer.title || groupId;
            await notifyForcedJoin(client, notifChannelEntity, groupTitle, result.channels);
            
            // انتظار ثانيتين ثم إعادة المحاولة
            await new Promise(r => setTimeout(r, 2000));
            try {
              await client.sendMessage(peer, { message });
              sentCount++;
              console.log(`✅ Auto-publish [${taskId}]: Retry succeeded for group ${groupId} after forced join`);
            } catch (retryErr) {
              console.error(`❌ Auto-publish [${taskId}]: Retry failed for group ${groupId}:`, retryErr.message);
            }
          }
        } catch (forceErr) {
          console.error(`❌ Forced subscription handling failed:`, forceErr.message);
        }
      }
      
      currentIndex++;
    }
  }

  // إرسال أول رسالة فوراً
  await sendNext();

  // جدولة الباقي
  const interval = setInterval(sendNext, intervalMs);
  
  activeAutoPublish.set(taskId, {
    interval,
    client,
    groupIds,
    message,
    intervalMinutes,
    startedAt: Date.now(),
    sentCount: () => sentCount,
  });

  console.log(`✅ Auto-publish started [${taskId}]: ${groupIds.length} groups, every ${intervalMinutes} min`);
  
  return { 
    success: true, 
    taskId, 
    message: `بدأ النشر التلقائي لـ ${groupIds.length} مجموعة كل ${intervalMinutes} دقيقة` 
  };
}

/**
 * إيقاف النشر التلقائي
 */
async function stopAutoPublish({ taskId }) {
  if (activeAutoPublish.has(taskId)) {
    clearInterval(activeAutoPublish.get(taskId).interval);
    const task = activeAutoPublish.get(taskId);
    activeAutoPublish.delete(taskId);
    await releaseClientIfUnused(task.client, `stop auto-publish ${taskId}`);
    console.log(`🛑 Auto-publish stopped [${taskId}]`);
    return { success: true, message: 'تم إيقاف النشر التلقائي' };
  }
  return { success: false, error: 'لا توجد مهمة نشر بهذا المعرف' };
}

/**
 * حالة النشر التلقائي
 */
async function getAutoPublishStatus({ taskId }) {
  if (activeAutoPublish.has(taskId)) {
    const task = activeAutoPublish.get(taskId);
    return {
      success: true,
      active: true,
      groupsCount: task.groupIds.length,
      intervalMinutes: task.intervalMinutes,
      sentCount: task.sentCount(),
      startedAt: task.startedAt,
    };
  }
  return { success: true, active: false };
}

/**
 * جلب الأشخاص الذين راسلوني (من المحادثات الخاصة)
 */
async function fetchDialogs({ sessionString }) {
  const client = await getOrCreateClient(sessionString);
  
  const dialogs = await client.getDialogs({ limit: 500 });
  const users = [];
  const seenIds = new Set();

  for (const dialog of dialogs) {
    // فقط المحادثات الخاصة (وليس مجموعات أو قنوات)
    if (!dialog.isUser) continue;
    const entity = dialog.entity;
    if (!entity || entity.bot || entity.deleted || entity.self) continue;
    
    const idStr = entity.id?.toString();
    if (seenIds.has(idStr)) continue;
    seenIds.add(idStr);

    let photoUrl = null;
    try {
      const buf = await client.downloadProfilePhoto(entity, { isBig: false });
      if (buf) photoUrl = `data:image/jpeg;base64,${Buffer.from(buf).toString('base64')}`;
    } catch {}

    users.push({
      id: idStr,
      firstName: entity.firstName || '',
      lastName: entity.lastName || '',
      username: entity.username || null,
      phone: entity.phone || null,
      photo: photoUrl,
    });
  }

  return { success: true, users };
}

/**
 * بث رسالة خاصة لجميع الأشخاص الذين راسلوني + اختيارياً جهات الاتصال (مع استثناء blacklist)
 */
async function broadcast({ sessionString, message, blacklistIds = [], includeContacts = false, taskId, mediaBase64, mediaFileName, mediaMimeType }) {
  const client = await getOrCreateClient(sessionString);
  
  let mediaBuffer = null;
  if (mediaBase64) {
    mediaBuffer = Buffer.from(mediaBase64, 'base64');
  }

  const blacklistSet = new Set(blacklistIds.map(String));
  const sentIds = new Set();
  let sentCount = 0;
  let failedCount = 0;
  const errors = [];

  async function sendToEntity(entity) {
    if (mediaBuffer) {
      await client.sendFile(entity, { file: mediaBuffer, caption: message || '', fileName: mediaFileName || 'file' });
    } else {
      await client.sendMessage(entity, { message });
    }
  }

  // 1) جلب الأشخاص من المحادثات الخاصة (الذين كلموني)
  const dialogs = await client.getDialogs({ limit: 500 });
  for (const dialog of dialogs) {
    if (!dialog.isUser) continue;
    const entity = dialog.entity;
    if (!entity || entity.bot || entity.deleted || entity.self) continue;
    
    const idStr = entity.id?.toString();
    if (blacklistSet.has(idStr) || sentIds.has(idStr)) continue;
    sentIds.add(idStr);

    try {
      await sendToEntity(entity);
      sentCount++;
      console.log(`📤 Broadcast [${taskId}]: Sent to ${entity.firstName || entity.id}`);
      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      failedCount++;
      errors.push({ userId: idStr, error: err.message });
      console.error(`❌ Broadcast [${taskId}]: Failed for ${idStr}:`, err.message);
    }
  }

  // 2) اختيارياً: جلب جهات الاتصال أيضاً
  if (includeContacts) {
    const result = await client.invoke(new Api.contacts.GetContacts({ hash: BigInt(0) }));
    if (result.users) {
      for (const user of result.users) {
        if (user.bot || user.deleted || user.self) continue;
        const idStr = user.id?.toString();
        if (blacklistSet.has(idStr) || sentIds.has(idStr)) continue;
        sentIds.add(idStr);

        try {
          await sendToEntity(user);
          sentCount++;
          console.log(`📤 Broadcast [${taskId}]: Sent to contact ${user.firstName || user.id}`);
          await new Promise(r => setTimeout(r, 1500));
        } catch (err) {
          failedCount++;
          errors.push({ userId: idStr, error: err.message });
        }
      }
    }
  }

  stats.broadcast.totalSent += sentCount;
  stats.broadcast.totalFailed += failedCount;
  stats.broadcast.lastRunAt = Date.now();
  recordStat('broadcast', { status: 'completed', sentCount, failedCount });
  console.log(`✅ Broadcast [${taskId}] complete: ${sentCount} sent, ${failedCount} failed`);

  return {
    success: true,
    taskId,
    sentCount,
    failedCount,
    errors: errors.slice(0, 10),
    message: `تم إرسال ${sentCount} رسالة، فشل ${failedCount}`,
  };
}

/**
 * جلب بيانات البروفايل الكاملة
 */
async function getProfile({ sessionString }) {
  const client = await getOrCreateClient(sessionString);
  const me = await client.getMe();
  
  let photoUrl = null;
  try {
    const buf = await client.downloadProfilePhoto(me, { isBig: false });
    if (buf) photoUrl = `data:image/jpeg;base64,${Buffer.from(buf).toString('base64')}`;
  } catch {}

  // جلب الـ bio
  const full = await client.invoke(new Api.users.GetFullUser({ id: me }));
  const about = full?.fullUser?.about || '';

  return {
    success: true,
    profile: {
      id: me.id?.toString(),
      firstName: me.firstName || '',
      lastName: me.lastName || '',
      username: me.username || null,
      phone: me.phone || null,
      photo: photoUrl,
      about,
    },
  };
}

/**
 * تحديث الاسم والبايو
 */
async function updateProfile({ sessionString, firstName, lastName, about }) {
  const client = await getOrCreateClient(sessionString);
  
  await client.invoke(new Api.account.UpdateProfile({
    firstName: firstName || '',
    lastName: lastName || '',
    about: about || '',
  }));

  return { success: true, message: 'تم تحديث البروفايل بنجاح' };
}

/**
 * تحديث صورة البروفايل (base64)
 */
async function updateProfilePhoto({ sessionString, photoBase64 }) {
  const client = await getOrCreateClient(sessionString);
  
  // تحويل base64 إلى buffer
  const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, '');
  const photoBuffer = Buffer.from(base64Data, 'base64');
  
  // استخدام CustomFile لضمان التوافق مع GramJS
  const { CustomFile } = await import('telegram/client/uploads.js');
  const customFile = new CustomFile("profile_photo.jpg", photoBuffer.length, "", photoBuffer);
  
  // رفع الصورة
  const file = await client.uploadFile({
    file: customFile,
    workers: 1,
  });
  
  await client.invoke(new Api.photos.UploadProfilePhoto({
    file,
  }));

  return { success: true, message: 'تم تحديث الصورة بنجاح' };
}

/**
 * حذف صورة البروفايل
 */
async function deleteProfilePhoto({ sessionString }) {
  const client = await getOrCreateClient(sessionString);
  
  const photos = await client.invoke(new Api.photos.GetUserPhotos({
    userId: 'me',
    offset: 0,
    maxId: BigInt(0),
    limit: 1,
  }));

  if (photos.photos && photos.photos.length > 0) {
    await client.invoke(new Api.photos.DeletePhotos({
      id: [photos.photos[0]],
    }));
  }

  return { success: true, message: 'تم حذف الصورة بنجاح' };
}

// تخزين مؤقت لمراقبة المنشنات (taskId → handler)
const activeMentionsMonitors = new Map();

/**
 * إنشاء قناة جديدة للمنشنات
 */
async function createMentionsChannel({ sessionString }) {
  const client = await getOrCreateClient(sessionString);
  
  const result = await client.invoke(new Api.channels.CreateChannel({
    title: '📢 مراقب المنشنات',
    about: 'قناة تلقائية لتلقي إشعارات المنشنات والردود من المجموعات',
    megagroup: false,
    broadcast: true,
  }));

  const chat = result.chats?.[0];
  if (!chat) throw new Error('فشل إنشاء القناة');

  console.log(`✅ Created mentions channel: ${chat.id}`);
  return {
    success: true,
    channel: {
      id: chat.id?.toString(),
      title: chat.title || '📢 مراقب المنشنات',
      username: chat.username || null,
      photo: null,
    },
  };
}

/**
 * جلب القنوات التي أنا أدمن فيها - مع إنشاء تلقائي إذا لم توجد
 */
async function fetchChannels({ sessionString, autoCreate = true }) {
  const client = await getOrCreateClient(sessionString);
  const dialogs = await client.getDialogs({ limit: 500 });
  
  const channels = [];
  for (const dialog of dialogs) {
    const entity = dialog.entity;
    if (!entity) continue;
    const isChannel = entity.className === 'Channel' && !entity.megagroup;
    if (!isChannel) continue;
    if (!entity.creator && !entity.adminRights) continue;

    let photoUrl = null;
    try {
      if (entity.photo) {
        const buf = await client.downloadProfilePhoto(entity, { isBig: false });
        if (buf) photoUrl = `data:image/jpeg;base64,${Buffer.from(buf).toString('base64')}`;
      }
    } catch {}

    channels.push({
      id: entity.id?.toString(),
      title: entity.title || 'بدون اسم',
      username: entity.username || null,
      photo: photoUrl,
    });
  }

  // إذا لم توجد قنوات، أنشئ واحدة تلقائياً
  if (channels.length === 0 && autoCreate) {
    console.log('📢 No admin channels found, creating one automatically...');
    try {
      const created = await createMentionsChannel({ sessionString });
      channels.push(created.channel);
    } catch (err) {
      console.error('❌ Failed to auto-create channel:', err.message);
    }
  }

  console.log(`✅ Fetched ${channels.length} admin channels`);
  return { success: true, channels };
}

/**
 * بدء مراقبة المنشنات والردود وإرسالها للقناة المحددة
 */
async function startMentionsMonitor({ sessionString, channelId, taskId }) {
  // إيقاف أي مراقبة سابقة
  if (activeMentionsMonitors.has(taskId)) {
    await stopMentionsMonitor({ taskId });
  }

  const client = await getOrCreateClient(sessionString);
  markClientAsUsed(client);
  const me = await client.getMe();
  const myId = me.id?.toString();
  const myUsername = me.username?.toLowerCase();
  const channelEntity = await client.getEntity(BigInt(channelId));
  
  // تعيين قناة الإشعارات العامة لاستخدامها في الاشتراكات الإجبارية
  notificationClient = client;
  notificationChannelEntity = channelEntity;
  
  const mentionsLog = [];

  // Event handler for new messages
  const { NewMessage } = await import('telegram/events/index.js');
  
  const handler = async (event) => {
    try {
      markClientAsUsed(client);
      const msg = event.message;
      if (!msg || !msg.peerId) return;
      
      // فقط رسائل المجموعات
      const chat = await msg.getChat();
      if (!chat || (chat.className !== 'Channel' && chat.className !== 'Chat')) return;
      if (chat.className === 'Channel' && !chat.megagroup) return; // تجاهل القنوات
      
      const sender = await msg.getSender();
      if (!sender || sender.id?.toString() === myId) return; // تجاهل رسائلي
      
      const text = msg.message || '';
      let isMention = false;
      
      // 1) تحقق من المنشنات في entities
      if (msg.entities) {
        for (const ent of msg.entities) {
          if (ent.className === 'MessageEntityMention') {
            const mentionText = text.substring(ent.offset + 1, ent.offset + ent.length).toLowerCase();
            if (mentionText === myUsername) isMention = true;
          }
          if (ent.className === 'MessageEntityMentionName' && ent.userId?.toString() === myId) {
            isMention = true;
          }
        }
      }
      
      // 2) تحقق من الرد على رسائلي
      if (msg.replyTo && msg.replyTo.replyToMsgId) {
        try {
          const repliedMsg = await client.getMessages(chat, { ids: [msg.replyTo.replyToMsgId] });
          if (repliedMsg?.[0]?.senderId?.toString() === myId) {
            isMention = true;
          }
        } catch {}
      }
      
      if (!isMention) return;

      const groupUsername = chat.username;
      const groupId = chat.id?.toString();
      let messageLink = null;
      if (groupUsername) {
        messageLink = `https://t.me/${groupUsername}/${msg.id}`;
      } else {
        // For private groups, use c/ format
        messageLink = `https://t.me/c/${groupId}/${msg.id}`;
      }

      const mentionData = {
        fromUser: {
          id: sender.id?.toString(),
          firstName: sender.firstName || '',
          lastName: sender.lastName || '',
          username: sender.username || null,
        },
        groupTitle: chat.title || '',
        groupId,
        message: text.substring(0, 500),
        messageLink,
        date: new Date().toISOString(),
      };

      mentionsLog.push(mentionData);
      if (mentionsLog.length > 100) mentionsLog.shift();

      // إرسال إشعار للقناة
      const senderName = [sender.firstName, sender.lastName].filter(Boolean).join(' ') || 'مجهول';
      const senderTag = sender.username ? ` (@${sender.username})` : '';
      const notifText = [
        `🔔 **منشن / رد جديد**`,
        `━━━━━━━━━━━━━━━`,
        ``,
        `👤 **من:** ${senderName}${senderTag}`,
        `💬 **المجموعة:** ${chat.title}`,
        ``,
        `📝 **الرسالة:**`,
        `> ${text.substring(0, 300)}`,
        ``,
        messageLink ? `🔗 [فتح الرسالة](${messageLink})` : '',
        ``,
        `━━━━━━━━━━━━━━━`,
        `🕐 ${new Date().toLocaleString('ar-u-nu-latn')}`,
      ].filter(Boolean).join('\n');

      await client.sendMessage(channelEntity, { message: notifText, parseMode: 'md' });
      console.log(`📨 Mention forwarded to channel [${taskId}] from ${sender.firstName}`);
    } catch (err) {
      console.error(`❌ Mention handler error [${taskId}]:`, err.message);
    }
  };

  client.addEventHandler(handler, new NewMessage({}));
  
  // Auto-reconnect on disconnect/timeout
  const reconnectInterval = setInterval(async () => {
    try {
      if (!client.connected) {
        console.log(`🔄 Reconnecting mentions monitor [${taskId}]...`);
        await client.connect();
        markClientAsUsed(client);
        console.log(`✅ Reconnected mentions monitor [${taskId}]`);
      }
    } catch (err) {
      console.error(`❌ Reconnect failed [${taskId}]:`, err.message);
    }
  }, 30000); // check every 30s
  
  activeMentionsMonitors.set(taskId, { handler, client, mentionsLog, reconnectInterval });
  console.log(`✅ Mentions monitor started [${taskId}]`);
  
  return { success: true, message: 'تم بدء مراقبة المنشنات والردود' };
}

/**
 * إيقاف مراقبة المنشنات
 */
async function stopMentionsMonitor({ taskId }) {
  if (activeMentionsMonitors.has(taskId)) {
    const { handler, client, reconnectInterval } = activeMentionsMonitors.get(taskId);
    try { if (reconnectInterval) clearInterval(reconnectInterval); } catch {}
    try { client.removeEventHandler(handler); } catch {}
    activeMentionsMonitors.delete(taskId);
    await releaseClientIfUnused(client, `stop mentions monitor ${taskId}`);
    console.log(`🛑 Mentions monitor stopped [${taskId}]`);
    return { success: true, message: 'تم إيقاف المراقبة' };
  }
  return { success: true, message: 'لا توجد مراقبة نشطة' };
}

/**
 * جلب المنشنات المسجلة
 */
async function getMentions({ taskId }) {
  if (activeMentionsMonitors.has(taskId)) {
    return { success: true, mentions: activeMentionsMonitors.get(taskId).mentionsLog };
  }
  return { success: true, mentions: [] };
}

// تنظيف العملاء غير المستخدمين كل 15 دقيقة
setInterval(async () => {
  const now = Date.now();
  const THIRTY_MINUTES = 30 * 60 * 1000;
  
  for (const [hash, val] of activeClients.entries()) {
    if (isClientProtected(val.client)) continue;

    if (now - val.lastUsed > THIRTY_MINUTES) {
      console.log(`🧹 Cleaning idle client: ${hash}`);
      await shutdownClient(val.client, `idle cleanup ${hash}`);
      activeClients.delete(hash);
    }
  }
}, 15 * 60 * 1000);

// ============================================================
// الرد التلقائي في الخاص (أول رسالة فقط)
// ============================================================

/**
 * بدء الرد التلقائي - يرد مرة واحدة فقط لكل شخص يراسل لأول مرة
 */
async function startAutoReply({ sessionString, replyMessage, taskId, mentionsChannelId, mediaBase64, mediaFileName, mediaMimeType }) {
  if (activeAutoReply.has(taskId)) {
    return { success: false, error: 'الرد التلقائي يعمل بالفعل بهذا المعرف' };
  }

  const client = await getOrCreateClient(sessionString);
  markClientAsUsed(client);
  const repliedUsers = new Set();
  
  let mediaBuffer = null;
  if (mediaBase64) {
    mediaBuffer = Buffer.from(mediaBase64, 'base64');
  }

  // تجهيز قناة الإشعارات
  let channelEntity = null;
  if (mentionsChannelId) {
    try {
      channelEntity = await client.getEntity(BigInt(mentionsChannelId));
    } catch (err) {
      console.error(`⚠️ Auto-reply: Could not resolve notification channel:`, err.message);
    }
  }

  const { NewMessage } = await import('telegram/events/index.js');

  const handler = async (event) => {
    try {
      markClientAsUsed(client);
      const msg = event.message;
      if (!msg || !msg.peerId) return;

      // فقط الرسائل الخاصة (PeerUser)
      if (msg.peerId.className !== 'PeerUser') return;

      // تجاهل الرسائل الصادرة منا
      if (msg.out) return;

      const senderId = msg.peerId.userId?.toString();
      if (!senderId) return;

      // تحقق: هل تم الرد على هذا الشخص مسبقاً؟
      if (repliedUsers.has(senderId)) {
        stats.autoReply.totalIgnored++;
        return;
      }

      // جلب معلومات المرسل
      let sender;
      try {
        sender = await client.getEntity(BigInt(senderId));
      } catch {
        sender = { firstName: 'مجهول', lastName: '', username: null, id: senderId };
      }

      // تجاهل البوتات
      if (sender.bot) return;

      // الرد
      if (mediaBuffer) {
        await client.sendFile(BigInt(senderId), { file: mediaBuffer, caption: replyMessage || '', fileName: mediaFileName || 'file' });
      } else {
        await client.sendMessage(BigInt(senderId), { message: replyMessage });
      }
      repliedUsers.add(senderId);
      stats.autoReply.totalReplied++;

      const senderName = [sender.firstName, sender.lastName].filter(Boolean).join(' ') || 'مجهول';
      const senderTag = sender.username ? ` (@${sender.username})` : '';

      recordStat('autoReply', {
        userId: senderId,
        userName: senderName,
        status: 'replied',
      });

      console.log(`💬 Auto-reply [${taskId}]: Replied to ${senderName} (${senderId})`);

      // إرسال إشعار للقناة
      if (channelEntity) {
        try {
          const notif = [
            `💬 **رد تلقائي**`,
            `━━━━━━━━━━━━━━━`,
            ``,
            `👤 **المرسل:** ${senderName}${senderTag}`,
            ``,
            `📩 **رسالته:**`,
            `> ${(msg.text || '').substring(0, 200)}`,
            ``,
            `✅ **تم الرد تلقائياً**`,
            ``,
            `━━━━━━━━━━━━━━━`,
            `🕐 ${new Date().toLocaleString('ar-u-nu-latn')}`,
          ].join('\n');
          await client.sendMessage(channelEntity, { message: notif, parseMode: 'md' });
        } catch {}
      }
    } catch (err) {
      console.error(`❌ Auto-reply handler error [${taskId}]:`, err.message);
    }
  };

  client.addEventHandler(handler, new NewMessage({}));

  // Auto-reconnect
  const reconnectInterval = setInterval(async () => {
    try {
      if (!client.connected) {
        console.log(`🔄 Reconnecting auto-reply [${taskId}]...`);
        await client.connect();
        markClientAsUsed(client);
      }
    } catch (err) {
      console.error(`❌ Auto-reply reconnect failed [${taskId}]:`, err.message);
    }
  }, 30000);

  activeAutoReply.set(taskId, { handler, client, repliedUsers, reconnectInterval });
  console.log(`✅ Auto-reply started [${taskId}]`);

  return { success: true, message: 'تم بدء الرد التلقائي في الخاص' };
}

/**
 * إيقاف الرد التلقائي
 */
async function stopAutoReply({ taskId }) {
  if (activeAutoReply.has(taskId)) {
    const { handler, client, repliedUsers, reconnectInterval } = activeAutoReply.get(taskId);
    try { if (reconnectInterval) clearInterval(reconnectInterval); } catch {}
    try { client.removeEventHandler(handler); } catch {}
    const totalReplied = repliedUsers.size;
    activeAutoReply.delete(taskId);
    await releaseClientIfUnused(client, `stop auto-reply ${taskId}`);
    console.log(`🛑 Auto-reply stopped [${taskId}], replied to ${totalReplied} users`);
    return { success: true, message: `تم إيقاف الرد التلقائي (تم الرد على ${totalReplied} شخص)` };
  }
  return { success: true, message: 'لا يوجد رد تلقائي نشط' };
}

/**
 * حالة الرد التلقائي
 */
function getAutoReplyStatus({ taskId }) {
  if (activeAutoReply.has(taskId)) {
    const { repliedUsers } = activeAutoReply.get(taskId);
    return { success: true, active: true, repliedCount: repliedUsers.size };
  }
  return { success: true, active: false, repliedCount: 0 };
}

// ============================================================
// مراقب الرسائل المحذوفة (Anti-Delete)
// ============================================================

/**
 * بدء مراقبة الرسائل المحذوفة
 * يحفظ نسخة من كل رسالة واردة، وعند حذفها يرسلها للقناة
 */
async function startAntiDelete({ sessionString, taskId, mentionsChannelId }) {
  if (activeAntiDelete.has(taskId)) {
    return { success: false, error: 'مراقب الحذف يعمل بالفعل' };
  }

  const client = await getOrCreateClient(sessionString);

  // قناة الإشعارات
  let channelEntity = null;
  if (mentionsChannelId) {
    try {
      channelEntity = await client.getEntity(BigInt(mentionsChannelId));
    } catch (err) {
      console.error(`⚠️ Anti-delete: Could not resolve notification channel:`, err.message);
    }
  }

  if (!channelEntity) {
    return { success: false, error: 'يجب تحديد قناة الإشعارات أولاً من "مراقب المنشنات"' };
  }

  // كاش الرسائل: msgId → { text, senderId, senderName, chatTitle, chatId, media, date }
  const messageCache = new Map();
  const MAX_CACHE = 5000;

  const { NewMessage } = await import('telegram/events/index.js');
  const { DeletedMessage } = await import('telegram/events/index.js');

  // Handler 1: حفظ نسخة من كل رسالة جديدة
  const newMsgHandler = async (event) => {
    try {
      const msg = event.message;
      if (!msg) return;

      // جلب معلومات المرسل والمحادثة
      let senderName = 'مجهول';
      let senderId = '';
      let senderUsername = null;
      let chatTitle = 'محادثة خاصة';
      let chatId = '';

      try {
        if (msg.senderId) {
          senderId = msg.senderId.toString();
          const sender = await client.getEntity(msg.senderId);
          senderName = [sender.firstName, sender.lastName].filter(Boolean).join(' ') || 'مجهول';
          senderUsername = sender.username || null;
        }
      } catch {}

      try {
        if (msg.peerId) {
          if (msg.peerId.className === 'PeerUser') {
            chatId = msg.peerId.userId?.toString() || '';
            chatTitle = senderName; // في الخاص = اسم المرسل
          } else if (msg.peerId.className === 'PeerChannel' || msg.peerId.className === 'PeerChat') {
            const chatEntityId = msg.peerId.channelId || msg.peerId.chatId;
            chatId = chatEntityId?.toString() || '';
            try {
              const chat = await client.getEntity(BigInt('-100' + chatId));
              chatTitle = chat.title || chatId;
            } catch {
              chatTitle = `مجموعة (${chatId})`;
            }
          }
        }
      } catch {}

      // حفظ في الكاش
      const cacheEntry = {
        text: msg.text || '',
        senderId,
        senderName,
        senderUsername,
        chatTitle,
        chatId,
        hasMedia: !!msg.media,
        mediaType: msg.media?.className || null,
        date: new Date().toISOString(),
      };

      // محاولة حفظ الميديا كـ buffer
      if (msg.media) {
        try {
          const buffer = await client.downloadMedia(msg.media, { workers: 1 });
          if (buffer && buffer.length < 10 * 1024 * 1024) { // أقل من 10MB
            cacheEntry.mediaBuffer = buffer;
            cacheEntry.mediaFileName = msg.file?.name || null;
          }
        } catch {}
      }

      messageCache.set(msg.id, cacheEntry);

      // تنظيف الكاش القديم
      if (messageCache.size > MAX_CACHE) {
        const keys = Array.from(messageCache.keys());
        for (let i = 0; i < keys.length - MAX_CACHE; i++) {
          messageCache.delete(keys[i]);
        }
      }
    } catch (err) {
      // صامت - لا نريد إيقاف التدفق
    }
  };

  // Handler 2: مراقبة الحذف
  const deleteHandler = async (event) => {
    try {
      const deletedIds = event.deletedIds || [];
      
      for (const msgId of deletedIds) {
        const cached = messageCache.get(msgId);
        if (!cached) continue;

        messageCache.delete(msgId);

        const senderTag = cached.senderUsername ? ` (@${cached.senderUsername})` : '';

        // إرسال إشعار نصي
        const notifLines = [
          `🗑️ **رسالة محذوفة**`,
          `━━━━━━━━━━━━━━━`,
          ``,
          `👤 **من:** ${cached.senderName}${senderTag}`,
          `💬 **المحادثة:** ${cached.chatTitle}`,
          ``,
        ];

        if (cached.text) {
          notifLines.push(`📝 **النص:**`);
          notifLines.push(`> ${cached.text.substring(0, 500)}`);
          notifLines.push(``);
        }

        if (cached.hasMedia) {
          notifLines.push(`📎 **نوع المرفق:** ${cached.mediaType || 'ملف'}`);
          notifLines.push(``);
        }

        notifLines.push(`━━━━━━━━━━━━━━━`);
        notifLines.push(`🕐 حُذفت: ${new Date().toLocaleString('ar-u-nu-latn')}`);
        notifLines.push(`📅 أُرسلت: ${new Date(cached.date).toLocaleString('ar-u-nu-latn')}`);

        await client.sendMessage(channelEntity, { 
          message: notifLines.join('\n'), 
          parseMode: 'md' 
        });

        // إرسال الميديا المحفوظة
        if (cached.mediaBuffer) {
          try {
            await client.sendFile(channelEntity, {
              file: Buffer.from(cached.mediaBuffer),
              caption: `📎 مرفق الرسالة المحذوفة من ${cached.senderName}`,
              fileName: cached.mediaFileName || 'deleted_media',
            });
          } catch (mediaErr) {
            console.error(`⚠️ Anti-delete: Could not send cached media:`, mediaErr.message);
          }
        }

        console.log(`🗑️ Anti-delete [${taskId}]: Captured deleted msg from ${cached.senderName} in ${cached.chatTitle}`);
      }
    } catch (err) {
      console.error(`❌ Anti-delete handler error [${taskId}]:`, err.message);
    }
  };

  client.addEventHandler(newMsgHandler, new NewMessage({}));
  client.addEventHandler(deleteHandler, new DeletedMessage({}));

  // Auto-reconnect
  const reconnectInterval = setInterval(async () => {
    try {
      if (!client.connected) {
        console.log(`🔄 Reconnecting anti-delete [${taskId}]...`);
        await client.connect();
      }
    } catch (err) {
      console.error(`❌ Anti-delete reconnect failed [${taskId}]:`, err.message);
    }
  }, 30000);

  activeAntiDelete.set(taskId, { 
    handlers: [newMsgHandler, deleteHandler], 
    client, 
    messageCache, 
    reconnectInterval 
  });

  console.log(`✅ Anti-delete started [${taskId}]`);
  return { success: true, message: 'تم بدء مراقبة الرسائل المحذوفة' };
}

/**
 * إيقاف مراقب الحذف
 */
async function stopAntiDelete({ taskId }) {
  if (activeAntiDelete.has(taskId)) {
    const { handlers, client, messageCache, reconnectInterval } = activeAntiDelete.get(taskId);
    try { if (reconnectInterval) clearInterval(reconnectInterval); } catch {}
    for (const handler of handlers) {
      try { client.removeEventHandler(handler); } catch {}
    }
    const cachedCount = messageCache.size;
    messageCache.clear();
    activeAntiDelete.delete(taskId);
    console.log(`🛑 Anti-delete stopped [${taskId}], had ${cachedCount} cached msgs`);
    return { success: true, message: 'تم إيقاف مراقب الحذف' };
  }
  return { success: true, message: 'لا يوجد مراقب حذف نشط' };
}

/**
 * حالة مراقب الحذف
 */
function getAntiDeleteStatus({ taskId }) {
  if (activeAntiDelete.has(taskId)) {
    const { messageCache } = activeAntiDelete.get(taskId);
    return { success: true, active: true, cachedMessages: messageCache.size };
  }
  return { success: true, active: false, cachedMessages: 0 };
}

/**
 * جلب الإيموجي البريميوم من حساب المستخدم
 */
async function getPremiumEmojis({ sessionString }) {
  const client = await getOrCreateClient(sessionString);
  try {
    // جلب مجموعات الإيموجي البريميوم
    const result = await client.invoke(
      new Api.messages.GetEmojiStickers({ hash: 0 })
    );

    const emojis = [];

    if (result?.sets) {
      for (const stickerSet of result.sets) {
        try {
          // جلب محتوى كل مجموعة
          const fullSet = await client.invoke(
            new Api.messages.GetStickerSet({
              stickerset: new Api.InputStickerSetID({
                id: stickerSet.id,
                accessHash: stickerSet.accessHash,
              }),
              hash: 0,
            })
          );

          if (fullSet?.documents) {
            for (const doc of fullSet.documents) {
              // استخراج الإيموجي البديلة من الـ attributes
              let emoticon = '✨';
              for (const attr of doc.attributes || []) {
                if (attr.className === 'DocumentAttributeCustomEmoji' || attr.alt) {
                  emoticon = attr.alt || emoticon;
                  break;
                }
              }

              emojis.push({
                documentId: doc.id.toString(),
                accessHash: doc.accessHash.toString(),
                emoticon,
                stickerSetTitle: stickerSet.title || 'إيموجي بريميوم',
              });
            }
          }
        } catch (setErr) {
          console.warn(`⚠️ Failed to fetch sticker set ${stickerSet.title}:`, setErr.message);
        }
      }
    }

    console.log(`✅ Fetched ${emojis.length} premium emojis`);
    return { success: true, emojis };
  } catch (err) {
    console.error('❌ Get premium emojis error:', err.message);
    throw err;
  }
}

export default {
  fetchGroups,
  fetchContacts,
  fetchDialogs,
  startAutoPublish,
  stopAutoPublish,
  getAutoPublishStatus,
  broadcast,
  getProfile,
  updateProfile,
  updateProfilePhoto,
  deleteProfilePhoto,
  fetchChannels,
  createMentionsChannel,
  startMentionsMonitor,
  stopMentionsMonitor,
  getMentions,
  getStats,
  startAutoReply,
  stopAutoReply,
  getAutoReplyStatus,
  startAntiDelete,
  stopAntiDelete,
  getAntiDeleteStatus,
  getPremiumEmojis,
};
