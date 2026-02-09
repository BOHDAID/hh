-- Create ticket_messages table for chat-like conversation
CREATE TABLE public.ticket_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL DEFAULT 'user', -- 'user' or 'admin'
  sender_id UUID,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view messages of their own tickets
CREATE POLICY "Users can view own ticket messages"
ON public.ticket_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.support_tickets 
    WHERE support_tickets.id = ticket_messages.ticket_id 
    AND support_tickets.user_id = auth.uid()
  )
  OR is_admin(auth.uid())
);

-- Policy: Users can add messages to their own tickets
CREATE POLICY "Users can add messages to own tickets"
ON public.ticket_messages
FOR INSERT
WITH CHECK (
  (
    sender_type = 'user' 
    AND sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_tickets 
      WHERE support_tickets.id = ticket_messages.ticket_id 
      AND support_tickets.user_id = auth.uid()
      AND support_tickets.status != 'closed'
    )
  )
  OR is_admin(auth.uid())
);

-- Policy: Admins can manage all messages
CREATE POLICY "Admins can manage ticket messages"
ON public.ticket_messages
FOR ALL
USING (is_admin(auth.uid()));