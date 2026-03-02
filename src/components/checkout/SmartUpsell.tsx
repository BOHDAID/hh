import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "@/lib/supabaseClient";
import { Zap, Clock, Plus, X, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

interface UpsellProduct {
  id: string;
  name: string;
  name_en: string | null;
  price: number;
  image_url: string | null;
  category_id: string | null;
}

interface SmartUpsellProps {
  cartProductIds: string[];
  currentCategoryId?: string | null;
  onAddToOrder: (product: UpsellProduct, discountedPrice: number) => void;
}

const UPSELL_DISCOUNT = 0.15; // 15% off
const TIMER_SECONDS = 300; // 5 minutes

const SmartUpsell = ({ cartProductIds, currentCategoryId, onAddToOrder }: SmartUpsellProps) => {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === "ar";
  const [product, setProduct] = useState<UpsellProduct | null>(null);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const [dismissed, setDismissed] = useState(false);
  const [added, setAdded] = useState(false);

  const fetchUpsell = useCallback(async () => {
    try {
      // Strategy: find a product from the same category, or best sellers, not already in cart
      let query = db
        .from("products")
        .select("id, name, name_en, price, image_url, category_id")
        .eq("is_active", true)
        .not("id", "in", `(${cartProductIds.join(",")})`)
        .gt("price", 0)
        .order("sales_count", { ascending: false })
        .limit(10);

      if (currentCategoryId) {
        query = query.eq("category_id", currentCategoryId);
      }

      const { data } = await query;

      if (!data || data.length === 0) {
        // Fallback: any popular product not in cart
        const { data: fallback } = await db
          .from("products")
          .select("id, name, name_en, price, image_url, category_id")
          .eq("is_active", true)
          .not("id", "in", `(${cartProductIds.join(",")})`)
          .gt("price", 0)
          .order("sales_count", { ascending: false })
          .limit(5);

        if (fallback && fallback.length > 0) {
          const random = fallback[Math.floor(Math.random() * fallback.length)];
          setProduct(random);
        }
        return;
      }

      // Pick a random one from top results for variety
      const random = data[Math.floor(Math.random() * Math.min(data.length, 5))];
      setProduct(random);
    } catch {
      // Silently fail - upsell is non-critical
    }
  }, [cartProductIds, currentCategoryId]);

  useEffect(() => {
    if (cartProductIds.length > 0) {
      fetchUpsell();
    }
  }, [fetchUpsell, cartProductIds]);

  // Countdown timer
  useEffect(() => {
    if (!product || dismissed || added) return;
    if (timeLeft <= 0) {
      setDismissed(true);
      return;
    }
    const interval = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [product, dismissed, added, timeLeft]);

  if (!product || dismissed || added) return null;

  const discountedPrice = +(product.price * (1 - UPSELL_DISCOUNT)).toFixed(2);
  const savedAmount = +(product.price - discountedPrice).toFixed(2);
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const displayName = isRTL ? product.name : (product.name_en || product.name);
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
        {/* Dismiss button */}
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-2 right-2 z-10 h-6 w-6 rounded-full bg-muted/80 flex items-center justify-center hover:bg-muted transition-colors"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>

        {/* Header ribbon */}
        <div className="bg-gradient-to-r from-primary to-primary/80 px-4 py-2 flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary-foreground" />
          <span className="text-xs font-bold text-primary-foreground tracking-wide uppercase">
            {isRTL ? "عرض حصري لك!" : "Exclusive offer for you!"}
          </span>
          <div className="mr-auto" />
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
            urgency ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-primary-foreground/20 text-primary-foreground"
          }`}>
            <Clock className="h-3 w-3" />
            {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
          </div>
        </div>

        {/* Content */}
        <div className="p-4 flex gap-4 items-center" dir={isRTL ? "rtl" : "ltr"}>
          {/* Product image */}
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-muted overflow-hidden flex-shrink-0 border border-border">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={displayName}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-muted">
                <Flame className="h-8 w-8 text-primary/40" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-sm text-foreground truncate">{displayName}</h4>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-lg font-bold text-primary">${discountedPrice}</span>
              <span className="text-sm text-muted-foreground line-through">${product.price}</span>
              <span className="text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-md">
                -{Math.round(UPSELL_DISCOUNT * 100)}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isRTL ? `وفّر $${savedAmount}` : `Save $${savedAmount}`}
            </p>
          </div>

          {/* Add button */}
          <Button
            size="sm"
            className="shrink-0 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground font-bold shadow-md"
            onClick={() => {
              setAdded(true);
              onAddToOrder(product, discountedPrice);
            }}
          >
            <Plus className="h-4 w-4" />
            {isRTL ? "أضف" : "Add"}
          </Button>
        </div>

        {/* Progress bar showing time urgency */}
        <div className="h-1 bg-muted">
          <motion.div
            className={`h-full ${urgency ? "bg-destructive" : "bg-primary"}`}
            initial={{ width: "100%" }}
            animate={{ width: `${(timeLeft / TIMER_SECONDS) * 100}%` }}
            transition={{ duration: 1, ease: "linear" }}
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SmartUpsell;
