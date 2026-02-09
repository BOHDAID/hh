-- إنشاء دالة للتحقق من دور المستخدم
CREATE OR REPLACE FUNCTION public.get_user_role(check_user_id uuid)
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = check_user_id
  LIMIT 1
$$;

-- إنشاء دالة للتحقق من صلاحية الوصول للوحة التحكم
CREATE OR REPLACE FUNCTION public.has_admin_access(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = check_user_id 
    AND role IN ('admin', 'full_access', 'support')
  )
$$;