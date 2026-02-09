import { useState, useEffect } from "react";
import { db } from "@/lib/supabaseClient";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Mail, Plus, Loader2, Trash2, Edit, Eye, EyeOff, 
  QrCode, Key, RefreshCw, AlertCircle, ChevronDown, ChevronUp, Package, Wifi, WifiOff, Cookie, Upload
} from "lucide-react";

interface OtpConfiguration {
  id: string;
  product_id: string;
  gmail_address: string;
  gmail_app_password: string;
  activation_type: string; // "otp" أو "qr" أو "otp,qr"
  is_active: boolean;
  created_at: string;
  products?: {
    name: string;
    name_en: string | null;
    image_url: string | null;
  };
}

interface Product {
  id: string;
  name: string;
  name_en: string | null;
  image_url: string | null;
}

const OtpConfigurationsManager = () => {
  const [loading, setLoading] = useState(true);
  const [configurations, setConfigurations] = useState<OtpConfiguration[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<OtpConfiguration | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  
  // حالة الجلسة
  const [sessionStatus, setSessionStatus] = useState<{
    isLoggedIn: boolean;
    email: string | null;
    lastActivity: string | null;
  } | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  
  const [serverSleeping, setServerSleeping] = useState(false);
  const [wakingUp, setWakingUp] = useState(false);
  const [importingCookies, setImportingCookies] = useState(false);
  const [cookiesText, setCookiesText] = useState("");

  const [form, setForm] = useState({
    product_id: "",
    gmail_address: "",
    gmail_app_password: "",
    otp_enabled: true,
    qr_enabled: false,
    is_active: true,
  });

  // استدعاء Edge Function للتواصل مع Render
  const callOsnSession = async (action: string, params: Record<string, any> = {}) => {
    const { data, error } = await supabase.functions.invoke("osn-session", {
      body: { action, ...params },
    });

    if (error) {
      console.error("OSN Session error:", error);
      throw new Error(error.message || "فشل الاتصال بالسيرفر");
    }

    // التحقق من حالة النوم
    if (data.hint?.includes("sleep")) {
      setServerSleeping(true);
    } else {
      setServerSleeping(false);
    }

    return data;
  };

  // إيقاظ السيرفر
  const wakeUpServer = async () => {
    setWakingUp(true);
    toast({
      title: "⏳ جاري إيقاظ السيرفر...",
      description: "قد يستغرق هذا حتى 30 ثانية",
    });

    // محاولة إيقاظ السيرفر عدة مرات
    for (let i = 0; i < 3; i++) {
      try {
        const result = await callOsnSession("health");
        if (result.success || result.status === "ok") {
          setServerSleeping(false);
          toast({
            title: "✅ السيرفر جاهز!",
            description: "يمكنك الآن تهيئة الجلسة",
          });
          await fetchSessionStatus();
          setWakingUp(false);
          return;
        }
      } catch {
        // انتظر ثم حاول مرة أخرى
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    toast({
      title: "⚠️ السيرفر لا يزال يستيقظ",
      description: "جرب مرة أخرى بعد 30 ثانية",
      variant: "destructive",
    });
    setWakingUp(false);
  };

  // جلب حالة الجلسة من Render عبر Edge Function
  const fetchSessionStatus = async () => {
    setSessionLoading(true);
    try {
      const result = await callOsnSession("status");
      if (result.success) {
        setSessionStatus(result.data || result);
        setServerSleeping(false);
      } else if (result.hint?.includes("sleep")) {
        setServerSleeping(true);
      }
    } catch (error) {
      console.error("Error fetching session status:", error);
    }
    setSessionLoading(false);
  };




  // استيراد Cookies مباشرة
  const handleImportCookies = async () => {
    if (!cookiesText.trim()) {
      toast({ title: "خطأ", description: "الصق الكوكيز أولاً", variant: "destructive" });
      return;
    }

    setImportingCookies(true);
    try {
      let cookies: any[];
      try {
        cookies = JSON.parse(cookiesText.trim());
        if (!Array.isArray(cookies)) cookies = [cookies];
      } catch {
        toast({ title: "خطأ", description: "صيغة JSON غير صحيحة. الصق الكوكيز كـ JSON Array.", variant: "destructive" });
        setImportingCookies(false);
        return;
      }

      const activeConfig = configurations.find(c => c.is_active);
      const result = await callOsnSession("import-cookies", { 
        cookies, 
        email: activeConfig?.gmail_address || "imported" 
      });

      if (result.success) {
        toast({ title: "✅ تم استيراد الجلسة بنجاح!", description: "الكوكيز شغالة والجلسة متصلة" });
        setSessionStatus({ isLoggedIn: true, email: activeConfig?.gmail_address || "imported", lastActivity: new Date().toISOString() });
        setCookiesText("");
      } else {
        toast({ title: "❌ فشل الاستيراد", description: result.error || "الكوكيز منتهية أو غير صالحة", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "❌ خطأ", description: error.message, variant: "destructive" });
    }
    setImportingCookies(false);
  };

  // دالة لتحويل activation_type إلى checkboxes
  const parseActivationType = (type: string) => {
    const types = type?.split(",") || [];
    return {
      otp: types.includes("otp"),
      qr: types.includes("qr"),
    };
  };

  // دالة لبناء activation_type من checkboxes
  const buildActivationType = (otp: boolean, qr: boolean): string => {
    const types: string[] = [];
    if (otp) types.push("otp");
    if (qr) types.push("qr");
    return types.length > 0 ? types.join(",") : "otp"; // default to otp
  };

  useEffect(() => {
    fetchData();
    fetchSessionStatus();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    const [configsResult, productsResult] = await Promise.all([
      db.from("otp_configurations")
        .select(`*, products:product_id (name, name_en, image_url)`)
        .order("created_at", { ascending: false }),
      db.from("products")
        .select("id, name, name_en, image_url")
        .eq("is_active", true)
        .order("name")
    ]);

    if (configsResult.error) {
      console.error("Error fetching configurations:", configsResult.error);
    } else {
      setConfigurations(configsResult.data || []);
    }

    if (productsResult.error) {
      console.error("Error fetching products:", productsResult.error);
    } else {
      setProducts(productsResult.data || []);
    }
    
    setLoading(false);
  };

  // لم نعد نحتاج parseActivationType لأن النوع أصبح قيمة واحدة

  const openAddDialog = () => {
    setEditingConfig(null);
    setForm({
      product_id: "",
      gmail_address: "",
      gmail_app_password: "",
      otp_enabled: true,
      qr_enabled: false,
      is_active: true,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (config: OtpConfiguration) => {
    setEditingConfig(config);
    const parsed = parseActivationType(config.activation_type);
    setForm({
      product_id: config.product_id,
      gmail_address: config.gmail_address,
      gmail_app_password: config.gmail_app_password,
      otp_enabled: parsed.otp,
      qr_enabled: parsed.qr,
      is_active: config.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.product_id || !form.gmail_address || !form.gmail_app_password) {
      toast({
        title: "خطأ",
        description: "يرجى ملء جميع الحقول المطلوبة",
        variant: "destructive",
      });
      return;
    }

    if (!form.otp_enabled && !form.qr_enabled) {
      toast({
        title: "خطأ",
        description: "يجب اختيار نوع تفعيل واحد على الأقل",
        variant: "destructive",
      });
      return;
    }

    const activationType = buildActivationType(form.otp_enabled, form.qr_enabled);

    setSaving(true);

    try {
      if (editingConfig) {
        const { error } = await db
          .from("otp_configurations")
          .update({
            gmail_address: form.gmail_address,
            gmail_app_password: form.gmail_app_password,
            activation_type: activationType,
            is_active: form.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingConfig.id);

        if (error) throw error;
        toast({ title: "✅ تم التحديث بنجاح" });
      } else {
        const { error } = await db
          .from("otp_configurations")
          .insert({
            product_id: form.product_id,
            gmail_address: form.gmail_address,
            gmail_app_password: form.gmail_app_password,
            activation_type: activationType,
            is_active: form.is_active,
          });

        if (error) {
          if (error.code === "23505") {
            toast({
              title: "خطأ",
              description: "هذا المنتج لديه إعداد OTP مسبقاً",
              variant: "destructive",
            });
          } else {
            throw error;
          }
          setSaving(false);
          return;
        }
        toast({ title: "✅ تم الإضافة بنجاح" });
      }

      setDialogOpen(false);
      fetchData();




    } catch (error: any) {
      console.error("Error saving configuration:", error);
      toast({
        title: "خطأ",
        description: error.message || "فشل في الحفظ",
        variant: "destructive",
      });
    }

    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الإعداد؟")) return;

    const { error } = await db
      .from("otp_configurations")
      .delete()
      .eq("id", id);

    if (error) {
      toast({
        title: "خطأ",
        description: "فشل في الحذف",
        variant: "destructive",
      });
    } else {
      toast({ title: "✅ تم الحذف" });
      fetchData();
    }
  };

  const toggleActive = async (id: string, currentState: boolean) => {
    const { error } = await db
      .from("otp_configurations")
      .update({ is_active: !currentState })
      .eq("id", id);

    if (error) {
      toast({ title: "خطأ", variant: "destructive" });
    } else {
      fetchData();
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // المنتجات المتاحة
  const availableProducts = products.filter(p => 
    !configurations.some(c => c.product_id === p.id) || 
    (editingConfig && editingConfig.product_id === p.id)
  );

  // عرض badges الأنواع
  const renderTypeBadges = (activationType: string) => {
    const types = activationType?.split(",") || [];
    return (
      <div className="flex items-center gap-1">
        {types.includes("otp") && (
          <Badge variant="outline" className="gap-1 text-xs">
            <Key className="h-3 w-3" />
            OTP
          </Badge>
        )}
        {types.includes("qr") && (
          <Badge variant="outline" className="gap-1 text-xs">
            <QrCode className="h-3 w-3" />
            QR
          </Badge>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* حالة السيرفر - تحذير النوم */}
      {serverSleeping && (
        <Card className="border-2 border-destructive/50 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <div>
                  <p className="font-medium text-destructive">⚠️ السيرفر في وضع النوم</p>
                  <p className="text-sm text-muted-foreground">
                    سيرفرات Render المجانية تنام بعد عدم النشاط. اضغط لإيقاظه.
                  </p>
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                disabled={wakingUp}
                onClick={wakeUpServer}
              >
                {wakingUp ? (
                  <>
                    <Loader2 className="h-4 w-4 ml-1 animate-spin" />
                    جاري الإيقاظ...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 ml-1" />
                    إيقاظ السيرفر
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* حالة الجلسة */}
      {!serverSleeping && (
        <Card className={`border-2 ${sessionStatus?.isLoggedIn ? 'border-primary/50 bg-primary/5' : 'border-muted/50 bg-muted/5'}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {sessionStatus?.isLoggedIn ? (
                  <Wifi className="h-5 w-5 text-primary" />
                ) : (
                  <WifiOff className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <p className="font-medium">
                    {sessionStatus?.isLoggedIn ? "✅ الجلسة متصلة" : "⚠️ الجلسة غير متصلة - استورد الكوكيز"}
                  </p>
                  {sessionStatus?.email && (
                    <p className="text-sm text-muted-foreground">{sessionStatus.email}</p>
                  )}
                  {sessionStatus?.lastActivity && (
                    <p className="text-xs text-muted-foreground">
                      آخر نشاط: {new Date(sessionStatus.lastActivity).toLocaleString("ar-SA")}
                    </p>
                  )}
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={fetchSessionStatus}
                disabled={sessionLoading}
              >
                {sessionLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* استيراد Cookies */}
      {!serverSleeping && (
        <Card className="border-2 border-dashed border-muted-foreground/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Cookie className="h-5 w-5 text-primary" />
              <Label className="font-medium">استيراد جلسة (Cookies)</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              سجّل دخول OSN من متصفحك، صدّر الكوكيز (بإضافة مثل EditThisCookie أو Cookie-Editor)، والصقها هنا كـ JSON.
            </p>
            <Textarea
              placeholder='[{"name":"session_id","value":"xxx","domain":".osnplus.com"}, ...]'
              value={cookiesText}
              onChange={(e) => setCookiesText(e.target.value)}
              dir="ltr"
              className="font-mono text-xs min-h-[80px]"
            />
            <Button
              size="sm"
              onClick={handleImportCookies}
              disabled={importingCookies || !cookiesText.trim()}
              className="w-full"
            >
              {importingCookies ? (
                <>
                  <Loader2 className="h-4 w-4 ml-1 animate-spin" />
                  جاري الاستيراد...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 ml-1" />
                  استيراد الجلسة
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">إعدادات OTP للمنتجات</h3>
          <Badge variant="outline">{configurations.length}</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { fetchData(); fetchSessionStatus(); }}>
            <RefreshCw className="h-4 w-4 ml-1" />
            تحديث
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openAddDialog}>
                <Plus className="h-4 w-4 ml-1" />
                إنشاء جديد
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md" dir="rtl">
              <DialogHeader>
                <DialogTitle>
                  {editingConfig ? "تعديل إعداد OTP" : "إنشاء إعداد OTP جديد"}
                </DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                {/* اختيار المنتج */}
                <div className="space-y-2">
                  <Label>المنتج <span className="text-destructive">*</span></Label>
                  <Select
                    value={form.product_id}
                    onValueChange={(v) => setForm({ ...form, product_id: v })}
                    disabled={!!editingConfig}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="اختر المنتج..." />
                    </SelectTrigger>
                    <SelectContent className="bg-background border shadow-lg z-50">
                      {availableProducts.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          <div className="flex items-center gap-2">
                            {product.image_url && (
                              <img src={product.image_url} className="h-5 w-5 rounded object-cover" />
                            )}
                            <span>{product.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* OSN Email - إيميل حساب OSN */}
                <div className="space-y-2">
                  <Label>إيميل حساب OSN <span className="text-destructive">*</span></Label>
                  <Input
                    type="email"
                    placeholder="example@gmail.com"
                    value={form.gmail_address}
                    onChange={(e) => setForm({ ...form, gmail_address: e.target.value })}
                    dir="ltr"
                  />
                  <p className="text-xs text-muted-foreground">
                    البريد المستخدم لتسجيل الدخول في OSN (يُرسل للعميل)
                  </p>
                </div>

                {/* Gmail App Password - لقراءة OTP عبر IMAP */}
                <div className="space-y-2">
                  <Label>Gmail App Password (لقراءة OTP) <span className="text-destructive">*</span></Label>
                  <Input
                    type="password"
                    placeholder="xxxx xxxx xxxx xxxx"
                    value={form.gmail_app_password}
                    onChange={(e) => setForm({ ...form, gmail_app_password: e.target.value })}
                    dir="ltr"
                  />
                  <p className="text-xs text-muted-foreground">
                    كلمة مرور التطبيق لقراءة رسائل OTP من Gmail عبر IMAP
                    <br />
                    <a 
                      href="https://myaccount.google.com/apppasswords" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      إنشاء App Password من هنا
                    </a>
                  </p>
                </div>

                {/* نوع التفعيل - Checkboxes متعددة */}
                <div className="space-y-3">
                  <Label>نوع التفعيل <span className="text-destructive">*</span></Label>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                      <Checkbox
                        id="otp_enabled"
                        checked={form.otp_enabled}
                        onCheckedChange={(checked) => setForm({ ...form, otp_enabled: !!checked })}
                      />
                      <label htmlFor="otp_enabled" className="flex items-center gap-2 cursor-pointer flex-1">
                        <Key className="h-4 w-4 text-primary" />
                        <div>
                          <p className="text-sm font-medium">رمز OTP</p>
                          <p className="text-xs text-muted-foreground">العميل يسجل دخول ← يطلب رمز ← أنت ترسل الرمز له</p>
                        </div>
                      </label>
                    </div>
                    
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                      <Checkbox
                        id="qr_enabled"
                        checked={form.qr_enabled}
                        onCheckedChange={(checked) => setForm({ ...form, qr_enabled: !!checked })}
                      />
                      <label htmlFor="qr_enabled" className="flex items-center gap-2 cursor-pointer flex-1">
                        <QrCode className="h-4 w-4 text-primary" />
                        <div>
                          <p className="text-sm font-medium">رمز QR</p>
                          <p className="text-xs text-muted-foreground">العميل يرسل صورة QR ← أنت تعمل Scan وتفعّل الحساب</p>
                        </div>
                      </label>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    يمكنك اختيار واحد أو اثنين حسب نوع المنتج
                  </p>
                </div>

                {/* التفعيل */}
                <div className="flex items-center justify-between">
                  <Label>مفعّل</Label>
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                  />
                </div>

                {/* تحذير */}
                <div className="flex items-start gap-2 p-3 rounded-lg border bg-muted/50">
                  <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    كود التفعيل صالح لمدة <strong>24 ساعة</strong> فقط من وقت الشراء.
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  إلغاء
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
                  {editingConfig ? "تحديث" : "إنشاء"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Empty State */}
      {configurations.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10">
            <Mail className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center mb-4">
              لم تقم بإضافة أي إعدادات OTP بعد
            </p>
            <Button onClick={openAddDialog}>
              <Plus className="h-4 w-4 ml-1" />
              إنشاء إعداد جديد
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* Configurations Accordion List */
        <div className="space-y-2">
          {configurations.map((config) => (
            <Collapsible
              key={config.id}
              open={expandedItems[config.id]}
              onOpenChange={() => toggleExpand(config.id)}
            >
              <Card className={`transition-all ${!config.is_active ? 'opacity-60' : ''}`}>
                {/* Header - Always Visible */}
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      {/* Product Image */}
                      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                        {config.products?.image_url ? (
                          <img 
                            src={config.products.image_url} 
                            className="h-full w-full object-cover" 
                            alt={config.products.name}
                          />
                        ) : (
                          <Package className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      
                      {/* Product Name & Email */}
                      <div>
                        <p className="font-medium text-sm">
                          {config.products?.name || "منتج محذوف"}
                        </p>
                        <p className="text-xs text-muted-foreground" dir="ltr">
                          {config.gmail_address}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Type Badges */}
                      {renderTypeBadges(config.activation_type)}
                      
                      {/* Status */}
                      {config.is_active ? (
                        <Badge className="bg-primary/10 text-primary border-primary/30 text-xs">
                          مفعّل
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          معطّل
                        </Badge>
                      )}

                      {/* Expand Icon */}
                      {expandedItems[config.id] ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CollapsibleTrigger>

                {/* Expanded Content */}
                <CollapsibleContent>
                  <div className="px-4 pb-4 pt-0 border-t">
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      {/* Gmail */}
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">البريد</Label>
                        <code className="block text-sm bg-muted px-2 py-1.5 rounded" dir="ltr">
                          {config.gmail_address}
                        </code>
                      </div>

                      {/* Password */}
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">App Password</Label>
                        <div className="flex items-center gap-1">
                          <code className="flex-1 text-sm bg-muted px-2 py-1.5 rounded" dir="ltr">
                            {showPasswords[config.id] ? config.gmail_app_password : "••••••••••••"}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowPasswords(prev => ({ ...prev, [config.id]: !prev[config.id] }));
                            }}
                          >
                            {showPasswords[config.id] ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Activation Types Info */}
                    <div className="mt-4 p-3 bg-muted/30 rounded-lg">
                      <Label className="text-xs text-muted-foreground">أنواع التفعيل المدعومة:</Label>
                      <div className="flex items-center gap-2 mt-2">
                        {config.activation_type?.includes("otp") && (
                          <div className="flex items-center gap-1 text-xs">
                            <Key className="h-3 w-3" />
                            <span>OTP - ترسل رمز للعميل</span>
                          </div>
                        )}
                        {config.activation_type?.includes("qr") && (
                          <div className="flex items-center gap-1 text-xs">
                            <QrCode className="h-3 w-3" />
                            <span>QR - العميل يرسل صورة وأنت تفعّل</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm">مفعّل</Label>
                        <Switch
                          checked={config.is_active}
                          onCheckedChange={() => toggleActive(config.id, config.is_active)}
                        />
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(config);
                          }}
                        >
                          <Edit className="h-4 w-4 ml-1" />
                          تعديل
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(config.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 ml-1" />
                          حذف
                        </Button>
                      </div>
                    </div>
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </div>
      )}
    </div>
  );
};

export default OtpConfigurationsManager;
