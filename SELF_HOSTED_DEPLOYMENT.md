# 🚀 دليل النشر المستقل (Self-Hosted Deployment)

هذا الدليل يشرح كيفية نشر الـ Edge Functions على مشروع Supabase الخارجي الخاص بك.

## 📋 المتطلبات

1. **Supabase CLI** مثبت على جهازك
2. **مشروع Supabase خارجي** (لديك بالفعل: `vepwoilxujuyeuutybjp`)
3. **Docker Desktop** (مطلوب لنشر Edge Functions)

---

## 📦 الخطوة 1: تثبيت Supabase CLI

### على macOS:
```bash
brew install supabase/tap/supabase
```

### على Windows (PowerShell):
```powershell
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

### على Linux:
```bash
brew install supabase/tap/supabase
# أو
curl -s https://raw.githubusercontent.com/supabase/cli/main/install.sh | bash
```

### التحقق من التثبيت:
```bash
supabase --version
```

---

## 🔐 الخطوة 2: تسجيل الدخول

```bash
supabase login
```

سيفتح المتصفح لتسجيل الدخول إلى حساب Supabase الخاص بك.

---

## 🔗 الخطوة 3: ربط المشروع

```bash
# إنشاء مجلد جديد للمشروع
mkdir my-store-functions
cd my-store-functions

# تهيئة مشروع Supabase
supabase init

# ربط المشروع الخارجي
supabase link --project-ref vepwoilxujuyeuutybjp
```

> **ملاحظة:** سيُطلب منك إدخال Database Password الخاص بمشروعك.

---

## 📁 الخطوة 4: إنشاء بنية الملفات

```
my-store-functions/
├── supabase/
│   ├── config.toml
│   └── functions/
│       ├── _shared/
│       │   └── security.ts
│       ├── complete-payment/
│       │   └── index.ts
│       ├── crypto-check-payment/
│       │   └── index.ts
│       ├── crypto-generate-address/
│       │   └── index.ts
│       ├── crypto-get-price/
│       │   └── index.ts
│       ├── lemonsqueezy-create/
│       │   └── index.ts
│       ├── lemonsqueezy-webhook/
│       │   └── index.ts
│       ├── nowpayments-create/
│       │   └── index.ts
│       ├── nowpayments-webhook/
│       │   └── index.ts
│       ├── payment-methods-status/
│       │   └── index.ts
│       ├── paypal-capture/
│       │   └── index.ts
│       ├── paypal-create/
│       │   └── index.ts
│       ├── process-order/
│       │   └── index.ts
│       ├── remove-background/
│       │   └── index.ts
│       ├── send-delivery-email/
│       │   └── index.ts
│       ├── sync-settings/
│       │   └── index.ts
│       └── track-visit/
│           └── index.ts
```

---

## ⚙️ الخطوة 5: تحديث config.toml

```toml
[project]
id = "vepwoilxujuyeuutybjp"

# تعطيل التحقق من JWT ليتم التحقق في الكود
[functions.complete-payment]
verify_jwt = false

[functions.crypto-check-payment]
verify_jwt = false

[functions.crypto-generate-address]
verify_jwt = false

[functions.crypto-get-price]
verify_jwt = false

[functions.lemonsqueezy-create]
verify_jwt = false

[functions.lemonsqueezy-webhook]
verify_jwt = false

[functions.nowpayments-create]
verify_jwt = false

[functions.nowpayments-webhook]
verify_jwt = false

[functions.payment-methods-status]
verify_jwt = false

[functions.paypal-capture]
verify_jwt = false

[functions.paypal-create]
verify_jwt = false

[functions.process-order]
verify_jwt = false

[functions.remove-background]
verify_jwt = false

[functions.send-delivery-email]
verify_jwt = false

[functions.sync-settings]
verify_jwt = false

[functions.track-visit]
verify_jwt = false
```

---

## 🔑 الخطوة 6: إضافة الـ Secrets

قبل النشر، أضف الـ Secrets المطلوبة:

```bash
# Secrets أساسية (ستُضاف تلقائياً من Supabase)
# SUPABASE_URL
# SUPABASE_ANON_KEY
# SUPABASE_SERVICE_ROLE_KEY

# Secrets إضافية تحتاج إضافتها يدوياً:
supabase secrets set LTC_XPUB="your_ltc_xpub_here"
supabase secrets set RESEND_API_KEY="your_resend_api_key_here"
```

> **ملاحظة:** `SUPABASE_URL` و `SUPABASE_ANON_KEY` و `SUPABASE_SERVICE_ROLE_KEY` متاحة تلقائياً في Edge Functions.

---

## 🚀 الخطوة 7: نشر الدوال

### نشر جميع الدوال دفعة واحدة:
```bash
supabase functions deploy
```

### نشر دالة محددة:
```bash
supabase functions deploy complete-payment
supabase functions deploy crypto-generate-address
supabase functions deploy process-order
# ... وهكذا
```

### نشر مع سجلات تفصيلية:
```bash
supabase functions deploy --debug
```

---

## ✅ الخطوة 8: التحقق من النشر

```bash
# عرض قائمة الدوال المنشورة
supabase functions list

# اختبار دالة
curl -X POST "https://vepwoilxujuyeuutybjp.supabase.co/functions/v1/track-visit" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{"page_path": "/test"}'
```

---

## 🔄 الخطوة 9: تحديث الـ Frontend

بعد نشر الدوال، عدّل ملف `src/lib/cloudFunctions.ts`:

```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { externalSupabase } from './externalSupabase';

// استخدم Supabase الخارجي مباشرة
const EXTERNAL_URL = 'https://vepwoilxujuyeuutybjp.supabase.co';
const EXTERNAL_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlcHdvaWx4dWp1eWV1dXR5YmpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MTk3MTYsImV4cCI6MjA4NTI5NTcxNn0.bzqiWihFNR73aPRTOSQoiTRmJVvpSrSGgVCaPCM1hZk';

export const cloudClient: SupabaseClient = createClient(EXTERNAL_URL, EXTERNAL_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

console.log('☁️ External Functions Client ready:', EXTERNAL_URL);

export async function invokeCloudFunction<T = unknown>(
  fnName: string,
  body: Record<string, unknown>,
  accessToken: string
): Promise<{ data: T | null; error: Error | null }> {
  try {
    const response = await fetch(`${EXTERNAL_URL}/functions/v1/${fnName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: EXTERNAL_ANON_KEY,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) {
      return { data: null, error: new Error(data?.error || `Function ${fnName} returned ${response.status}`) };
    }
    return { data: data as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export async function invokeCloudFunctionPublic<T = unknown>(
  fnName: string,
  body: Record<string, unknown>
): Promise<{ data: T | null; error: Error | null }> {
  try {
    const response = await fetch(`${EXTERNAL_URL}/functions/v1/${fnName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EXTERNAL_ANON_KEY,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) {
      return { data: null, error: new Error(data?.error || `Function ${fnName} returned ${response.status}`) };
    }
    return { data: data as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export const getExternalStorageClient = () => externalSupabase;
```

---

## 📝 تعديلات مطلوبة في Edge Functions

### المشكلة الحالية:
بعض الدوال تستخدم `VITE_EXTERNAL_SUPABASE_URL` لأنها كانت تعمل على Lovable Cloud.

### الحل:
بما أن الدوال ستعمل على Supabase الخارجي مباشرة، عدّل جميع الدوال لتستخدم:

```typescript
// بدلاً من:
const externalUrl = Deno.env.get("VITE_EXTERNAL_SUPABASE_URL")!;
const externalServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;

// استخدم:
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
```

الدوال التي تحتاج تعديل:
- `crypto-generate-address/index.ts`
- `lemonsqueezy-create/index.ts`
- `lemonsqueezy-webhook/index.ts`
- `payment-methods-status/index.ts`
- `process-order/index.ts`
- `sync-settings/index.ts`

---

## 📋 قائمة الدوال

| الدالة | الوظيفة |
|--------|---------|
| `complete-payment` | إتمام الطلب وتسليم المنتجات |
| `crypto-check-payment` | التحقق من حالة دفع الكريبتو |
| `crypto-generate-address` | توليد عنوان دفع من xPub |
| `crypto-get-price` | جلب سعر LTC/BTC الحالي |
| `lemonsqueezy-create` | إنشاء جلسة دفع Lemon Squeezy |
| `lemonsqueezy-webhook` | معالجة إشعارات Lemon Squeezy |
| `nowpayments-create` | إنشاء فاتورة NOWPayments |
| `nowpayments-webhook` | معالجة إشعارات NOWPayments |
| `payment-methods-status` | التحقق من طرق الدفع المفعلة |
| `paypal-capture` | تأكيد دفع PayPal |
| `paypal-create` | إنشاء طلب PayPal |
| `process-order` | معالجة الطلب الجديد |
| `remove-background` | إزالة خلفية الصور |
| `send-delivery-email` | إرسال إيميل التسليم |
| `sync-settings` | مزامنة الإعدادات |
| `track-visit` | تتبع زيارات الصفحات |

---

## 🔧 استكشاف الأخطاء

### خطأ: Function not found
```bash
supabase functions list  # تأكد من وجود الدالة
supabase functions deploy function-name  # أعد النشر
```

### خطأ: CORS
تأكد من وجود `corsHeaders` في كل دالة:
```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, ...",
};

if (req.method === "OPTIONS") {
  return new Response(null, { headers: corsHeaders });
}
```

### خطأ: Unauthorized
- تأكد من إرسال `Authorization: Bearer TOKEN`
- تأكد من صحة الـ Token

### عرض السجلات:
```bash
supabase functions logs function-name --tail
```

---

## 🎉 انتهى!

بعد اتباع هذه الخطوات، سيكون مشروعك مستقلاً تماماً ويعمل على Supabase الخارجي الخاص بك.

---

## 📚 مراجع

- [Supabase CLI Documentation](https://supabase.com/docs/reference/cli)
- [Edge Functions Guide](https://supabase.com/docs/guides/functions)
- [Deploying Edge Functions](https://supabase.com/docs/guides/functions/deploy)
