import { useState, useEffect } from "react";
import { db, getAuthClient, isExternalConfigured } from "@/lib/supabaseClient";
import { invokeCloudFunction } from "@/lib/cloudFunctions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { 
  Save, Loader2, Store, Share2, CreditCard, Bitcoin, Wallet, 
  ImageOff, Mail, Server, Globe, Eye, EyeOff, Settings, 
  Sparkles, CheckCircle2, ExternalLink, Shield, Zap, XCircle,
  Bot, Key, MessageCircle
} from "lucide-react";
import ImageUpload from "./ImageUpload";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

interface Setting {
  id: string;
  key: string;
  value: string | null;
  category: string;
  description?: string;
  is_sensitive?: boolean;
}

const MotionCard = motion(Card);

const InfoBox = ({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "success" | "warning" | "info" }) => {
  const variants = {
    default: "bg-muted/50 border-muted",
    success: "bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400",
    warning: "bg-yellow-500/10 border-yellow-500/20 text-yellow-600 dark:text-yellow-400",
    info: "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400"
  };
  return (
    <div className={`p-4 rounded-xl border text-sm ${variants[variant]}`}>
      {children}
    </div>
  );
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const }
  })
};

const SettingsTab = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState("general");
  
  // حالات اختبار الاتصال لكل بوابة
  const [paypalTestStatus, setPaypalTestStatus] = useState<"idle" | "testing" | "connected" | "failed">("idle");
  const [paypalTestMessage, setPaypalTestMessage] = useState<string>("");
  const [oxapayTestStatus, setOxapayTestStatus] = useState<"idle" | "testing" | "connected" | "failed">("idle");
  const [oxapayTestMessage, setOxapayTestMessage] = useState<string>("");
  const [cryptomusTestStatus, setCryptomusTestStatus] = useState<"idle" | "testing" | "connected" | "failed">("idle");
  const [cryptomusTestMessage, setCryptomusTestMessage] = useState<string>("");
  const [nowpaymentsTestStatus, setNowpaymentsTestStatus] = useState<"idle" | "testing" | "connected" | "failed">("idle");
  const [nowpaymentsTestMessage, setNowpaymentsTestMessage] = useState<string>("");
  const [lemonsqueezyTestStatus, setLemonsqueezyTestStatus] = useState<"idle" | "testing" | "connected" | "failed">("idle");
  const [lemonsqueezyTestMessage, setLemonsqueezyTestMessage] = useState<string>("");
  const [sellauthTestStatus, setSellauthTestStatus] = useState<"idle" | "testing" | "connected" | "failed">("idle");
  const [sellauthTestMessage, setSellauthTestMessage] = useState<string>("");

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const { data, error } = await db
      .from("site_settings")
      .select("*");
    
    if (data) {
      const settingsMap: Record<string, string> = {};
      data.forEach((setting: Setting) => {
        settingsMap[setting.key] = setting.value || "";
      });
      setSettings(settingsMap);
    }
    setLoading(false);
  };

  const updateSetting = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const togglePasswordVisibility = (key: string) => {
    setShowPasswords(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const saveSettings = async () => {
    setSaving(true);
    
    try {
      for (const [key, value] of Object.entries(settings)) {
        await db
          .from("site_settings")
          .upsert({ 
            key, 
            value, 
            updated_at: new Date().toISOString() 
          }, { 
            onConflict: 'key' 
          });
      }
      
      toast({
        title: "✅ تم الحفظ بنجاح",
        description: "تم تحديث جميع الإعدادات",
      });
    } catch (error) {
      toast({
        title: "❌ خطأ",
        description: "حدث خطأ أثناء حفظ الإعدادات",
        variant: "destructive",
      });
    }
    
    setSaving(false);
  };

  const testPayPalConnection = async () => {
    setPaypalTestStatus("testing");
    setPaypalTestMessage("");

    try {
      const authClient = isExternalConfigured ? getAuthClient() : db;
      const { data: { session } } = await authClient.auth.getSession();

      if (!session) {
        setPaypalTestStatus("failed");
        setPaypalTestMessage("يجب تسجيل الدخول أولاً");
        return;
      }

      const result = await invokeCloudFunction<{
        success: boolean;
        status: string;
        message: string;
        mode?: string;
      }>("paypal-test-connection", {}, session.access_token);

      if (result.error) {
        setPaypalTestStatus("failed");
        setPaypalTestMessage(result.error.message || "فشل الاتصال");
        return;
      }

      if (result.data?.success) {
        setPaypalTestStatus("connected");
        setPaypalTestMessage(result.data.message);
        toast({
          title: "✅ اتصال ناجح",
          description: result.data.message,
        });
      } else {
        setPaypalTestStatus("failed");
        setPaypalTestMessage(result.data?.message || "فشل التحقق من بيانات PayPal");
      }
    } catch (error) {
      setPaypalTestStatus("failed");
      setPaypalTestMessage(error instanceof Error ? error.message : "خطأ غير معروف");
    }
  };

  // دالة اختبار عامة لبوابات الدفع
  const testGatewayConnection = async (
    gatewayName: string,
    apiKeyField: string,
    testEndpoint: string | null,
    setStatus: (s: "idle" | "testing" | "connected" | "failed") => void,
    setMessage: (m: string) => void
  ) => {
    setStatus("testing");
    setMessage("");

    const apiKey = settings[apiKeyField];
    if (!apiKey) {
      setStatus("failed");
      setMessage("مفتاح API غير موجود - يرجى إدخاله وحفظ الإعدادات أولاً");
      return;
    }

    try {
      const authClient = isExternalConfigured ? getAuthClient() : db;
      const { data: { session } } = await authClient.auth.getSession();

      if (!session) {
        setStatus("failed");
        setMessage("يجب تسجيل الدخول أولاً");
        return;
      }

      // إذا لا يوجد endpoint للاختبار، نتحقق فقط من وجود المفتاح
      if (!testEndpoint) {
        const keyLength = apiKey.length;
        const keyPreview = apiKey.substring(0, 4) + "..." + apiKey.substring(apiKey.length - 4);
        setStatus("connected");
        setMessage(`المفتاح موجود (${keyLength} حرف: ${keyPreview}) - جاهز للاستخدام`);
        toast({
          title: "✅ المفتاح جاهز",
          description: `${gatewayName}: المفتاح موجود وجاهز للاستخدام`,
        });
        return;
      }

      // اختبار الاتصال الفعلي
      const result = await invokeCloudFunction<{
        success: boolean;
        message?: string;
        error?: string;
      }>(testEndpoint, {}, session.access_token);

      if (result.error) {
        setStatus("failed");
        setMessage(result.error.message || "فشل الاتصال");
        return;
      }

      if (result.data?.success) {
        setStatus("connected");
        setMessage(result.data.message || "متصل بنجاح");
        toast({
          title: "✅ اتصال ناجح",
          description: `${gatewayName}: ${result.data.message || "متصل بنجاح"}`,
        });
      } else {
        setStatus("failed");
        setMessage(result.data?.error || result.data?.message || "فشل التحقق");
      }
    } catch (error) {
      setStatus("failed");
      setMessage(error instanceof Error ? error.message : "خطأ غير معروف");
    }
  };

  // دوال اختبار لكل بوابة
  const testOxapayConnection = () => testGatewayConnection(
    "OxaPay", "oxapay_merchant_api_key", null, setOxapayTestStatus, setOxapayTestMessage
  );

  const testCryptomusConnection = () => testGatewayConnection(
    "Cryptomus", "cryptomus_api_key", null, setCryptomusTestStatus, setCryptomusTestMessage
  );

  const testNowpaymentsConnection = () => testGatewayConnection(
    "NOWPayments", "nowpayments_api_key", null, setNowpaymentsTestStatus, setNowpaymentsTestMessage
  );

  const testLemonsqueezyConnection = () => testGatewayConnection(
    "Lemon Squeezy", "lemonsqueezy_api_key", null, setLemonsqueezyTestStatus, setLemonsqueezyTestMessage
  );

  const testSellauthConnection = () => testGatewayConnection(
    "SellAuth", "sellauth_api_key", null, setSellauthTestStatus, setSellauthTestMessage
  );

  // Render functions instead of inline components to avoid re-creation
  const renderPasswordInput = (label: string, settingKey: string, placeholder: string, description?: string) => (
    <div className="space-y-2" key={settingKey}>
      <Label className="text-sm font-medium">{label}</Label>
      <div className="relative">
        <Input
          value={settings[settingKey] || ""}
          onChange={(e) => updateSetting(settingKey, e.target.value)}
          placeholder={placeholder}
          className="bg-background/50 border-border/50 font-mono pr-10 focus:border-primary/50 transition-colors"
          dir="ltr"
          type={showPasswords[settingKey] ? "text" : "password"}
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            togglePasswordVisibility(settingKey);
          }}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          {showPasswords[settingKey] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );

  const renderSettingInput = (label: string, settingKey: string, placeholder: string, options?: { description?: string; type?: string; dir?: "rtl" | "ltr"; className?: string }) => (
    <div className="space-y-2" key={settingKey}>
      <Label className="text-sm font-medium">{label}</Label>
      <Input
        type={options?.type || "text"}
        value={settings[settingKey] || ""}
        onChange={(e) => updateSetting(settingKey, e.target.value)}
        placeholder={placeholder}
        className={`bg-background/50 border-border/50 focus:border-primary/50 transition-colors ${options?.className || ""}`}
        dir={options?.dir || "rtl"}
      />
      {options?.description && <p className="text-xs text-muted-foreground">{options.description}</p>}
    </div>
  );

  // زر اختبار الاتصال
  const renderTestButton = (
    testFn: () => void,
    status: "idle" | "testing" | "connected" | "failed",
    message: string
  ) => (
    <div className="pt-2 border-t border-border/50">
      <Button
        variant="outline"
        size="sm"
        onClick={testFn}
        disabled={status === "testing"}
        className={`w-full gap-2 ${
          status === "connected" 
            ? "border-green-500/50 text-green-600 hover:bg-green-500/10" 
            : status === "failed"
            ? "border-red-500/50 text-red-600 hover:bg-red-500/10"
            : ""
        }`}
      >
        {status === "testing" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري الاختبار...
          </>
        ) : status === "connected" ? (
          <>
            <CheckCircle2 className="h-4 w-4" />
            المفتاح جاهز
          </>
        ) : status === "failed" ? (
          <>
            <XCircle className="h-4 w-4" />
            فشل الاختبار
          </>
        ) : (
          <>
            <Zap className="h-4 w-4" />
            اختبار الاتصال
          </>
        )}
      </Button>
      {message && (
        <p className={`text-xs mt-2 ${
          status === "connected" ? "text-green-600" : "text-red-600"
        }`}>
          {message}
        </p>
      )}
    </div>
  );

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.1, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const }
    })
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
          <Loader2 className="h-12 w-12 animate-spin text-primary relative" />
        </div>
        <p className="text-muted-foreground animate-pulse">جاري تحميل الإعدادات...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8" dir="rtl">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10 p-6 border border-border/50">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-secondary/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />
        
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-primary to-secondary shadow-lg">
              <Settings className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">إعدادات الموقع</h1>
              <p className="text-muted-foreground text-sm">إدارة وتخصيص متجرك</p>
            </div>
          </div>
          
          <Button 
            onClick={saveSettings} 
            disabled={saving}
            className="gap-2 bg-gradient-to-r from-primary to-secondary hover:opacity-90 shadow-lg shadow-primary/25"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            حفظ التغييرات
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="w-full grid grid-cols-5 p-1 bg-muted/50 rounded-xl h-auto">
          {[
            { value: "general", icon: Globe, label: "عام" },
            { value: "telegram", icon: Bot, label: "البوت" },
            { value: "smtp", icon: Mail, label: "البريد" },
            { value: "payment", icon: CreditCard, label: "الدفع" },
            { value: "crypto", icon: Bitcoin, label: "كريبتو" },
          ].map((tab) => (
            <TabsTrigger 
              key={tab.value}
              value={tab.value}
              className="flex items-center gap-2 py-3 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg transition-all"
            >
              <tab.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Store Identity */}
            <MotionCard 
              custom={0}
              initial="hidden"
              animate="visible"
              variants={cardVariants}
              className="border-border/50 bg-card/50 backdrop-blur-sm"
            >
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-primary/10">
                    <Store className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">هوية المتجر</CardTitle>
                    <CardDescription>المعلومات الأساسية لمتجرك</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {renderSettingInput("اسم المتجر", "store_name", "متجر رقمي")}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">شعار المتجر</Label>
                  <ImageUpload
                    value={settings.store_logo_url || ""}
                    onChange={(url) => updateSetting("store_logo_url", url)}
                    bucket="store-assets"
                    removeBackground={true}
                  />
                </div>
                {renderSettingInput("بريد الدعم الفني", "support_email", "support@yourstore.com", { dir: "ltr", description: "البريد الظاهر للعملاء للتواصل" })}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">العملة الافتراضية</Label>
                  <Select
                    value={settings.currency || "USD"}
                    onValueChange={(value) => updateSetting("currency", value)}
                  >
                    <SelectTrigger className="bg-background/50 border-border/50 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">🇺🇸 دولار أمريكي (USD)</SelectItem>
                      <SelectItem value="EUR">🇪🇺 يورو (EUR)</SelectItem>
                      <SelectItem value="SAR">🇸🇦 ريال سعودي (SAR)</SelectItem>
                      <SelectItem value="AED">🇦🇪 درهم إماراتي (AED)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </MotionCard>

            {/* Social Links */}
            <MotionCard 
              custom={1}
              initial="hidden"
              animate="visible"
              variants={cardVariants}
              className="border-border/50 bg-card/50 backdrop-blur-sm"
            >
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-secondary/10">
                    <Share2 className="h-5 w-5 text-secondary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">روابط التواصل</CardTitle>
                    <CardDescription>حسابات التواصل الاجتماعي</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  {renderSettingInput("انستقرام (اسم المستخدم)", "instagram_username", "username", { dir: "ltr", description: "اسم المستخدم فقط بدون @" })}
                  {renderSettingInput("تيك توك (اسم المستخدم)", "tiktok_username", "username", { dir: "ltr", description: "اسم المستخدم فقط بدون @" })}
                  {renderSettingInput("تيليجرام (اسم المستخدم)", "telegram_username", "username", { dir: "ltr", description: "اسم المستخدم فقط بدون @" })}
                  {renderSettingInput("قناة تيليجرام", "telegram_channel", "channel_name", { dir: "ltr", description: "اسم القناة بدون @" })}
                  {renderSettingInput("ديسكورد (كود الدعوة)", "discord_invite", "abc123", { dir: "ltr", description: "كود الدعوة فقط (ما بعد discord.gg/)" })}
                  {renderSettingInput("إكس/تويتر (اسم المستخدم)", "twitter_username", "username", { dir: "ltr", description: "اسم المستخدم فقط بدون @" })}
                </div>
                {renderSettingInput("واتساب (رقم الهاتف)", "whatsapp_number", "966512345678", { dir: "ltr", description: "رقم الهاتف مع رمز الدولة بدون + أو 00" })}
              </CardContent>
            </MotionCard>
          </div>

          {/* Remove Background */}
          <MotionCard 
            custom={2}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            className="border-green-500/20 bg-card/50 backdrop-blur-sm"
          >
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-green-500/10">
                    <ImageOff className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">إزالة خلفية الصور</CardTitle>
                    <CardDescription>خدمة remove.bg لإزالة الخلفيات تلقائياً</CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="border-green-500/30 text-green-600">
                  <Sparkles className="h-3 w-3 ml-1" />
                  اختياري
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {renderPasswordInput("Remove.bg API Key", "remove_bg_api_key", "أدخل مفتاح API من remove.bg")}
              <InfoBox variant="success">
                <div className="flex items-start gap-2">
                  <ExternalLink className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>
                    احصل على مفتاح مجاني من{" "}
                    <a href="https://www.remove.bg/api" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                      remove.bg/api
                    </a>
                  </span>
                </div>
              </InfoBox>
            </CardContent>
          </MotionCard>
        </TabsContent>

        {/* SMTP Settings */}
        <TabsContent value="smtp" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <MotionCard 
              custom={0}
              initial="hidden"
              animate="visible"
              variants={cardVariants}
              className="border-emerald-500/20 bg-card/50 backdrop-blur-sm lg:col-span-2"
            >
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10">
                    <Server className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">إعدادات Gmail SMTP</CardTitle>
                    <CardDescription>لإرسال إيميلات الطلبات والتسليم</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  {renderSettingInput("خادم SMTP", "smtp_host", "smtp.gmail.com", { dir: "ltr", className: "font-mono" })}
                  {renderSettingInput("المنفذ (Port)", "smtp_port", "465", { dir: "ltr", className: "font-mono" })}
                </div>
                {renderSettingInput("بريد Gmail للإرسال", "smtp_user", "yourstore@gmail.com", { dir: "ltr", className: "font-mono" })}
                {renderPasswordInput("كلمة مرور التطبيقات (App Password)", "smtp_pass", "xxxx xxxx xxxx xxxx", "كلمة مرور مكونة من 16 حرف من إعدادات أمان Google")}
                <InfoBox variant="success">
                  <p className="font-medium mb-2">📌 كيفية الحصول على كلمة مرور التطبيقات:</p>
                  <ol className="list-decimal list-inside space-y-1 opacity-90">
                    <li>فعّل التحقق بخطوتين على حسابك Google</li>
                    <li>اذهب إلى <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="underline">myaccount.google.com/apppasswords</a></li>
                    <li>أنشئ كلمة مرور جديدة للتطبيقات</li>
                    <li>انسخ كلمة المرور المكونة من 16 حرف</li>
                  </ol>
                </InfoBox>
              </CardContent>
            </MotionCard>

            <MotionCard 
              custom={1}
              initial="hidden"
              animate="visible"
              variants={cardVariants}
              className="border-blue-500/20 bg-card/50 backdrop-blur-sm lg:col-span-2"
            >
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-500/10">
                    <Mail className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">إعدادات البريد المرسل</CardTitle>
                    <CardDescription>تخصيص عنوان المرسل</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {renderSettingInput("عنوان إيميل المرسل (للعرض)", "sender_email", "noreply@yourdomain.com", { dir: "ltr", className: "font-mono", description: "اتركه فارغاً لاستخدام بريد Gmail أعلاه" })}
              </CardContent>
            </MotionCard>
          </div>
        </TabsContent>

        {/* Payment Settings */}
        <TabsContent value="payment" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* PayPal */}
            <MotionCard 
              custom={0}
              initial="hidden"
              animate="visible"
              variants={cardVariants}
              className="border-blue-500/20 bg-card/50 backdrop-blur-sm"
            >
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-blue-500/10">
                      <Wallet className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">PayPal</CardTitle>
                      <CardDescription>بطاقات بنكية وحساب PayPal</CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-blue-500/30 text-blue-600">موثوق</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {renderPasswordInput("Client ID", "paypal_client_id", "أدخل Client ID")}
                {renderPasswordInput("Client Secret", "paypal_client_secret", "أدخل Client Secret")}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">الوضع</Label>
                  <Select
                    value={settings.paypal_mode || "sandbox"}
                    onValueChange={(value) => updateSetting("paypal_mode", value)}
                  >
                    <SelectTrigger className="bg-background/50 border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sandbox">🧪 تجريبي (Sandbox)</SelectItem>
                      <SelectItem value="live">🚀 حقيقي (Live)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <InfoBox variant="info">
                  <div className="flex items-start gap-2">
                    <ExternalLink className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>
                      <a href="https://developer.paypal.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                        developer.paypal.com
                      </a>
                      {" → Dashboard → Create App"}
                    </span>
                  </div>
                </InfoBox>

                {/* PayPal Connection Test Button */}
                <div className="pt-2 border-t border-border/50">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={testPayPalConnection}
                    disabled={paypalTestStatus === "testing"}
                    className={`w-full gap-2 ${
                      paypalTestStatus === "connected" 
                        ? "border-green-500/50 text-green-600 hover:bg-green-500/10" 
                        : paypalTestStatus === "failed"
                        ? "border-red-500/50 text-red-600 hover:bg-red-500/10"
                        : ""
                    }`}
                  >
                    {paypalTestStatus === "testing" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        جاري الاختبار...
                      </>
                    ) : paypalTestStatus === "connected" ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        متصل بنجاح
                      </>
                    ) : paypalTestStatus === "failed" ? (
                      <>
                        <XCircle className="h-4 w-4" />
                        فشل الاتصال
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4" />
                        اختبار الاتصال
                      </>
                    )}
                  </Button>
                  {paypalTestMessage && (
                    <p className={`text-xs mt-2 ${
                      paypalTestStatus === "connected" ? "text-green-600" : "text-red-600"
                    }`}>
                      {paypalTestMessage}
                    </p>
                  )}
                </div>
              </CardContent>
            </MotionCard>

            {/* Lemon Squeezy */}
            <MotionCard 
              custom={1}
              initial="hidden"
              animate="visible"
              variants={cardVariants}
              className="border-yellow-500/20 bg-card/50 backdrop-blur-sm"
            >
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-yellow-500/10">
                      <span className="text-xl">🍋</span>
                    </div>
                    <div>
                      <CardTitle className="text-lg">Lemon Squeezy</CardTitle>
                      <CardDescription>رسوم أقل من PayPal</CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-yellow-500/30 text-yellow-600">موصى به</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {renderPasswordInput("API Key", "lemonsqueezy_api_key", "أدخل مفتاح API")}
                {renderSettingInput("Store ID", "lemonsqueezy_store_id", "123456", { dir: "ltr", className: "font-mono" })}
                {renderSettingInput("Variant ID (اختياري)", "lemonsqueezy_variant_id", "123456", { dir: "ltr", className: "font-mono" })}
                {renderPasswordInput("Webhook Secret", "lemonsqueezy_webhook_secret", "lsq_...")}
                <InfoBox variant="warning">
                  <p className="font-medium mb-2">📌 خطوات الإعداد:</p>
                  <ol className="list-decimal list-inside space-y-1 opacity-90 text-xs">
                    <li>سجل في <a href="https://lemonsqueezy.com" target="_blank" rel="noopener noreferrer" className="underline">lemonsqueezy.com</a></li>
                    <li>أنشئ متجر واحصل على Store ID</li>
                    <li>Settings → API → Create API Key</li>
                  </ol>
                </InfoBox>
                {renderTestButton(testLemonsqueezyConnection, lemonsqueezyTestStatus, lemonsqueezyTestMessage)}
              </CardContent>
            </MotionCard>

            {/* NOWPayments */}
            <MotionCard 
              custom={2}
              initial="hidden"
              animate="visible"
              variants={cardVariants}
              className="border-orange-500/20 bg-card/50 backdrop-blur-sm"
            >
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-orange-500/10">
                    <Bitcoin className="h-5 w-5 text-orange-500" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">NOWPayments</CardTitle>
                    <CardDescription>100+ عملة رقمية مع تأكيد تلقائي</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {renderPasswordInput("API Key", "nowpayments_api_key", "أدخل مفتاح API")}
                {renderPasswordInput("IPN Secret Key", "nowpayments_ipn_secret", "مفتاح التحقق من الإشعارات")}
                <InfoBox variant="info">
                  <div className="flex items-start gap-2">
                    <ExternalLink className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>
                      <a href="https://nowpayments.io" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                        nowpayments.io
                      </a>
                      {" → Settings → API Keys"}
                    </span>
                  </div>
                </InfoBox>
                {renderTestButton(testNowpaymentsConnection, nowpaymentsTestStatus, nowpaymentsTestMessage)}
              </CardContent>
            </MotionCard>

            {/* Cryptomus */}
            <MotionCard 
              custom={3}
              initial="hidden"
              animate="visible"
              variants={cardVariants}
              className="border-purple-500/20 bg-card/50 backdrop-blur-sm"
            >
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-purple-500/10">
                      <Bitcoin className="h-5 w-5 text-purple-500" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Cryptomus</CardTitle>
                      <CardDescription>بوابة كريبتو موثوقة وسهلة</CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-purple-500/30 text-purple-600">جديد</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {renderSettingInput("Merchant ID", "cryptomus_merchant_id", "أدخل معرف التاجر", { dir: "ltr", className: "font-mono" })}
                {renderPasswordInput("Payment API Key", "cryptomus_api_key", "أدخل مفتاح API للدفع (لإنشاء الفواتير)")}
                {renderPasswordInput("Payment Key (للـ Webhook)", "cryptomus_payment_key", "أدخل مفتاح التحقق من Webhook")}
                <InfoBox variant="info">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start gap-2">
                      <ExternalLink className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>
                        <a href="https://cryptomus.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                          cryptomus.com
                        </a>
                        {" → Settings → API"}
                      </span>
                    </div>
                    <p className="text-xs opacity-80">
                      • Payment API Key: لإنشاء الفواتير<br/>
                      • Payment Key: للتحقق من صحة الـ Webhook (مفتاح مختلف!)
                    </p>
                  </div>
                </InfoBox>
                {renderTestButton(testCryptomusConnection, cryptomusTestStatus, cryptomusTestMessage)}
              </CardContent>
            </MotionCard>

            {/* OxaPay */}
            <MotionCard 
              custom={4}
              initial="hidden"
              animate="visible"
              variants={cardVariants}
              className="border-green-500/20 bg-card/50 backdrop-blur-sm"
            >
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-green-500/10">
                      <Bitcoin className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">OxaPay</CardTitle>
                      <CardDescription>كريبتو وبطاقات بنكية - قبول فوري</CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-green-500/30 text-green-600">جديد</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {renderPasswordInput("Merchant API Key", "oxapay_merchant_api_key", "أدخل مفتاح API من OxaPay")}
                <InfoBox variant="success">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start gap-2">
                      <ExternalLink className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>
                        <a href="https://oxapay.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                          oxapay.com
                        </a>
                        {" → Settings → API Keys"}
                      </span>
                    </div>
                    <p className="text-xs opacity-80">
                      يدعم العملات الرقمية والبطاقات البنكية مع قبول فوري بدون KYC للحدود الصغيرة
                    </p>
                  </div>
                </InfoBox>
                {renderTestButton(testOxapayConnection, oxapayTestStatus, oxapayTestMessage)}
              </CardContent>
            </MotionCard>

            {/* SellAuth */}
            <MotionCard 
              custom={5}
              initial="hidden"
              animate="visible"
              variants={cardVariants}
              className="border-cyan-500/20 bg-card/50 backdrop-blur-sm"
            >
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-cyan-500/10">
                      <CreditCard className="h-5 w-5 text-cyan-500" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">SellAuth</CardTitle>
                      <CardDescription>Visa, Mastercard, Apple Pay - رسوم منخفضة</CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-cyan-500/30 text-cyan-600">جديد</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {renderPasswordInput("API Key", "sellauth_api_key", "أدخل مفتاح API من SellAuth")}
                {renderSettingInput("Shop ID", "sellauth_shop_id", "أدخل معرف المتجر", { dir: "ltr", className: "font-mono" })}
                <div className="grid gap-4 sm:grid-cols-2">
                  {renderSettingInput("Product ID", "sellauth_product_id", "معرف المنتج ($1)", { dir: "ltr", className: "font-mono", description: "أنشئ منتج بسعر $1 في SellAuth" })}
                  {renderSettingInput("Variant ID", "sellauth_variant_id", "معرف الفاريانت", { dir: "ltr", className: "font-mono" })}
                </div>
                {renderPasswordInput("Webhook Secret", "sellauth_webhook_secret", "أدخل مفتاح التحقق من Webhook")}
                <InfoBox variant="warning">
                  <div className="flex flex-col gap-2">
                    <p className="font-medium mb-1">📌 خطوات الإعداد:</p>
                    <ol className="list-decimal list-inside space-y-1 opacity-90 text-xs">
                      <li>أنشئ منتج جديد في SellAuth بسعر <strong>$1</strong> واسمه "رصيد" أو "Credit"</li>
                      <li>انسخ Product ID و Variant ID من صفحة المنتج</li>
                      <li>النظام سيرسل الكمية حسب المبلغ (مثلاً: $50 = 50 وحدة)</li>
                    </ol>
                  </div>
                </InfoBox>
                <InfoBox variant="info">
                  <div className="flex items-start gap-2">
                    <ExternalLink className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>
                      <a href="https://sellauth.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                        sellauth.com
                      </a>
                      {" → Dashboard → Products → Create Product"}
                    </span>
                  </div>
                </InfoBox>
                {renderTestButton(testSellauthConnection, sellauthTestStatus, sellauthTestMessage)}
              </CardContent>
            </MotionCard>

            {/* General Payment Settings */}
            <MotionCard 
              custom={3}
              initial="hidden"
              animate="visible"
              variants={cardVariants}
              className="border-border/50 bg-card/50 backdrop-blur-sm"
            >
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-accent/10">
                    <Shield className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">إعدادات عامة</CardTitle>
                    <CardDescription>خيارات الدفع الإضافية</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {renderSettingInput("محفظة العملات الرقمية (يدوي)", "crypto_wallet_address", "0x...", { dir: "ltr", className: "font-mono text-sm", description: "للدفع اليدوي بدون بوابة" })}
                {renderSettingInput("نسبة عمولة المسوقين (%)", "affiliate_commission", "10", { type: "number", className: "w-32" })}
              </CardContent>
            </MotionCard>
          </div>
        </TabsContent>

        {/* Crypto Settings */}
        <TabsContent value="crypto" className="space-y-6">
          {/* Fixed Addresses - Recommended */}
          <MotionCard 
            custom={0}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            className="border-green-500/20 bg-card/50 backdrop-blur-sm"
          >
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-green-500/10">
                    <Wallet className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">عناوين الدفع الثابتة</CardTitle>
                    <CardDescription>أدخل عنوان محفظتك مباشرة - أبسط وأضمن</CardDescription>
                  </div>
                </div>
                <Badge className="bg-green-500/10 text-green-600 border-green-500/30">
                  <CheckCircle2 className="h-3 w-3 ml-1" />
                  موصى به
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                {renderSettingInput("عنوان Litecoin (LTC)", "ltc_address", "L... أو ltc1...", { dir: "ltr", className: "font-mono text-sm", description: "انسخ العنوان من محفظة Exodus أو أي محفظة" })}
                {renderSettingInput("عنوان Bitcoin (BTC)", "btc_address", "bc1... أو 1... أو 3...", { dir: "ltr", className: "font-mono text-sm" })}
              </div>
              <InfoBox variant="success">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  <span>هذه الطريقة مضمونة 100% - الفلوس تصل مباشرة لمحفظتك</span>
                </div>
              </InfoBox>
            </CardContent>
          </MotionCard>

          {/* xPub - Advanced */}
          <MotionCard 
            custom={1}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            className="border-purple-500/20 bg-card/50 backdrop-blur-sm opacity-75"
          >
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-purple-500/10">
                    <Bitcoin className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">xPub (للمتقدمين)</CardTitle>
                    <CardDescription>إنشاء عنوان مختلف لكل طلب - قد لا يعمل مع بعض المحافظ</CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="border-purple-500/30 text-purple-600">متقدم</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {renderSettingInput("Litecoin xPub", "ltc_xpub", "Ltub... أو xpub...", { dir: "ltr", className: "font-mono text-xs" })}
                {renderSettingInput("Bitcoin xPub", "btc_xpub", "xpub...", { dir: "ltr", className: "font-mono text-xs" })}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {renderSettingInput("العملات المفعلة", "enabled_cryptos", "LTC,BTC,USDT", { dir: "ltr", description: "افصل بين العملات بفاصلة" })}
                {renderSettingInput("عدد التأكيدات المطلوبة", "crypto_confirmations", "1", { type: "number", className: "w-32" })}
              </div>
              <InfoBox variant="warning">
                <div className="flex items-start gap-2">
                  <span className="text-lg">⚠️</span>
                  <span>xPub قد لا يعمل مع Exodus بسبب اختلاف derivation path. استخدم العناوين الثابتة أعلاه بدلاً منه.</span>
                </div>
              </InfoBox>
            </CardContent>
          </MotionCard>
        </TabsContent>

        {/* Telegram Bot Settings */}
        <TabsContent value="telegram" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Bot Configuration */}
            <MotionCard 
              custom={0}
              initial="hidden"
              animate="visible"
              variants={cardVariants}
              className="border-border/50 bg-card/50 backdrop-blur-sm"
            >
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-500/10">
                    <Bot className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">بوت تيليجرام</CardTitle>
                    <CardDescription>إعدادات بوت توصيل رموز OTP للعملاء</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {renderPasswordInput("Bot Token", "telegram_bot_token", "123456789:ABCdefGHI...", "احصل عليه من @BotFather في تيليجرام")}
                {renderSettingInput("اسم البوت", "telegram_bot_username", "@your_store_bot", { dir: "ltr", description: "Username البوت بدون @" })}
                
                <InfoBox variant="info">
                  <div className="space-y-2 text-sm">
                    <p className="font-medium">كيفية إنشاء البوت:</p>
                    <ol className="list-decimal list-inside space-y-1 text-xs">
                      <li>افتح @BotFather في تيليجرام</li>
                      <li>أرسل /newbot واتبع التعليمات</li>
                      <li>انسخ Token والصقه هنا</li>
                    </ol>
                  </div>
                </InfoBox>
              </CardContent>
            </MotionCard>

            {/* Bot Messages */}
            <MotionCard 
              custom={1}
              initial="hidden"
              animate="visible"
              variants={cardVariants}
              className="border-border/50 bg-card/50 backdrop-blur-sm"
            >
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-green-500/10">
                    <MessageCircle className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">رسائل البوت</CardTitle>
                    <CardDescription>تخصيص الرسائل التي يرسلها البوت</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {renderSettingInput("رسالة الترحيب", "telegram_welcome_message", "مرحباً بك في بوت المتجر! أدخل كود التفعيل:", { description: "الرسالة الأولى عند بدء المحادثة" })}
                {renderSettingInput("رسالة الكود الخاطئ", "telegram_invalid_code_message", "كود التفعيل غير صحيح أو منتهي الصلاحية", { description: "عند إدخال كود غير صالح" })}
                {renderSettingInput("رسالة طلب تسجيل الدخول", "telegram_login_prompt", "سجل دخولك للحساب الآن، ثم أرسل 'تم' للحصول على الرمز", { description: "بعد التحقق من الكود" })}
                {renderSettingInput("رسالة نجاح OTP", "telegram_otp_success", "رمز التحقق: {otp}\n⚠️ صالح لمدة 5 دقائق فقط", { description: "استخدم {otp} لعرض الرمز" })}
              </CardContent>
            </MotionCard>
          </div>

          {/* Gmail IMAP for OTP */}
          <MotionCard 
            custom={2}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            className="border-border/50 bg-card/50 backdrop-blur-sm"
          >
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-red-500/10">
                    <Mail className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">بريد استقبال رموز OTP</CardTitle>
                    <CardDescription>Gmail لقراءة رموز التحقق تلقائياً</CardDescription>
                  </div>
                </div>
                <Badge className="bg-red-500/10 text-red-600 border-red-500/30">Gmail IMAP</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {renderSettingInput("بريدات Gmail لاستقبال OTP", "otp_emails", "account1@gmail.com, account2@gmail.com", { 
                dir: "ltr", 
                description: "بريدات استقبال OTP مفصولة بفاصلة (يمكن إضافة أكثر من بريد)" 
              })}
              <div className="grid gap-4 sm:grid-cols-2">
                {renderSettingInput("بريد Gmail الرئيسي", "otp_gmail_email", "your-store@gmail.com", { dir: "ltr", description: "البريد الافتراضي لقراءة رموز OTP" })}
                {renderPasswordInput("App Password", "otp_gmail_app_password", "xxxx xxxx xxxx xxxx", "كلمة مرور التطبيق من Google")}
              </div>
              
              <InfoBox variant="warning">
                <div className="space-y-2 text-sm">
                  <p className="font-medium">⚠️ كيفية الحصول على App Password:</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>فعّل التحقق بخطوتين في حساب Google</li>
                    <li>اذهب إلى <a href="https://myaccount.google.com/apppasswords" target="_blank" className="text-primary hover:underline">Google App Passwords</a></li>
                    <li>أنشئ كلمة مرور جديدة للتطبيق</li>
                    <li>انسخ الـ 16 حرف والصقها هنا</li>
                  </ol>
                </div>
              </InfoBox>
              
              <InfoBox variant="info">
                <div className="text-sm">
                  <p className="font-medium mb-2">💡 نصيحة لأكثر من بريد:</p>
                  <p className="text-xs opacity-90">
                    يمكنك إضافة عدة بريدات Gmail في خانة "بريدات Gmail لاستقبال OTP"، وسيقوم النظام بالبحث في جميع البريدات للعثور على رمز OTP المطلوب.
                  </p>
                </div>
              </InfoBox>
            </CardContent>
          </MotionCard>

          {/* Webhook URL */}
          <MotionCard 
            custom={3}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            className="border-border/50 bg-card/50 backdrop-blur-sm"
          >
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-500/10">
                  <Key className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <CardTitle className="text-lg">رابط Webhook</CardTitle>
                  <CardDescription>لربط البوت بالسيرفر (يتم إعداده تلقائياً)</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-xl border border-border/50">
                <code className="text-xs text-muted-foreground break-all" dir="ltr">
                  https://umzjbcmrdknmyhgmkatp.supabase.co/functions/v1/telegram-bot-webhook
                </code>
              </div>
              <InfoBox variant="success">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>بعد حفظ Bot Token، سيتم إعداد الـ Webhook تلقائياً</span>
                </div>
              </InfoBox>
            </CardContent>
          </MotionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsTab;
