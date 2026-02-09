import { useState, useEffect } from "react";
import { db, getAuthClient, isExternalConfigured } from "@/lib/supabaseClient";
import { invokeCloudFunction } from "@/lib/cloudFunctions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Key, Loader2, Send, RefreshCw, CheckCircle2, Clock, XCircle, 
  MessageCircle, User, Copy, Eye, EyeOff, AlertTriangle, Settings
} from "lucide-react";
import { formatDistanceToNow, differenceInHours } from "date-fns";
import { ar } from "date-fns/locale";
import OtpConfigurationsManager from "./OtpConfigurationsManager";

interface ActivationCode {
  id: string;
  code: string;
  order_id: string | null;
  product_id: string;
  user_id: string;
  account_email: string | null;
  account_password: string | null;
  status: string;
  is_used: boolean;
  telegram_chat_id: string | null;
  telegram_username: string | null;
  expires_at: string;
  created_at: string;
  products?: {
    name: string;
    name_en: string | null;
    image_url: string | null;
  };
}

const ActivationCodesTab = () => {
  const [loading, setLoading] = useState(true);
  const [codes, setCodes] = useState<ActivationCode[]>([]);
  const [sendingOtp, setSendingOtp] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState<Record<string, string>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [setupLoading, setSetupLoading] = useState(false);

  useEffect(() => {
    fetchCodes();
  }, []);

  const fetchCodes = async () => {
    setLoading(true);
    const { data, error } = await db
      .from("activation_codes")
      .select(`
        *,
        products:product_id (name, name_en, image_url)
      `)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Error fetching activation codes:", error);
      toast({
        title: "خطأ",
        description: "فشل في جلب أكواد التفعيل",
        variant: "destructive",
      });
    } else {
      setCodes(data || []);
    }
    setLoading(false);
  };

  const setupWebhook = async () => {
    setSetupLoading(true);
    try {
      const authClient = isExternalConfigured ? getAuthClient() : db;
      const { data: { session } } = await authClient.auth.getSession();

      if (!session) {
        toast({
          title: "خطأ",
          description: "يجب تسجيل الدخول أولاً",
          variant: "destructive",
        });
        return;
      }

      const result = await invokeCloudFunction<{
        success: boolean;
        message: string;
        bot_info?: { username: string };
      }>("telegram-setup-webhook", {}, session.access_token);

      if (result.error) {
        toast({
          title: "فشل إعداد Webhook",
          description: result.error.message,
          variant: "destructive",
        });
      } else if (result.data?.success) {
        toast({
          title: "✅ تم إعداد البوت",
          description: `البوت @${result.data.bot_info?.username} جاهز للعمل!`,
        });
      }
    } catch (error) {
      toast({
        title: "خطأ",
        description: "حدث خطأ غير متوقع",
        variant: "destructive",
      });
    }
    setSetupLoading(false);
  };

  const sendOtp = async (codeId: string) => {
    const otp = otpInput[codeId];
    if (!otp || otp.length < 4) {
      toast({
        title: "خطأ",
        description: "أدخل رمز OTP صالح (4 أحرف على الأقل)",
        variant: "destructive",
      });
      return;
    }

    setSendingOtp(codeId);
    try {
      const authClient = isExternalConfigured ? getAuthClient() : db;
      const { data: { session } } = await authClient.auth.getSession();

      if (!session) {
        toast({
          title: "خطأ",
          description: "يجب تسجيل الدخول أولاً",
          variant: "destructive",
        });
        return;
      }

      const result = await invokeCloudFunction<{ success: boolean; message: string }>(
        "telegram-send-otp",
        { activation_code_id: codeId, otp_code: otp },
        session.access_token
      );

      if (result.error) {
        toast({
          title: "فشل إرسال OTP",
          description: result.error.message,
          variant: "destructive",
        });
      } else if (result.data?.success) {
        toast({
          title: "✅ تم الإرسال",
          description: "تم إرسال رمز OTP للعميل عبر تيليجرام",
        });
        setOtpInput(prev => ({ ...prev, [codeId]: "" }));
        fetchCodes();
      }
    } catch (error) {
      toast({
        title: "خطأ",
        description: "حدث خطأ غير متوقع",
        variant: "destructive",
      });
    }
    setSendingOtp(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "تم النسخ" });
  };

  const getStatusBadge = (code: ActivationCode) => {
    if (code.is_used) {
      return <Badge className="bg-green-500/10 text-green-600 border-green-500/30">مستخدم ✅</Badge>;
    }
    
    // التحقق من انتهاء الصلاحية
    const hoursRemaining = differenceInHours(new Date(code.expires_at), new Date());
    if (hoursRemaining <= 0) {
      return <Badge variant="destructive">منتهي الصلاحية</Badge>;
    }
    
    switch (code.status) {
      case "pending":
        return (
          <div className="flex items-center gap-1">
            <Badge variant="outline">في الانتظار</Badge>
            {hoursRemaining <= 6 && (
              <Badge variant="outline" className="text-orange-500 border-orange-500/30">
                <Clock className="h-3 w-3 ml-1" />
                {hoursRemaining}س
              </Badge>
            )}
          </div>
        );
      case "in_progress":
        return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">جاري التفعيل</Badge>;
      case "awaiting_otp":
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/30 animate-pulse">بانتظار OTP 🔔</Badge>;
      case "expired":
        return <Badge variant="destructive">منتهي</Badge>;
      default:
        return <Badge variant="outline">{code.status}</Badge>;
    }
  };

  const getRemainingTime = (expiresAt: string) => {
    const hours = differenceInHours(new Date(expiresAt), new Date());
    if (hours <= 0) return null;
    if (hours <= 6) return <span className="text-orange-500 text-xs">⚠️ {hours} ساعة متبقية</span>;
    return <span className="text-muted-foreground text-xs">{hours} ساعة متبقية</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const awaitingOtpCodes = codes.filter(c => c.status === "awaiting_otp" && !c.is_used);
  const pendingCodes = codes.filter(c => !c.is_used && c.status !== "awaiting_otp");
  const usedCodes = codes.filter(c => c.is_used);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Key className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">أكواد التفعيل و OTP</h2>
            <p className="text-sm text-muted-foreground">إدارة أكواد التفعيل وإعدادات البريد</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchCodes} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ml-2 ${loading ? "animate-spin" : ""}`} />
            تحديث
          </Button>
          <Button onClick={setupWebhook} disabled={setupLoading}>
            {setupLoading ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <MessageCircle className="h-4 w-4 ml-2" />}
            إعداد البوت
          </Button>
        </div>
      </div>

      {/* تحذير 24 ساعة */}
      <Card className="border-yellow-500/50 bg-yellow-500/5">
        <CardContent className="flex items-center gap-3 py-4">
          <AlertTriangle className="h-5 w-5 text-yellow-600" />
          <p className="text-sm text-yellow-700">
            <strong>تنبيه:</strong> أكواد التفعيل صالحة لمدة <strong>24 ساعة فقط</strong> من وقت الشراء. 
            يجب على العميل إتمام التفعيل قبل انتهاء المدة.
          </p>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="codes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="codes" className="gap-2">
            <Key className="h-4 w-4" />
            سجل الأكواد
            {awaitingOtpCodes.length > 0 && (
              <Badge className="bg-blue-500 text-white text-xs px-1.5">
                {awaitingOtpCodes.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            إعدادات OTP
          </TabsTrigger>
        </TabsList>

        {/* سجل الأكواد */}
        <TabsContent value="codes" className="space-y-4">
          {/* Awaiting OTP Alert */}
          {awaitingOtpCodes.length > 0 && (
            <Card className="border-blue-500/50 bg-blue-500/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2 text-blue-600">
                  <MessageCircle className="h-5 w-5 animate-pulse" />
                  طلبات بانتظار OTP ({awaitingOtpCodes.length})
                </CardTitle>
                <CardDescription>هؤلاء العملاء أكدوا تسجيل الدخول وينتظرون رمز التحقق</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {awaitingOtpCodes.map((code) => (
                    <div key={code.id} className="flex items-center justify-between p-4 bg-background rounded-xl border">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                          <User className="h-5 w-5 text-blue-500" />
                        </div>
                        <div>
                          <p className="font-medium">@{code.telegram_username || "مجهول"}</p>
                          <p className="text-sm text-muted-foreground">{code.products?.name}</p>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <span>البريد: </span>
                          <code className="bg-muted px-2 py-0.5 rounded">{code.account_email}</code>
                        </div>
                        {getRemainingTime(code.expires_at)}
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="رمز OTP"
                          value={otpInput[code.id] || ""}
                          onChange={(e) => setOtpInput(prev => ({ ...prev, [code.id]: e.target.value }))}
                          className="w-32"
                          dir="ltr"
                        />
                        <Button 
                          size="sm"
                          onClick={() => sendOtp(code.id)}
                          disabled={sendingOtp === code.id}
                        >
                          {sendingOtp === code.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-2xl font-bold">{pendingCodes.length}</p>
                  <p className="text-sm text-muted-foreground">في الانتظار</p>
                </div>
                <Clock className="h-8 w-8 text-muted-foreground" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-2xl font-bold text-blue-600">{awaitingOtpCodes.length}</p>
                  <p className="text-sm text-muted-foreground">بانتظار OTP</p>
                </div>
                <MessageCircle className="h-8 w-8 text-blue-500" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-2xl font-bold text-green-600">{usedCodes.length}</p>
                  <p className="text-sm text-muted-foreground">مكتملة</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </CardContent>
            </Card>
          </div>

          {/* All Codes Table */}
          <Card>
            <CardHeader>
              <CardTitle>جميع الأكواد</CardTitle>
              <CardDescription>إجمالي {codes.length} كود</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الكود</TableHead>
                      <TableHead>المنتج</TableHead>
                      <TableHead>الحساب</TableHead>
                      <TableHead>تيليجرام</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead>الوقت المتبقي</TableHead>
                      <TableHead>إجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {codes.map((code) => (
                      <TableRow key={code.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="bg-muted px-2 py-1 rounded font-mono text-sm">{code.code}</code>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(code.code)}>
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {code.products?.image_url && (
                              <img src={code.products.image_url} className="h-8 w-8 rounded object-cover" />
                            )}
                            <span className="text-sm">{code.products?.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-xs">
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">📧</span>
                              <code>{code.account_email || "-"}</code>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">🔑</span>
                              {code.account_password ? (
                                <div className="flex items-center gap-1">
                                  <code>{showPasswords[code.id] ? code.account_password : "••••••"}</code>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-5 w-5"
                                    onClick={() => setShowPasswords(prev => ({ ...prev, [code.id]: !prev[code.id] }))}
                                  >
                                    {showPasswords[code.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                  </Button>
                                </div>
                              ) : "-"}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {code.telegram_username ? (
                            <span className="text-sm">@{code.telegram_username}</span>
                          ) : code.telegram_chat_id ? (
                            <span className="text-xs text-muted-foreground">Chat: {code.telegram_chat_id}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(code)}</TableCell>
                        <TableCell>
                          {!code.is_used && getRemainingTime(code.expires_at)}
                          {code.is_used && (
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(code.created_at), { addSuffix: true, locale: ar })}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {code.status === "awaiting_otp" && !code.is_used && (
                            <div className="flex items-center gap-1">
                              <Input
                                placeholder="OTP"
                                value={otpInput[code.id] || ""}
                                onChange={(e) => setOtpInput(prev => ({ ...prev, [code.id]: e.target.value }))}
                                className="w-20 h-8 text-xs"
                                dir="ltr"
                              />
                              <Button 
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => sendOtp(code.id)}
                                disabled={sendingOtp === code.id}
                              >
                                {sendingOtp === code.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Send className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* إعدادات OTP */}
        <TabsContent value="settings">
          <OtpConfigurationsManager />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ActivationCodesTab;
