import { useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Home, Copy, Eye, EyeOff, ExternalLink, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const TELEGRAM_TOOLS_URL = "https://telegram.tools/session-string-generator";

const AutoDashboard = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [sessionString, setSessionString] = useState("");
  const [showSession, setShowSession] = useState(false);
  const [saved, setSaved] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("تم النسخ!");
  };

  const handleSave = () => {
    if (!sessionString.trim()) {
      toast.error("يرجى لصق Session String أولاً");
      return;
    }
    setSaved(true);
    toast.success("تم حفظ Session String بنجاح!");
  };

  return (
    <div className="min-h-screen bg-background flex" dir="rtl">
      {/* Sidebar */}
      <aside
        className={cn(
          "h-screen sticky top-0 border-l border-border bg-card flex flex-col transition-all duration-300",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h2 className="text-sm font-bold text-foreground truncate">لوحة تحكم Telegram</h2>
              <p className="text-xs text-muted-foreground truncate">إنشاء جلسة</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          <div className={cn(
            "flex items-center gap-3 rounded-lg p-2.5 text-sm bg-primary/10 text-primary font-medium"
          )}>
            <div className="flex items-center justify-center h-7 w-7 rounded-full shrink-0 text-xs font-bold border-2 border-primary bg-primary text-primary-foreground">
              1
            </div>
            {!collapsed && <span className="truncate">إنشاء Session</span>}
          </div>
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-border space-y-2">
          <Link to="/">
            <Button variant="ghost" size="sm" className={cn("w-full", collapsed ? "justify-center px-0" : "justify-start gap-2")}>
              <Home className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="text-xs">الرئيسية</span>}
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="w-full"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">إنشاء Telegram Session</h1>
          <p className="text-muted-foreground text-sm mt-1">
            استخدم الأداة أدناه لإنشاء Session String ثم الصقه في الحقل
          </p>
        </div>

        {/* Instructions */}
        <div className="bg-muted/50 rounded-xl p-5 space-y-3 border border-border max-w-3xl">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-primary" />
            طريقة الاستخدام:
          </h3>
          <ol className="space-y-2 text-sm text-foreground/80 list-decimal list-inside">
            <li>استخدم الأداة المدمجة أدناه (أو <a href={TELEGRAM_TOOLS_URL} target="_blank" rel="noopener noreferrer" className="text-primary underline">افتحها في تبويب جديد</a>).</li>
            <li>اختر <strong>Telethon</strong> كنوع الجلسة.</li>
            <li>أدخل <strong>API ID</strong> و <strong>API Hash</strong> (من <a href="https://my.telegram.org" target="_blank" rel="noopener noreferrer" className="text-primary underline">my.telegram.org</a>).</li>
            <li>أدخل رقم هاتفك ثم رمز التحقق.</li>
            <li>انسخ الـ <strong>Session String</strong> والصقه في الحقل بالأسفل.</li>
          </ol>
        </div>

        {/* Embedded iframe */}
        <div className="max-w-4xl">
          <div className="rounded-xl border border-border overflow-hidden bg-background shadow-sm">
            <div className="bg-muted/50 px-4 py-2 border-b border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">telegram.tools - Session String Generator</span>
              <a href={TELEGRAM_TOOLS_URL} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="sm" className="gap-1 text-xs h-7">
                  <ExternalLink className="h-3 w-3" />
                  فتح في تبويب جديد
                </Button>
              </a>
            </div>
            <iframe
              src={TELEGRAM_TOOLS_URL}
              className="w-full border-0"
              style={{ height: "600px" }}
              allow="clipboard-read; clipboard-write"
              title="Telegram Session Generator"
            />
          </div>
        </div>

        {/* Paste Session String */}
        <div className="max-w-2xl space-y-4">
          <div className="space-y-2">
            <Label htmlFor="session-string" className="text-base font-semibold">
              الصق Session String هنا
            </Label>
            <div className="relative">
              <Input
                id="session-string"
                placeholder="1BVtsOKABu2HY9..."
                value={sessionString}
                onChange={(e) => {
                  setSessionString(e.target.value);
                  setSaved(false);
                }}
                dir="ltr"
                className="font-mono text-sm pr-20"
              />
              <div className="absolute left-2 top-1/2 -translate-y-1/2 flex gap-1">
                <button
                  type="button"
                  onClick={() => setShowSession(!showSession)}
                  className="text-muted-foreground hover:text-foreground p-1"
                >
                  {showSession ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                {sessionString && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(sessionString)}
                    className="text-muted-foreground hover:text-foreground p-1"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            {sessionString && !showSession && (
              <p className="text-xs text-muted-foreground font-mono" dir="ltr">
                {sessionString.substring(0, 10)}{"•".repeat(20)}
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={!sessionString.trim() || saved} className="gap-2">
              {saved ? <CheckCircle2 className="h-4 w-4" /> : null}
              {saved ? "تم الحفظ" : "حفظ Session"}
            </Button>
          </div>

          {saved && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
              <p className="text-sm text-green-700 dark:text-green-300">
                تم حفظ Session String بنجاح! يمكنك الآن استخدامه في النشر التلقائي.
              </p>
            </div>
          )}
        </div>

        {/* Warning */}
        <div className="max-w-2xl bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
            <p><strong>تنبيه أمني:</strong></p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>لا تشارك Session String مع أي شخص.</li>
              <li>Session String يمنح وصولاً كاملاً لحساب Telegram الخاص بك.</li>
              <li>إذا شككت في تسريبه، قم بإنهاء جميع الجلسات من إعدادات Telegram.</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AutoDashboard;
