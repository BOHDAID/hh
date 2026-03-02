import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Bot, Home, LogIn, BookOpen, Users, Send, MessageSquare, User, CheckCircle2, Loader2, AlertCircle, Key, ExternalLink, Eye, EyeOff, Copy, Shield, AtSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { invokeCloudFunction, invokeCloudFunctionPublic } from "@/lib/cloudFunctions";
import { getAuthClient } from "@/lib/supabaseClient";
import TelegramProfileCard from "@/components/auto/TelegramProfileCard";
import GroupsSelector from "@/components/auto/GroupsSelector";
import AutoPublishPanel from "@/components/auto/AutoPublishPanel";
import BroadcastPanel from "@/components/auto/BroadcastPanel";
import MentionsMonitorPanel from "@/components/auto/MentionsMonitorPanel";

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

const AutoDashboard = () => {
  // Auth state
  const [loggedIn, setLoggedIn] = useState(false);
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null);
  const [activeSession, setActiveSession] = useState("");
  const [autoConnecting, setAutoConnecting] = useState(false);

  // Login state
  const [sessionInput, setSessionInput] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [showLoginMode, setShowLoginMode] = useState<"login" | "instructions">("login");

  // Groups state
  const [selectedGroups, setSelectedGroups] = useState<TelegramGroup[]>([]);

  // Active tab
  const [activeTab, setActiveTab] = useState("groups");

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

  const saveSessionToAccount = async (sessionStr: string, user: TelegramUser | null, groups?: TelegramGroup[]) => {
    if (!sessionStr) return;
    await callAccountAction("tg-save-account-session", {
      sessionString: sessionStr,
      telegramUser: user,
      selectedGroups: groups ?? selectedGroups,
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
          const savedGroups = parseStoredJson<TelegramGroup[]>(saved.selected_groups, []);
          setLoggedIn(true);
          setTelegramUser(result.user || savedUser);
          setActiveSession(saved.session_string);
          setSelectedGroups(savedGroups);
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

  const handleSendCode = async () => {
    if (!apiId || !apiHash || !phone) { toast.error("يرجى ملء جميع الحقول"); return; }
    setLoading(true); setErrorMsg("");
    try {
      const result = await callAction("tg-send-code", { apiId, apiHash, phone });
      setPhoneCodeHash(result.phoneCodeHash || "");
      setCurrentStep("otp");
      toast.success("تم إرسال الرمز إلى حسابك على Telegram");
    } catch (err: any) { setErrorMsg(err.message); toast.error(err.message); }
    finally { setLoading(false); }
  };

  const handleVerifyOTP = async () => {
    if (!otpCode) { toast.error("يرجى إدخال الرمز"); return; }
    setLoading(true); setErrorMsg("");
    try {
      const result = await callAction("tg-verify-code", { apiId, phone, code: otpCode, phoneCodeHash });
      if (result.needs2FA) { setNeeds2FA(true); setCurrentStep("2fa"); }
      else { setSessionString(result.sessionString || ""); setCurrentStep("result"); }
    } catch (err: any) { setErrorMsg(err.message); toast.error(err.message); }
    finally { setLoading(false); }
  };

  const handleVerify2FA = async () => {
    if (!password2FA) { toast.error("يرجى إدخال كلمة المرور"); return; }
    setLoading(true); setErrorMsg("");
    try {
      const result = await callAction("tg-verify-2fa", { apiId, phone, password: password2FA });
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
  if (loggedIn) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        {/* Top bar */}
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
          {/* Profile Card */}
          <TelegramProfileCard
            sessionString={activeSession}
            initialUser={telegramUser}
            onLogout={handleLogout}
          />

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 h-11">
              <TabsTrigger value="groups" className="gap-2 text-sm">
                <Users className="h-4 w-4" /> المجموعات
              </TabsTrigger>
              <TabsTrigger value="auto-publish" className="gap-2 text-sm">
                <Send className="h-4 w-4" /> النشر التلقائي
              </TabsTrigger>
              <TabsTrigger value="broadcast" className="gap-2 text-sm">
                <MessageSquare className="h-4 w-4" /> إرسال رسائل خاص
              </TabsTrigger>
              <TabsTrigger value="mentions" className="gap-2 text-sm">
                <AtSign className="h-4 w-4" /> المنشنات
              </TabsTrigger>
            </TabsList>

            <TabsContent value="groups" className="mt-4">
              <GroupsSelector
                sessionString={activeSession}
                selectedGroups={selectedGroups}
                onSave={async (groups) => {
                  setSelectedGroups(groups);
                  try {
                    await saveSessionToAccount(activeSession, telegramUser, groups);
                    toast.success("تم حفظ المجموعات في الحساب");
                  } catch (err: any) {
                    toast.error(err.message || "تعذر حفظ المجموعات");
                  }
                }}
              />
            </TabsContent>

            <TabsContent value="auto-publish" className="mt-4">
              <AutoPublishPanel sessionString={activeSession} selectedGroups={selectedGroups} />
            </TabsContent>

            <TabsContent value="broadcast" className="mt-4">
              <BroadcastPanel sessionString={activeSession} />
            </TabsContent>

            <TabsContent value="mentions" className="mt-4">
              <MentionsMonitorPanel sessionString={activeSession} />
            </TabsContent>
          </Tabs>
        </main>
      </div>
    );
  }

  // ============ NOT LOGGED IN VIEW ============
  if (autoConnecting) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground text-sm">جاري إعادة الاتصال...</p>
      </div>
    );
  }

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

  return (
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
};

export default AutoDashboard;
