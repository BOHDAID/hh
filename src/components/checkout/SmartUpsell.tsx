import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "@/lib/supabaseClient";
import { Zap, Clock, Plus, X, Flame } from "lucide-react";
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

const UPSELL_DISCOUNT = 0.15;
const TIMER_SECONDS = 300;

const SmartUpsell = ({ cartProductIds, currentCategoryId, onAddToOrder }: SmartUpsellProps) => {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === "ar";
  const [variant, setVariant] = useState<UpsellVariant | null>(null);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const [dismissed, setDismissed] = useState(false);
  const [added, setAdded] = useState(false);

  const fetchUpsell = useCallback(async () => {
    try {
      let query = db
        .from("product_variants")
        .select("id, name, name_en, price, product_id, products!inner(id, name, name_en, image_url, category_id, is_active, sales_count)")
        .eq("is_active", true)
        .eq("products.is_active", true)
        .gt("price", 0)
        .order("price", { ascending: true })
        .limit(15);

      if (currentCategoryId) {
        query = query.eq("products.category_id", currentCategoryId);
      }

      const { data } = await query;

      if (!data || data.length === 0) return;

      // Filter out variants whose product is already in cart
      const filtered = data.filter((v: any) => !cartProductIds.includes(v.product_id));
      if (filtered.length === 0) return;

      const pick = filtered[Math.floor(Math.random() * Math.min(filtered.length, 5))];
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
    if (cartProductIds.length > 0) {
      fetchUpsell();
    }
  }, [fetchUpsell, cartProductIds]);

  useEffect(() => {
    if (!variant || dismissed || added) return;
    if (timeLeft <= 0) { setDismissed(true); return; }
    const interval = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [variant, dismissed, added, timeLeft]);

  if (!variant || dismissed || added) return null;

  const discountedPrice = +(variant.price * (1 - UPSELL_DISCOUNT)).toFixed(2);
  const savedAmount = +(variant.price - discountedPrice).toFixed(2);
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const displayName = isRTL
    ? `${variant.name}`
    : `${variant.name_en || variant.name}`;
  const productName = isRTL
    ? variant.product_name
    : (variant.product_name_en || variant.product_name);
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

        <div className="p-4 flex gap-4 items-center" dir={isRTL ? "rtl" : "ltr"}>
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-muted overflow-hidden flex-shrink-0 border border-border">
            {variant.product_image_url ? (
              <img
                src={variant.product_image_url}
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

          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-muted-foreground truncate">{productName}</p>
            <h4 className="font-bold text-sm text-foreground truncate">{displayName}</h4>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-lg font-bold text-primary">${discountedPrice}</span>
              <span className="text-sm text-muted-foreground line-through">${variant.price}</span>
              <span className="text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-md">
                -{Math.round(UPSELL_DISCOUNT * 100)}%
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
      </motion.div>
    </AnimatePresence>
  );
};

export default SmartUpsell;
