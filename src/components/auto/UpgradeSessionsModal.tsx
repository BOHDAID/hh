import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db, getAuthClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Plus as PlusIcon, Minus, CreditCard } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSessions: number;
}

const UpgradeSessionsModal = ({ open, onOpenChange, currentSessions }: Props) => {
  const navigate = useNavigate();
  const [pricePerSession, setPricePerSession] = useState<number>(5);
  const [loading, setLoading] = useState(true);
  const [extraSessions, setExtraSessions] = useState(1);
  const [planId, setPlanId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setExtraSessions(1);
      loadPrice();
    }
  }, [open]);

  const loadPrice = async () => {
    setLoading(true);
    try {
      // Get the active plan's price_per_extra_session from admin settings
      const { data } = await db
        .from("telegram_plans")
        .select("id, price_per_extra_session")
        .eq("is_active", true)
        .order("display_order")
        .limit(1);

      if (data && data.length > 0) {
        setPricePerSession((data[0] as any).price_per_extra_session ?? 5);
        setPlanId(data[0].id);
      }
    } catch {
      toast.error("فشل تحميل السعر");
    }
    setLoading(false);
  };

  const totalPrice = Math.round(extraSessions * pricePerSession * 100) / 100;

  const handlePurchase = async () => {
    const authClient = getAuthClient();
    const { data: { session } } = await authClient.auth.getSession();
    if (!session) {
      toast.error("يجب تسجيل الدخول أولاً");
      return;
    }

    onOpenChange(false);
    navigate("/checkout", {
      state: {
        cartItems: [{
          id: `extra-sessions-${planId}`,
          name: `إضافة ${extraSessions} جلسة`,
          price: totalPrice,
          quantity: 1,
          image_url: null,
        }],
        totalAmount: totalPrice,
        planDetails: {
          planId,
          extraSessions,
          type: "add_sessions",
        },
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>إضافة جلسات</DialogTitle>
          <DialogDescription>
            لديك حالياً {currentSessions} جلسة — اختر عدد الجلسات الإضافية
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Session counter */}
            <div className="bg-muted/50 rounded-xl p-4 flex items-center justify-between">
              <span className="text-sm font-medium">عدد الجلسات الإضافية</span>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  onClick={() => setExtraSessions(prev => Math.max(1, prev - 1))}
                  disabled={extraSessions <= 1}
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <span className="text-2xl font-bold text-primary min-w-[2rem] text-center">
                  {extraSessions}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  onClick={() => setExtraSessions(prev => prev + 1)}
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Price summary */}
            <div className="rounded-xl border border-border p-4 space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>سعر الجلسة الواحدة</span>
                <span>${pricePerSession}</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>العدد</span>
                <span>×{extraSessions}</span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between items-baseline">
                <span className="font-semibold">الإجمالي</span>
                <span className="text-xl font-bold text-primary">${totalPrice}</span>
              </div>
            </div>

            <Button className="w-full gap-2" onClick={handlePurchase}>
              <CreditCard className="h-4 w-4" /> إضافة وادفع ${totalPrice}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default UpgradeSessionsModal;
