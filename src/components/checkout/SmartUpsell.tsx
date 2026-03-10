import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "@/lib/supabaseClient";
import { Zap, Clock, Plus, X, Flame, Gift, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

interface UpsellVariant {
  id: string;
  name: string;
  name_en: string | null;
  price: number;
  product_id: string;
  product_name: string;
  product_name_en: string | null;
  product_image_url: string | null;
}

interface SmartUpsellProps {
  cartProductIds: string[];
  currentCategoryId?: string | null;
  onAddToOrder: (product: { id: string; name: string; name_en: string | null; price: number; image_url: string | null; category_id: string | null }, discountedPrice: number) => void;
}

const TIMER_SECONDS = 300;
const DISCOUNT_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// Roulette spinner component
const DiscountRoulette = ({ onComplete, isRTL }: { onComplete: (discount: number) => void; isRTL: boolean }) => {
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [displayValue, setDisplayValue] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const spin = () => {
    if (spinning) return;
    setSpinning(true);
    setResult(null);

    // Pick final result (weighted towards 3-7%)
    const weights = [5, 8, 12, 15, 18, 15, 12, 8, 5, 2]; // weights for 1-10
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let rand = Math.random() * totalWeight;
    let finalDiscount = 1;
    for (let i = 0; i < weights.length; i++) {
      rand -= weights[i];
      if (rand <= 0) { finalDiscount = DISCOUNT_VALUES[i]; break; }
    }

    // Animate through numbers rapidly then slow down
    let tick = 0;
    const totalTicks = 30 + Math.floor(Math.random() * 10);
    
    intervalRef.current = setInterval(() => {
      tick++;
      const progress = tick / totalTicks;
      
      if (progress < 0.7) {
        // Fast spinning
        setDisplayValue(DISCOUNT_VALUES[Math.floor(Math.random() * DISCOUNT_VALUES.length)]);
      } else if (progress < 0.9) {
        // Slowing down - show nearby values
        const nearby = [finalDiscount - 1, finalDiscount, finalDiscount + 1, finalDiscount].filter(v => v >= 1 && v <= 10);
        setDisplayValue(nearby[Math.floor(Math.random() * nearby.length)]);
      } else {
        // Final value
        setDisplayValue(finalDiscount);
      }

      if (tick >= totalTicks) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setDisplayValue(finalDiscount);
        setResult(finalDiscount);
        setSpinning(false);
        setTimeout(() => onComplete(finalDiscount), 800);
      }
    }, tick < totalTicks * 0.7 ? 60 : 60 + (tick - totalTicks * 0.7) * 30);
  };

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 py-6 px-4">
      <div className="flex items-center gap-2 text-primary">
        <Gift className="h-5 w-5" />
        <h3 className="font-bold text-base">
          {isRTL ? "ادور العجلة واحصل على خصمك!" : "Spin & get your discount!"}
        </h3>
      </div>

      {/* Roulette display */}
      <div className="relative">
        <motion.div
          className={`w-24 h-24 rounded-2xl border-4 flex items-center justify-center ${
            result ? "border-primary bg-primary/10" : spinning ? "border-primary/50 bg-primary/5" : "border-border bg-muted/50"
          }`}
          animate={spinning ? { 
            scale: [1, 1.05, 1],
            borderColor: ["hsl(var(--primary) / 0.5)", "hsl(var(--primary))", "hsl(var(--primary) / 0.5)"]
          } : result ? { scale: [1, 1.15, 1] } : {}}
          transition={spinning ? { duration: 0.3, repeat: Infinity } : { duration: 0.4 }}
        >
          <motion.span 
            className="text-3xl font-black text-primary"
            key={displayValue}
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.05 }}
          >
            {spinning || result ? `${displayValue}%` : "?%"}
          </motion.span>
        </motion.div>
        
        {result && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1, rotate: [0, 10, -10, 0] }}
            className="absolute -top-2 -right-2 bg-primary text-primary-foreground rounded-full p-1"
          >
            <Sparkles className="h-4 w-4" />
          </motion.div>
        )}
      </div>

      {!result && (
        <Button
          onClick={spin}
          disabled={spinning}
          className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 font-bold px-6"
          size="sm"
        >
          {spinning ? (
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.5, repeat: Infinity, ease: "linear" }}>
              <Sparkles className="h-4 w-4" />
            </motion.div>
          ) : (
            <Gift className="h-4 w-4" />
          )}
          {spinning 
            ? (isRTL ? "جاري الدوران..." : "Spinning...") 
            : (isRTL ? "ادور العجلة!" : "Spin now!")}
        </Button>
      )}

      {result && (
        <motion.p
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm font-bold text-primary"
        >
          {isRTL ? `🎉 مبروك! حصلت على خصم ${result}%` : `🎉 You got ${result}% off!`}
        </motion.p>
      )}
    </div>
  );
};

const SmartUpsell = ({ cartProductIds, currentCategoryId, onAddToOrder }: SmartUpsellProps) => {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === "ar";
  const [variant, setVariant] = useState<UpsellVariant | null>(null);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const [dismissed, setDismissed] = useState(false);
  const [added, setAdded] = useState(false);
  const [discount, setDiscount] = useState<number | null>(null);
  const [phase, setPhase] = useState<"roulette" | "offer">("roulette");

  const fetchUpsell = useCallback(async () => {
    try {
      let query = db
        .from("product_variants")
        .select("id, name, name_en, price, product_id, created_at, products!inner(id, name, name_en, image_url, category_id, is_active, sales_count)")
        .eq("is_active", true)
        .eq("products.is_active", true)
        .gt("price", 0)
        .order("created_at", { ascending: false })
        .limit(50);

      if (currentCategoryId) {
        query = query.eq("products.category_id", currentCategoryId);
      }

      const { data } = await query;
      if (!data || data.length === 0) return;

      const filtered = data.filter((v: any) => !cartProductIds.includes(v.product_id));
      if (filtered.length === 0) return;

      const pick = filtered[Math.floor(Math.random() * filtered.length)];
      const product = (pick as any).products;

      setVariant({
        id: pick.id,
        name: pick.name,
        name_en: pick.name_en,
        price: pick.price,
        product_id: pick.product_id,
        product_name: product.name,
        product_name_en: product.name_en,
        product_image_url: product.image_url,
      });
    } catch {
      // Silently fail
    }
  }, [cartProductIds, currentCategoryId]);

  useEffect(() => {
    if (cartProductIds.length > 0) fetchUpsell();
  }, [fetchUpsell, cartProductIds]);

  // Timer only starts after roulette completes
  useEffect(() => {
    if (!variant || dismissed || added || phase !== "offer") return;
    if (timeLeft <= 0) { setDismissed(true); return; }
    const interval = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [variant, dismissed, added, timeLeft, phase]);

  const handleRouletteComplete = (discountPercent: number) => {
    setDiscount(discountPercent);
    setPhase("offer");
  };

  if (!variant || dismissed || added) return null;

  const discountFraction = (discount || 5) / 100;
  const discountedPrice = +(variant.price * (1 - discountFraction)).toFixed(2);
  const savedAmount = +(variant.price - discountedPrice).toFixed(2);
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const displayName = isRTL ? variant.name : (variant.name_en || variant.name);
  const productName = isRTL ? variant.product_name : (variant.product_name_en || variant.product_name);
  const urgency = timeLeft < 60;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative overflow-hidden rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-background to-accent/10"
      >
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-2 right-2 z-10 h-6 w-6 rounded-full bg-muted/80 flex items-center justify-center hover:bg-muted transition-colors"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>

        {/* Header */}
        <div className="bg-gradient-to-r from-primary to-primary/80 px-4 py-2 flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary-foreground" />
          <span className="text-xs font-bold text-primary-foreground tracking-wide uppercase">
            {isRTL ? "عرض حصري لك!" : "Exclusive offer for you!"}
          </span>
          <div className="mr-auto" />
          {phase === "offer" && (
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
              urgency ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-primary-foreground/20 text-primary-foreground"
            }`}>
              <Clock className="h-3 w-3" />
              {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
            </div>
          )}
        </div>

        {/* Phase: Roulette or Offer */}
        {phase === "roulette" ? (
          <DiscountRoulette onComplete={handleRouletteComplete} isRTL={isRTL} />
        ) : (
          <>
            <div className="p-4 flex gap-4 items-center" dir={isRTL ? "rtl" : "ltr"}>
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-muted overflow-hidden flex-shrink-0 border border-border">
                {variant.product_image_url ? (
                  <img src={variant.product_image_url} alt={displayName} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-muted">
                    <Flame className="h-8 w-8 text-primary/40" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground truncate">{productName}</p>
                <h4 className="font-bold text-sm text-foreground truncate">{displayName}</h4>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-lg font-bold text-primary">${discountedPrice}</span>
                  <span className="text-sm text-muted-foreground line-through">${variant.price}</span>
                  <span className="text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-md">
                    -{discount}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isRTL ? `وفّر $${savedAmount}` : `Save $${savedAmount}`}
                </p>
              </div>

              <Button
                size="sm"
                className="shrink-0 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground font-bold shadow-md"
                onClick={() => {
                  setAdded(true);
                  onAddToOrder({
                    id: variant.product_id,
                    name: variant.product_name,
                    name_en: variant.product_name_en,
                    price: variant.price,
                    image_url: variant.product_image_url,
                    category_id: null,
                  }, discountedPrice);
                }}
              >
                <Plus className="h-4 w-4" />
                {isRTL ? "أضف" : "Add"}
              </Button>
            </div>

            <div className="h-1 bg-muted">
              <motion.div
                className={`h-full ${urgency ? "bg-destructive" : "bg-primary"}`}
                initial={{ width: "100%" }}
                animate={{ width: `${(timeLeft / TIMER_SECONDS) * 100}%` }}
                transition={{ duration: 1, ease: "linear" }}
              />
            </div>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default SmartUpsell;
