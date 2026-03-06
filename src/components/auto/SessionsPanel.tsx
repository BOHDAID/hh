import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { db, getAuthClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { 
  Loader2, Smartphone, Crown, Plus, Trash2, 
  ChevronDown, ChevronUp, LogOut, Check, WifiOff,
  User as UserIcon, ShoppingCart
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SavedSession {
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
}

interface SessionsPanelProps {
  activeSessionString: string;
  maxSessions: number;
  hasSubscription: boolean;
  subscriptionEndsAt?: string | null;
  onSwitchSession: (sessionString: string, user: any) => void;
  onLogout: () => void;
  onAddNewSession: () => void;
}

const SessionsPanel = ({
  activeSessionString,
  maxSessions,
  hasSubscription,
  subscriptionEndsAt,
  onSwitchSession,
  onLogout,
  onAddNewSession,
}: SessionsPanelProps) => {
  const [expanded, setExpanded] = useState(false);
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const authClient = getAuthClient();
      const { data: { session } } = await authClient.auth.getSession();
      if (!session) return;

      const { data } = await db
        .from("telegram_sessions")
        .select("id, session_string, telegram_user, created_at")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: true });

      setSessions((data as SavedSession[]) || []);
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitch = async (s: SavedSession) => {
    if (s.session_string === activeSessionString) return;
    setSwitching(s.id);
    try {
      onSwitchSession(s.session_string, s.telegram_user);
    } finally {
      setSwitching(null);
    }
  };

  const handleDelete = async (s: SavedSession) => {
    if (s.session_string === activeSessionString) {
      toast.error("لا يمكن حذف الجلسة النشطة. قم بتسجيل الخروج أولاً");
      return;
    }
    setDeleting(s.id);
    try {
      const authClient = getAuthClient();
      const { data: { session } } = await authClient.auth.getSession();
      if (!session) return;

      await db
        .from("telegram_sessions")
        .delete()
        .eq("id", s.id)
        .eq("user_id", session.user.id);

      setSessions(prev => prev.filter(x => x.id !== s.id));
      toast.success("تم حذف الجلسة");
    } catch {
      toast.error("فشل في حذف الجلسة");
    } finally {
      setDeleting(null);
    }
  };

  const usedSlots = sessions.length;
  const canAddMore = hasSubscription && usedSlots < maxSessions;

  // Find active session info
  const activeSession = sessions.find(s => s.session_string === activeSessionString);
  const activeUser = activeSession?.telegram_user;
  const activeName = activeUser
    ? `${activeUser.firstName || ''} ${activeUser.lastName || ''}`.trim() || activeUser.username || activeUser.phone || 'جلسة'
    : 'جلسة متصلة';

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Collapsed header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Smartphone className="h-5 w-5 text-primary" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-card" />
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-foreground">{activeName}</p>
            <p className="text-xs text-muted-foreground">
              {usedSlots} / {maxSessions} جلسة
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasSubscription && (
            <span className="text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
              <Crown className="h-3 w-3" /> مشترك
            </span>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded sessions list */}
      {expanded && (
        <div className="border-t border-border">
          {loading ? (
            <div className="flex justify-center p-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {/* Sessions */}
              {sessions.map((s) => {
                const user = s.telegram_user;
                const name = user
                  ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || user.phone || 'جلسة'
                  : 'جلسة غير معروفة';
                const username = user?.username ? `@${user.username}` : null;
                const isActive = s.session_string === activeSessionString;

                return (
                  <div
                    key={s.id}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-xl transition-all",
                      isActive
                        ? "bg-primary/10 border border-primary/30"
                        : "bg-muted/40 border border-transparent hover:border-border cursor-pointer"
                    )}
                    onClick={() => !isActive && handleSwitch(s)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0",
                        isActive ? "bg-primary/20" : "bg-muted"
                      )}>
                        {isActive ? (
                          <Check className="h-4 w-4 text-primary" />
                        ) : (
                          <UserIcon className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className={cn(
                          "text-sm font-medium truncate",
                          isActive ? "text-primary" : "text-foreground"
                        )}>
                          {name}
                        </p>
                        {username && (
                          <p className="text-xs text-muted-foreground truncate" dir="ltr">
                            {username}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      {switching === s.id && (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      )}
                      {isActive ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => { e.stopPropagation(); onLogout(); }}
                        >
                          <LogOut className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => { e.stopPropagation(); handleDelete(s); }}
                          disabled={deleting === s.id}
                        >
                          {deleting === s.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Add session / Subscribe button */}
              {canAddMore ? (
                <button
                  onClick={onAddNewSession}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-primary transition-all"
                >
                  <Plus className="h-4 w-4" />
                  <span className="text-sm font-medium">إضافة جلسة جديدة</span>
                </button>
              ) : !hasSubscription ? (
                <Link to="/auto-dashboard" className="block">
                  <div className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-primary/10 text-primary text-sm font-medium">
                    <ShoppingCart className="h-4 w-4" />
                    اشترك للحصول على جلسات
                  </div>
                </Link>
              ) : usedSlots >= maxSessions ? (
                <div className="text-center p-2 text-xs text-muted-foreground">
                  وصلت للحد الأقصى ({maxSessions} جلسة) — <Link to="/auto-dashboard" className="text-primary underline">ترقية الباقة</Link>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SessionsPanel;
