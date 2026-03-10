import { externalSupabase } from './externalSupabase';

// ============================================================
// Cloud Functions Client
// جميع الـ Edge Functions تعمل على Lovable Cloud
// قاعدة البيانات الخارجية تُستخدم فقط للتخزين
// ============================================================

// Lovable Cloud URL
const CLOUD_URL = 'https://wueacwqzafxsvowlqbwh.supabase.co';
const CLOUD_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1ZWFjd3F6YWZ4c3Zvd2xxYndoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NTQ4NjYsImV4cCI6MjA4NjIzMDg2Nn0.oAm52uJqIMD5jWjy2iJJuioTKMv0Xl1ayZEbXjj33Ug';

// ============================================================
// خريطة أسماء الدوال → الـ Slugs
// ============================================================
export const FUNCTION_SLUGS: Record<string, string> = {
  // === الدوال الأساسية للكريبتو ===
  'crypto-generate-address': 'crypto-generate-address',
  'crypto-check-payment': 'crypto-check-payment',
  'crypto-get-price': 'crypto-get-price',
  
  // === معالجة الطلبات ===
  'process-order': 'process-order',
  'complete-payment': 'complete-payment',
  'order-invoice': 'order-invoice',
  
  // === البريد الإلكتروني ===
  'send-delivery-email': 'send-delivery-email',
  'send-request-fulfilled': 'send-request-fulfilled',
  
  // === الإعدادات ===
  'sync-settings': 'sync-settings',
  
  // === بوابات الدفع الخارجية ===
  'lemonsqueezy-create': 'lemonsqueezy-create',
  'lemonsqueezy-webhook': 'lemonsqueezy-webhook',
  'nowpayments-create': 'nowpayments-create',
  'nowpayments-webhook': 'nowpayments-webhook',
  'paypal-create': 'paypal-create',
  'paypal-capture': 'paypal-capture',
  'cryptomus-create': 'cryptomus-create',
  'cryptomus-webhook': 'cryptomus-webhook',
  'oxapay-create': 'oxapay-create',
  'oxapay-webhook': 'oxapay-webhook',
  'sellauth-create': 'sellauth-create',
  'sellauth-webhook': 'sellauth-webhook',
  'ivno-create': 'ivno-create',
  'ivno-webhook': 'ivno-webhook',
  
  // === أخرى ===
  'payment-methods-status': 'payment-methods-status',
  'track-visit': 'track-visit',
  'remove-background': 'remove-background',
  'paypal-test-connection': 'paypal-test-connection',
  'send-ban-email': 'send-ban-email',
  'cancel-expired-orders': 'cancel-expired-orders',
  'admin-get-wallets': 'admin-get-wallets',

  // === Admin utilities ===
  'admin-adjust-wallet': 'admin-adjust-wallet',
  'merge-product-image': 'merge-product-image',

  // === Security ===
  'track-login': 'track-login',

  // === Telegram Bot ===
  'telegram-bot-webhook': 'telegram-bot-webhook',
  'telegram-send-otp': 'telegram-send-otp',
  'telegram-setup-webhook': 'telegram-setup-webhook',
  
  // === Gmail OTP ===
  'gmail-read-otp': 'gmail-read-otp',
  
  // === Cookie Testing ===
  'test-cookies': 'test-cookies',
  
  // === OSN Session & Telegram Session ===
  'osn-session': 'osn-session',
  
  // === Telegram Plans ===
  'process-plan-subscription': 'process-plan-subscription',
};

// Cloud functions client initialized silently

// Helper to get the actual function slug
function getFunctionSlug(fnName: string): string {
  const slug = FUNCTION_SLUGS[fnName];
  if (!slug) {
    console.warn(`⚠️ Function "${fnName}" not mapped, using as-is`);
    return fnName;
  }
  return slug;
}

// Helper to invoke functions with a user auth token
export async function invokeCloudFunction<T = unknown>(
  fnName: string,
  body: Record<string, unknown>,
  accessToken: string
): Promise<{ data: T | null; error: Error | null }> {
  const slug = getFunctionSlug(fnName);
  const url = `${CLOUD_URL}/functions/v1/${slug}`;
  
  console.log(`🚀 Invoking: ${fnName} → ${url}`);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: CLOUD_ANON_KEY,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error(`❌ Function ${slug} failed:`, data);
      return { data: null, error: new Error(data?.error || `Function ${slug} returned ${response.status}`) };
    }
    console.log(`✅ Function ${slug} success`);
    return { data: data as T, error: null };
  } catch (err) {
    console.error(`❌ Function ${slug} error:`, err);
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

// Helper to invoke functions without requiring auth (for public endpoints like webhooks)
export async function invokeCloudFunctionPublic<T = unknown>(
  fnName: string,
  body: Record<string, unknown>
): Promise<{ data: T | null; error: Error | null }> {
  const slug = getFunctionSlug(fnName);
  const url = `${CLOUD_URL}/functions/v1/${slug}`;
  
  console.log(`🚀 Invoking (public): ${fnName} → ${url}`);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: CLOUD_ANON_KEY,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error(`❌ Function ${slug} failed:`, data);
      return { data: null, error: new Error(data?.error || `Function ${slug} returned ${response.status}`) };
    }
    console.log(`✅ Function ${slug} success`);
    return { data: data as T, error: null };
  } catch (err) {
    console.error(`❌ Function ${slug} error:`, err);
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

// Get the external Supabase client for storage operations
export const getExternalStorageClient = () => externalSupabase;

// Export URLs for direct use if needed
export const EXTERNAL_SUPABASE_URL = 'https://vepwoilxujuyeuutybjp.supabase.co';
export const EXTERNAL_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlcHdvaWx4dWp1eWV1dXR5YmpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MTk3MTYsImV4cCI6MjA4NTI5NTcxNn0.bzqiWihFNR73aPRTOSQoiTRmJVvpSrSGgVCaPCM1hZk';
