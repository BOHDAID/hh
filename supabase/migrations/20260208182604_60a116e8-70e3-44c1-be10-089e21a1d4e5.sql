-- تعديل constraint لقبول القيم المركبة
ALTER TABLE public.otp_configurations 
DROP CONSTRAINT IF EXISTS otp_configurations_activation_type_check;

-- إضافة constraint جديد يقبل otp, qr, أو otp,qr
ALTER TABLE public.otp_configurations 
ADD CONSTRAINT otp_configurations_activation_type_check 
CHECK (activation_type ~ '^(otp|qr|otp,qr|qr,otp)$');