import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getAuthClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Crown, CheckCircle2, Clock, Loader2, Zap, Bot, Send, AtSign, BarChart3, Shield, Star, CreditCard
} from "lucide-react";

interface Plan {
  id: string;
  name: string;
  duration_days: number;
  price: number;
  max_sessions: number;
  features: string[];
  is_active: boolean;
}

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
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [startingTrial, setStartingTrial] = useState(false);

  useEffect(() => {
    checkSubscription();
  }, []);

  const checkSubscription = async () => {
    setLoading(true);
    try {
      const authClient = getAuthClient();
      const { data: { session } } = await authClient.auth.getSession();
      if (!session) { setLoading(false); return; }

      // Fetch plans
      const { data: plansData } = await supabase
        .from("telegram_plans")
        .select("*")
        .eq("is_active", true)
        .order("display_order");
      if (plansData) setPlans(plansData.map(p => ({ ...p, features: Array.isArray(p.features) ? (p.features as string[]) : [] })));

      // Fetch active subscription
      const { data: subs } = await supabase
        .from("telegram_subscriptions")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const sub = subs?.[0] || null;
      setSubscription(sub);

      if (sub) {
        const now = new Date();
        const end = new Date(sub.ends_at);
        const active = end > now;
        setIsActive(active);
        onSubscriptionLoaded?.(sub, active ? sub.max_sessions : 0);
      } else {
        onSubscriptionLoaded?.(null, 0);
      }
    } catch (err) {
      console.error("Subscription check error:", err);
    }
    setLoading(false);
  };

  const startTrial = async () => {
    setStartingTrial(true);
    try {
      const authClient = getAuthClient();
      const { data: { session } } = await authClient.auth.getSession();
      if (!session) { toast.error("يجب تسجيل الدخول أولاً"); return; }

      // Check if trial already used
      const { data: existing } = await supabase
        .from("telegram_subscriptions")
        .select("id")
        .eq("user_id", session.user.id)
        .eq("is_trial", true)
        .limit(1);

      if (existing && existing.length > 0) {
        toast.error("لقد استخدمت الفترة التجريبية مسبقاً");
        return;
      }

      const now = new Date();
      const trialEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1 day

      const { error } = await supabase.from("telegram_subscriptions").insert({
        user_id: session.user.id,
        status: "trial",
        starts_at: now.toISOString(),
        ends_at: trialEnd.toISOString(),
        max_sessions: 1,
        is_trial: true,
        trial_used: true,
      });

      if (error) throw error;
      toast.success("تم تفعيل الفترة التجريبية! لديك 24 ساعة");
      checkSubscription();
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ");
    } finally {
      setStartingTrial(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground text-sm">جاري التحقق من الاشتراك...</p>
      </div>
    );
  }

  // Active subscription → show children
  if (isActive && subscription) {
    return <>{children}</>;
  }

  // No active subscription → show pricing page
  const trialUsed = subscription?.trial_used === true;
  const isExpired = subscription && new Date(subscription.ends_at) < new Date();

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="max-w-5xl mx-auto px-4 py-12 space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex p-4 rounded-2xl bg-primary/10 mb-2">
            <Bot className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">التحكم في Telegram</h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            أتمتة النشر والرسائل ومراقبة المنشنات في مجموعات وقنوات تليجرام
          </p>

          {isExpired && (
            <div className="inline-flex items-center gap-2 bg-destructive/10 text-destructive border border-destructive/20 px-4 py-2 rounded-xl text-sm">
              <Clock className="h-4 w-4" />
              انتهت مدة اشتراكك. يرجى الاشتراك لمتابعة الاستخدام.
            </div>
          )}
        </div>

        {/* Features */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: <Send className="h-5 w-5" />, label: "نشر تلقائي" },
            { icon: <AtSign className="h-5 w-5" />, label: "مراقب المنشنات" },
            { icon: <Zap className="h-5 w-5" />, label: "رسائل خاص" },
            { icon: <BarChart3 className="h-5 w-5" />, label: "تقارير مفصلة" },
          ].map((f, i) => (
            <div key={i} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-card border border-border">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">{f.icon}</div>
              <span className="text-sm font-medium">{f.label}</span>
            </div>
          ))}
        </div>

        {/* Trial */}
        {!trialUsed && (
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-6 text-center space-y-3">
            <div className="flex items-center justify-center gap-2">
              <Star className="h-5 w-5 text-primary" />
              <h3 className="font-bold text-lg">جرّب مجاناً لمدة 24 ساعة!</h3>
            </div>
            <p className="text-sm text-muted-foreground">جلسة واحدة مع جميع المميزات — بدون بطاقة ائتمان</p>
            <Button onClick={startTrial} disabled={startingTrial} className="gap-2">
              {startingTrial ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              بدء التجربة المجانية
            </Button>
          </div>
        )}

        {/* Plans */}
        <div>
          <h2 className="text-xl font-bold text-center mb-6">اختر باقتك</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan, idx) => {
              const isPopular = idx === 1;
              return (
                <div key={plan.id} className={`relative rounded-2xl border p-6 space-y-4 transition-all hover:shadow-lg ${isPopular ? "border-primary bg-primary/5 shadow-md" : "border-border bg-card"}`}>
                  {isPopular && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground gap-1">
                      <Crown className="h-3 w-3" /> الأكثر شعبية
                    </Badge>
                  )}
                  <h3 className="font-bold text-lg">{plan.name}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-primary">${plan.price}</span>
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <Bot className="h-4 w-4" /> {plan.max_sessions} جلسة
                  </div>
                  <ul className="space-y-2">
                    {plan.features.map((f, i) => (
                      <li key={i} className="text-sm flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant={isPopular ? "default" : "outline"}
                    className="w-full gap-2"
                    onClick={() => toast.info("سيتم إضافة الدفع قريباً")}
                  >
                    <CreditCard className="h-4 w-4" /> اشترك الآن
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Security note */}
        <div className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1">
          <Shield className="h-3 w-3" /> جلساتك مشفرة ومحمية — لا نشارك بياناتك أبداً
        </div>
      </div>
    </div>
  );
};

export default SubscriptionGate;
