import { createClient } from '@supabase/supabase-js';

/**
 * Supabase Client للـ Backend (Server-side)
 * يستخدم Service Role Key للوصول الكامل لقاعدة البيانات
 */

const supabaseUrl = process.env.EXTERNAL_SUPABASE_URL || process.env.VITE_EXTERNAL_SUPABASE_URL;
const supabaseServiceKey = process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('⚠️ Supabase credentials not found. Database features will be disabled.');
}

export const supabaseBackend = supabaseUrl && supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

/**
 * جلب إعدادات OTP النشطة من قاعدة البيانات
 * @returns {Promise<{email: string, gmailAppPassword: string} | null>}
 */
export async function getActiveOtpConfig() {
  if (!supabaseBackend) {
    console.log('⚠️ Supabase not configured, skipping database lookup');
    return null;
  }

  try {
    const { data, error } = await supabaseBackend
      .from('otp_configurations')
      .select('gmail_address, gmail_app_password')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        console.log('ℹ️ No active OTP configuration found in database');
        return null;
      }
      console.error('❌ Error fetching OTP config:', error.message);
      return null;
    }

    if (data) {
      console.log('✅ Found active OTP config for:', data.gmail_address);
      return {
        email: data.gmail_address,
        gmailAppPassword: data.gmail_app_password,
      };
    }

    return null;
  } catch (err) {
    console.error('❌ Error in getActiveOtpConfig:', err.message);
    return null;
  }
}

/**
 * جلب إعداد QR_AUTOMATION_SECRET من site_settings
 * @returns {Promise<string | null>}
 */
export async function getQrSecret() {
  if (!supabaseBackend) {
    return process.env.QR_AUTOMATION_SECRET || 'default-qr-secret-key';
  }

  try {
    const { data, error } = await supabaseBackend
      .from('site_settings')
      .select('value')
      .eq('key', 'qr_automation_secret')
      .single();

    if (error || !data?.value) {
      return process.env.QR_AUTOMATION_SECRET || 'default-qr-secret-key';
    }

    return data.value;
  } catch (err) {
    return process.env.QR_AUTOMATION_SECRET || 'default-qr-secret-key';
  }
}

export default supabaseBackend;
