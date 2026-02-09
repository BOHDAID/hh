-- إضافة أعمدة الحظر لجدول profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_banned boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS banned_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS banned_reason text;

-- إنشاء index للبحث السريع عن المستخدمين المحظورين
CREATE INDEX IF NOT EXISTS idx_profiles_is_banned ON public.profiles(is_banned) WHERE is_banned = true;