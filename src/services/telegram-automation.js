// ============================================================
// Telegram Automation Services
// جلب المجموعات، النشر التلقائي، البث، Blacklist
// ============================================================

import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

// تخزين مؤقت للعملاء المتصلين (sessionHash → client)
const activeClients = new Map();
// تخزين مؤقت للنشر التلقائي الجاري (taskId → interval)
const activeAutoPublish = new Map();
// تخزين مؤقت للقنوات المنضمة إجبارياً (channelId → { leaveAt, sessionString })
const forcedJoins = new Map();
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
    history: [], // آخر 100 عملية { timestamp, groupId, groupTitle, status, error? }
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

async function getOrCreateClient(sessionString) {
  const hash = getSessionHash(sessionString);
  
  if (activeClients.has(hash)) {
    const existing = activeClients.get(hash);
    if (existing.client.connected) {
      existing.lastUsed = Date.now();
      return existing.client;
    }
    // إعادة الاتصال
    try { await existing.client.disconnect(); } catch {}
    activeClients.delete(hash);
  }

  const client = new TelegramClient(
    new StringSession(sessionString),
    2040,
    'b18441a1ff607e10a989891a5462e627',
    {
      connectionRetries: 10,
      retryDelay: 2000,
      autoReconnect: true,
      deviceModel: 'ninto Store Bot',
      systemVersion: 'Linux',
      appVersion: '1.0.0',
    }
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
 * يكتشف القنوات المطلوبة ويشترك فيها ثم يجدول الخروج بعد 24 ساعة
 */
async function handleForcedSubscription({ client, peer, groupId, channelId }) {
  try {
    // جلب معلومات المجموعة الكاملة للبحث عن القنوات المرتبطة
    const fullChat = await client.invoke(new Api.channels.GetFullChannel({ channel: peer }));
    const linkedChatId = fullChat?.fullChat?.linkedChatId;
    
    // جلب آخر رسالة من البوت للبحث عن روابط القنوات الإجبارية
    const messages = await client.getMessages(peer, { limit: 20 });
    const joinLinks = new Set();
    
    for (const msg of messages) {
      if (!msg?.message) continue;
      
      // البحث عن روابط t.me في الرسائل
      const linkMatches = msg.message.match(/(?:https?:\/\/)?t\.me\/(?:\+|joinchat\/)?([a-zA-Z0-9_]+)/g);
      if (linkMatches) {
        for (const link of linkMatches) joinLinks.add(link);
      }
      
      // البحث عن @username في النص (مثل @x_f_r) - نمط بوتات الاشتراك الإجباري
      const usernameMatches = msg.message.match(/@([a-zA-Z][a-zA-Z0-9_]{3,})/g);
      if (usernameMatches) {
        for (const uMatch of usernameMatches) {
          const username = uMatch.replace('@', '');
          // تجاهل اليوزرنيمات القصيرة جداً أو الشائعة (بوتات)
          if (username.length >= 4 && !username.toLowerCase().endsWith('bot')) {
            joinLinks.add(`t.me/${username}`);
          }
        }
      }

      // البحث في entities الرسالة عن mentions مباشرة
      if (msg.entities) {
        for (const entity of msg.entities) {
          // MessageEntityMention = @username
          if (entity.className === 'MessageEntityMention') {
            const mention = msg.message.substring(entity.offset, entity.offset + entity.length);
            const username = mention.replace('@', '');
            if (username.length >= 4 && !username.toLowerCase().endsWith('bot')) {
              joinLinks.add(`t.me/${username}`);
            }
          }
          // MessageEntityTextUrl = رابط مخفي في النص
          if (entity.className === 'MessageEntityTextUrl' && entity.url?.includes('t.me/')) {
            joinLinks.add(entity.url);
          }
        }
      }
      
      // البحث عن أزرار inline التي تحتوي على روابط
      if (msg.replyMarkup?.rows) {
        for (const row of msg.replyMarkup.rows) {
          for (const btn of (row.buttons || [])) {
            if (btn.url && btn.url.includes('t.me/')) {
              joinLinks.add(btn.url);
            }
            // أزرار callback قد تحتوي على معلومات القناة
            if (btn.text && btn.text.includes('@')) {
              const btnUsername = btn.text.match(/@([a-zA-Z][a-zA-Z0-9_]{3,})/);
              if (btnUsername && !btnUsername[1].toLowerCase().endsWith('bot')) {
                joinLinks.add(`t.me/${btnUsername[1]}`);
              }
            }
          }
        }
      }
    }

    if (linkedChatId) {
      joinLinks.add(`linked:${linkedChatId}`);
    }

    if (joinLinks.size === 0) {
      console.log(`⚠️ No forced subscription channels found for group ${groupId}`);
      return { joined: false, channels: [] };
    }

    const joinedChannels = [];

    for (const link of joinLinks) {
      try {
        let targetEntity;
        let channelTitle = '';

        if (link.startsWith('linked:')) {
          const id = link.replace('linked:', '');
          targetEntity = await client.getEntity(BigInt(id));
          channelTitle = targetEntity.title || id;
        } else {
          // استخراج username أو invite hash
          const cleanLink = link.replace(/https?:\/\//, '');
          const parts = cleanLink.replace('t.me/', '').replace('+', '').replace('joinchat/', '');
          
          if (parts.includes('/')) continue; // تجاهل روابط الرسائل
          
          try {
            targetEntity = await client.getEntity(parts);
            channelTitle = targetEntity.title || parts;
          } catch {
            // محاولة كـ invite link
            try {
              const inviteResult = await client.invoke(new Api.messages.ImportChatInvite({ hash: parts }));
              channelTitle = inviteResult?.chats?.[0]?.title || parts;
              joinedChannels.push({ id: parts, title: channelTitle, link, method: 'invite' });
              
              // جدولة الخروج بعد 24 ساعة
              scheduleForcedLeave(client, inviteResult?.chats?.[0], parts, channelTitle);
              continue;
            } catch (invErr) {
              console.log(`⚠️ Can't join via invite ${link}: ${invErr.message}`);
              continue;
            }
          }
        }

        if (!targetEntity) continue;

        // التحقق هل نحن مشتركين أصلاً
        try {
          const participant = await client.invoke(new Api.channels.GetParticipant({
            channel: targetEntity,
            participant: new Api.InputPeerSelf(),
          }));
          // مشتركين أصلاً - لا حاجة للانضمام
          console.log(`✅ Already subscribed to ${channelTitle}`);
          continue;
        } catch {
          // غير مشتركين - نحتاج للانضمام
        }

        // الانضمام
        await client.invoke(new Api.channels.JoinChannel({ channel: targetEntity }));
        console.log(`✅ Force-joined: ${channelTitle}`);
        joinedChannels.push({ 
          id: targetEntity.id?.toString(), 
          title: channelTitle, 
          link,
          method: 'join'
        });

        // جدولة الخروج بعد 24 ساعة
        scheduleForcedLeave(client, targetEntity, targetEntity.id?.toString(), channelTitle);

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
  
  // تسجيل في القائمة
  forcedJoins.set(channelId, {
    joinedAt: Date.now(),
    leaveAt: Date.now() + TWENTY_FOUR_HOURS,
    title: channelTitle,
  });

  setTimeout(async () => {
    try {
      if (entity) {
        await client.invoke(new Api.channels.LeaveChannel({ channel: entity }));
        console.log(`👋 Auto-left forced channel: ${channelTitle} (after 24h)`);
      }
      forcedJoins.delete(channelId);

      // إرسال إشعار للقناة
      if (notificationClient && notificationChannelEntity) {
        try {
          const notif = `📤 **خروج تلقائي**\n\n🚪 تم الخروج من القناة/المجموعة: **${channelTitle}**\n⏱ السبب: انتهاء مدة الـ 24 ساعة (اشتراك إجباري)\n🕐 الوقت: ${new Date().toLocaleString('ar')}`;
          await notificationClient.sendMessage(notificationChannelEntity, { message: notif, parseMode: 'md' });
        } catch {}
      }
    } catch (err) {
      console.error(`❌ Auto-leave failed for ${channelTitle}:`, err.message);
      forcedJoins.delete(channelId);
    }
  }, TWENTY_FOUR_HOURS);

  console.log(`⏰ Scheduled auto-leave for ${channelTitle} in 24h`);
}

/**
 * إرسال إشعار اشتراك إجباري للقناة
 */
async function notifyForcedJoin(client, channelEntity, groupTitle, joinedChannels) {
  if (!channelEntity) return;
  try {
    const channelsList = joinedChannels.map(c => `  • ${c.title}`).join('\n');
    const notif = [
      `🔐 **اشتراك إجباري تلقائي**`,
      ``,
      `💬 **المجموعة:** ${groupTitle}`,
      `📋 **القنوات المنضمة:**`,
      channelsList,
      ``,
      `⏱ سيتم الخروج تلقائياً بعد **24 ساعة**`,
      `🕐 **الوقت:** ${new Date().toLocaleString('ar')}`,
    ].join('\n');
    await client.sendMessage(channelEntity, { message: notif, parseMode: 'md' });
  } catch (err) {
    console.error(`❌ Notify forced join error:`, err.message);
  }
}

/**
 * النشر التلقائي - إرسال رسالة لكل المجموعات المختارة بفاصل زمني
 */
async function startAutoPublish({ sessionString, groupIds, message, intervalMinutes, taskId, mentionsChannelId }) {
  // إيقاف أي نشر سابق لنفس المهمة
  if (activeAutoPublish.has(taskId)) {
    clearInterval(activeAutoPublish.get(taskId).interval);
    activeAutoPublish.delete(taskId);
  }

  const client = await getOrCreateClient(sessionString);
  
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
    if (currentIndex >= groupIds.length) {
      currentIndex = 0; // إعادة من البداية (دورة)
    }

    const groupId = groupIds[currentIndex];
    try {
      const peer = await client.getEntity(BigInt(groupId));
      await client.sendMessage(peer, { message });
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
async function broadcast({ sessionString, message, blacklistIds = [], includeContacts = false, taskId }) {
  const client = await getOrCreateClient(sessionString);
  
  const blacklistSet = new Set(blacklistIds.map(String));
  const sentIds = new Set();
  let sentCount = 0;
  let failedCount = 0;
  const errors = [];

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
      await client.sendMessage(entity, { message });
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
          await client.sendMessage(user, { message });
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
      const notifText = [
        `🔔 **منشن/رد جديد**`,
        ``,
        `👤 **من:** ${sender.firstName || ''} ${sender.lastName || ''} ${sender.username ? `(@${sender.username})` : ''} [ID: ${sender.id}]`,
        `💬 **المجموعة:** ${chat.title}`,
        `📝 **الرسالة:** ${text.substring(0, 300)}`,
        `🕐 **الوقت:** ${new Date().toLocaleString('ar')}`,
        messageLink ? `🔗 **الرابط:** ${messageLink}` : '',
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
setInterval(() => {
  const now = Date.now();
  const THIRTY_MINUTES = 30 * 60 * 1000;
  
  for (const [hash, val] of activeClients.entries()) {
    if (now - val.lastUsed > THIRTY_MINUTES) {
      console.log(`🧹 Cleaning idle client: ${hash}`);
      try { val.client.disconnect(); } catch {}
      activeClients.delete(hash);
    }
  }
}, 15 * 60 * 1000);

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
};
