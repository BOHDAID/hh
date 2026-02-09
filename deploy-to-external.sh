#!/bin/bash

# ============================================================
# سكريبت نشر Edge Functions إلى Supabase الخارجي
# ============================================================
# 
# الاستخدام:
#   1. تأكد من تثبيت Supabase CLI: npm install -g supabase
#   2. قم بتعيين التوكن: export SUPABASE_ACCESS_TOKEN="your_new_token"
#   3. شغّل السكريبت: bash deploy-to-external.sh
#
# ============================================================

# إعدادات المشروع
PROJECT_ID="vepwoilxujuyeuutybjp"

# التحقق من وجود التوكن
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
    echo "❌ خطأ: يجب تعيين SUPABASE_ACCESS_TOKEN"
    echo "   مثال: export SUPABASE_ACCESS_TOKEN='sbp_xxxxx'"
    exit 1
fi

echo "🚀 بدء نشر Edge Functions إلى المشروع: $PROJECT_ID"
echo "=================================================="

# قائمة الدوال للنشر
FUNCTIONS=(
    "complete-payment"
    "crypto-check-payment"
    "crypto-generate-address"
    "crypto-get-price"
    "lemonsqueezy-create"
    "lemonsqueezy-webhook"
    "nowpayments-create"
    "nowpayments-webhook"
    "payment-methods-status"
    "paypal-capture"
    "paypal-create"
    "process-order"
    "remove-background"
    "send-delivery-email"
    "sync-settings"
    "track-visit"
)

# نسخ الدوال من self-hosted-functions إلى supabase/functions
echo "📁 نسخ الدوال المستقلة..."
for func in "${FUNCTIONS[@]}"; do
    if [ -d "self-hosted-functions/$func" ]; then
        echo "   ✓ نسخ $func"
        cp -r "self-hosted-functions/$func/index.ts" "supabase/functions/$func/index.ts" 2>/dev/null || true
    fi
done

# نشر كل دالة
echo ""
echo "📤 بدء النشر..."
for func in "${FUNCTIONS[@]}"; do
    if [ -f "supabase/functions/$func/index.ts" ]; then
        echo ""
        echo "🔄 نشر: $func"
        supabase functions deploy "$func" --project-ref "$PROJECT_ID" --no-verify-jwt
        
        if [ $? -eq 0 ]; then
            echo "   ✅ تم نشر $func بنجاح"
        else
            echo "   ❌ فشل نشر $func"
        fi
    else
        echo "⚠️  الدالة $func غير موجودة"
    fi
done

echo ""
echo "=================================================="
echo "✅ اكتمل النشر!"
echo ""
echo "📝 ملاحظات مهمة:"
echo "   - تأكد من إعداد الـ Secrets في لوحة تحكم Supabase:"
echo "     • RESEND_API_KEY"
echo "     • LTC_XPUB"
echo "     • NOWPAYMENTS_API_KEY"
echo "     • PAYPAL_CLIENT_ID"
echo "     • PAYPAL_SECRET"
echo "     • REMOVE_BG_API_KEY (اختياري)"
echo ""
