import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye } from "lucide-react";
import { useTranslation } from "react-i18next";
import { db } from "@/lib/supabaseClient";

interface LiveViewersProps {
  productId: string;
  salesCount?: number;
}

const LiveViewers = ({ productId, salesCount = 0 }: LiveViewersProps) => {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === "ar";
  const [viewers, setViewers] = useState(0);
  const channelRef = useRef<ReturnType<typeof db.channel> | null>(null);

  useEffect(() => {
    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    const channel = db.channel(`product-viewers-${productId}`, {
      config: { presence: { key: uniqueId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const count = Object.keys(state).length;
        setViewers(count);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ product_id: productId, joined_at: new Date().toISOString() });
        }
      });

    channelRef.current = channel;

    return () => {
      channel.untrack();
      db.removeChannel(channel);
    };
  }, [productId]);

  if (viewers < 1) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
      </span>
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
            ? `${viewers} ${viewers === 1 ? "يشاهد الآن" : "يشاهدون الآن"}`
            : `${viewers} viewing now`
          }
        </motion.span>
      </AnimatePresence>
    </motion.div>
  );
};

export default LiveViewers;
