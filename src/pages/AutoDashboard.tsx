import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Bot, Home, LogIn, BookOpen, Users, Send, MessageSquare, User, CheckCircle2, Loader2, AlertCircle, Key, ExternalLink, Eye, EyeOff, Copy, Shield, AtSign, BarChart3, ChevronLeft, Sparkles, Zap, MessageCircleReply, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { invokeCloudFunction, invokeCloudFunctionPublic } from "@/lib/cloudFunctions";
import { getAuthClient } from "@/lib/supabaseClient";
import SessionsPanel from "@/components/auto/SessionsPanel";
import GroupsSelector from "@/components/auto/GroupsSelector";
import AutoPublishPanel from "@/components/auto/AutoPublishPanel";
import BroadcastPanel from "@/components/auto/BroadcastPanel";
import MentionsMonitorPanel from "@/components/auto/MentionsMonitorPanel";
import StatsPanel from "@/components/auto/StatsPanel";
import AutoReplyPanel from "@/components/auto/AutoReplyPanel";
import AntiDeletePanel from "@/components/auto/AntiDeletePanel";
import SubscriptionGate from "@/components/auto/SubscriptionGate";

interface TelegramUser {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  phone: string;
}

interface TelegramGroup {
  id: string;
  title: string;
  username: string | null;
  participantsCount: number;
  photo: string | null;
  type: "channel" | "supergroup" | "group";
}

interface MediaConfig {
  base64: string;
  fileName: string;
  mimeType: string;
  sendType: string;
}

interface MentionsAutomationState {
  taskId: string | null;
  running: boolean;
  channelId?: string | null;
}

interface AntiDeleteAutomationState {
  taskId: string | null;
  running: boolean;
}

interface AutoReplyAutomationState {
  taskId: string | null;
  running: boolean;
  replyMessage: string;
  mentionsChannelId?: string | null;
  media: MediaConfig | null;
}

interface AutoPublishAutomationState {
  taskId: string | null;
  running: boolean;
  message: string;
  intervalMinutes: number;
  forcedSubscription: boolean;
  groupIds: string[];
  mentionsChannelId?: string | null;
  media: MediaConfig | null;
}

interface AutomationState {
  mentions?: MentionsAutomationState;
  antiDelete?: AntiDeleteAutomationState;
  autoReply?: AutoReplyAutomationState;
  autoPublish?: AutoPublishAutomationState;
}

interface StoredSessionPayload {
  groups: TelegramGroup[];
  automation: AutomationState;
}

const AutoDashboard = () => {
  // Auth state
  const [loggedIn, setLoggedIn] = useState(false);
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null);
  const [maxSessions, setMaxSessions] = useState(1);
  const [subscriptionEndsAt, setSubscriptionEndsAt] = useState<string | null>(null);
  const [subscriptionIsTrial, setSubscriptionIsTrial] = useState(false);
  const [activeSession, setActiveSession] = useState("");
  const [autoConnecting, setAutoConnecting] = useState(false);

  // Login state
  const [sessionInput, setSessionInput] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [showLoginMode, setShowLoginMode] = useState<"login" | "instructions">("login");

  // Groups + automation state
  const [selectedGroups, setSelectedGroups] = useState<TelegramGroup[]>([]);
  const [savedMentionsChannelId, setSavedMentionsChannelId] = useState<string | null>(null);
  const [automationState, setAutomationState] = useState<AutomationState>({});

  // Active section - persist to localStorage
  const [activeFeature, setActiveFeatureState] = useState<string | null>(() => {
    try { return localStorage.getItem("tg-active-feature") || null; } catch { return null; }
  });
  const setActiveFeature = (f: string | null) => {
    setActiveFeatureState(f);
    try { if (f) localStorage.setItem("tg-active-feature", f); else localStorage.removeItem("tg-active-feature"); } catch {}
  };
  const [showStats, setShowStats] = useState(false);
  const resumeKeyRef = useRef<string | null>(null);

  const callAction = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await invokeCloudFunctionPublic<any>("osn-session", { action, ...extra });
    if (error) throw new Error(error.message);
    if (data && !data.success) throw new Error(data.error || "فشل غير متوقع");
    return data;
  };

  const callAccountAction = async (action: string, extra: Record<string, unknown> = {}) => {
    const authClient = getAuthClient();
    const { data: { session } } = await authClient.auth.getSession();
    if (!session?.access_token) throw new Error("يجب تسجيل الدخول في الحساب أولاً");
    const { data, error } = await invokeCloudFunction<any>("osn-session", { action, ...extra }, session.access_token);
    if (error) throw new Error(error.message);
    if (data && !data.success) throw new Error(data.error || "فشل غير متوقع");
    return data;
  };

  const parseStoredJson = <T,>(value: unknown, fallback: T): T => {
    if (value === null || value === undefined) return fallback;
    if (typeof value === "string") {
      try { return JSON.parse(value) as T; } catch { return fallback; }
    }
    return value as T;
  };

  const normalizeStoredSessionPayload = (rawValue: unknown): StoredSessionPayload => {
    const parsed = parseStoredJson<unknown>(rawValue, []);

    if (Array.isArray(parsed)) {
      return { groups: parsed as TelegramGroup[], automation: {} };
    }

    if (parsed && typeof parsed === "object") {
      const maybeObj = parsed as Record<string, unknown>;
      const groups = Array.isArray(maybeObj.groups)
        ? maybeObj.groups as TelegramGroup[]
        : Array.isArray(maybeObj.selectedGroups)
          ? maybeObj.selectedGroups as TelegramGroup[]
          : [];

      const automation = maybeObj.automation && typeof maybeObj.automation === "object"
        ? (maybeObj.automation as AutomationState)
        : {};

      return { groups, automation };
    }

    return { groups: [], automation: {} };
  };

  const saveSessionToAccount = async (sessionStr: string, user: TelegramUser | null, groups?: TelegramGroup[]) => {
    if (!sessionStr) return;
    await callAccountAction("tg-save-account-session", {
      sessionString: sessionStr,
      telegramUser: user,
      selectedGroups: groups ?? selectedGroups,
      automationState,
    });
  };

  const saveAutomationSection = async <K extends keyof AutomationState>(key: K, value: AutomationState[K]) => {
    setAutomationState((prev) => ({ ...prev, [key]: value }));
    await callAccountAction("tg-save-automation-state", {
      automationState: { [key]: value },
    });
  };

  // Auto-reconnect
  useEffect(() => {
    let mounted = true;
    const loadSession = async () => {
      setAutoConnecting(true);
      try {
        const data = await callAccountAction("tg-get-account-session");
        const saved = data?.session;
        if (!saved?.session_string || !mounted) return;
        try {
          const result = await callAction("tg-connect-session", { sessionString: saved.session_string });
          if (!mounted) return;
          const savedUser = parseStoredJson<TelegramUser | null>(saved.telegram_user, null);
          const storedPayload = normalizeStoredSessionPayload(saved.selected_groups);
          const restoredMentionsChannel = saved.mentions_channel_id || storedPayload.automation.mentions?.channelId || null;

          setLoggedIn(true);
          setTelegramUser(result.user || savedUser);
          setActiveSession(saved.session_string);
          setSelectedGroups(storedPayload.groups);
          setAutomationState(storedPayload.automation);
          setSavedMentionsChannelId(restoredMentionsChannel);
        } catch {
          await callAccountAction("tg-delete-account-session");
        }
      } catch {
        // not logged in or no saved session
      } finally {
        if (mounted) setAutoConnecting(false);
      }
    };
    loadSession();
    return () => { mounted = false; };
  }, []);

  // Auto-resume tasks after backend restart/deploy
  useEffect(() => {
    if (!loggedIn || !activeSession) return;
    if (resumeKeyRef.current === activeSession) return;
    resumeKeyRef.current = activeSession;

    const tryStart = async (action: string, payload: Record<string, unknown>) => {
      try {
        await callAction(action, payload);
      } catch (err: any) {
        const msg = String(err?.message || "");
        if (!/يعمل بالفعل|already|نشط|active/i.test(msg)) {
          console.warn(`Auto-resume failed for ${action}:`, msg);
        }
      }
    };

    const resume = async () => {
      const mentionsState = automationState.mentions;
      const channelId = savedMentionsChannelId || mentionsState?.channelId || null;

      if (mentionsState?.running && mentionsState.taskId && channelId) {
        await tryStart("tg-start-mentions-monitor", {
          sessionString: activeSession,
          channelId,
          taskId: mentionsState.taskId,
        });
      }

      const antiDeleteState = automationState.antiDelete;
      if (antiDeleteState?.running && antiDeleteState.taskId && channelId) {
        await tryStart("tg-start-anti-delete", {
          sessionString: activeSession,
          taskId: antiDeleteState.taskId,
          mentionsChannelId: channelId,
        });
      }

      const autoReplyState = automationState.autoReply;
      if (autoReplyState?.running && autoReplyState.taskId && (autoReplyState.replyMessage || autoReplyState.media)) {
        await tryStart("tg-start-auto-reply", {
          sessionString: activeSession,
          taskId: autoReplyState.taskId,
          replyMessage: autoReplyState.replyMessage || "",
          mentionsChannelId: channelId || autoReplyState.mentionsChannelId || undefined,
          mediaBase64: autoReplyState.media?.base64,
          mediaFileName: autoReplyState.media?.fileName,
          mediaMimeType: autoReplyState.media?.mimeType,
          mediaSendType: autoReplyState.media?.sendType,
        });
      }

      const autoPublishState = automationState.autoPublish;
      const groupIds = Array.isArray(autoPublishState?.groupIds)
        ? autoPublishState.groupIds.filter((id) => typeof id === "string")
        : [];

      if (autoPublishState?.running && autoPublishState.taskId && (autoPublishState.message || autoPublishState.media) && groupIds.length > 0) {
        await tryStart("tg-start-auto-publish", {
          sessionString: activeSession,
          taskId: autoPublishState.taskId,
          groupIds,
          message: autoPublishState.message || "",
          intervalMinutes: autoPublishState.intervalMinutes || 1,
          mentionsChannelId: channelId || autoPublishState.mentionsChannelId || undefined,
          mediaBase64: autoPublishState.media?.base64,
          mediaFileName: autoPublishState.media?.fileName,
          mediaMimeType: autoPublishState.media?.mimeType,
          mediaSendType: autoPublishState.media?.sendType,
          forcedSubscription: autoPublishState.forcedSubscription ?? true,
        });
      }
    };

    resume();
  }, [loggedIn, activeSession, savedMentionsChannelId, automationState]);

  // === Login ===
  const handleSessionLogin = async () => {
    if (!sessionInput.trim()) { toast.error("يرجى لصق Session String"); return; }
    setLoginLoading(true);
    setLoginError("");
    try {
      const result = await callAction("tg-connect-session", { sessionString: sessionInput.trim() });
      setLoggedIn(true);
      setTelegramUser(result.user || null);
      setActiveSession(sessionInput.trim());
      try {
        await saveSessionToAccount(sessionInput.trim(), result.user || null);
      } catch (saveErr: any) {
        toast.error(saveErr.message || "تعذر حفظ الجلسة في الحساب");
      }
      toast.success("تم الاتصال بنجاح!");
    } catch (err: any) {
      setLoginError(err.message);
      toast.error(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try { await callAccountAction("tg-delete-account-session"); } catch {}
    setLoggedIn(false);
    setTelegramUser(null);
    setActiveSession("");
    setSessionInput("");
    setSelectedGroups([]);
    setSavedMentionsChannelId(null);
    setAutomationState({});
  };

  // Wizard state
  type Step = "credentials" | "phone" | "otp" | "2fa" | "result";
  const [currentStep, setCurrentStep] = useState<Step>("credentials");
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [password2FA, setPassword2FA] = useState("");
  const [sessionString, setSessionString] = useState("");
  const [phoneCodeHash, setPhoneCodeHash] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showSession, setShowSession] = useState(false);
  const [loading, setLoading] = useState(false);
  const [needs2FA, setNeeds2FA] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const normalizePhone = (value: string) => {
    const cleaned = String(value || "").replace(/[\s\-\(\)]/g, "");
    if (!cleaned) return "";
    return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
  };

  const handleSendCode = async () => {
    if (!apiId || !apiHash || !phone) { toast.error("يرجى ملء جميع الحقول"); return; }
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone.length < 8) { toast.error("رقم الهاتف قصير جداً. تأكد من إدخال رمز الدولة (مثل: +966...)"); return; }
    setLoading(true); setErrorMsg("");
    try {
      const result = await callAction("tg-send-code", { apiId, apiHash, phone: normalizedPhone });
      setPhoneCodeHash(result.phoneCodeHash || "");
      setCurrentStep("otp");
      toast.success("تم إرسال الرمز إلى حسابك على Telegram");
    } catch (err: any) { setErrorMsg(err.message); toast.error(err.message); }
    finally { setLoading(false); }
  };

  const handleVerifyOTP = async () => {
    if (!otpCode) { toast.error("يرجى إدخال الرمز"); return; }
    const normalizedPhone = normalizePhone(phone);
    setLoading(true); setErrorMsg("");
    try {
      const result = await callAction("tg-verify-code", { apiId, phone: normalizedPhone, code: otpCode, phoneCodeHash });
      if (result.needs2FA) { setNeeds2FA(true); setCurrentStep("2fa"); }
      else { setSessionString(result.sessionString || ""); setCurrentStep("result"); }
    } catch (err: any) { setErrorMsg(err.message); toast.error(err.message); }
    finally { setLoading(false); }
  };

  const handleVerify2FA = async () => {
    if (!password2FA) { toast.error("يرجى إدخال كلمة المرور"); return; }
    const normalizedPhone = normalizePhone(phone);
    setLoading(true); setErrorMsg("");
    try {
      const result = await callAction("tg-verify-2fa", { apiId, phone: normalizedPhone, password: password2FA });
      setSessionString(result.sessionString || "");
      setCurrentStep("result");
    } catch (err: any) { setErrorMsg(err.message); toast.error(err.message); }
    finally { setLoading(false); }
  };

  const copyToClipboard = (text: string) => { navigator.clipboard.writeText(text); toast.success("تم النسخ!"); };

  const ErrorBox = ({ msg }: { msg: string }) => msg ? (
    <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-start gap-2">
      <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
      <p className="text-sm text-destructive">{msg}</p>
    </div>
  ) : null;

  // ============ LOGGED IN VIEW ============
  const loggedInView = (
      <div className="min-h-screen bg-background" dir="rtl">
        <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-md border-b border-border">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <h1 className="font-bold text-foreground">لوحة تحكم Telegram</h1>
            </div>
            <Link to="/">
              <Button variant="ghost" size="sm" className="gap-2 text-xs">
                <Home className="h-4 w-4" /> الرئيسية
              </Button>
            </Link>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
          <SessionsPanel
            activeSessionString={activeSession}
            maxSessions={maxSessions}
            hasSubscription={!!subscriptionEndsAt}
            subscriptionEndsAt={subscriptionEndsAt}
            onSwitchSession={async (sessionStr, user) => {
              try {
                await callAction("tg-connect-session", { sessionString: sessionStr });
                setActiveSession(sessionStr);
                setTelegramUser(user || null);
                // Reload stored data for this session
                const data = await callAccountAction("tg-get-account-session");
                const saved = data?.session;
                if (saved) {
                  const storedPayload = normalizeStoredSessionPayload(saved.selected_groups);
                  setSelectedGroups(storedPayload.groups);
                  setAutomationState(storedPayload.automation);
                  setSavedMentionsChannelId(saved.mentions_channel_id || null);
                }
                toast.success("تم التبديل للجلسة بنجاح!");
              } catch (err: any) {
                toast.error(err.message || "فشل التبديل");
              }
            }}
            onLogout={handleLogout}
            onAddNewSession={() => {
              // Logout current and show login form
              handleLogout();
            }}
          />

          {/* Feature cards grid */}
          {!activeFeature && !showStats && (
            <div className="grid gap-4 sm:grid-cols-2">
              {/* المميزات card */}
              <div
                onClick={() => setActiveFeature("features")}
                className="group cursor-pointer rounded-2xl border border-border bg-card p-6 space-y-3 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <Sparkles className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-foreground">المميزات</h3>
                    <p className="text-sm text-muted-foreground">المجموعات، النشر، الرسائل، المنشنات</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> المجموعات</span>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground flex items-center gap-1"><Send className="h-3 w-3" /> النشر التلقائي</span>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground flex items-center gap-1"><MessageSquare className="h-3 w-3" /> رسائل خاص</span>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground flex items-center gap-1"><AtSign className="h-3 w-3" /> مراقب المنشنات</span>
                </div>
              </div>

              {/* التقارير card */}
              <div
                onClick={() => setShowStats(true)}
                className="group cursor-pointer rounded-2xl border border-border bg-card p-6 space-y-3 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <BarChart3 className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-foreground">التقارير</h3>
                    <p className="text-sm text-muted-foreground">إحصائيات النشر والبث والمنشنات</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground flex items-center gap-1"><Zap className="h-3 w-3" /> إحصائيات حية</span>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground flex items-center gap-1"><BarChart3 className="h-3 w-3" /> معدلات النجاح</span>
                </div>
              </div>
            </div>
          )}

          {/* Features expanded view */}
          {activeFeature === "features" && (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground" onClick={() => setActiveFeature(null)}>
                <ChevronLeft className="h-4 w-4 rotate-180" /> رجوع
              </Button>

              {/* Sub-feature buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { key: "groups", icon: Users, label: "المجموعات" },
                  { key: "auto-publish", icon: Send, label: "النشر التلقائي" },
                  { key: "broadcast", icon: MessageSquare, label: "رسائل خاص" },
                  { key: "auto-reply", icon: MessageCircleReply, label: "رد تلقائي" },
                  { key: "anti-delete", icon: Trash2, label: "مراقب الحذف" },
                  { key: "mentions", icon: AtSign, label: "مراقب المنشنات" },
                ].map(({ key, icon: Icon, label }) => (
                  <button
                    key={key}
                    onClick={() => setActiveFeature(key)}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-200",
                      activeFeature === key
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card hover:border-primary/30 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-xs font-medium">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeFeature === "groups" && (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground" onClick={() => setActiveFeature("features")}>
                <ChevronLeft className="h-4 w-4 rotate-180" /> المميزات
              </Button>
              <GroupsSelector sessionString={activeSession} selectedGroups={selectedGroups} onSave={async (groups) => { setSelectedGroups(groups); try { await saveSessionToAccount(activeSession, telegramUser, groups); toast.success("تم حفظ المجموعات في الحساب"); } catch (err: any) { toast.error(err.message || "تعذر حفظ المجموعات"); } }} />
            </div>
          )}

          <div className={activeFeature === "auto-publish" ? "space-y-4" : "hidden"}>
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground" onClick={() => setActiveFeature("features")}>
              <ChevronLeft className="h-4 w-4 rotate-180" /> المميزات
            </Button>
            <AutoPublishPanel
              sessionString={activeSession}
              selectedGroups={selectedGroups}
              mentionsChannelId={savedMentionsChannelId}
              persistedState={automationState.autoPublish}
              onStateChange={(nextState) => {
                saveAutomationSection("autoPublish", nextState).catch((err: any) => {
                  toast.error(err?.message || "تعذر حفظ حالة النشر التلقائي");
                });
              }}
            />
          </div>

          <div className={activeFeature === "broadcast" ? "space-y-4" : "hidden"}>
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground" onClick={() => setActiveFeature("features")}>
              <ChevronLeft className="h-4 w-4 rotate-180" /> المميزات
            </Button>
            <BroadcastPanel sessionString={activeSession} />
          </div>

          <div className={activeFeature === "mentions" ? "space-y-4" : "hidden"}>
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground" onClick={() => setActiveFeature("features")}>
              <ChevronLeft className="h-4 w-4 rotate-180" /> المميزات
            </Button>
            <MentionsMonitorPanel
              sessionString={activeSession}
              savedChannelId={savedMentionsChannelId}
              persistedState={automationState.mentions}
              onChannelSave={(channelId) => {
                setSavedMentionsChannelId(channelId);
                saveAutomationSection("mentions", {
                  taskId: automationState.mentions?.taskId || null,
                  running: automationState.mentions?.running || false,
                  channelId,
                }).catch(() => {});
              }}
              onStateChange={(nextState) => {
                saveAutomationSection("mentions", nextState).catch((err: any) => {
                  toast.error(err?.message || "تعذر حفظ حالة مراقب المنشنات");
                });
              }}
            />
          </div>

          <div className={activeFeature === "auto-reply" ? "space-y-4" : "hidden"}>
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground" onClick={() => setActiveFeature("features")}>
              <ChevronLeft className="h-4 w-4 rotate-180" /> المميزات
            </Button>
            <AutoReplyPanel
              sessionString={activeSession}
              mentionsChannelId={savedMentionsChannelId}
              persistedState={automationState.autoReply}
              onStateChange={(nextState) => {
                saveAutomationSection("autoReply", nextState).catch((err: any) => {
                  toast.error(err?.message || "تعذر حفظ حالة الرد التلقائي");
                });
              }}
            />
          </div>

          <div className={activeFeature === "anti-delete" ? "space-y-4" : "hidden"}>
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground" onClick={() => setActiveFeature("features")}>
              <ChevronLeft className="h-4 w-4 rotate-180" /> المميزات
            </Button>
            <AntiDeletePanel
              sessionString={activeSession}
              mentionsChannelId={savedMentionsChannelId}
              persistedState={automationState.antiDelete}
              onStateChange={(nextState) => {
                saveAutomationSection("antiDelete", nextState).catch((err: any) => {
                  toast.error(err?.message || "تعذر حفظ حالة مراقب الحذف");
                });
              }}
            />
          </div>

          {/* Stats expanded view */}
          {showStats && (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground" onClick={() => setShowStats(false)}>
                <ChevronLeft className="h-4 w-4 rotate-180" /> رجوع
              </Button>
              <StatsPanel />
            </div>
          )}
        </main>
      </div>
  );

  // ============ NOT LOGGED IN VIEW ============
  const connectingView = (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground text-sm">جاري إعادة الاتصال...</p>
      </div>
  );

  // Instructions wizard renderer
  const renderInstructions = () => {
    switch (currentStep) {
      case "credentials":
        return (
          <div className="space-y-6">
            <div className="bg-muted/50 rounded-xl p-5 space-y-4 border border-border">
              <h3 className="font-semibold text-foreground flex items-center gap-2"><ExternalLink className="h-4 w-4 text-primary" />التعليمات:</h3>
              <ol className="space-y-3 text-sm text-foreground/80 list-decimal list-inside">
                <li>افتح: <a href="https://my.telegram.org" target="_blank" rel="noopener noreferrer" className="text-primary underline">my.telegram.org</a></li>
                <li>سجل دخولك برقم هاتفك.</li>
                <li>اضغط على <span className="font-semibold">"API development tools"</span>.</li>
                <li>انسخ <span className="font-semibold text-primary">API ID</span> و <span className="font-semibold text-primary">API Hash</span>.</li>
              </ol>
            </div>
            <div className="space-y-4 bg-card rounded-xl p-5 border border-border">
              <div className="space-y-3">
                <div className="space-y-2"><Label>API ID</Label><Input placeholder="12345678" value={apiId} onChange={e => setApiId(e.target.value)} dir="ltr" /></div>
                <div className="space-y-2"><Label>API Hash</Label><Input placeholder="a1b2c3d4e5f6..." value={apiHash} onChange={e => setApiHash(e.target.value)} dir="ltr" /></div>
                <div className="space-y-2"><Label>رقم الهاتف</Label><Input placeholder="+966512345678" value={phone} onChange={e => setPhone(e.target.value)} dir="ltr" type="tel" /></div>
              </div>
              <ErrorBox msg={errorMsg} />
              <Button onClick={handleSendCode} disabled={!apiId || !apiHash || !phone || loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                إرسال رمز التحقق
              </Button>
            </div>
          </div>
        );
      case "otp":
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-bold">رمز التحقق</h2>
            <div className="space-y-2"><Label>رمز التحقق</Label><Input placeholder="12345" value={otpCode} onChange={e => setOtpCode(e.target.value)} dir="ltr" className="text-center text-lg tracking-widest font-mono" /></div>
            <ErrorBox msg={errorMsg} />
            <Button onClick={handleVerifyOTP} disabled={!otpCode || loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} تحقق
            </Button>
          </div>
        );
      case "2fa":
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-bold">التحقق بخطوتين</h2>
            <div className="space-y-2">
              <Label>كلمة المرور</Label>
              <div className="relative">
                <Input type={showPassword ? "text" : "password"} placeholder="أدخل كلمة المرور" value={password2FA} onChange={e => setPassword2FA(e.target.value)} dir="ltr" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <ErrorBox msg={errorMsg} />
            <Button onClick={handleVerify2FA} disabled={!password2FA || loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />} تأكيد
            </Button>
          </div>
        );
      case "result":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-2"><CheckCircle2 className="h-6 w-6 text-green-500" /><h2 className="text-xl font-bold">تم بنجاح!</h2></div>
            <div className="bg-muted/50 rounded-xl p-5 border border-border space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Session String</Label>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowSession(!showSession)} className="gap-1 text-xs">
                    {showSession ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(sessionString)} className="gap-1 text-xs">
                    <Copy className="h-3.5 w-3.5" /> نسخ
                  </Button>
                </div>
              </div>
              <div className="bg-background rounded-lg p-3 font-mono text-xs break-all border border-border" dir="ltr">
                {showSession ? sessionString : "••••••••••••••••••••••••••••••••"}
              </div>
            </div>
            <div className="flex gap-3">
              <Button onClick={() => { setSessionInput(sessionString); setShowLoginMode("login"); }} className="gap-2">
                <LogIn className="h-4 w-4" /> استخدمه لتسجيل الدخول
              </Button>
              <Button variant="outline" onClick={() => { setCurrentStep("credentials"); setSessionString(""); }}>
                إنشاء جلسة جديدة
              </Button>
            </div>
          </div>
        );
    }
  };

  const innerContent = (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4" dir="rtl">
      <div className="w-full max-w-lg space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-2xl bg-primary/10 mb-2">
            <Bot className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">لوحة تحكم Telegram</h1>
          <p className="text-muted-foreground text-sm">اتصل بحسابك لبدء الأتمتة</p>
        </div>

        {/* Toggle login / instructions */}
        <div className="flex rounded-xl bg-muted/50 p-1 border border-border">
          <button
            onClick={() => setShowLoginMode("login")}
            className={cn(
              "flex-1 py-2 rounded-lg text-sm font-medium transition-all",
              showLoginMode === "login" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            <LogIn className="h-4 w-4 inline mr-1.5" /> تسجيل الدخول
          </button>
          <button
            onClick={() => setShowLoginMode("instructions")}
            className={cn(
              "flex-1 py-2 rounded-lg text-sm font-medium transition-all",
              showLoginMode === "instructions" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            <BookOpen className="h-4 w-4 inline mr-1.5" /> إنشاء جلسة
          </button>
        </div>

        {/* Content */}
        {showLoginMode === "login" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Session String</Label>
              <Textarea placeholder="الصق Session String هنا..." value={sessionInput} onChange={e => setSessionInput(e.target.value)} dir="ltr" className="font-mono text-xs min-h-[100px]" />
            </div>
            <ErrorBox msg={loginError} />
            <Button onClick={handleSessionLogin} disabled={!sessionInput.trim() || loginLoading} className="w-full gap-2">
              {loginLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              اتصال
            </Button>
          </div>
        ) : (
          renderInstructions()
        )}

        <div className="text-center">
          <Link to="/" className="text-xs text-muted-foreground hover:text-primary transition-colors">
            ← العودة للرئيسية
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <SubscriptionGate onSubscriptionLoaded={(sub, max) => { setMaxSessions(max); if (sub) { setSubscriptionEndsAt(sub.ends_at); setSubscriptionIsTrial(sub.is_trial); } }}>
      {loggedIn ? loggedInView : (autoConnecting ? connectingView : innerContent)}
    </SubscriptionGate>
  );
};

export default AutoDashboard;
