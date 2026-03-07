import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getAuthClient } from "@/lib/supabaseClient";
import { invokeCloudFunction } from "@/lib/cloudFunctions";
import { Button } from "@/components/ui/button";
import {
  Loader2, Smartphone, Crown, Plus, Trash2,
  ChevronDown, ChevronUp, LogOut, Check, Wifi,
  User as UserIcon, ShoppingCart
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import UpgradeSessionsModal from "./UpgradeSessionsModal";

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
  selected_groups: unknown;
  created_at: string;
}

interface AutomationState {
  mentions?: { running?: boolean };
  antiDelete?: { running?: boolean };
  autoReply?: { running?: boolean };
  autoPublish?: { running?: boolean };
}

interface SessionsPanelProps {
  activeSessionString: string;
  maxSessions: number;
  hasSubscription: boolean;
  onSwitchSession: (sessionString: string, user: any) => Promise<void> | void;
  onLogout: () => void;
  onAddNewSession: () => void;
}

const parseMaybeJson = <T,>(value: unknown, fallback: T): T => {
  if (value === null || value === undefined) return fallback;

  let current: unknown = value;
  for (let i = 0; i < 3; i += 1) {
    if (typeof current !== "string") break;
    const trimmed = current.trim();
    if (!trimmed) break;

    try {
      current = JSON.parse(trimmed);
    } catch {
      break;
    }
  }

  if (current === null || current === undefined) return fallback;
  return current as T;
};

function getAutomationFromPayload(raw: unknown): AutomationState {
  if (!raw) return {};
  const parsed = parseMaybeJson<unknown>(raw, raw);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    if (obj.automation && typeof obj.automation === "object") {
      return obj.automation as AutomationState;
    }
  }
  return {};
}

function hasRunningTasks(automation: AutomationState): boolean {
  return !!(
    automation.mentions?.running ||
    automation.antiDelete?.running ||
    automation.autoReply?.running ||
    automation.autoPublish?.running
  );
}

function getRunningTasksCount(automation: AutomationState): number {
  let count = 0;
  if (automation.mentions?.running) count++;
  if (automation.antiDelete?.running) count++;
  if (automation.autoReply?.running) count++;
  if (automation.autoPublish?.running) count++;
  return count;
}

const SessionsPanel = ({
  activeSessionString,
  maxSessions,
  hasSubscription,
  onSwitchSession,
  onLogout,
  onAddNewSession,
}: SessionsPanelProps) => {
  const [expanded, setExpanded] = useState(false);
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedFromServer, setHasLoadedFromServer] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const callAccountAction = async (action: string, extra: Record<string, unknown> = {}) => {
    const authClient = getAuthClient();
    const { data: { session } } = await authClient.auth.getSession();
    if (!session?.access_token) throw new Error("يجب تسجيل الدخول أولاً");

    const { data, error } = await invokeCloudFunction<any>("osn-session", { action, ...extra }, session.access_token);
    if (error) throw error;
    if (data && !data.success) throw new Error(data.error || "فشل غير متوقع");
    return data;
  };

  useEffect(() => {
    fetchSessions();
  }, [activeSessionString]);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const data = await callAccountAction("tg-list-account-sessions");
      const normalized = ((data?.sessions || []) as any[])
        .filter((s) => typeof s?.session_string === "string" && s.session_string.trim().length > 0)
        .map((s) => ({
          id: s.session_string,
          session_string: s.session_string,
          telegram_user: parseMaybeJson(s.telegram_user, null),
          selected_groups: parseMaybeJson(s.selected_groups, null),
          created_at: s.updated_at || new Date().toISOString(),
        } as SavedSession));

      setSessions(normalized);
      setHasLoadedFromServer(true);
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
      await onSwitchSession(s.session_string, s.telegram_user);
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
      await callAccountAction("tg-delete-account-session", { sessionString: s.session_string });
      setSessions((prev) => prev.filter((x) => x.session_string !== s.session_string));
      toast.success("تم حذف الجلسة");
    } catch {
      toast.error("فشل في حذف الجلسة");
    } finally {
      setDeleting(null);
    }
  };

  const effectiveSessions = sessions.length
    ? sessions
    : (!hasLoadedFromServer && activeSessionString
      ? [{ id: activeSessionString, session_string: activeSessionString, telegram_user: null, selected_groups: null, created_at: "" }]
      : []);

  const usedSlots = effectiveSessions.length;
  const displayMaxSessions = Math.max(maxSessions, usedSlots > 0 ? 1 : 0);
  const canAddMore = hasSubscription && usedSlots < maxSessions;

  // Find active session info
  const activeSessionData = effectiveSessions.find(s => s.session_string === activeSessionString);
  const activeUser = activeSessionData?.telegram_user;
  const activeName = activeUser
    ? `${activeUser.firstName || ''} ${activeUser.lastName || ''}`.trim() || activeUser.username || activeUser.phone || 'جلسة'
    : 'جلسة متصلة';

  // Active session is always "connected" if it has a session string
  const activeIsConnected = !!activeSessionString;
  const activeAutomation = activeSessionData ? getAutomationFromPayload(activeSessionData.selected_groups) : {};
  const activeTasksCount = getRunningTasksCount(activeAutomation);

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
            {/* Connection status dot */}
            <div className={cn(
              "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card",
              activeIsConnected ? "bg-green-500" : "bg-destructive"
            )} />
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-foreground">{activeName}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{usedSlots} / {displayMaxSessions} جلسة</span>
              {activeIsConnected ? (
                <span className="flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
                  <Wifi className="h-3 w-3" /> متصل {activeTasksCount > 0 ? `(${activeTasksCount})` : ''}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-destructive font-medium">
                  غير متصل
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasSubscription && (
            <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium flex items-center gap-1">
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
              {effectiveSessions.map((s) => {
                const user = s.telegram_user;
                const name = user
                  ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || user.phone || 'جلسة'
                  : 'جلسة غير معروفة';
                const username = user?.username ? `@${user.username}` : null;
                const isActive = s.session_string === activeSessionString;
                const sessionConnected = !!s.session_string; // has session = connected
                const sessionAutomation = getAutomationFromPayload(s.selected_groups);
                const tasksCount = getRunningTasksCount(sessionAutomation);

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
                      <div className="relative">
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
                        {/* Per-session connection dot */}
                        <div className={cn(
                          "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2",
                          isActive ? "border-primary/10" : "border-muted/40",
                          sessionConnected ? "bg-green-500" : "bg-destructive"
                        )} />
                      </div>
                      <div className="min-w-0">
                        <p className={cn(
                          "text-sm font-medium truncate",
                          isActive ? "text-primary" : "text-foreground"
                        )}>
                          {name}
                        </p>
                        <div className="flex items-center gap-2">
                          {username && (
                            <p className="text-xs text-muted-foreground truncate" dir="ltr">
                              {username}
                            </p>
                          )}
                          {sessionConnected ? (
                            <span className="text-[10px] flex items-center gap-0.5 text-green-600 dark:text-green-400 font-medium">
                              <Wifi className="h-2.5 w-2.5" /> متصل {tasksCount > 0 ? `(${tasksCount} مهام)` : ''}
                            </span>
                          ) : (
                            <span className="text-[10px] text-destructive font-medium">
                              غير متصل
                            </span>
                          )}
                        </div>
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
                <Link to="/#telegram-plans" className="block">
                  <div className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-primary/10 text-primary text-sm font-medium">
                    <ShoppingCart className="h-4 w-4" />
                    اشترك للحصول على جلسات
                  </div>
                </Link>
              ) : usedSlots >= maxSessions ? (
                <>
                  <div className="text-center p-2 text-xs text-muted-foreground">
                    وصلت للحد الأقصى ({displayMaxSessions} جلسة) — <button onClick={() => setUpgradeOpen(true)} className="text-primary underline">ترقية الباقة</button>
                  </div>
                  <UpgradeSessionsModal open={upgradeOpen} onOpenChange={setUpgradeOpen} currentSessions={usedSlots} maxSessions={maxSessions} />
                </>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SessionsPanel;
