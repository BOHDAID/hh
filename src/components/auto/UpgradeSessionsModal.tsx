import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db, getAuthClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Crown, CreditCard, Minus, Plus, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface Plan {
  id: string;
  name: string;
  duration_days: number;
  price: number;
  max_sessions: number;
  price_per_extra_session: number;
  features: string[];
}

const calculatePrice = (basePrice: number, sessions: number) => {
  let total = basePrice;
  for (let i = 2; i <= sessions; i++) {
    total += basePrice * 0.35;
  }
  return Math.round(total * 100) / 100;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSessions: number;
}

const UpgradeSessionsModal = ({ open, onOpenChange, currentSessions }: Props) => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Record<string, number>>({});

  useEffect(() => {
    if (open) loadPlans();
  }, [open]);

  const loadPlans = async () => {
    setLoading(true);
    try {
      const { data } = await db
        .from("telegram_plans")
        .select("*")
        .eq("is_active", true)
        .order("display_order");

      if (data) {
        const mapped = data.map(p => ({
          ...p,
          price_per_extra_session: (p as any).price_per_extra_session ?? 5,
          features: Array.isArray(p.features) ? (p.features as string[]) : [],
        }));
        setPlans(mapped);
        const init: Record<string, number> = {};
        mapped.forEach(p => { init[p.id] = Math.max(currentSessions + 1, 2); });
        setSessions(init);
      }
    } catch {
      toast.error("فشل تحميل الباقات");
    }
    setLoading(false);
  };

  const handleSubscribe = async (plan: Plan) => {
    const authClient = getAuthClient();
    const { data: { session } } = await authClient.auth.getSession();
    if (!session) {
      toast.error("يجب تسجيل الدخول أولاً");
      return;
    }
    const count = sessions[plan.id] || 2;
    const totalPrice = calculatePrice(plan.price, count);
    onOpenChange(false);
    navigate("/checkout", {
      state: {
        cartItems: [{
          id: `plan-${plan.id}`,
          name: `${plan.name} (${count} جلسة)`,
          price: totalPrice,
          quantity: 1,
          image_url: null,
        }],
        totalAmount: totalPrice,
        planDetails: { planId: plan.id, sessions: count, durationDays: plan.duration_days },
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-primary" />
            ترقية عدد الجلسات
          </DialogTitle>
          <DialogDescription>
            اختر باقة وعدد الجلسات المطلوب
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : plans.length === 0 ? (
          <p className="text-center text-muted-foreground py-6">لا توجد باقات متاحة حالياً</p>
        ) : (
          <div className="space-y-3">
            {plans.map((plan) => {
              const count = sessions[plan.id] || 2;
              const totalPrice = calculatePrice(plan.price, count);
              const isSelected = selectedPlan === plan.id;

              return (
                <div
                  key={plan.id}
                  className={`rounded-xl border p-4 space-y-3 cursor-pointer transition-all ${
                    isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                  }`}
                  onClick={() => setSelectedPlan(plan.id)}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm">{plan.name}</h4>
                    <span className="text-xs text-muted-foreground">{plan.duration_days} يوم</span>
                  </div>

                  {/* Session selector */}
                  <div className="bg-muted/50 rounded-lg p-2.5 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">عدد الجلسات</span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 rounded-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSessions(prev => ({ ...prev, [plan.id]: Math.max(1, count - 1) }));
                        }}
                        disabled={count <= 1}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="text-lg font-bold text-primary min-w-[1.5rem] text-center">{count}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 rounded-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSessions(prev => ({ ...prev, [plan.id]: count + 1 }));
                        }}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Price */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-bold text-primary">${totalPrice}</span>
                      <span className="text-[10px] text-muted-foreground">/ {plan.duration_days} يوم</span>
                    </div>
                    {count > 1 && (
                      <span className="text-[10px] text-muted-foreground">
                        +35% لكل جلسة إضافية
                      </span>
                    )}
                  </div>

                  {/* Features */}
                  {plan.features.length > 0 && (
                    <ul className="space-y-1">
                      {plan.features.slice(0, 3).map((f, i) => (
                        <li key={i} className="text-xs flex items-center gap-1.5 text-muted-foreground">
                          <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" /> {f}
                        </li>
                      ))}
                    </ul>
                  )}

                  <Button
                    className="w-full gap-2"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSubscribe(plan);
                    }}
                  >
                    <CreditCard className="h-4 w-4" /> اشترك الآن
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default UpgradeSessionsModal;
