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
      connectionRetries: 3,
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
async function startAutoPublish({ sessionString, groupIds, message, intervalMinutes, taskId }) {
  // إيقاف أي نشر سابق لنفس المهمة
  if (activeAutoPublish.has(taskId)) {
    clearInterval(activeAutoPublish.get(taskId).interval);
    activeAutoPublish.delete(taskId);
  }

  const client = await getOrCreateClient(sessionString);
  
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
      console.log(`📤 Auto-publish [${taskId}]: Sent to group ${groupId} (${sentCount} total)`);
    } catch (err) {
      console.error(`❌ Auto-publish [${taskId}]: Failed for group ${groupId}:`, err.message);
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
  
  // رفع الصورة
  const file = await client.uploadFile({
    file: photoBuffer,
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
 * جلب القنوات التي أنا أدمن فيها
 */
async function fetchChannels({ sessionString }) {
  const client = await getOrCreateClient(sessionString);
  const dialogs = await client.getDialogs({ limit: 500 });
  
  const channels = [];
  for (const dialog of dialogs) {
    const entity = dialog.entity;
    if (!entity) continue;
    // فقط القنوات (وليس المجموعات)
    const isChannel = entity.className === 'Channel' && !entity.megagroup;
    if (!isChannel) continue;
    // تحقق أن لدي صلاحية الإرسال (أدمن أو creator)
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
  
  activeMentionsMonitors.set(taskId, { handler, client, mentionsLog });
  console.log(`✅ Mentions monitor started [${taskId}]`);
  
  return { success: true, message: 'تم بدء مراقبة المنشنات والردود' };
}

/**
 * إيقاف مراقبة المنشنات
 */
async function stopMentionsMonitor({ taskId }) {
  if (activeMentionsMonitors.has(taskId)) {
    const { handler, client } = activeMentionsMonitors.get(taskId);
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
  startMentionsMonitor,
  stopMentionsMonitor,
  getMentions,
};
