import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================================
// External Supabase Client - المصدر الوحيد للحقيقة
// قاعدة البيانات الخارجية الخاصة بالمستخدم
// ============================================================

// Hardcoded External Supabase Credentials (Anon Key is publishable/safe)
const EXTERNAL_SUPABASE_URL = 'https://vepwoilxujuyeuutybjp.supabase.co';
const EXTERNAL_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlcHdvaWx4dWp1eWV1dXR5YmpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MTk3MTYsImV4cCI6MjA4NTI5NTcxNn0.bzqiWihFNR73aPRTOSQoiTRmJVvpSrSGgVCaPCM1hZk';

// دائماً مهيأ لأن القيم موجودة مباشرة
export const isExternalConfigured = true;

// إنشاء الـ client الخارجي - هذا هو العميل الوحيد المستخدم
export const externalSupabase: SupabaseClient = createClient(
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storage: localStorage,
      storageKey: 'external-supabase-auth',
    },
  }
);

console.log('✅ External Supabase Client connected:', EXTERNAL_SUPABASE_URL);

// دالة للتحقق من الاتصال
export const checkExternalConnection = async (): Promise<{ connected: boolean; error?: string }> => {
  if (!externalSupabase) {
    return { 
      connected: false, 
      error: 'External Supabase not configured. Set VITE_EXTERNAL_SUPABASE_URL and VITE_EXTERNAL_SUPABASE_ANON_KEY' 
    };
  }

  try {
    const { error } = await externalSupabase.from('site_settings').select('key').limit(1);
    
    if (error) {
      if (error.code === '42P01') {
        return { 
          connected: true, 
          error: 'Connected but tables not found. Please create the required tables.' 
        };
      }
      return { connected: false, error: error.message };
    }
    
    return { connected: true };
  } catch (err) {
    return { connected: false, error: String(err) };
  }
};

// تصدير الأنواع المطلوبة
export interface ExternalProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category_id: string | null;
  is_active: boolean;
  platform: string | null;
  warranty_days: number;
  product_type: string;
  sales_count: number;
  average_rating: number;
  created_at: string;
  updated_at: string;
}

export interface ExternalSiteSetting {
  id: string;
  key: string;
  value: string | null;
  category: string;
  description: string | null;
  is_sensitive: boolean;
  updated_at: string;
}

export interface ExternalOrder {
  id: string;
  order_number: string;
  user_id: string;
  total_amount: number;
  status: string;
  payment_method: string | null;
  payment_status: string;
  created_at: string;
}

export interface ExternalProductAccount {
  id: string;
  product_id: string;
  account_data: string;
  is_sold: boolean;
  sold_at: string | null;
  created_at: string;
}
