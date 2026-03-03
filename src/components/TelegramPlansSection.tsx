import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { db, getAuthClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion, useMotionValue, useTransform, useSpring } from "framer-motion";
import {
  Crown, CheckCircle2, Loader2, Zap, Bot, Send, AtSign, BarChart3, Shield, Star, CreditCard, MessageSquare, Sparkles, PlusCircle, Minus, Plus
} from "lucide-react";

interface Plan {
  id: string;
  name: string;
  duration_days: number;
  price: number;
  max_sessions: number;
  price_per_extra_session: number;
  features: string[];
  is_active: boolean;
}

const featureHighlights = [
  { icon: <Send className="h-5 w-5" />, label: "نشر تلقائي مجدول", desc: "جدولة ونشر المحتوى تلقائياً في مجموعاتك" },
  { icon: <AtSign className="h-5 w-5" />, label: "مراقب المنشنات", desc: "تتبع كل إشارة لك في المجموعات" },
  { icon: <MessageSquare className="h-5 w-5" />, label: "رسائل خاص جماعية", desc: "أرسل رسائل للمحادثات النشطة" },
  { icon: <BarChart3 className="h-5 w-5" />, label: "تقارير وإحصائيات", desc: "تقارير مفصلة عن أداء حساباتك" },
];

const calculatePrice = (basePrice: number, sessions: number) => {
  let total = basePrice;
  for (let i = 2; i <= sessions; i++) {
    total += basePrice * 0.35;
  }
  return Math.round(total * 100) / 100;
};

// 3D Tilt Plan Card Component
const PlanCard = ({ plan, idx, onSubscribe, sessions, onSessionsChange }: { 
  plan: Plan; idx: number; onSubscribe: (plan: Plan, sessions: number) => void;
  sessions: number; onSessionsChange: (sessions: number) => void;
}) => {
  const isPopular = idx === 1;
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(mouseY, [0, 1], [8, -8]), { stiffness: 300, damping: 30 });
  const rotateY = useSpring(useTransform(mouseX, [0, 1], [-8, 8]), { stiffness: 300, damping: 30 });

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width);
    mouseY.set((e.clientY - rect.top) / rect.height);
  }, [mouseX, mouseY]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    mouseX.set(0.5);
    mouseY.set(0.5);
  }, [mouseX, mouseY]);

  const totalPrice = calculatePrice(plan.price, sessions);

  return (
    <motion.div
      ref={cardRef}
      className={`relative rounded-2xl border p-6 space-y-4 transition-colors ${
        isPopular ? "border-primary bg-primary/5" : "border-border bg-card"
      }`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX: isHovered ? rotateX : 0,
        rotateY: isHovered ? rotateY : 0,
        transformPerspective: 800,
        transformStyle: "preserve-3d",
      }}
      whileHover={{
        boxShadow: "0 25px 50px -12px hsl(var(--primary) / 0.25)",
        borderColor: "hsl(var(--primary) / 0.4)",
        scale: 1.03,
      }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      {/* Content */}
      <div className="relative z-[3] space-y-4">
        {isPopular && (
          <Badge className="absolute -top-9 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground gap-1">
            <Crown className="h-3 w-3" /> الأكثر شعبية
          </Badge>
        )}
        <h4 className="font-bold text-lg">{plan.name}</h4>
        
        {/* Session Selector */}
        <div className="bg-muted/50 rounded-xl p-3 space-y-2">
          <label className="text-xs text-muted-foreground font-medium">عدد الجلسات</label>
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={(e) => { e.stopPropagation(); onSessionsChange(Math.max(1, sessions - 1)); }}
              disabled={sessions <= 1}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xl font-bold text-primary min-w-[2rem] text-center">{sessions}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={(e) => { e.stopPropagation(); onSessionsChange(sessions + 1); }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          {sessions > 1 && (
            <p className="text-[10px] text-muted-foreground text-center">
              +35% لكل جلسة إضافية
            </p>
          )}
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-1">
          <motion.span
            className="text-3xl font-bold text-primary"
            key={totalPrice}
            initial={{ scale: 1.2, opacity: 0.7 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            ${totalPrice}
          </motion.span>
          <span className="text-xs text-muted-foreground">/ {plan.duration_days} يوم</span>
        </div>

        {sessions > 1 && (
          <div className="text-xs text-muted-foreground">
            السعر الأساسي: ${plan.price} + {sessions - 1} جلسة إضافية
          </div>
        )}

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
          onClick={() => onSubscribe(plan, sessions)}
        >
          <CreditCard className="h-4 w-4" /> اشترك الآن
        </Button>
      </div>
    </motion.div>
  );
};

const TelegramPlansSection = () => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingTrial, setStartingTrial] = useState(false);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [trialUsed, setTrialUsed] = useState(false);
  const [planSessions, setPlanSessions] = useState<Record<string, number>>({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data: plansData } = await db
        .from("telegram_plans")
        .select("*")
        .eq("is_active", true)
        .order("display_order");

      if (plansData) {
        const mapped = plansData.map(p => ({
          ...p,
          price_per_extra_session: (p as any).price_per_extra_session ?? 5,
          features: Array.isArray(p.features) ? (p.features as string[]) : []
        }));
        setPlans(mapped);
        // Initialize sessions to 1 for each plan
        const initial: Record<string, number> = {};
        mapped.forEach(p => { initial[p.id] = 1; });
        setPlanSessions(initial);
      }

      const authClient = getAuthClient();
      const { data: { session } } = await authClient.auth.getSession();
      if (session) {
        const { data: subs } = await db
          .from("telegram_subscriptions")
          .select("*")
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: false })
          .limit(1);

        if (subs?.[0]) {
          const active = new Date(subs[0].ends_at) > new Date();
          setHasSubscription(active);
          setTrialUsed(subs[0].trial_used);
        }
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const startTrial = async () => {
    setStartingTrial(true);
    try {
      const authClient = getAuthClient();
      const { data: { session } } = await authClient.auth.getSession();
      if (!session) { toast.error("يجب تسجيل الدخول أولاً"); return; }

      const { data: existing } = await db
        .from("telegram_subscriptions")
        .select("id")
        .eq("user_id", session.user.id)
        .eq("is_trial", true)
        .limit(1);

      if (existing && existing.length > 0) {
        toast.error("لقد استخدمت الفترة التجريبية مسبقاً");
        setTrialUsed(true);
        return;
      }

      const now = new Date();
      const trialEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const { error } = await db.from("telegram_subscriptions").insert({
        user_id: session.user.id,
        status: "trial",
        starts_at: now.toISOString(),
        ends_at: trialEnd.toISOString(),
        max_sessions: 1,
        is_trial: true,
        trial_used: true,
      });

      if (error) throw error;
      toast.success("تم تفعيل التجربة المجانية! لديك 24 ساعة");
      setHasSubscription(true);
      setTrialUsed(true);
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ");
    } finally {
      setStartingTrial(false);
    }
  };

  const handleSubscribe = async (plan: Plan, sessions: number) => {
    const authClient = getAuthClient();
    const { data: { session } } = await authClient.auth.getSession();
    if (!session) {
      toast.error("يجب تسجيل الدخول أولاً");
      navigate("/login?redirect=/#telegram-plans");
      return;
    }
    navigate(`/checkout/plan-${plan.id}?sessions=${sessions}`, {
      state: { sessions }
    });
  };

  if (loading || plans.length === 0) return null;

  return (
    <section className="py-16 bg-gradient-to-b from-background to-muted/30" dir="rtl">
      <div className="max-w-6xl mx-auto px-4 space-y-10">
        {/* Section Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium">
            <Sparkles className="h-4 w-4" />
            خدمة أتمتة Telegram
          </div>
          <h2 className="text-3xl font-bold text-foreground">تحكم بحساب Telegram الخاص بك</h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            أتمتة النشر، مراقبة المنشنات، إرسال رسائل جماعية وتقارير مفصلة — كل ذلك من لوحة تحكم واحدة
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {featureHighlights.map((f, i) => (
            <div key={i} className="group flex flex-col items-center gap-3 p-5 rounded-2xl bg-card border border-border hover:border-primary/30 hover:shadow-md transition-all">
              <div className="p-3 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                {f.icon}
              </div>
              <h3 className="font-semibold text-sm text-center">{f.label}</h3>
              <p className="text-xs text-muted-foreground text-center leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Active subscription banner */}
        {hasSubscription && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-6 text-center space-y-3">
            <div className="flex items-center justify-center gap-2 text-green-600">
              <CheckCircle2 className="h-6 w-6" />
              <h3 className="font-bold text-lg">اشتراكك فعّال!</h3>
            </div>
            <Button onClick={() => navigate("/auto-dashboard")} className="gap-2">
              <Bot className="h-4 w-4" /> الذهاب للوحة التحكم
            </Button>
          </div>
        )}

        {/* Trial CTA */}
        {!hasSubscription && !trialUsed && (
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

        {/* Plans Grid */}
        {!hasSubscription && (
          <div>
            <h3 className="text-xl font-bold text-center mb-2">اختر باقتك</h3>
            <p className="text-sm text-muted-foreground text-center mb-6">
              السعر الأساسي لجلسة واحدة — أضف جلسات إضافية بزيادة 35% لكل جلسة
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((plan, idx) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  idx={idx}
                  sessions={planSessions[plan.id] || 1}
                  onSessionsChange={(s) => setPlanSessions(prev => ({ ...prev, [plan.id]: s }))}
                  onSubscribe={handleSubscribe}
                />
              ))}
            </div>
          </div>
        )}

        {/* Security note */}
        <div className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1">
          <Shield className="h-3 w-3" /> جلساتك مشفرة ومحمية — لا نشارك بياناتك أبداً
        </div>
      </div>
    </section>
  );
};

export default TelegramPlansSection;
