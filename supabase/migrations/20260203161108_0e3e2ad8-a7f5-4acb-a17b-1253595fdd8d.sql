-- Phase 1: إصلاح تسريب بيانات الزوار
-- حذف سياسة القراءة العامة التي تكشف بيانات الزوار للجميع

DROP POLICY IF EXISTS "Allow anyone to read page_visits" ON page_visits;

-- أيضاً حذف السياسة المكررة للقراءة العامة إن وجدت
DROP POLICY IF EXISTS "Anyone can read page_visits" ON page_visits;

-- تحسين سياسة الإدراج لتضمين تحقق أفضل
DROP POLICY IF EXISTS "Allow anyone to insert page_visits" ON page_visits;

-- سياسة إدراج محسنة مع تحقق من البيانات
CREATE POLICY "Allow edge function to insert page_visits" 
ON page_visits 
FOR INSERT 
WITH CHECK (
  ip_hash IS NOT NULL 
  AND length(ip_hash) >= 8 
  AND page_path IS NOT NULL 
  AND length(page_path) <= 500
);