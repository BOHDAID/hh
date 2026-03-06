import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { db, getAuthClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { 
  Loader2, Smartphone, Crown, Plus, Trash2, 
  ShoppingCart, Calendar, Wifi, WifiOff, User as UserIcon
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

interface TelegramSession {
  id: string;
  session_string: string;
  telegram_user: {
    id?: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    phone?: string;
  } | null;
  created_at: string;
  updated_at: string;
}

interface Subscription {
  id: string;
  status: string;
  ends_at: string;
  max_sessions: number;
  is_trial: boolean;
  plan_id: string | null;
}

const ProfileSessions = ({ userId }: { userId: string }) => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<TelegramSession[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [userId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch sessions and subscription in parallel
      const [sessionsRes, subsRes] = await Promise.all([
        db.from("telegram_sessions")
          .select("id, session_string, telegram_user, created_at, updated_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
        db.from("telegram_subscriptions")
          .select("*")
          .eq("user_id", userId)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

      setSessions((sessionsRes.data as TelegramSession[]) || []);
      
      const sub = subsRes.data?.[0] || null;
      if (sub) {
        const now = new Date();
        const end = new Date(sub.ends_at);
        if (end > now) {
          setSubscription(sub as Subscription);
        } else {
          setSubscription(null);
        }
      }
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    setDeleting(sessionId);
    try {
      const { error } = await db
        .from("telegram_sessions")
        .delete()
        .eq("id", sessionId)
        .eq("user_id", userId);
      
      if (error) throw error;
      
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      toast({
        title: isRTL ? "تم الحذف" : "Deleted",
        description: isRTL ? "تم حذف الجلسة بنجاح" : "Session deleted successfully",
      });
    } catch {
      toast({
        title: isRTL ? "خطأ" : "Error",
        description: isRTL ? "فشل في حذف الجلسة" : "Failed to delete session",
        variant: "destructive",
      });
    } finally {
      setDeleting(null);
    }
  };

  const maxSessions = subscription?.max_sessions || 0;
  const usedSessions = sessions.length;
  const canAddMore = subscription && usedSessions < maxSessions;
  const hasSubscription = !!subscription;

  if (loading) {
    return (
      <div className="glass rounded-2xl p-8 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/15">
            <Smartphone className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">
              {isRTL ? "جلسات تليجرام" : "Telegram Sessions"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isRTL 
                ? `${usedSessions} من ${maxSessions || 0} جلسة مستخدمة` 
                : `${usedSessions} of ${maxSessions || 0} sessions used`}
            </p>
          </div>
        </div>

        {/* Subscription badge */}
        {hasSubscription ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/15 text-green-600 dark:text-green-400 text-xs font-medium">
            <Crown className="h-3.5 w-3.5" />
            {isRTL ? "مشترك" : "Active"}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">
            <WifiOff className="h-3.5 w-3.5" />
            {isRTL ? "بدون اشتراك" : "No Plan"}
          </div>
        )}
      </div>

      {/* Usage bar */}
      {hasSubscription && (
        <div className="space-y-2">
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div 
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${maxSessions > 0 ? (usedSessions / maxSessions) * 100 : 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{isRTL ? "المستخدمة" : "Used"}: {usedSessions}</span>
            <span>{isRTL ? "المتاحة" : "Available"}: {Math.max(0, maxSessions - usedSessions)}</span>
          </div>
        </div>
      )}

      {/* Sessions list */}
      {sessions.length > 0 ? (
        <div className="space-y-3">
          {sessions.map((session) => {
            const user = session.telegram_user;
            const displayName = user 
              ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || user.phone || 'Unknown'
              : (isRTL ? 'جلسة غير معروفة' : 'Unknown Session');
            const username = user?.username ? `@${user.username}` : null;
            
            return (
              <div 
                key={session.id} 
                className="flex items-center justify-between p-3.5 rounded-xl bg-muted/50 border border-border/50 hover:border-border transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <UserIcon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {displayName}
                    </p>
                    {username && (
                      <p className="text-xs text-muted-foreground truncate" dir="ltr">
                        {username}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                  onClick={() => handleDeleteSession(session.id)}
                  disabled={deleting === session.id}
                >
                  {deleting === session.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-6 text-muted-foreground">
          <Smartphone className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">
            {isRTL ? "لا توجد جلسات مسجلة" : "No sessions registered"}
          </p>
        </div>
      )}

      {/* Action button */}
      {!hasSubscription ? (
        <Link to="/auto-dashboard">
          <Button variant="hero" className="w-full gap-2">
            <ShoppingCart className="h-4 w-4" />
            {isRTL ? "اشترك للحصول على جلسات" : "Subscribe to get sessions"}
          </Button>
        </Link>
      ) : canAddMore ? (
        <Link to="/auto-dashboard">
          <Button variant="outline" className="w-full gap-2">
            <Plus className="h-4 w-4" />
            {isRTL ? "إضافة جلسة جديدة" : "Add new session"}
          </Button>
        </Link>
      ) : (
        <Link to="/auto-dashboard">
          <Button variant="outline" className="w-full gap-2">
            <Crown className="h-4 w-4" />
            {isRTL 
              ? "ترقية الاشتراك لإضافة جلسات أكثر" 
              : "Upgrade plan for more sessions"}
          </Button>
        </Link>
      )}
    </div>
  );
};

export default ProfileSessions;
