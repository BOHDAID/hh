import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Zap, Clock, ArrowLeft, Flame, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";

interface FlashSale {
  id: string;
  product_id: string;
  variant_id: string | null;
  original_price: number;
  sale_price: number;
  ends_at: string;
  products: { name: string; image_url: string | null };
}

const FlashSaleBanner = () => {
  const navigate = useNavigate();
  const [sales, setSales] = useState<FlashSale[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    fetchActiveSales();
  }, []);

  useEffect(() => {
    if (sales.length === 0) return;

    const interval = setInterval(() => {
      const now = Date.now();
      // Get the nearest ending sale
      const nearestEnd = Math.min(...sales.map(s => new Date(s.ends_at).getTime()));
      const diff = nearestEnd - now;

      if (diff <= 0) {
        fetchActiveSales();
        return;
      }

      setTimeLeft({
        hours: Math.floor(diff / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [sales]);

  const fetchActiveSales = async () => {
    const now = new Date().toISOString();
    const { data } = await db
      .from("flash_sales")
      .select("*, products(name, image_url)")
      .eq("is_active", true)
      .lte("starts_at", now)
      .gt("ends_at", now)
      .order("ends_at", { ascending: true })
      .limit(10);

    if (data) setSales(data as unknown as FlashSale[]);
  };

  if (sales.length === 0) return null;

  return (
    <>
      {/* Floating Notification Button */}
      <motion.div
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.5, type: "spring", stiffness: 100 }}
        className="fixed right-4 bottom-24 z-50"
      >
        <motion.button
          onClick={() => setIsOpen(true)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="relative flex items-center gap-2 bg-gradient-to-r from-orange-500 to-rose-500 text-white px-4 py-3 rounded-full shadow-lg hover:shadow-xl transition-shadow"
        >
          {/* Pulse Animation */}
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-yellow-400"></span>
          </span>
          
          <motion.div
            animate={{ rotate: [0, -10, 10, 0] }}
            transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
          >
            <Flame className="h-5 w-5" />
          </motion.div>
          <span className="font-bold text-sm">عروض خاطفة!</span>
          <Badge variant="secondary" className="bg-white/20 text-white text-xs">
            {sales.length}
          </Badge>
        </motion.button>
      </motion.div>

      {/* Drawer with Sales */}
      <Drawer open={isOpen} onOpenChange={setIsOpen}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="border-b pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-r from-orange-500 to-rose-500 rounded-full">
                  <Flame className="h-5 w-5 text-white" />
                </div>
                <div>
                  <DrawerTitle className="text-xl">عروض خاطفة 🔥</DrawerTitle>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                    <Clock className="h-4 w-4" />
                    <span>
                      تنتهي خلال {String(timeLeft.hours).padStart(2, "0")}:
                      {String(timeLeft.minutes).padStart(2, "0")}:
                      {String(timeLeft.seconds).padStart(2, "0")}
                    </span>
                  </div>
                </div>
              </div>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon">
                  <X className="h-5 w-5" />
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>
          
          <div className="p-4 overflow-y-auto">
            <div className="grid gap-3">
              {sales.map((sale) => {
                const discount = Math.round((1 - sale.sale_price / sale.original_price) * 100);
                return (
                  <motion.div
                    key={sale.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-4 p-3 bg-muted/50 rounded-xl border hover:border-primary/50 transition-colors"
                  >
                    {/* Product Image */}
                    <div className="relative shrink-0">
                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-background">
                        {sale.products.image_url ? (
                          <img
                            src={sale.products.image_url}
                            alt={sale.products.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Zap className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <Badge className="absolute -top-2 -right-2 bg-rose-500 text-white text-xs px-1.5">
                        -{discount}%
                      </Badge>
                    </div>

                    {/* Product Info */}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-sm truncate">
                        {sale.products.name}
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-muted-foreground line-through text-xs">
                          ${sale.original_price}
                        </span>
                        <span className="text-primary font-bold">
                          ${sale.sale_price}
                        </span>
                      </div>
                    </div>

                    {/* CTA */}
                    <Button
                      size="sm"
                      onClick={() => {
                        const url = sale.variant_id
                          ? `/checkout/${sale.product_id}?variant=${sale.variant_id}`
                          : `/checkout/${sale.product_id}`;
                        navigate(url);
                        setIsOpen(false);
                      }}
                      className="shrink-0 gap-1"
                    >
                      <span>اشتري</span>
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
};

export default FlashSaleBanner;
