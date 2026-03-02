import { useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Home, Key, Send, Shield, CheckCircle2, ExternalLink, Copy, Eye, EyeOff, Loader2, AlertCircle, BookOpen, LogIn, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { invokeCloudFunctionPublic } from "@/lib/cloudFunctions";

type Mode = "instructions" | "login";

const AutoDashboard = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [mode, setMode] = useState<Mode>("login");

  // Login mode - paste session
  const [sessionInput, setSessionInput] = useState("");
  const [showSessionInput, setShowSessionInput] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [sessionData, setSessionData] = useState<any>(null);

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
    const { data, error } = await invokeCloudFunctionPublic<any>("osn-session", {
      action,
      ...extra,
    });
    if (error) throw new Error(error.message);
    if (data && !data.success) throw new Error(data.error || "فشل غير متوقع");
    return data;
  };

  // === Login Mode handlers ===
  const handleSessionLogin = async () => {
    if (!sessionInput.trim()) {
      toast.error("يرجى لصق Session String");
      return;
    }
    setLoginLoading(true);
    try {
      // For now just accept the session and show the dashboard
      setLoggedIn(true);
      setSessionData({ sessionString: sessionInput.trim() });
      toast.success("تم تسجيل الدخول بنجاح!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  // === Instructions Mode handlers ===
  const handleSendCode = async () => {
    if (!apiId || !apiHash || !phone) {
      toast.error("يرجى ملء جميع الحقول");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    try {
      const result = await callAction("tg-send-code", { apiId, apiHash, phone });
      setPhoneCodeHash(result.phoneCodeHash || "");
      setCurrentStep("otp");
      toast.success("تم إرسال الرمز إلى حسابك على Telegram");
    } catch (err: any) {
      setErrorMsg(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otpCode) {
      toast.error("يرجى إدخال الرمز");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    try {
      const result = await callAction("tg-verify-code", {
        apiId, phone, code: otpCode, phoneCodeHash,
      });
      if (result.needs2FA) {
        setNeeds2FA(true);
        setCurrentStep("2fa");
      } else {
        setSessionString(result.sessionString || "");
        setCurrentStep("result");
      }
    } catch (err: any) {
      setErrorMsg(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async () => {
    if (!password2FA) {
      toast.error("يرجى إدخال كلمة المرور");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    try {
      const result = await callAction("tg-verify-2fa", {
        apiId, phone, password: password2FA,
      });
      setSessionString(result.sessionString || "");
      setCurrentStep("result");
    } catch (err: any) {
      setErrorMsg(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("تم النسخ!");
  };

  const ErrorBox = () => errorMsg ? (
    <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-start gap-2">
      <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
      <p className="text-sm text-destructive">{errorMsg}</p>
    </div>
  ) : null;

  // === Render Login Mode ===
  const renderLoginMode = () => {
    if (loggedIn) {
      return (
        <div className="space-y-6 max-w-2xl">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-green-500" />
            <h2 className="text-xl font-bold text-foreground">تم تسجيل الدخول بنجاح!</h2>
          </div>
          <div className="bg-muted/50 rounded-xl p-6 border border-border space-y-4">
            <p className="text-muted-foreground text-sm">أنت الآن متصل. يمكنك البدء بإعداد النشر التلقائي.</p>
            <p className="text-xs text-muted-foreground">القائمة والإعدادات قادمة قريباً...</p>
          </div>
          <Button variant="outline" onClick={() => { setLoggedIn(false); setSessionInput(""); setSessionData(null); }}>
            تسجيل خروج
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-6 max-w-md">
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-foreground">تسجيل الدخول</h2>
          <p className="text-muted-foreground text-sm">الصق Session String الخاص بحسابك على Telegram</p>
        </div>

        <div className="space-y-3">
          <Label htmlFor="session-input">Session String</Label>
          <div className="relative">
            <Textarea
              id="session-input"
              placeholder="الصق Session String هنا..."
              value={sessionInput}
              onChange={(e) => setSessionInput(e.target.value)}
              dir="ltr"
              className="font-mono text-xs min-h-[100px] pr-10"
            />
            <button
              type="button"
              onClick={() => setShowSessionInput(!showSessionInput)}
              className="absolute left-3 top-3 text-muted-foreground hover:text-foreground"
            >
              {showSessionInput ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {!showSessionInput && sessionInput && (
            <div className="bg-muted rounded-lg p-3 font-mono text-xs break-all border border-border" dir="ltr">
              ••••••••••••••••••••••••••••••••••••••••
            </div>
          )}
        </div>

        <div className="bg-muted/50 rounded-lg p-4 border border-border space-y-2">
          <p className="text-xs text-muted-foreground">
            ما عندك Session String؟{" "}
            <button onClick={() => setMode("instructions")} className="text-primary underline font-medium">
              اتبع التعليمات لإنشاء واحد
            </button>
          </p>
        </div>

        <Button onClick={handleSessionLogin} disabled={!sessionInput.trim() || loginLoading} className="w-full gap-2">
          {loginLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          دخول
        </Button>
      </div>
    );
  };

  // === Render Instructions Mode ===
  const renderInstructionsMode = () => {
    switch (currentStep) {
      case "credentials":
        return (
          <div className="space-y-6 max-w-2xl">
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">الخطوة 1: الحصول على API ID و API Hash</h2>
              <p className="text-muted-foreground text-sm">تحتاج أولاً إلى إنشاء تطبيق في بوابة Telegram.</p>
            </div>

            <div className="bg-muted/50 rounded-xl p-5 space-y-4 border border-border">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <ExternalLink className="h-4 w-4 text-primary" />
                التعليمات:
              </h3>
              <ol className="space-y-3 text-sm text-foreground/80 list-decimal list-inside">
                <li>افتح: <a href="https://my.telegram.org" target="_blank" rel="noopener noreferrer" className="text-primary underline font-medium">my.telegram.org</a></li>
                <li>سجل دخولك برقم هاتفك (مع رمز الدولة مثل: +966).</li>
                <li>سيصلك رمز تأكيد على Telegram — أدخله.</li>
                <li>اضغط على <span className="font-semibold text-foreground">"API development tools"</span>.</li>
                <li>إذا طُلب إنشاء تطبيق:
                  <ul className="mt-2 mr-4 space-y-1 list-disc list-inside text-muted-foreground">
                    <li><strong>App title:</strong> أي اسم</li>
                    <li><strong>Short name:</strong> أي اسم قصير</li>
                    <li><strong>Platform:</strong> Desktop</li>
                  </ul>
                </li>
                <li>انسخ <span className="font-semibold text-primary">API ID</span> و <span className="font-semibold text-primary">API Hash</span>.</li>
              </ol>
            </div>

            <div className="space-y-4 bg-card rounded-xl p-5 border border-border">
              <h3 className="font-semibold text-foreground">الخطوة 2: أدخل البيانات</h3>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="api-id">API ID</Label>
                  <Input id="api-id" placeholder="مثال: 12345678" value={apiId} onChange={(e) => setApiId(e.target.value)} dir="ltr" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="api-hash">API Hash</Label>
                  <Input id="api-hash" placeholder="مثال: a1b2c3d4e5f6..." value={apiHash} onChange={(e) => setApiHash(e.target.value)} dir="ltr" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">رقم الهاتف</Label>
                  <Input id="phone" placeholder="+966512345678" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" type="tel" />
                </div>
              </div>
              <ErrorBox />
              <Button onClick={handleSendCode} disabled={!apiId || !apiHash || !phone || loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                إرسال رمز التحقق
              </Button>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700 dark:text-amber-300">
                <strong>تنبيه:</strong> لا تشارك API ID و API Hash مع أي شخص آخر.
              </p>
            </div>
          </div>
        );

      case "otp":
        return (
          <div className="space-y-6 max-w-md">
            <h2 className="text-xl font-bold text-foreground">رمز التحقق</h2>
            <p className="text-muted-foreground text-sm">أدخل الرمز الذي وصلك على Telegram</p>
            <div className="space-y-2">
              <Label htmlFor="otp">رمز التحقق</Label>
              <Input id="otp" placeholder="12345" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} dir="ltr" className="text-center text-lg tracking-widest font-mono" />
            </div>
            <ErrorBox />
            <Button onClick={handleVerifyOTP} disabled={!otpCode || loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              تحقق
            </Button>
          </div>
        );

      case "2fa":
        return (
          <div className="space-y-6 max-w-md">
            <h2 className="text-xl font-bold text-foreground">التحقق بخطوتين</h2>
            <p className="text-muted-foreground text-sm">حسابك محمي بكلمة مرور إضافية.</p>
            <div className="space-y-2">
              <Label htmlFor="2fa">كلمة مرور التحقق بخطوتين</Label>
              <div className="relative">
                <Input id="2fa" type={showPassword ? "text" : "password"} placeholder="أدخل كلمة المرور" value={password2FA} onChange={(e) => setPassword2FA(e.target.value)} dir="ltr" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <ErrorBox />
            <Button onClick={handleVerify2FA} disabled={!password2FA || loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
              تأكيد
            </Button>
          </div>
        );

      case "result":
        return (
          <div className="space-y-6 max-w-2xl">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-green-500" />
              <h2 className="text-xl font-bold text-foreground">تم بنجاح!</h2>
            </div>
            <p className="text-muted-foreground text-sm">تم إنشاء Session String. يمكنك نسخه واستخدامه لتسجيل الدخول.</p>

            <div className="bg-muted/50 rounded-xl p-5 border border-border space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Session String</Label>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowSession(!showSession)} className="gap-1 text-xs">
                    {showSession ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {showSession ? "إخفاء" : "عرض"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(sessionString)} className="gap-1 text-xs">
                    <Copy className="h-3.5 w-3.5" /> نسخ
                  </Button>
                </div>
              </div>
              <div className="bg-background rounded-lg p-3 font-mono text-xs break-all border border-border" dir="ltr">
                {showSession ? sessionString : "••••••••••••••••••••••••••••••••••••••••"}
              </div>
            </div>

            <div className="flex gap-3">
              <Button onClick={() => { setSessionInput(sessionString); setMode("login"); }} className="gap-2">
                <LogIn className="h-4 w-4" />
                استخدمه لتسجيل الدخول
              </Button>
              <Button variant="outline" onClick={() => { setCurrentStep("credentials"); setSessionString(""); }}>
                إنشاء جلسة جديدة
              </Button>
            </div>
          </div>
        );
    }
  };

  const sidebarItems = [
    { key: "login" as Mode, label: "تسجيل الدخول", icon: LogIn },
    { key: "instructions" as Mode, label: "التعليمات", icon: BookOpen },
  ];

  return (
    <div className="min-h-screen bg-background flex" dir="rtl">
      {/* Sidebar */}
      <aside className={cn("h-screen sticky top-0 border-l border-border bg-card flex flex-col transition-all duration-300", collapsed ? "w-16" : "w-64")}>
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0"><Bot className="h-5 w-5 text-primary" /></div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h2 className="text-sm font-bold text-foreground truncate">النشر التلقائي</h2>
              <p className="text-xs text-muted-foreground truncate">Telegram Session</p>
            </div>
          )}
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const isActive = mode === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setMode(item.key)}
                className={cn(
                  "flex items-center gap-3 rounded-lg p-2.5 text-sm transition-colors w-full",
                  isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border space-y-2">
          <Link to="/"><Button variant="ghost" size="sm" className={cn("w-full", collapsed ? "justify-center px-0" : "justify-start gap-2")}><Home className="h-4 w-4 shrink-0" />{!collapsed && <span className="text-xs">الرئيسية</span>}</Button></Link>
          <Button variant="ghost" size="icon" className="w-full" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">
            {mode === "login" ? "تسجيل الدخول" : "إنشاء Telegram Session"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {mode === "login" ? "الصق Session String للدخول مباشرة" : "اتبع الخطوات لإنشاء Session String"}
          </p>
        </div>
        {mode === "login" ? renderLoginMode() : renderInstructionsMode()}
      </main>
    </div>
  );
};

export default AutoDashboard;
