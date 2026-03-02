

# خطة التطوير الشاملة - Level Max

هذه الخطة تغطي الأربع مجالات اللي اخترتها: الأمان، الأداء، الإيميل ماركتنق، والذكاء الاصطناعي. بنقسمها لمراحل عشان ما نكسر شي.

---

## المرحلة 1: الأمان والحماية 🔒

### 1.1 سجل أنشطة الأدمن (Admin Activity Log)
- إنشاء جدول `admin_activity_logs` يسجل كل عملية (إضافة/تعديل/حذف) في لوحة التحكم
- الأعمدة: `user_id`, `action` (create/update/delete), `target_type` (product/order/user...), `target_id`, `details` (JSON), `ip_address`, `created_at`
- إنشاء دالة مساعدة `logAdminAction()` تُستدعى من كل عملية في لوحة الأدمن
- إضافة تبويب "السجلات" في لوحة الأدمن لعرض النشاطات مع فلاتر بالتاريخ والنوع

### 1.2 تشفير البيانات الحساسة
- تشفير حقل `account_data` في `product_accounts` باستخدام Edge Function
- إنشاء Edge Function `encrypt-decrypt` للتشفير/فك التشفير عند الحفظ والقراءة
- استخدام AES-256-GCM مع مفتاح secret مخزن في Secrets

### 1.3 تحسين Rate Limiting
- تحسين الدالة الموجودة `check_rate_limit` لتغطي endpoints إضافية (login, register, checkout, contact)
- إضافة Rate Limiting على مستوى Edge Functions للـ webhooks

---

## المرحلة 2: تحسين الأداء ⚡

### 2.1 React Query Caching الذكي
- تحويل `ProductsSection` من `useState+useEffect` إلى `useQuery` مع `staleTime: 5 minutes`
- تحويل `categories` fetch إلى `useQuery` مع `staleTime: 30 minutes`
- إضافة `prefetchQuery` للمنتجات عند hover على الكاتيجوري

### 2.2 Code Splitting (Lazy Loading)
- تحويل جميع الصفحات في `App.tsx` إلى `React.lazy()` مع `Suspense`
- الصفحات الثقيلة بالأخص: `Admin`, `Checkout`, `CryptoPayment`, `OrderInvoice`
- إضافة loading skeleton كـ fallback

### 2.3 تحسين الصور
- إضافة `loading="lazy"` و `decoding="async"` لجميع صور المنتجات
- إضافة كومبوننت `OptimizedImage` يتعامل مع placeholder و error states

---

## المرحلة 3: إيميل ماركتنق 📧

### 3.1 إيميل ترحيبي تلقائي
- إنشاء Edge Function `send-welcome-email` تُرسل عند تسجيل مستخدم جديد
- إنشاء كوبون خصم تلقائي (مثلاً 10%) صالح لأول طلب
- تضمين الكوبون في الإيميل الترحيبي مع تصميم HTML جذاب

### 3.2 تذكير السلة المتروكة
- تحسين Edge Function `check-abandoned-carts` الموجودة
- إرسال إيميل تذكيري بعد ساعة من ترك السلة مع زر "أكمل طلبك"
- تضمين صور المنتجات والأسعار في الإيميل

---

## المرحلة 4: ذكاء اصطناعي 🤖

### 4.1 توصيات منتجات ذكية
- إنشاء Edge Function `ai-recommendations` تستخدم Lovable AI (Gemini Flash)
- تحلل سجل مشتريات المستخدم + المنتجات المتاحة
- تعرض "منتجات قد تعجبك" في الصفحة الرئيسية (قسم جديد بعد المنتجات)
- للزوار الجدد: تعرض المنتجات الأكثر مبيعاً

### 4.2 ملخص يومي للأدمن
- إنشاء Edge Function `admin-daily-summary` تولد ملخص يومي بالذكاء الاصطناعي
- تشمل: عدد الطلبات، الإيرادات، المنتجات الأكثر طلباً، تنبيهات المخزون
- تُعرض كبطاقة في تبويب Dashboard

---

## ترتيب التنفيذ المقترح

بسبب حجم العمل الكبير، أقترح نبدأ بالمراحل بالترتيب التالي:
1. **الأداء** (أسرع تنفيذاً وأكبر تأثيراً فوري)
2. **سجل الأنشطة** (أهم شي في الأمان)
3. **الإيميل الترحيبي** (يزيد المبيعات فوراً)
4. **توصيات المنتجات** (أكبر ميزة تنافسية)
5. **باقي الأمان** (التشفير + Rate Limiting)
6. **تذكير السلة + الملخص اليومي**

---

## ملاحظات تقنية
- جميع Edge Functions ستستخدم قاعدة البيانات الخارجية (External Supabase) كأولوية
- الإيميلات ستُرسل عبر `nodemailer` (المكتبة الحالية)
- الذكاء الاصطناعي سيستخدم Lovable AI بدون حاجة لـ API Key خارجي

