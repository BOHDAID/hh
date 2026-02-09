
# خطة: إصلاح نظام OSN الآلي (Email + OTP بدون كلمة مرور)

## فهم المشكلة

الكود الحالي يفترض خطأً أن OSN يحتاج:
- Email + Password ← **خطأ!**

الواقع أن OSN يعمل هكذا:
- Email فقط → OSN يرسل OTP للـ Email → إدخال OTP → تم الدخول

---

## التدفق الصحيح

```text
┌─────────────────────────────────────────────────────────────────┐
│               التدفق الصحيح لـ OSN                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📌 إعداد المنتج (في لوحة التحكم):                              │
│     ├─ اختيار المنتج: OSN                                       │
│     ├─ Gmail Address: example@gmail.com (حساب OSN)             │
│     ├─ Gmail App Password: xxxx xxxx xxxx xxxx (لقراءة IMAP)   │
│     └─ نوع التفعيل: QR أو OTP                                  │
│                                                                 │
│  🚀 تشغيل السيرفر (مرة واحدة):                                  │
│     ├─ المتصفح يفتح https://stream.osn.com/login               │
│     ├─ يدخل Email فقط (بدون password!)                         │
│     ├─ يضغط "Continue" أو "Next"                               │
│     ├─ OSN يرسل OTP إلى Gmail                                  │
│     ├─ النظام يقرأ OTP من Gmail عبر IMAP                       │
│     ├─ يدخل OTP ← تسجيل دخول ناجح                              │
│     └─ الجلسة تبقى مفتوحة وجاهزة ✅                             │
│                                                                 │
│  👤 عميل يشتري ويرسل كود التفعيل:                              │
│     ├─ إذا QR: النظام يجلب QR من صفحة إضافة جهاز              │
│     └─ إذا OTP: النظام يقرأ آخر OTP من Gmail ويرسله           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## التغييرات المطلوبة

### 1. تحديث جدول otp_configurations

إعادة تسمية الحقول لتوضيح الغرض:

| الحقل الحالي | المقترح | الشرح |
|-------------|---------|-------|
| gmail_address | osn_email | إيميل حساب OSN |
| gmail_app_password | gmail_imap_password | App Password لقراءة OTP من Gmail |

**ملاحظة:** يمكن الإبقاء على الأسماء الحالية مع تحديث التسميات في الواجهة فقط.

### 2. إنشاء خدمة قراءة Gmail (IMAP)

ملف جديد: `src/services/gmail-reader.js`

```javascript
import Imap from 'imap';
import { simpleParser } from 'mailparser';

class GmailReader {
  constructor(email, appPassword) {
    this.config = {
      user: email,
      password: appPassword,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
    };
  }

  async getLatestOTP(maxAgeMinutes = 5) {
    // الاتصال بـ Gmail عبر IMAP
    // البحث في آخر 5 دقائق
    // استخراج رمز OTP (4-8 أرقام)
  }
}
```

### 3. تحديث خدمة OSN Automation

ملف: `src/services/osn-automation.js`

**التغييرات:**
- إزالة حقل password من الدالة
- تعديل التدفق ليكون: Email → انتظار → قراءة OTP → إدخاله

```javascript
async loginWithEmailOTP(email, gmailReader) {
  // 1. فتح صفحة OSN
  // 2. إدخال Email فقط
  // 3. الضغط على Continue
  // 4. انتظار 5 ثواني ليصل OTP
  // 5. قراءة OTP من Gmail
  // 6. إدخال OTP
  // 7. تأكيد الدخول
}
```

### 4. إنشاء مدير الجلسة المستمرة

ملف جديد: `src/services/session-manager.js`

```javascript
class OSNSessionManager {
  constructor() {
    this.browser = null;
    this.page = null;
    this.isLoggedIn = false;
    this.gmailReader = null;
  }

  // تهيئة الجلسة عند بدء السيرفر
  async initialize(email, gmailAppPassword) {
    this.gmailReader = new GmailReader(email, gmailAppPassword);
    await this.login(email);
  }

  // تسجيل الدخول بـ Email + OTP
  async login(email) {
    // فتح المتصفح
    // إدخال email
    // انتظار OTP
    // قراءة OTP من Gmail
    // إدخاله
    // الحفاظ على الجلسة مفتوحة
  }

  // جلب QR للعميل
  async getQRCode() {
    // الذهاب لصفحة إضافة جهاز
    // التقاط صورة QR
  }

  // جلب OTP للعميل
  async getClientOTP() {
    // قراءة آخر OTP من Gmail
  }
}
```

### 5. تحديث server.js

إضافة تهيئة الجلسة عند بدء السيرفر:

```javascript
import sessionManager from './src/services/session-manager.js';

// عند بدء السيرفر
app.listen(PORT, async () => {
  console.log('🚀 Server starting...');
  
  // تهيئة جلسة OSN
  const osnEmail = process.env.OSN_EMAIL;
  const gmailPassword = process.env.GMAIL_APP_PASSWORD;
  
  if (osnEmail && gmailPassword) {
    await sessionManager.initialize(osnEmail, gmailPassword);
    console.log('✅ OSN session initialized');
  }
});
```

### 6. تحديث API Routes

ملف: `src/routes/qr-automation.js`

```javascript
// جلب QR (للتفعيل على TV)
router.post('/get-qr', async (req, res) => {
  const qrImage = await sessionManager.getQRCode();
  res.json({ success: true, qrImage });
});

// جلب OTP (للتفعيل على الجوال)
router.post('/get-otp', async (req, res) => {
  const otp = await sessionManager.getClientOTP();
  res.json({ success: true, otp });
});

// حالة الجلسة
router.get('/session-status', (req, res) => {
  res.json({ 
    loggedIn: sessionManager.isLoggedIn,
    email: sessionManager.currentEmail 
  });
});
```

### 7. تحديث بوت تيليجرام

تعديل طريقة استدعاء API:

```typescript
// بدلاً من إرسال email + password
// نستدعي فقط get-qr أو get-otp

if (activationType === "qr") {
  const result = await fetch(`${renderUrl}/api/qr/get-qr`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret }),
  });
  // إرسال QR للعميل
}

if (activationType === "otp") {
  const result = await fetch(`${renderUrl}/api/qr/get-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret }),
  });
  // إرسال OTP للعميل
}
```

---

## الحزم المطلوبة

```json
{
  "imap": "^0.8.19",
  "mailparser": "^3.6.5"
}
```

---

## المتغيرات البيئية (Environment Variables)

| المتغير | الوصف | أين يُستخدم |
|---------|-------|-------------|
| OSN_EMAIL | إيميل حساب OSN | خادم Render |
| GMAIL_APP_PASSWORD | App Password للـ IMAP | خادم Render |
| QR_AUTOMATION_SECRET | مفتاح تأمين API | خادم Render + Edge Function |
| RENDER_SERVER_URL | رابط خادم Render | Edge Function |

---

## ملخص الملفات

| الملف | الحالة | الوصف |
|-------|--------|-------|
| src/services/gmail-reader.js | جديد | قراءة OTP من Gmail عبر IMAP |
| src/services/session-manager.js | جديد | إدارة جلسة OSN المستمرة |
| src/services/osn-automation.js | تعديل | تغيير التدفق لـ Email + OTP |
| src/routes/qr-automation.js | تعديل | إضافة endpoints جديدة |
| server.js | تعديل | تهيئة الجلسة عند البدء |
| supabase/functions/telegram-bot-webhook/index.ts | تعديل | تحديث استدعاءات API |
| src/components/admin/OtpConfigurationsManager.tsx | تعديل | توضيح التسميات |

---

## ملاحظات مهمة

1. **الجلسة المستمرة**: إذا أعاد Render تشغيل السيرفر، يجب إعادة تسجيل الدخول تلقائياً.

2. **مراقبة الجلسة**: إضافة نظام للتحقق من صلاحية الجلسة كل فترة.

3. **معالجة الأخطاء**: إذا انتهت الجلسة، إشعار الأدمن عبر تيليجرام.

4. **واجهة OSN**: قد تتغير السيلكتورات، تحتاج صيانة دورية.
