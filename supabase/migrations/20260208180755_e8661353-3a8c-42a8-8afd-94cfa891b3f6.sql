-- إضافة إعدادات بوت تيليجرام و OTP
INSERT INTO site_settings (key, value, category, description, is_sensitive)
VALUES 
  ('telegram_bot_username', NULL, 'telegram', 'اسم بوت تيليجرام (بدون @)', false),
  ('telegram_bot_token', NULL, 'telegram', 'توكن بوت تيليجرام من BotFather', true),
  ('otp_emails', NULL, 'otp', 'بريدات استقبال OTP (مفصولة بفاصلة)', false),
  ('otp_imap_host', 'imap.gmail.com', 'otp', 'خادم IMAP للبريد', false),
  ('otp_imap_port', '993', 'otp', 'منفذ IMAP', false),
  ('activation_message_template', 'مرحباً! كود التفعيل الخاص بك هو: {code}

للحصول على رمز OTP، تواصل مع البوت: @{bot_username}', 'activation', 'رسالة تظهر للعميل بعد الشراء', false)
ON CONFLICT (key) DO NOTHING;

-- إعادة تفريغ schema
NOTIFY pgrst, 'reload schema';