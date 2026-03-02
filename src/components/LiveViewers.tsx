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
    // Generate a realistic number based on product popularity
    const base = Math.min(Math.max(Math.floor(salesCount / 5), 1), 15);
    const variation = Math.floor(Math.random() * 5);
    setViewers(base + variation);

    // Periodically change viewers slightly
    const interval = setInterval(() => {
      setViewers(prev => {
        const change = Math.random() > 0.5 ? 1 : -1;
        const next = prev + change;
        return Math.max(1, Math.min(next, base + 10));
      });
    }, 5000 + Math.random() * 10000);

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
