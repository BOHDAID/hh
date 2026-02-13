

# خطة تحسين Puppeteer لتجاوز حظر Crunchyroll

## المشكلة الجذرية

Crunchyroll يكتشف أن الطلبات تأتي من سيرفر (Datacenter IP) ويحظر تنفيذ JavaScript، مما يعني أن الصفحة تحمل لكن بدون أي محتوى في body. الحلول البديلة (fetch مباشر) ترجع 200 لكن لا ترسل الإيميل فعلياً.

بالإضافة لذلك، خطأ "بيانات Gmail غير متوفرة" يشير إلى أن gmailAddress أو gmailAppPassword لا يصلان للدالة.

## التعديلات المطلوبة

### 1. تحسين إعدادات المتصفح (session-manager.js)

**في دالة `_applyStealthToPage`:**
- إضافة `Accept-Language: en-US,en;q=0.9` كأولوية (بدون العربية) لضمان تحميل النسخة الإنجليزية
- تحديث User-Agent لأحدث إصدار Chrome (132+)

**في دالة `_withBrowser`:**
- تحديث executablePath ليستخدم `/usr/bin/google-chrome-stable` بشكل موحد
- إضافة `--disable-features=IsolateOrigins,site-per-process` لتقليل الكشف

### 2. إعادة كتابة دالة `crunchyrollChangePassword` بالكامل

**المنطق الجديد:**

```text
الخطوة 1: فتح صفحة reset-password بالإنجليزية
         URL: https://sso.crunchyroll.com/en/reset-password
         
الخطوة 2: انتظار hydration بشكل أطول (30 ثانية)
         - فحص كل 2 ثانية لوجود أي input
         - استخدام waitForSelector بدلاً من polling يدوي
         
الخطوة 3: إذا وُجد input[name="email"] أو input[type="email"]
         - استخدام page.type مع delay: 150 (محاكاة كتابة بشرية)
         - انتظار 1 ثانية بعد الكتابة
         - الضغط على زر Submit
         - انتظار ظهور رسالة نجاح قبل المتابعة
         
الخطوة 4: إذا لم يُعثر على input (IP محظور)
         - لا نستخدم fetch/form-post (لا تعمل فعلياً)
         - نرجع رسالة خطأ واضحة تطلب من المستخدم إعداد Proxy
```

### 3. إصلاح مشكلة بيانات Gmail المفقودة

سأتتبع كيف يتم استدعاء `crunchyrollChangePassword` من البوت للتأكد من تمرير `gmailAddress` و `gmailAppPassword` بشكل صحيح. اللوقات تظهر أن هذه القيم لا تصل للدالة.

### 4. إضافة دعم Proxy (اختياري)

إضافة دعم لمتغير بيئة `PROXY_URL` في Render:
- إذا كان موجوداً، يُستخدم كـ Residential Proxy في Puppeteer
- هذا هو الحل الحقيقي لمشكلة حظر IP

## التفاصيل التقنية

### الملفات المتأثرة:
- `src/services/session-manager.js` - تحسين المتصفح وإعادة كتابة دالة Crunchyroll
- `src/services/telegram-bot.js` - التأكد من تمرير بيانات Gmail للدالة
- `src/routes/qr-automation.js` - التأكد من تمرير البيانات من API endpoint

### ملاحظة مهمة:
إذا كان IP السيرفر (Render) محظوراً من Crunchyroll، فإن الحل الوحيد المضمون هو استخدام Residential Proxy. بدونه، حتى أفضل تقنيات التخفي لن تعمل لأن Crunchyroll يحظر بناءً على نطاق IP وليس فقط بصمة المتصفح.

