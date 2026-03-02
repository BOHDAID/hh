import { useState } from "react";
import { Link } from "react-router-dom";
import { Bot, ChevronRight, ChevronLeft, Home, Key, Send, Shield, CheckCircle2, ExternalLink, Copy, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { invokeCloudFunctionPublic } from "@/lib/cloudFunctions";

type Step = "instructions" | "credentials" | "phone" | "otp" | "2fa" | "result";

const STEPS_ORDER: Step[] = ["instructions", "credentials", "phone", "otp", "2fa", "result"];

const AutoDashboard = () => {
  const [collapsed, setCollapsed] = useState(false);

  // Wizard state
  const [currentStep, setCurrentStep] = useState<Step>("instructions");
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

  const stepIndex = STEPS_ORDER.indexOf(currentStep);

  const goNext = () => {
    setErrorMsg("");
    const nextIdx = stepIndex + 1;
    if (nextIdx < STEPS_ORDER.length) {
      if (STEPS_ORDER[nextIdx] === "2fa" && !needs2FA) {
        setCurrentStep("result");
      } else {
        setCurrentStep(STEPS_ORDER[nextIdx]);
      }
    }
  };

  const goBack = () => {
    setErrorMsg("");
    const prevIdx = stepIndex - 1;
    if (prevIdx >= 0) {
      if (STEPS_ORDER[prevIdx] === "2fa" && !needs2FA) {
        setCurrentStep("otp");
      } else {
        setCurrentStep(STEPS_ORDER[prevIdx]);
      }
    }
  };

  const resetWizard = () => {
    setCurrentStep("instructions");
    setApiId("");
    setApiHash("");
    setPhone("");
    setOtpCode("");
    setPassword2FA("");
    setSessionString("");
    setPhoneCodeHash("");
    setNeeds2FA(false);
    setLoading(false);
    setErrorMsg("");
  };

  const callAction = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await invokeCloudFunctionPublic<any>("osn-session", {
      action,
      ...extra,
    });
    if (error) throw new Error(error.message);
    if (data && !data.success) throw new Error(data.error || "فشل غير متوقع");
    return data;
  };

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
      goNext();
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

  const renderStep = () => {
    switch (currentStep) {
      case "instructions":
        return (
          <div className="space-y-6 max-w-2xl">
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">الخطوة 1: الحصول على API ID و API Hash</h2>
              <p className="text-muted-foreground text-sm">
                تحتاج أولاً إلى إنشاء تطبيق في بوابة Telegram للحصول على بيانات الاعتماد.
              </p>
            </div>

            <div className="bg-muted/50 rounded-xl p-5 space-y-4 border border-border">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <ExternalLink className="h-4 w-4 text-primary" />
                التعليمات:
              </h3>
              <ol className="space-y-3 text-sm text-foreground/80 list-decimal list-inside">
                <li>
                  افتح الرابط:{" "}
                  <a href="https://my.telegram.org" target="_blank" rel="noopener noreferrer" className="text-primary underline font-medium">
                    my.telegram.org
                  </a>
                </li>
                <li>سجل دخولك برقم هاتفك المرتبط بـ Telegram (مع رمز الدولة مثل: +966).</li>
                <li>سيصلك رمز تأكيد على تطبيق Telegram — أدخله.</li>
                <li>اضغط على <span className="font-semibold text-foreground">"API development tools"</span>.</li>
                <li>
                  إذا طُلب منك إنشاء تطبيق، املأ:
                  <ul className="mt-2 mr-4 space-y-1 list-disc list-inside text-muted-foreground">
                    <li><strong>App title:</strong> أي اسم</li>
                    <li><strong>Short name:</strong> أي اسم قصير</li>
                    <li><strong>Platform:</strong> Desktop</li>
                  </ul>
                </li>
                <li>انسخ <span className="font-semibold text-primary">API ID</span> و <span className="font-semibold text-primary">API Hash</span>.</li>
              </ol>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700 dark:text-amber-300">
                <strong>تنبيه:</strong> لا تشارك API ID و API Hash مع أي شخص آخر.
              </p>
            </div>

            <Button onClick={goNext} className="gap-2">
              التالي
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        );

      case "credentials":
        return (
          <div className="space-y-6 max-w-md">
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">الخطوة 2: بيانات API</h2>
              <p className="text-muted-foreground text-sm">أدخل البيانات من my.telegram.org</p>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="api-id">API ID</Label>
                <Input id="api-id" placeholder="مثال: 12345678" value={apiId} onChange={(e) => setApiId(e.target.value)} dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="api-hash">API Hash</Label>
                <Input id="api-hash" placeholder="مثال: a1b2c3d4e5f6..." value={apiHash} onChange={(e) => setApiHash(e.target.value)} dir="ltr" />
              </div>
            </div>
            <ErrorBox />
            <div className="flex gap-3">
              <Button variant="outline" onClick={goBack}><ChevronRight className="h-4 w-4 ml-1" /> رجوع</Button>
              <Button onClick={goNext} disabled={!apiId || !apiHash} className="gap-2">التالي <ChevronLeft className="h-4 w-4" /></Button>
            </div>
          </div>
        );

      case "phone":
        return (
          <div className="space-y-6 max-w-md">
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">الخطوة 3: رقم الهاتف</h2>
              <p className="text-muted-foreground text-sm">أدخل رقم هاتفك مع رمز الدولة</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">رقم الهاتف</Label>
              <Input id="phone" placeholder="+966512345678" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" type="tel" />
            </div>
            <div className="bg-muted/50 rounded-lg p-4 border border-border">
              <p className="text-xs text-muted-foreground">سيتم إرسال رمز تحقق إلى حسابك على Telegram.</p>
            </div>
            <ErrorBox />
            <div className="flex gap-3">
              <Button variant="outline" onClick={goBack}><ChevronRight className="h-4 w-4 ml-1" /> رجوع</Button>
              <Button onClick={handleSendCode} disabled={!phone || loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                إرسال الرمز
              </Button>
            </div>
          </div>
        );

      case "otp":
        return (
          <div className="space-y-6 max-w-md">
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">الخطوة 4: رمز التحقق</h2>
              <p className="text-muted-foreground text-sm">أدخل الرمز الذي وصلك على Telegram</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="otp">رمز التحقق</Label>
              <Input id="otp" placeholder="12345" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} dir="ltr" className="text-center text-lg tracking-widest font-mono" />
            </div>
            <ErrorBox />
            <div className="flex gap-3">
              <Button variant="outline" onClick={goBack}><ChevronRight className="h-4 w-4 ml-1" /> رجوع</Button>
              <Button onClick={handleVerifyOTP} disabled={!otpCode || loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                تحقق
              </Button>
            </div>
          </div>
        );

      case "2fa":
        return (
          <div className="space-y-6 max-w-md">
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">الخطوة 5: التحقق بخطوتين</h2>
              <p className="text-muted-foreground text-sm">حسابك محمي بكلمة مرور إضافية.</p>
            </div>
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
            <div className="flex gap-3">
              <Button variant="outline" onClick={goBack}><ChevronRight className="h-4 w-4 ml-1" /> رجوع</Button>
              <Button onClick={handleVerify2FA} disabled={!password2FA || loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                تأكيد
              </Button>
            </div>
          </div>
        );

      case "result":
        return (
          <div className="space-y-6 max-w-2xl">
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                <CheckCircle2 className="h-6 w-6 text-green-500" />
                تم بنجاح!
              </h2>
              <p className="text-muted-foreground text-sm">تم إنشاء Session String. احتفظ به في مكان آمن.</p>
            </div>

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

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
                <p><strong>مهم جداً:</strong></p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>لا تشاركه مع أي شخص.</li>
                  <li>إذا فقدته، ستحتاج إلى إنشاء واحد جديد.</li>
                </ul>
              </div>
            </div>

            <Button onClick={resetWizard} variant="outline" className="gap-2">إنشاء جلسة جديدة</Button>
          </div>
        );
    }
  };

  const visibleSteps = [
    { key: "instructions", label: "التعليمات", icon: ExternalLink },
    { key: "credentials", label: "بيانات API", icon: Key },
    { key: "phone", label: "الهاتف", icon: Send },
    { key: "otp", label: "الرمز", icon: Shield },
    { key: "result", label: "النتيجة", icon: CheckCircle2 },
  ];

  return (
    <div className="min-h-screen bg-background flex" dir="rtl">
      {/* Sidebar */}
      <aside className={cn("h-screen sticky top-0 border-l border-border bg-card flex flex-col transition-all duration-300", collapsed ? "w-16" : "w-64")}>
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0"><Bot className="h-5 w-5 text-primary" /></div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h2 className="text-sm font-bold text-foreground truncate">لوحة تحكم Telegram</h2>
              <p className="text-xs text-muted-foreground truncate">إنشاء جلسة</p>
            </div>
          )}
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {visibleSteps.map((step, idx) => {
            const isCurrent = currentStep === step.key || (currentStep === "2fa" && step.key === "otp");
            const isDone = STEPS_ORDER.indexOf(currentStep) > STEPS_ORDER.indexOf(step.key as Step);
            const StepIcon = step.icon;
            return (
              <div key={step.key} className={cn("flex items-center gap-3 rounded-lg p-2.5 text-sm transition-colors",
                isCurrent && "bg-primary/10 text-primary font-medium",
                isDone && "text-green-600 dark:text-green-400",
                !isCurrent && !isDone && "text-muted-foreground"
              )}>
                <div className={cn("flex items-center justify-center h-7 w-7 rounded-full shrink-0 text-xs font-bold border-2 transition-colors",
                  isCurrent && "border-primary bg-primary text-primary-foreground",
                  isDone && "border-green-500 bg-green-500 text-white",
                  !isCurrent && !isDone && "border-muted-foreground/30"
                )}>
                  {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : collapsed ? <StepIcon className="h-3.5 w-3.5" /> : idx + 1}
                </div>
                {!collapsed && <span className="truncate">{step.label}</span>}
              </div>
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
          <h1 className="text-2xl font-bold text-foreground">إنشاء Telegram Session</h1>
          <p className="text-muted-foreground text-sm mt-1">اتبع الخطوات لإنشاء Session String لتشغيل النشر التلقائي</p>
        </div>
        {renderStep()}
      </main>
    </div>
  );
};

export default AutoDashboard;
