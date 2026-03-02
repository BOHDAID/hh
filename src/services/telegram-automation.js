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
      deviceModel: 'Angel Store Bot',
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
  
  const groups = [];
  for (const dialog of dialogs) {
    const entity = dialog.entity;
    if (!entity) continue;
    
    // مجموعات وقنوات فقط
    const isGroup = entity.className === 'Channel' || entity.className === 'Chat';
    const isSupergroup = entity.megagroup === true;
    const isChannel = entity.className === 'Channel' && !entity.megagroup;
    
    if (!isGroup || isChannel) continue;

    const photoUrl = null; // تخطي الصور لتسريع الجلب

    groups.push({
      id: entity.id?.toString(),
      title: entity.title || 'بدون اسم',
      username: entity.username || null,
      participantsCount: entity.participantsCount || 0,
      photo: photoUrl,
      type: isChannel ? 'channel' : (isSupergroup ? 'supergroup' : 'group'),
    });
  }

  console.log(`✅ Fetched ${groups.length} groups/channels`);
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
 * بث رسالة خاصة لجميع جهات الاتصال (مع استثناء blacklist)
 */
async function broadcast({ sessionString, message, blacklistIds = [], taskId }) {
  const client = await getOrCreateClient(sessionString);
  
  // جلب جميع جهات الاتصال
  const result = await client.invoke(new Api.contacts.GetContacts({ hash: BigInt(0) }));
  
  const blacklistSet = new Set(blacklistIds.map(String));
  let sentCount = 0;
  let failedCount = 0;
  const errors = [];

  if (result.users) {
    for (const user of result.users) {
      if (user.bot || user.deleted || user.self) continue;
      if (blacklistSet.has(user.id?.toString())) continue;

      try {
        await client.sendMessage(user, { message });
        sentCount++;
        console.log(`📤 Broadcast [${taskId}]: Sent to ${user.firstName || user.id}`);
        
        // تأخير بسيط لتجنب الحظر
        await new Promise(r => setTimeout(r, 1500));
      } catch (err) {
        failedCount++;
        errors.push({ userId: user.id?.toString(), error: err.message });
        console.error(`❌ Broadcast [${taskId}]: Failed for ${user.id}:`, err.message);
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
  startAutoPublish,
  stopAutoPublish,
  getAutoPublishStatus,
  broadcast,
};
