-- Add image_url column to ticket_messages for image attachments
ALTER TABLE public.ticket_messages
ADD COLUMN IF NOT EXISTS image_url TEXT;