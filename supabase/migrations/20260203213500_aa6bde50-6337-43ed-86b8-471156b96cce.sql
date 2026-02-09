-- السماح للمستخدمين بإنشاء محفظتهم الخاصة فقط (user_id = auth.uid())
CREATE POLICY "Users can create own wallet"
ON public.wallets
FOR INSERT
WITH CHECK (auth.uid() = user_id AND balance = 0 AND total_earned = 0);

-- تحديث: السماح للمستخدمين بتحديث رصيدهم فقط إذا كانوا يخصمون (الإضافة من الأدمن فقط)
-- ملاحظة: هذا لأغراض الأمان - المستخدم لا يستطيع زيادة رصيده بنفسه