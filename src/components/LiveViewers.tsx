import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";

interface LiveViewersProps {
  productId: string;
  salesCount?: number;
}

const LiveViewers = ({ productId, salesCount = 0 }: LiveViewersProps) => {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === "ar";
  const [viewers, setViewers] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    // Use Supabase Realtime Presence for real viewer tracking
    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    const channel = supabase.channel(`product-viewers-${productId}`, {
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
      supabase.removeChannel(channel);
    };
  }, [productId]);

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
        <Eye className="h-3 w-3 text-green-500" />
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
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse mr-1" />
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
