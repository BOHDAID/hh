# 🚀 دليل نشر Edge Functions إلى Supabase الخارجي

## المتطلبات
1. تثبيت Supabase CLI: `npm install -g supabase`
2. Access Token جديد (لا تستخدم التوكن المكشوف!)

## خطوات النشر

### 1. تسجيل الدخول
```bash
supabase login
# سيفتح المتصفح لتسجيل الدخول
```

### 2. ربط المشروع
```bash
supabase link --project-ref vepwoilxujuyeuutybjp
```

### 3. نشر الدوال واحدة تلو الأخرى

```bash
# الدوال الأساسية
supabase functions deploy payment-methods-status --no-verify-jwt
supabase functions deploy process-order --no-verify-jwt
supabase functions deploy complete-payment --no-verify-jwt

# دوال الكريبتو
supabase functions deploy crypto-generate-address --no-verify-jwt
supabase functions deploy crypto-check-payment --no-verify-jwt
supabase functions deploy crypto-get-price --no-verify-jwt

# دوال Lemon Squeezy
supabase functions deploy lemonsqueezy-create --no-verify-jwt
supabase functions deploy lemonsqueezy-webhook --no-verify-jwt

# دوال NOWPayments
supabase functions deploy nowpayments-create --no-verify-jwt
supabase functions deploy nowpayments-webhook --no-verify-jwt

# دوال PayPal
supabase functions deploy paypal-create --no-verify-jwt
supabase functions deploy paypal-capture --no-verify-jwt

# دوال أخرى
supabase functions deploy send-delivery-email --no-verify-jwt
supabase functions deploy sync-settings --no-verify-jwt
supabase functions deploy track-visit --no-verify-jwt
supabase functions deploy remove-background --no-verify-jwt
```

## ⚠️ ملاحظات مهمة

### الـ Secrets المطلوبة في Supabase Dashboard
اذهب إلى: Project Settings → Edge Functions → Secrets

```
RESEND_API_KEY=your_resend_api_key
LTC_XPUB=your_litecoin_extended_public_key
NOWPAYMENTS_API_KEY=your_nowpayments_key
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_SECRET=your_paypal_secret
REMOVE_BG_API_KEY=your_remove_bg_key (اختياري)
```

### التحقق من النشر
بعد النشر، اختبر أي دالة:
```bash
curl -X POST https://vepwoilxujuyeuutybjp.supabase.co/functions/v1/payment-methods-status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_ANON_KEY"
```

## 🔧 حل مشاكل شائعة

### خطأ "Module not found"
تأكد من نسخ ملفات `self-hosted-functions/` إلى `supabase/functions/` قبل النشر:
```bash
cp -r self-hosted-functions/* supabase/functions/
```

### خطأ 401 Invalid JWT
- تأكد من أن الدالة تستخدم `auth.getUser()` وليس `getClaims()`
- تحقق من صحة التوكن المُرسل من الـ Frontend
