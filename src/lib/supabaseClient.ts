import { externalSupabase } from '@/lib/externalSupabase';

// ============================================================
// Supabase Client - يستخدم External Supabase فقط
// لا يوجد أي Fallback لـ Lovable Cloud
// ============================================================

// تصدير مباشر للاستخدام السهل - هذا هو العميل الرئيسي والوحيد
export const db = externalSupabase;

// دالة للتحقق من مصدر البيانات الحالي - دائماً external
export const getDataSource = (): 'external' => 'external';

// تصدير حالة الاتصال الخارجي - دائماً true
export const isExternalConfigured = true;

// Helper للـ Auth - يستخدم External Supabase فقط
export const getAuthClient = () => externalSupabase;

// للتوافق مع الكود القديم
export const getSupabaseClient = () => externalSupabase;
