import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Bot, Home, LogIn, BookOpen, Users, Send, MessageSquare, ChevronLeft, ChevronRight, User, CheckCircle2, Loader2, AlertCircle, Key, ExternalLink, Eye, EyeOff, Copy, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { invokeCloudFunctionPublic } from "@/lib/cloudFunctions";
import GroupsSelector from "@/components/auto/GroupsSelector";
import AutoPublishPanel from "@/components/auto/AutoPublishPanel";
import BroadcastPanel from "@/components/auto/BroadcastPanel";

type Mode = "login" | "instructions" | "groups" | "auto-publish" | "broadcast";

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
  const [collapsed, setCollapsed] = useState(false);
  const [mode, setMode] = useState<Mode>("login");

  // Login state
  const [sessionInput, setSessionInput] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null);
  const [loginError, setLoginError] = useState("");
  const [activeSession, setActiveSession] = useState("");
  const [autoConnecting, setAutoConnecting] = useState(false);

  // Groups state
  const [selectedGroups, setSelectedGroups] = useState<TelegramGroup[]>([]);

  // Auto-reconnect from saved session
  useEffect(() => {
    const saved = localStorage.getItem("tg_session");
    const savedUser = localStorage.getItem("tg_user");
    const savedGroups = localStorage.getItem("tg_groups");
    
    if (saved) {
      setAutoConnecting(true);
      callAction("tg-connect-session", { sessionString: saved })
        .then(result => {
          setLoggedIn(true);
          setTelegramUser(result.user || (savedUser ? JSON.parse(savedUser) : null));
          setActiveSession(saved);
          setMode("groups");
          if (savedGroups) {
            try { setSelectedGroups(JSON.parse(savedGroups)); } catch {}
          }
        })
        .catch(() => {
          // Session expired or invalid, clear it
          localStorage.removeItem("tg_session");
          localStorage.removeItem("tg_user");
          localStorage.removeItem("tg_groups");
        })
        .finally(() => setAutoConnecting(false));
    }
  }, []);

  // Wizard state (instructions mode)
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

  const callAction = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await invokeCloudFunctionPublic<any>("osn-session", { action, ...extra });
    if (error) throw new Error(error.message);
    if (data && !data.success) throw new Error(data.error || "فشل غير متوقع");
    return data;
  };

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
      setMode("groups");
      // حفظ الجلسة
      localStorage.setItem("tg_session", sessionInput.trim());
      if (result.user) localStorage.setItem("tg_user", JSON.stringify(result.user));
      toast.success("تم الاتصال بنجاح!");
    } catch (err: any) {
      setLoginError(err.message);
      toast.error(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    setLoggedIn(false);
    setTelegramUser(null);
    setActiveSession("");
    setSessionInput("");
    setSelectedGroups([]);
    setMode("login");
    localStorage.removeItem("tg_session");
    localStorage.removeItem("tg_user");
    localStorage.removeItem("tg_groups");
  };

  // === Instructions handlers ===
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

  // === Sidebar items ===
  const sidebarItems = loggedIn
    ? [
        { key: "groups" as Mode, label: "المجموعات", icon: Users },
        { key: "auto-publish" as Mode, label: "النشر التلقائي", icon: Send },
        { key: "broadcast" as Mode, label: "البث", icon: MessageSquare },
      ]
    : [
        { key: "login" as Mode, label: "تسجيل الدخول", icon: LogIn },
        { key: "instructions" as Mode, label: "التعليمات", icon: BookOpen },
      ];

  const modeLabels: Record<Mode, { title: string; desc: string }> = {
    login: { title: "تسجيل الدخول", desc: "اتصل بحسابك على Telegram" },
    instructions: { title: "إنشاء Session String", desc: "اتبع الخطوات لإنشاء جلسة جديدة" },
    groups: { title: "المجموعات", desc: "جلب واختيار المجموعات للنشر" },
    "auto-publish": { title: "النشر التلقائي", desc: "إرسال رسائل تلقائية للمجموعات" },
    broadcast: { title: "البث", desc: "إرسال رسائل خاصة لجهات الاتصال" },
  };

  // === Render Login ===
  const renderLogin = () => {
    if (loggedIn && telegramUser) {
      return (
        <div className="space-y-6 max-w-2xl">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-green-500" />
            <h2 className="text-xl font-bold text-foreground">متصل بنجاح!</h2>
          </div>
          <div className="bg-muted/50 rounded-xl p-6 border border-border space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-7 w-7 text-primary" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-foreground text-lg">{telegramUser.firstName} {telegramUser.lastName}</h3>
                {telegramUser.username && <p className="text-sm text-muted-foreground" dir="ltr">@{telegramUser.username}</p>}
                {telegramUser.phone && <p className="text-sm text-muted-foreground" dir="ltr">+{telegramUser.phone}</p>}
              </div>
            </div>
          </div>
          <Button variant="outline" onClick={handleLogout}>قطع الاتصال</Button>
        </div>
      );
    }

    if (autoConnecting) {
      return (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">جاري إعادة الاتصال...</p>
        </div>
      );
    }

    return (
      <div className="space-y-6 max-w-md">
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-foreground">تسجيل الدخول</h2>
          <p className="text-muted-foreground text-sm">الصق Session String للاتصال بحسابك على Telegram</p>
        </div>
        <div className="space-y-2">
          <Label>Session String</Label>
          <Textarea placeholder="الصق Session String هنا..." value={sessionInput} onChange={e => setSessionInput(e.target.value)} dir="ltr" className="font-mono text-xs min-h-[100px]" />
        </div>
        <ErrorBox msg={loginError} />
        <div className="bg-muted/50 rounded-lg p-4 border border-border">
          <p className="text-xs text-muted-foreground">
            ما عندك Session String؟{" "}
            <button onClick={() => setMode("instructions")} className="text-primary underline font-medium">اتبع التعليمات</button>
          </p>
        </div>
        <Button onClick={handleSessionLogin} disabled={!sessionInput.trim() || loginLoading} className="w-full gap-2">
          {loginLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          اتصال
        </Button>
      </div>
    );
  };

  // === Render Instructions ===
  const renderInstructions = () => {
    switch (currentStep) {
      case "credentials":
        return (
          <div className="space-y-6 max-w-2xl">
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
          <div className="space-y-6 max-w-md">
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
          <div className="space-y-6 max-w-md">
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
          <div className="space-y-6 max-w-2xl">
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
              <Button onClick={() => { setSessionInput(sessionString); setMode("login"); }} className="gap-2">
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

  // === Render content by mode ===
  const renderContent = () => {
    switch (mode) {
      case "login": return renderLogin();
      case "instructions": return renderInstructions();
      case "groups": return <GroupsSelector sessionString={activeSession} selectedGroups={selectedGroups} onSave={(groups) => { setSelectedGroups(groups); localStorage.setItem("tg_groups", JSON.stringify(groups)); }} />;
      case "auto-publish": return <AutoPublishPanel sessionString={activeSession} selectedGroups={selectedGroups} />;
      case "broadcast": return <BroadcastPanel sessionString={activeSession} />;
    }
  };

  return (
    <div className="min-h-screen bg-background flex" dir="rtl">
      {/* Sidebar */}
      <aside className={cn("h-screen sticky top-0 border-l border-border bg-card flex flex-col transition-all duration-300", collapsed ? "w-16" : "w-64")}>
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0"><Bot className="h-5 w-5 text-primary" /></div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h2 className="text-sm font-bold text-foreground truncate">النشر التلقائي</h2>
              {loggedIn && telegramUser && (
                <p className="text-xs text-muted-foreground truncate">{telegramUser.firstName}</p>
              )}
            </div>
          )}
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {sidebarItems.map(item => {
            const Icon = item.icon;
            const isActive = mode === item.key;
            return (
              <button key={item.key} onClick={() => setMode(item.key)} className={cn(
                "flex items-center gap-3 rounded-lg p-2.5 text-sm transition-colors w-full",
                isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted"
              )}>
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border space-y-2">
          <Link to="/"><Button variant="ghost" size="sm" className={cn("w-full", collapsed ? "justify-center px-0" : "justify-start gap-2")}>
            <Home className="h-4 w-4 shrink-0" />{!collapsed && <span className="text-xs">الرئيسية</span>}
          </Button></Link>
          <Button variant="ghost" size="icon" className="w-full" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-6 md:p-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">{modeLabels[mode].title}</h1>
          <p className="text-muted-foreground text-sm mt-1">{modeLabels[mode].desc}</p>
        </div>
        {renderContent()}
      </main>
    </div>
  );
};

export default AutoDashboard;
