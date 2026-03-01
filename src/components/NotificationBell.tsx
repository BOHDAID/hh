import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "@/lib/supabaseClient";
import { useAppData } from "./AppInitializer";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

const NotificationBell = () => {
  const { user } = useAppData();
  const { i18n } = useTranslation();
  const isRTL = i18n.language === "ar";
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const fetchNotifications = async () => {
      const { data } = await db
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (data) {
        setNotifications(data as Notification[]);
        setUnreadCount((data as Notification[]).filter((n) => !n.is_read).length);
      }
    };

    fetchNotifications();

    // Realtime subscription
    const channel = db
      .channel("user-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications((prev) => [newNotif, ...prev].slice(0, 20));
          setUnreadCount((prev) => prev + 1);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [user]);

  const markAllRead = async () => {
    if (!user || unreadCount === 0) return;
    await db
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "order": return "📦";
      case "coupon": return "🎟️";
      case "stock": return "🔔";
      case "wallet": return "💰";
      default: return "ℹ️";
    }
  };

  if (!user) return null;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => {
          setOpen(!open);
          if (!open && unreadCount > 0) markAllRead();
        }}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground flex items-center justify-center"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </motion.span>
        )}
      </Button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`absolute top-full mt-2 z-50 w-80 max-h-96 overflow-y-auto rounded-xl border border-border bg-card shadow-xl ${isRTL ? "left-0" : "right-0"}`}
            >
              <div className="sticky top-0 bg-card border-b border-border p-3 flex items-center justify-between">
                <span className="font-bold text-sm">{isRTL ? "الإشعارات" : "Notifications"}</span>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                    {isRTL ? "قراءة الكل" : "Mark all read"}
                  </button>
                )}
              </div>

              {notifications.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  {isRTL ? "لا توجد إشعارات" : "No notifications"}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {notifications.map((n) => {
                    const content = (
                      <div
                        key={n.id}
                        className={`p-3 hover:bg-muted/50 transition-colors cursor-pointer ${!n.is_read ? "bg-primary/5" : ""}`}
                        onClick={() => setOpen(false)}
                      >
                        <div className="flex gap-2">
                          <span className="text-lg flex-shrink-0">{getTypeIcon(n.type)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{n.title}</p>
                            <p className="text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {formatDistanceToNow(new Date(n.created_at), {
                                addSuffix: true,
                                locale: isRTL ? ar : undefined,
                              })}
                            </p>
                          </div>
                          {!n.is_read && (
                            <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                          )}
                        </div>
                      </div>
                    );

                    return n.link ? (
                      <Link key={n.id} to={n.link}>
                        {content}
                      </Link>
                    ) : (
                      <div key={n.id}>{content}</div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationBell;
