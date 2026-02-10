import { useState, useEffect } from "react";
import { db } from "@/lib/supabaseClient";
// osn_sessions يُقرأ من db (الخارجي) مباشرة
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { 
  Mail, Plus, Loader2, Trash2, Edit, Eye, EyeOff, 
  QrCode, Key, RefreshCw, AlertCircle, ChevronDown, ChevronUp, Package, Wifi, WifiOff, Cookie
} from "lucide-react";

interface OsnSession {
  id: string;
  variant_id: string;
  email: string | null;
  cookies: any;
  is_active: boolean;
  is_connected: boolean;
  last_activity: string | null;
  created_at: string;
  gmail_address: string | null;
  gmail_app_password: string | null;
  product_variants?: {
    name: string;
    name_en: string | null;
    product_id: string;
    products?: {
      name: string;
      name_en: string | null;
      image_url: string | null;
    };
  };
}

interface ProductVariant {
  id: string;
  name: string;
  name_en: string | null;
  product_id: string;
  products?: {
    name: string;
    name_en: string | null;
    image_url: string | null;
  } | null;
}

interface OtpConfiguration {
  id: string;
  product_id: string;
  gmail_address: string;
  gmail_app_password: string;
  activation_type: string;
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
  const [initializingSession, setInitializingSession] = useState(false);
  const [serverSleeping, setServerSleeping] = useState(false);
  const [wakingUp, setWakingUp] = useState(false);
  
  // جلسات الكوكيز المتعددة
  const [osnSessions, setOsnSessions] = useState<OsnSession[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [cookieDialogOpen, setCookieDialogOpen] = useState(false);
  const [cookieText, setCookieText] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [importingCookies, setImportingCookies] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [smtpEditSessionId, setSmtpEditSessionId] = useState<string | null>(null);
  const [editingEmailSessionId, setEditingEmailSessionId] = useState<string | null>(null);
  const [editingEmailValue, setEditingEmailValue] = useState("");
  const [smtpGmailAddress, setSmtpGmailAddress] = useState("");
  const [smtpGmailAppPassword, setSmtpGmailAppPassword] = useState("");
  const [smtpAccountPassword, setSmtpAccountPassword] = useState("");
  const [sessionType, setSessionType] = useState<"osn" | "chatgpt">("osn");
  const [chatgptPassword, setChatgptPassword] = useState("");
  const [chatgptGmailAddress, setChatgptGmailAddress] = useState("");
  const [chatgptGmailAppPassword, setChatgptGmailAppPassword] = useState("");

  const [form, setForm] = useState({
    product_id: "",
    gmail_address: "",
    gmail_app_password: "",
    otp_enabled: true,
    qr_enabled: false,
    is_active: true,
  });

  // ==================== API Helpers ====================

  const callOsnSession = async (action: string, params: Record<string, any> = {}) => {
    const CLOUD_URL = import.meta.env.VITE_SUPABASE_URL;
    const CLOUD_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const response = await fetch(`${CLOUD_URL}/functions/v1/osn-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CLOUD_KEY}`,
        'apikey': CLOUD_KEY,
      },
      body: JSON.stringify({ action, ...params }),
    });
    if (!response.ok) throw new Error("فشل الاتصال بالسيرفر");
    const data = await response.json();
    if (data.hint?.includes("sleep")) setServerSleeping(true);
    else setServerSleeping(false);
    return data;
  };

  // ==================== Data Fetching ====================

  const fetchData = async () => {
    setLoading(true);
    const [configsResult, productsResult] = await Promise.all([
      db.from("otp_configurations").select(`*, products:product_id (name, name_en, image_url)`).order("created_at", { ascending: false }),
      db.from("products").select("id, name, name_en, image_url").eq("is_active", true).order("name"),
    ]);
    if (!configsResult.error) setConfigurations(configsResult.data || []);
    if (!productsResult.error) setProducts(productsResult.data || []);
    setLoading(false);
  };

  const fetchSessionStatus = async () => {
    setSessionLoading(true);
    try {
      const result = await callOsnSession("status");
      if (result.success) { setSessionStatus(result.data || result); setServerSleeping(false); }
      else if (result.hint?.includes("sleep")) setServerSleeping(true);
    } catch (error) { console.error("Error fetching session status:", error); }
    setSessionLoading(false);
  };

  const fetchOsnSessions = async () => {
    const { data, error } = await db
      .from("osn_sessions")
      .select(`*`)
      .order("created_at", { ascending: false });
    if (error) { console.error("Error fetching osn_sessions:", error); return; }
    if (!data) return;

    // Auto-extract and save email from cookies if missing
    for (const session of data) {
      if (!session.email && session.cookies) {
        const extracted = extractInfoFromCookies(Array.isArray(session.cookies) ? session.cookies : []);
        if (extracted) {
          session.email = extracted;
          db.from("osn_sessions").update({ email: extracted }).eq("id", session.id).then(() => {});
        }
      }
    }

    // Fetch variant details from external DB
    const variantIds = [...new Set(data.map(s => s.variant_id))];
    if (variantIds.length > 0) {
      const { data: variantsData } = await db
        .from("product_variants")
        .select(`id, name, name_en, product_id, products:product_id (name, name_en, image_url)`)
        .in("id", variantIds);
      
      const variantMap = new Map((variantsData || []).map((v: any) => [v.id, v]));
      const enriched = data.map(session => ({
        ...session,
        product_variants: variantMap.get(session.variant_id) || null,
      }));
      setOsnSessions(enriched as any);
    } else {
      setOsnSessions(data as any);
    }
  };

  const fetchVariants = async () => {
    const { data, error } = await db
      .from("product_variants")
      .select(`id, name, name_en, product_id, products:product_id (name, name_en, image_url)`)
      .eq("is_active", true)
      .order("name");
    if (!error && data) setVariants(data as any);
  };

  useEffect(() => {
    fetchData();
    fetchSessionStatus();
    fetchOsnSessions();
    fetchVariants();
  }, []);

  // ==================== Server Wake ====================

  const wakeUpServer = async () => {
    setWakingUp(true);
    toast({ title: "⏳ جاري إيقاظ السيرفر...", description: "قد يستغرق هذا حتى 30 ثانية" });
    for (let i = 0; i < 3; i++) {
      try {
        const result = await callOsnSession("health");
        if (result.success || result.status === "ok") {
          setServerSleeping(false);
          toast({ title: "✅ السيرفر جاهز!", description: "يمكنك الآن تهيئة الجلسة" });
          await fetchSessionStatus();
          setWakingUp(false);
          return;
        }
      } catch { await new Promise(resolve => setTimeout(resolve, 5000)); }
    }
    toast({ title: "⚠️ السيرفر لا يزال يستيقظ", description: "جرب مرة أخرى بعد 30 ثانية", variant: "destructive" });
    setWakingUp(false);
  };

  // ==================== Session Init (legacy) ====================

  const initializeSession = async (email: string, gmailAppPassword: string) => {
    setInitializingSession(true);
    try {
      const result = await callOsnSession("init", { email, gmailAppPassword });
      if (result.success) {
        toast({ title: "✅ تم تسجيل الدخول بنجاح", description: "الجلسة محفوظة وجاهزة للاستخدام" });
        setSessionStatus(result.status || result.data);
        return true;
      } else {
        toast({ title: "❌ فشل تسجيل الدخول", description: result.error || "حدث خطأ", variant: "destructive" });
        return false;
      }
    } catch (error: any) {
      toast({ title: "❌ خطأ في الاتصال", description: error.message, variant: "destructive" });
      return false;
    } finally { setInitializingSession(false); }
  };

  // ==================== Cookie Sessions ====================

  const extractInfoFromCookies = (cookies: any[]): string | null => {
    if (!Array.isArray(cookies)) return null;
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    
    // 1. بحث عن إيميل في كل الكوكيز
    for (const cookie of cookies) {
      const val = cookie.value || '';
      
      const directMatch = val.match(emailRegex);
      if (directMatch) return directMatch[0];
      
      try {
        const decoded = decodeURIComponent(val);
        const decodedMatch = decoded.match(emailRegex);
        if (decodedMatch) return decodedMatch[0];
        
        // فك JWT داخل JSON مشفر بـ URL
        const jwtMatch = decoded.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
        if (jwtMatch) {
          try {
            const payload = jwtMatch[0].split('.')[1];
            const jsonStr = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
            const emailInJwt = jsonStr.match(emailRegex);
            if (emailInJwt) return emailInJwt[0];
            // استخراج user_id كبديل
            const parsed = JSON.parse(jsonStr);
            if (parsed.user_id) return `user_${parsed.user_id}`;
          } catch {}
        }
      } catch {}
      
      // JWT مباشر في القيمة
      if (val.includes('.') && val.split('.').length >= 2) {
        try {
          const payload = val.split('.')[1];
          const jsonStr = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
          const jwtEmailMatch = jsonStr.match(emailRegex);
          if (jwtEmailMatch) return jwtEmailMatch[0];
          const parsed = JSON.parse(jsonStr);
          if (parsed.user_id) return `user_${parsed.user_id}`;
        } catch {}
      }
    }
    
    return null;
  };

  const handleImportCookies = async () => {
    if (!selectedVariantId) { toast({ title: "خطأ", description: "يرجى اختيار المنتج الفرعي", variant: "destructive" }); return; }
    if (!manualEmail.trim()) { toast({ title: "خطأ", description: "يرجى إدخال إيميل الحساب", variant: "destructive" }); return; }

    // ChatGPT type: no cookies needed
    if (sessionType === "chatgpt") {
      if (!chatgptPassword.trim()) { toast({ title: "خطأ", description: "يرجى إدخال كلمة مرور الحساب", variant: "destructive" }); return; }
      setImportingCookies(true);
      try {
        const { error: insertError } = await db.from("osn_sessions").insert({
          variant_id: selectedVariantId,
          email: manualEmail.trim(),
          cookies: [], // empty cookies for ChatGPT
          is_active: true,
          is_connected: true,
          last_activity: new Date().toISOString(),
          account_password: chatgptPassword.trim(),
          gmail_address: chatgptGmailAddress.trim() || null,
          gmail_app_password: chatgptGmailAppPassword.trim() || null,
        });
        if (insertError) {
          toast({ title: "❌ خطأ", description: insertError.message, variant: "destructive" });
        } else {
          const { error: unlimitedError } = await db.from("product_variants").update({ is_unlimited: true }).eq("id", selectedVariantId);
          if (unlimitedError) console.error("Failed to set variant as unlimited:", unlimitedError);
          toast({ title: "✅ تم إنشاء جلسة ChatGPT بنجاح", description: `${manualEmail.trim()} — المنتج الفرعي أصبح غير محدود` });
        }
        setCookieDialogOpen(false); setCookieText(""); setSelectedVariantId(""); setManualEmail("");
        setChatgptPassword(""); setChatgptGmailAddress(""); setChatgptGmailAppPassword(""); setSessionType("osn");
        await Promise.all([fetchOsnSessions(), fetchSessionStatus()]);
      } catch (error: any) {
        toast({ title: "❌ خطأ", description: error.message, variant: "destructive" });
      } finally { setImportingCookies(false); }
      return;
    }

    // OSN type: requires cookies
    if (!cookieText.trim()) { toast({ title: "خطأ", description: "يرجى لصق الكوكيز أولاً", variant: "destructive" }); return; }

    setImportingCookies(true);
    try {
      let cookies;
      try { cookies = JSON.parse(cookieText.trim()); }
      catch { toast({ title: "خطأ في التنسيق", description: "الكوكيز يجب أن تكون بتنسيق JSON صالح", variant: "destructive" }); setImportingCookies(false); return; }

      const extractedInfo = extractInfoFromCookies(cookies);
      const finalEmail = manualEmail.trim() || extractedInfo;
      const result = await callOsnSession("import-cookies", { cookies, email: finalEmail });

      if (result.success) {
        const { error: insertError } = await db.from("osn_sessions").insert({
          variant_id: selectedVariantId,
          email: finalEmail,
          cookies: cookies,
          is_active: true,
          is_connected: true,
          last_activity: new Date().toISOString(),
        });
        if (insertError) {
          toast({ title: "⚠️ تم الاستيراد لكن فشل الحفظ", description: insertError.message, variant: "destructive" });
        } else {
          const { error: unlimitedError } = await db.from("product_variants").update({ is_unlimited: true }).eq("id", selectedVariantId);
          if (unlimitedError) console.error("Failed to set variant as unlimited:", unlimitedError);
          toast({ title: "✅ تم استيراد الكوكيز بنجاح", description: `الجلسة متصلة${finalEmail ? ` - ${finalEmail}` : ''} — المنتج الفرعي أصبح غير محدود` });
        }
        setCookieDialogOpen(false); setCookieText(""); setSelectedVariantId(""); setManualEmail(""); setSessionType("osn");
        await Promise.all([fetchOsnSessions(), fetchSessionStatus()]);
      } else {
        toast({ title: "❌ فشل استيراد الكوكيز", description: result.error || "الكوكيز غير صالحة", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "❌ خطأ", description: error.message, variant: "destructive" });
    } finally { setImportingCookies(false); }
  };

  const handleSaveSmtp = async (sessionId: string) => {
    const { error } = await db.from("osn_sessions").update({
      gmail_address: smtpGmailAddress.trim() || null,
      gmail_app_password: smtpGmailAppPassword.trim() || null,
      account_password: smtpAccountPassword.trim() || null,
    }).eq("id", sessionId);
    if (error) toast({ title: "❌ خطأ", description: error.message, variant: "destructive" });
    else { toast({ title: "✅ تم حفظ البيانات" }); setSmtpEditSessionId(null); await fetchOsnSessions(); }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذه الجلسة؟")) return;
    setDeletingSessionId(sessionId);
    const { error } = await db.from("osn_sessions").delete().eq("id", sessionId);
    if (error) toast({ title: "خطأ", description: "فشل في حذف الجلسة", variant: "destructive" });
    else { toast({ title: "✅ تم حذف الجلسة" }); await fetchOsnSessions(); }
    setDeletingSessionId(null);
  };

  // ==================== OTP Config CRUD ====================

  const parseActivationType = (type: string) => {
    const types = type?.split(",") || [];
    return { otp: types.includes("otp"), qr: types.includes("qr") };
  };

  const buildActivationType = (otp: boolean, qr: boolean): string => {
    const types: string[] = [];
    if (otp) types.push("otp");
    if (qr) types.push("qr");
    return types.length > 0 ? types.join(",") : "otp";
  };

  const openAddDialog = () => {
    setEditingConfig(null);
    setForm({ product_id: "", gmail_address: "", gmail_app_password: "", otp_enabled: true, qr_enabled: false, is_active: true });
    setDialogOpen(true);
  };

  const openEditDialog = (config: OtpConfiguration) => {
    setEditingConfig(config);
    const parsed = parseActivationType(config.activation_type);
    setForm({ product_id: config.product_id, gmail_address: config.gmail_address, gmail_app_password: config.gmail_app_password, otp_enabled: parsed.otp, qr_enabled: parsed.qr, is_active: config.is_active });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.product_id || !form.gmail_address || !form.gmail_app_password) {
      toast({ title: "خطأ", description: "يرجى ملء جميع الحقول المطلوبة", variant: "destructive" }); return;
    }
    if (!form.otp_enabled && !form.qr_enabled) {
      toast({ title: "خطأ", description: "يجب اختيار نوع تفعيل واحد على الأقل", variant: "destructive" }); return;
    }
    const activationType = buildActivationType(form.otp_enabled, form.qr_enabled);
    setSaving(true);
    try {
      if (editingConfig) {
        const { error } = await db.from("otp_configurations").update({ gmail_address: form.gmail_address, gmail_app_password: form.gmail_app_password, activation_type: activationType, is_active: form.is_active, updated_at: new Date().toISOString() }).eq("id", editingConfig.id);
        if (error) throw error;
        toast({ title: "✅ تم التحديث بنجاح" });
      } else {
        const { error } = await db.from("otp_configurations").insert({ product_id: form.product_id, gmail_address: form.gmail_address, gmail_app_password: form.gmail_app_password, activation_type: activationType, is_active: form.is_active });
        if (error) { if (error.code === "23505") toast({ title: "خطأ", description: "هذا المنتج لديه إعداد OTP مسبقاً", variant: "destructive" }); else throw error; setSaving(false); return; }
        toast({ title: "✅ تم الإضافة بنجاح" });
      }
      setDialogOpen(false); fetchData();
    } catch (error: any) { toast({ title: "خطأ", description: error.message || "فشل في الحفظ", variant: "destructive" }); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الإعداد؟")) return;
    const { error } = await db.from("otp_configurations").delete().eq("id", id);
    if (error) toast({ title: "خطأ", description: "فشل في الحذف", variant: "destructive" });
    else { toast({ title: "✅ تم الحذف" }); fetchData(); }
  };

  const toggleActive = async (id: string, currentState: boolean) => {
    const { error } = await db.from("otp_configurations").update({ is_active: !currentState }).eq("id", id);
    if (error) toast({ title: "خطأ", variant: "destructive" });
    else fetchData();
  };

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const availableProducts = products.filter(p => 
    !configurations.some(c => c.product_id === p.id) || 
    (editingConfig && editingConfig.product_id === p.id)
  );

  const renderTypeBadges = (activationType: string) => {
    const types = activationType?.split(",") || [];
    return (
      <div className="flex items-center gap-1">
        {types.includes("otp") && <Badge variant="outline" className="gap-1 text-xs"><Key className="h-3 w-3" />OTP</Badge>}
        {types.includes("qr") && <Badge variant="outline" className="gap-1 text-xs"><QrCode className="h-3 w-3" />QR</Badge>}
      </div>
    );
  };

  // ==================== RENDER ====================

  if (loading) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
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
                  <p className="text-sm text-muted-foreground">سيرفرات Render المجانية تنام بعد عدم النشاط. اضغط لإيقاظه.</p>
                </div>
              </div>
              <Button variant="destructive" size="sm" disabled={wakingUp} onClick={wakeUpServer}>
                {wakingUp ? <><Loader2 className="h-4 w-4 ml-1 animate-spin" />جاري الإيقاظ...</> : <><RefreshCw className="h-4 w-4 ml-1" />إيقاظ السيرفر</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* حالة الجلسة الحالية */}
      {!serverSleeping && (() => {
        const hasConnectedSession = osnSessions.some(s => s.is_connected);
        const isConnected = sessionStatus?.isLoggedIn || hasConnectedSession;
        return (
        <Card className={`border-2 ${isConnected ? 'border-primary/50 bg-primary/5' : 'border-muted/50 bg-muted/5'}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isConnected ? <Wifi className="h-5 w-5 text-primary" /> : <WifiOff className="h-5 w-5 text-muted-foreground" />}
                <div>
                  <p className="font-medium">{isConnected ? "✅ الجلسة متصلة" : "⚠️ الجلسة غير متصلة"}</p>
                  {sessionStatus?.email && <p className="text-sm text-muted-foreground">{sessionStatus.email}</p>}
                  {sessionStatus?.lastActivity && <p className="text-xs text-muted-foreground">آخر نشاط: {new Date(sessionStatus.lastActivity).toLocaleString("ar-SA")}</p>}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={fetchSessionStatus} disabled={sessionLoading}>
                  {sessionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        );
      })()}

      {/* ===== قسم جلسات الكوكيز المتعددة ===== */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Cookie className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">جلسات الكوكيز</h3>
              <Badge variant="outline">{osnSessions.length}</Badge>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { fetchOsnSessions(); fetchSessionStatus(); }}>
                <RefreshCw className="h-4 w-4 ml-1" />
                تحديث
              </Button>
              <Button size="sm" onClick={() => setCookieDialogOpen(true)}>
                <Plus className="h-4 w-4 ml-1" />
                إنشاء جديد
              </Button>
            </div>
          </div>

          {osnSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Cookie className="h-10 w-10 mb-3 opacity-50" />
              <p className="text-sm">لا توجد جلسات كوكيز بعد</p>
              <p className="text-xs mt-1">اضغط "إنشاء جديد" لإضافة كوكيز</p>
            </div>
          ) : (
            <div className="space-y-2">
              {osnSessions.map((session) => (
                <div key={session.id} className="p-3 rounded-lg border bg-muted/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                        {session.product_variants?.products?.image_url ? (
                          <img src={session.product_variants.products.image_url} className="h-full w-full object-cover" alt="" />
                        ) : (
                          <Package className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {session.product_variants?.products?.name || "منتج"} — {session.product_variants?.name || "فرعي"}
                        </p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground" dir="ltr">
                          {editingEmailSessionId === session.id ? (
                            <form className="flex items-center gap-1" onSubmit={async (e) => {
                              e.preventDefault();
                              const { error } = await db.from("osn_sessions").update({ email: editingEmailValue.trim() }).eq("id", session.id);
                              if (!error) { toast({ title: "✅ تم تحديث الإيميل" }); setEditingEmailSessionId(null); await fetchOsnSessions(); }
                              else toast({ title: "❌ خطأ", description: error.message, variant: "destructive" });
                            }}>
                              <Input value={editingEmailValue} onChange={(e) => setEditingEmailValue(e.target.value)} className="h-6 text-xs w-48" dir="ltr" autoFocus />
                              <Button type="submit" size="sm" variant="ghost" className="h-6 px-1 text-xs">✓</Button>
                              <Button type="button" size="sm" variant="ghost" className="h-6 px-1 text-xs" onClick={() => setEditingEmailSessionId(null)}>✕</Button>
                            </form>
                          ) : (
                            <span className="cursor-pointer hover:text-primary hover:underline" onClick={() => { setEditingEmailSessionId(session.id); setEditingEmailValue(session.email || ''); }} title="انقر لتعديل الإيميل">
                              {session.email || "بدون إيميل - انقر للإضافة"}
                            </span>
                          )}
                          {session.last_activity && ` • ${new Date(session.last_activity).toLocaleString("ar-SA")}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={session.is_connected ? "default" : "secondary"} className="text-xs">
                        {session.is_connected ? "متصل" : "غير متصل"}
                      </Badge>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setSmtpEditSessionId(smtpEditSessionId === session.id ? null : session.id);
                          setSmtpGmailAddress(session.gmail_address || "");
                          setSmtpGmailAppPassword(session.gmail_app_password || "");
                          setSmtpAccountPassword((session as any).account_password || "");
                        }}
                        title="إعدادات SMTP وكلمة المرور"
                      >
                        <Mail className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={deletingSessionId === session.id}
                        onClick={() => handleDeleteSession(session.id)}
                      >
                        {deletingSessionId === session.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  {/* Gmail SMTP info or edit */}
                  {(session.gmail_address || (session as any).account_password) && smtpEditSessionId !== session.id && (
                    <div className="flex items-center gap-4 pt-1 border-t border-border/50 text-xs text-muted-foreground flex-wrap" dir="ltr">
                      {session.gmail_address && (
                        <div className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          <span>{session.gmail_address}</span>
                        </div>
                      )}
                      {session.gmail_app_password && (
                        <div className="flex items-center gap-1">
                          <Key className="h-3 w-3" />
                          <span>{showPasswords[session.id] ? session.gmail_app_password : "••••••••"}</span>
                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setShowPasswords(prev => ({ ...prev, [session.id]: !prev[session.id] }))}>
                            {showPasswords[session.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </Button>
                        </div>
                      )}
                      {(session as any).account_password && (
                        <div className="flex items-center gap-1">
                          <span className="text-primary font-medium">🔐</span>
                          <span>{showPasswords[`${session.id}_acc`] ? (session as any).account_password : "••••"}</span>
                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setShowPasswords(prev => ({ ...prev, [`${session.id}_acc`]: !prev[`${session.id}_acc`] }))}>
                            {showPasswords[`${session.id}_acc`] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                  {smtpEditSessionId === session.id && (
                    <div className="pt-2 border-t border-border/50 space-y-2">
                      <p className="text-xs font-medium flex items-center gap-1"><Mail className="h-3 w-3" />بيانات Gmail SMTP</p>
                      <Input type="email" placeholder="example@gmail.com" value={smtpGmailAddress} onChange={(e) => setSmtpGmailAddress(e.target.value)} dir="ltr" className="h-8 text-xs" />
                      <Input type="password" placeholder="Gmail App Password" value={smtpGmailAppPassword} onChange={(e) => setSmtpGmailAppPassword(e.target.value)} dir="ltr" className="h-8 text-xs" />
                      <div className="pt-1">
                        <p className="text-xs font-medium flex items-center gap-1 mb-1"><Key className="h-3 w-3" />كلمة مرور الحساب (للعميل)</p>
                        <Input type="password" placeholder="كلمة مرور ChatGPT/الحساب" value={smtpAccountPassword} onChange={(e) => setSmtpAccountPassword(e.target.value)} dir="ltr" className="h-8 text-xs" />
                        <p className="text-[10px] text-muted-foreground mt-1">يُرسل للعميل مع البريد ورمز OTP عبر البوت</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">إنشاء App Password</a>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSmtpEditSessionId(null)}>إلغاء</Button>
                          <Button size="sm" className="h-7 text-xs" onClick={() => handleSaveSmtp(session.id)}>حفظ</Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== قسم إعدادات OTP ===== */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">إعدادات OTP للمنتجات</h3>
          <Badge variant="outline">{configurations.length}</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { fetchData(); fetchSessionStatus(); }}>
            <RefreshCw className="h-4 w-4 ml-1" />تحديث
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openAddDialog}><Plus className="h-4 w-4 ml-1" />إنشاء جديد</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md" dir="rtl">
              <DialogHeader>
                <DialogTitle>{editingConfig ? "تعديل إعداد OTP" : "إنشاء إعداد OTP جديد"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>المنتج <span className="text-destructive">*</span></Label>
                  <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })} disabled={!!editingConfig}>
                    <SelectTrigger className="bg-background"><SelectValue placeholder="اختر المنتج..." /></SelectTrigger>
                    <SelectContent className="bg-background border shadow-lg z-50">
                      {availableProducts.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          <div className="flex items-center gap-2">
                            {product.image_url && <img src={product.image_url} className="h-5 w-5 rounded object-cover" />}
                            <span>{product.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>إيميل حساب OSN <span className="text-destructive">*</span></Label>
                  <Input type="email" placeholder="example@gmail.com" value={form.gmail_address} onChange={(e) => setForm({ ...form, gmail_address: e.target.value })} dir="ltr" />
                </div>
                <div className="space-y-2">
                  <Label>Gmail App Password <span className="text-destructive">*</span></Label>
                  <Input type="password" placeholder="xxxx xxxx xxxx xxxx" value={form.gmail_app_password} onChange={(e) => setForm({ ...form, gmail_app_password: e.target.value })} dir="ltr" />
                  <p className="text-xs text-muted-foreground">
                    <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="text-primary underline">إنشاء App Password من هنا</a>
                  </p>
                </div>
                <div className="space-y-3">
                  <Label>نوع التفعيل <span className="text-destructive">*</span></Label>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                      <Checkbox id="otp_enabled" checked={form.otp_enabled} onCheckedChange={(checked) => setForm({ ...form, otp_enabled: !!checked })} />
                      <label htmlFor="otp_enabled" className="flex items-center gap-2 cursor-pointer flex-1">
                        <Key className="h-4 w-4 text-primary" />
                        <div><p className="text-sm font-medium">رمز OTP</p><p className="text-xs text-muted-foreground">رمز تحقق عبر البريد</p></div>
                      </label>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                      <Checkbox id="qr_enabled" checked={form.qr_enabled} onCheckedChange={(checked) => setForm({ ...form, qr_enabled: !!checked })} />
                      <label htmlFor="qr_enabled" className="flex items-center gap-2 cursor-pointer flex-1">
                        <QrCode className="h-4 w-4 text-primary" />
                        <div><p className="text-sm font-medium">رمز QR</p><p className="text-xs text-muted-foreground">مسح رمز QR</p></div>
                      </label>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label>مفعّل</Label>
                  <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
                  {editingConfig ? "تحديث" : "إنشاء"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* قائمة إعدادات OTP */}
      {configurations.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10">
            <Mail className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center mb-4">لم تقم بإضافة أي إعدادات OTP بعد</p>
            <Button onClick={openAddDialog}><Plus className="h-4 w-4 ml-1" />إنشاء إعداد جديد</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {configurations.map((config) => (
            <Collapsible key={config.id} open={expandedItems[config.id]} onOpenChange={() => toggleExpand(config.id)}>
              <Card className={`transition-all ${!config.is_active ? 'opacity-60' : ''}`}>
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                        {config.products?.image_url ? <img src={config.products.image_url} className="h-full w-full object-cover" alt={config.products.name} /> : <Package className="h-5 w-5 text-muted-foreground" />}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{config.products?.name || "منتج محذوف"}</p>
                        <p className="text-xs text-muted-foreground" dir="ltr">{config.gmail_address}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {renderTypeBadges(config.activation_type)}
                      {config.is_active ? <Badge className="bg-primary/10 text-primary border-primary/30 text-xs">مفعّل</Badge> : <Badge variant="secondary" className="text-xs">معطّل</Badge>}
                      {expandedItems[config.id] ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4 pt-0 border-t">
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">البريد</Label>
                        <code className="block text-sm bg-muted px-2 py-1.5 rounded" dir="ltr">{config.gmail_address}</code>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">App Password</Label>
                        <div className="flex items-center gap-1">
                          <code className="flex-1 text-sm bg-muted px-2 py-1.5 rounded" dir="ltr">{showPasswords[config.id] ? config.gmail_app_password : "••••••••••••"}</code>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setShowPasswords(prev => ({ ...prev, [config.id]: !prev[config.id] })); }}>
                            {showPasswords[config.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm">مفعّل</Label>
                        <Switch checked={config.is_active} onCheckedChange={() => toggleActive(config.id, config.is_active)} />
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); openEditDialog(config); }}><Edit className="h-4 w-4 ml-1" />تعديل</Button>
                        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); handleDelete(config.id); }}><Trash2 className="h-4 w-4 ml-1" />حذف</Button>
                      </div>
                    </div>
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </div>
      )}

      {/* ديالوج إنشاء جلسة جديدة */}
      <Dialog open={cookieDialogOpen} onOpenChange={(open) => { setCookieDialogOpen(open); if (!open) { setSessionType("osn"); setChatgptPassword(""); setChatgptGmailAddress(""); setChatgptGmailAppPassword(""); } }}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {sessionType === "chatgpt" ? <Key className="h-5 w-5" /> : <Cookie className="h-5 w-5" />}
              {sessionType === "chatgpt" ? "إنشاء جلسة ChatGPT" : "استيراد كوكيز OSN"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* نوع الجلسة */}
            <div className="space-y-2">
              <Label>نوع الجلسة <span className="text-destructive">*</span></Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSessionType("osn")}
                  className={`p-3 rounded-lg border text-center transition-all ${sessionType === "osn" ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                >
                  <Cookie className="h-5 w-5 mx-auto mb-1" />
                  <span className="text-sm">OSN (كوكيز)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSessionType("chatgpt")}
                  className={`p-3 rounded-lg border text-center transition-all ${sessionType === "chatgpt" ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                >
                  <Key className="h-5 w-5 mx-auto mb-1" />
                  <span className="text-sm">ChatGPT (بيانات)</span>
                </button>
              </div>
            </div>

            {/* اختيار المنتج الفرعي */}
            <div className="space-y-2">
              <Label>المنتج الفرعي <span className="text-destructive">*</span></Label>
              <Select value={selectedVariantId} onValueChange={setSelectedVariantId}>
                <SelectTrigger className="bg-background"><SelectValue placeholder="اختر المنتج الفرعي..." /></SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50">
                  {variants.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      <div className="flex items-center gap-2">
                        {v.products?.image_url && <img src={v.products.image_url} className="h-5 w-5 rounded object-cover" />}
                        <span>{v.products?.name} — {v.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* إيميل الحساب */}
            <div className="space-y-2">
              <Label>إيميل الحساب <span className="text-destructive">*</span></Label>
              <Input
                type="email"
                placeholder="example@email.com"
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                dir="ltr"
              />
            </div>

            {/* حقول ChatGPT */}
            {sessionType === "chatgpt" && (
              <>
                <div className="space-y-2">
                  <Label>كلمة مرور الحساب <span className="text-destructive">*</span></Label>
                  <Input
                    type="password"
                    placeholder="كلمة مرور ChatGPT"
                    value={chatgptPassword}
                    onChange={(e) => setChatgptPassword(e.target.value)}
                    dir="ltr"
                  />
                  <p className="text-xs text-muted-foreground">تُرسل للعميل عبر البوت مع الإيميل</p>
                </div>
                <div className="space-y-2">
                  <Label>Gmail لقراءة OTP</Label>
                  <Input
                    type="email"
                    placeholder="example@gmail.com"
                    value={chatgptGmailAddress}
                    onChange={(e) => setChatgptGmailAddress(e.target.value)}
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Gmail App Password</Label>
                  <Input
                    type="password"
                    placeholder="xxxx xxxx xxxx xxxx"
                    value={chatgptGmailAppPassword}
                    onChange={(e) => setChatgptGmailAppPassword(e.target.value)}
                    dir="ltr"
                  />
                  <p className="text-xs text-muted-foreground">
                    <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="text-primary underline">إنشاء App Password من هنا</a>
                  </p>
                </div>
              </>
            )}

            {/* حقول OSN - كوكيز */}
            {sessionType === "osn" && (
              <>
                <div className="space-y-2">
                  <Label>كوكيز OSN (JSON) <span className="text-destructive">*</span></Label>
                  <Textarea
                    placeholder={'[\n  {\n    "name": "cookie_name",\n    "value": "cookie_value",\n    "domain": ".osnplus.com"\n  }\n]'}
                    value={cookieText}
                    onChange={(e) => setCookieText(e.target.value)}
                    dir="ltr"
                    className="min-h-[150px] font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    استخدم إضافة "Cookie-Editor" لتصدير الكوكيز.
                  </p>
                </div>
              </>
            )}

            <div className="flex items-start gap-2 p-3 rounded-lg border bg-muted/50">
              <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="text-xs text-muted-foreground space-y-1">
                {sessionType === "chatgpt" ? (
                  <>
                    <p><strong>الخطوات:</strong></p>
                    <p>1. أدخل إيميل وكلمة مرور حساب ChatGPT</p>
                    <p>2. أضف بيانات Gmail لقراءة OTP تلقائياً</p>
                    <p>3. اختر المنتج الفرعي واضغط "إنشاء"</p>
                  </>
                ) : (
                  <>
                    <p><strong>الخطوات:</strong></p>
                    <p>1. سجّل دخول في osnplus.com من متصفحك</p>
                    <p>2. استخدم إضافة Cookie-Editor لتصدير الكوكيز</p>
                    <p>3. اختر المنتج الفرعي والصق الكوكيز واضغط "استيراد"</p>
                    <p>4. بعد الاستيراد يمكنك إضافة بيانات Gmail SMTP من الجلسة</p>
                  </>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCookieDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleImportCookies} disabled={importingCookies}>
              {importingCookies && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              {sessionType === "chatgpt" ? "إنشاء" : "استيراد"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OtpConfigurationsManager;
