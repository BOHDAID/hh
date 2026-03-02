import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye } from "lucide-react";
import { useTranslation } from "react-i18next";

interface LiveViewersProps {
  productId: string;
  salesCount?: number;
}

const LiveViewers = ({ productId, salesCount = 0 }: LiveViewersProps) => {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === "ar";
  const [viewers, setViewers] = useState(0);

  useEffect(() => {
    // More realistic: use product ID hash + time-of-day pattern
    const hash = productId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const hour = new Date().getHours();
    // Peak hours: 18-23, low: 3-8
    const hourMultiplier = hour >= 18 ? 1.5 : hour >= 12 ? 1.2 : hour >= 8 ? 0.8 : 0.4;
    
    const popularity = Math.min(Math.max(salesCount, 1), 200);
    const base = Math.max(1, Math.round(Math.sqrt(popularity) * hourMultiplier));
    const seed = (hash + Math.floor(Date.now() / 30000)) % 7;
    setViewers(Math.max(1, base + seed));

    const interval = setInterval(() => {
      setViewers(prev => {
        const rand = Math.random();
        // 60% no change, 25% +1, 15% -1
        if (rand < 0.6) return prev;
        const change = rand < 0.85 ? 1 : -1;
        return Math.max(1, Math.min(prev + change, base + 8));
      });
    }, 8000 + Math.random() * 12000);

    return () => clearInterval(interval);
  }, [productId, salesCount]);

  if (viewers < 2) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
    >
      <motion.div
        animate={{ scale: [1, 1.3, 1] }}
        transition={{ repeat: Infinity, duration: 1.5 }}
      >
        <Eye className="h-3 w-3 text-orange-500" />
      </motion.div>
      <AnimatePresence mode="wait">
        <motion.span
          key={viewers}
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 5 }}
          transition={{ duration: 0.2 }}
          className="font-medium"
        >
          {isRTL 
            ? `${viewers} يشاهدون الآن`
            : `${viewers} viewing now`
          }
        </motion.span>
      </AnimatePresence>
    </motion.div>
  );
};

export default LiveViewers;
