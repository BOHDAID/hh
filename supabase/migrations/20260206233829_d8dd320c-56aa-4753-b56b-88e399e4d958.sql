-- Create email_logs table for tracking email delivery
CREATE TABLE IF NOT EXISTS public.email_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  user_id UUID,
  email_type TEXT NOT NULL DEFAULT 'delivery',
  recipient_email TEXT NOT NULL,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- Admin can view all email logs
CREATE POLICY "Admins can view email logs" 
ON public.email_logs 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'full_access')
  )
);

-- Add index for faster lookups
CREATE INDEX idx_email_logs_order_id ON public.email_logs(order_id);
CREATE INDEX idx_email_logs_created_at ON public.email_logs(created_at DESC);
CREATE INDEX idx_email_logs_status ON public.email_logs(status);