import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getAuthClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Loader2, Bot, ShoppingCart, Clock } from "lucide-react";

interface Subscription {
  id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  max_sessions: number;
  is_trial: boolean;
  trial_used: boolean;
  plan_id: string | null;
}

interface Props {
  children: React.ReactNode;
  onSubscriptionLoaded?: (sub: Subscription | null, maxSessions: number) => void;
}

const SubscriptionGate = ({ children, onSubscriptionLoaded }: Props) => {
  const [loading, setLoading] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    checkSubscription();
  }, []);

  const checkSubscription = async () => {
    setLoading(true);
    try {
      const authClient = getAuthClient();
      const { data: { session } } = await authClient.auth.getSession();
      if (!session) { setLoading(false); return; }

      const { data: subs } = await supabase
        .from("telegram_subscriptions")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const sub = subs?.[0] || null;

      if (sub) {
        const now = new Date();
        const end = new Date(sub.ends_at);
        const active = end > now;
        setIsActive(active);
        setIsExpired(!active);
        onSubscriptionLoaded?.(sub, active ? sub.max_sessions : 0);
      } else {
        onSubscriptionLoaded?.(null, 0);
      }
    } catch (err) {
      console.error("Subscription check error:", err);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground text-sm">جاري التحقق من الاشتراك...</p>
      </div>
    );
  }

  if (isActive) {
    return <>{children}</>;
  }

  // Not subscribed → redirect to store
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4" dir="rtl">
      <div className="max-w-md text-center space-y-6">
        <div className="inline-flex p-4 rounded-2xl bg-primary/10">
          <Bot className="h-10 w-10 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">
          {isExpired ? "انتهت مدة اشتراكك" : "تحتاج اشتراك للوصول"}
        </h1>
        <p className="text-muted-foreground">
          {isExpired
            ? "انتهت مدة اشتراكك في خدمة أتمتة Telegram. يرجى تجديد الاشتراك من المتجر."
            : "للوصول إلى لوحة تحكم Telegram، يجب عليك الاشتراك أولاً من المتجر."}
        </p>
        {isExpired && (
          <div className="inline-flex items-center gap-2 bg-destructive/10 text-destructive border border-destructive/20 px-4 py-2 rounded-xl text-sm">
            <Clock className="h-4 w-4" />
            تم إيقاف النشر التلقائي
          </div>
        )}
        <Link to="/#telegram-plans">
          <Button size="lg" className="gap-2">
            <ShoppingCart className="h-5 w-5" /> عرض الباقات والاشتراك
          </Button>
        </Link>
        <Link to="/" className="block text-sm text-muted-foreground hover:text-primary transition-colors">
          ← العودة للرئيسية
        </Link>
      </div>
    </div>
  );
};

export default SubscriptionGate;
