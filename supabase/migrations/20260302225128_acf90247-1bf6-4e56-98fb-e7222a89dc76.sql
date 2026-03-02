
-- Telegram subscription plans (admin-managed)
CREATE TABLE public.telegram_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  duration_days integer NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  max_sessions integer NOT NULL DEFAULT 1,
  features jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  display_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage plans" ON public.telegram_plans FOR ALL USING (has_admin_access(auth.uid()));
CREATE POLICY "Anyone can view active plans" ON public.telegram_plans FOR SELECT USING (is_active = true);

-- User subscriptions
CREATE TABLE public.telegram_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_id uuid REFERENCES public.telegram_plans(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'trial',
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  max_sessions integer NOT NULL DEFAULT 1,
  is_trial boolean NOT NULL DEFAULT false,
  trial_used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage subscriptions" ON public.telegram_subscriptions FOR ALL USING (has_admin_access(auth.uid()));
CREATE POLICY "Users can view own subscription" ON public.telegram_subscriptions FOR SELECT USING (auth.uid() = user_id);

-- Insert default plans
INSERT INTO public.telegram_plans (name, duration_days, price, max_sessions, display_order, features) VALUES
  ('شهر واحد', 30, 10, 1, 1, '["نشر تلقائي", "رسائل خاص", "مراقب المنشنات", "جلسة واحدة"]'::jsonb),
  ('3 أشهر', 90, 25, 2, 2, '["نشر تلقائي", "رسائل خاص", "مراقب المنشنات", "جلستين"]'::jsonb),
  ('6 أشهر', 180, 45, 3, 3, '["نشر تلقائي", "رسائل خاص", "مراقب المنشنات", "3 جلسات"]'::jsonb),
  ('سنة كاملة', 365, 80, 5, 4, '["نشر تلقائي", "رسائل خاص", "مراقب المنشنات", "5 جلسات", "أولوية الدعم"]'::jsonb);

-- Add trigger for updated_at
CREATE TRIGGER set_telegram_plans_updated_at
  BEFORE UPDATE ON public.telegram_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_telegram_sessions_updated_at();

CREATE TRIGGER set_telegram_subscriptions_updated_at
  BEFORE UPDATE ON public.telegram_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_telegram_sessions_updated_at();
