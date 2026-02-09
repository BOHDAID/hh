-- Phase 2: تعزيز سياسات INSERT وإضافة validation إضافي

-- 1. تعزيز سياسة contact_messages بتحقق أفضل
DROP POLICY IF EXISTS "Anyone can create contact messages with validation" ON contact_messages;

CREATE POLICY "Anyone can create contact messages with validation" 
ON contact_messages 
FOR INSERT 
WITH CHECK (
  -- التحقق من الاسم
  name IS NOT NULL 
  AND length(trim(name)) >= 2 
  AND length(trim(name)) <= 100
  AND name !~ '<[^>]*>' -- منع HTML tags
  -- التحقق من البريد
  AND email IS NOT NULL 
  AND email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  AND length(email) <= 255
  -- التحقق من الرسالة
  AND message IS NOT NULL 
  AND length(trim(message)) >= 10 
  AND length(trim(message)) <= 5000
  -- منع spam patterns
  AND message !~* '(viagra|casino|lottery|winner|congratulations.*won)'
);

-- 2. تعزيز سياسة product_requests
DROP POLICY IF EXISTS "Authenticated users can create requests" ON product_requests;

CREATE POLICY "Authenticated users can create requests" 
ON product_requests 
FOR INSERT 
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (user_id IS NULL OR user_id = auth.uid())
  AND product_name IS NOT NULL
  AND length(trim(product_name)) >= 2
  AND length(trim(product_name)) <= 200
  AND product_name !~ '<[^>]*>'
  AND (description IS NULL OR length(description) <= 2000)
);

-- 3. تعزيز سياسة reviews
DROP POLICY IF EXISTS "Authenticated users can create reviews" ON reviews;

CREATE POLICY "Authenticated users can create reviews" 
ON reviews 
FOR INSERT 
WITH CHECK (
  (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    OR is_admin(auth.uid())
  )
  AND rating >= 1 
  AND rating <= 5
  AND reviewer_name IS NOT NULL
  AND length(trim(reviewer_name)) >= 2
  AND length(trim(reviewer_name)) <= 100
  AND reviewer_name !~ '<[^>]*>'
  AND (comment IS NULL OR length(comment) <= 2000)
  AND (comment IS NULL OR comment !~ '<[^>]*>')
);

-- 4. تعزيز سياسة support_tickets
DROP POLICY IF EXISTS "Users can create tickets" ON support_tickets;

CREATE POLICY "Users can create tickets" 
ON support_tickets 
FOR INSERT 
WITH CHECK (
  auth.uid() = user_id
  AND subject IS NOT NULL
  AND length(trim(subject)) >= 5
  AND length(trim(subject)) <= 200
  AND subject !~ '<[^>]*>'
  AND message IS NOT NULL
  AND length(trim(message)) >= 20
  AND length(trim(message)) <= 5000
  AND message !~ '<script'
);

-- 5. تعزيز سياسة orders
DROP POLICY IF EXISTS "Users can create orders" ON orders;

CREATE POLICY "Users can create orders" 
ON orders 
FOR INSERT 
WITH CHECK (
  auth.uid() = user_id
  AND total_amount > 0
  AND total_amount < 100000
);

-- 6. تعزيز سياسة cart_items
DROP POLICY IF EXISTS "Users can add to own cart" ON cart_items;

CREATE POLICY "Users can add to own cart" 
ON cart_items 
FOR INSERT 
WITH CHECK (
  auth.uid() = user_id
  AND quantity > 0
  AND quantity <= 100
);

-- 7. إضافة سياسة تحقق على page_visits الحالية (حذف القديمة المكررة أولاً)
DROP POLICY IF EXISTS "Anyone can insert visits with validation" ON page_visits;