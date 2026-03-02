import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { db, getAuthClient, isExternalConfigured } from "@/lib/supabaseClient";
import { invokeCloudFunction } from "@/lib/cloudFunctions";
import { formatDateArabic, formatDateTimeArabic, formatDateShortArabic } from "@/lib/formatDate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import UserSidebar from "@/components/user/UserSidebar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Check, Clock, Shield, Star, ArrowRight, Loader2, RefreshCw, Printer, AlertCircle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import OrderTimeline from "@/components/OrderTimeline";

interface ActivationCode {
  code: string;
  product_id: string;
  status: string;
  expires_at: string | null;
  account_email: string | null;
}

interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  price: number;
  delivered_data: string | null;
  products?: {
    name: string;
    image_url: string | null;
    product_type?: string;
    warranty_days?: number;
  };
  product_accounts?: {
    variant_id: string | null;
    product_variants?: {
      name: string;
      name_en: string | null;
      warranty_days: number | null;
    } | null;
  } | null;
}

interface Order {
  id: string;
  order_number: string;
  total_amount: number;
  status: string;
  payment_status: string;
  payment_method: string;
  warranty_expires_at: string | null;
  created_at: string;
  order_items: OrderItem[];
}

const OrderInvoice = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const { toast } = useToast();
  
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [warrantyCountdown, setWarrantyCountdown] = useState<string>("");

  const [delivering, setDelivering] = useState(false);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [activationCodes, setActivationCodes] = useState<ActivationCode[]>([]);
  const [telegramBotUsername, setTelegramBotUsername] = useState<string | null>(null);
  const autoDeliveryAttemptedRef = useRef(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const pollCountRef = useRef(0);
  
  // Review state
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(false);
  
  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Helper to get auth token
  const getAuthToken = useCallback(async (): Promise<string | null> => {
    const authClient = isExternalConfigured ? getAuthClient() : db;
    const { data: sessionData } = await authClient.auth.getSession();
    return sessionData?.session?.access_token || null;
  }, []);

  // Fetch order via backend function (bypasses RLS)
  const fetchOrderViaBackend = useCallback(async (): Promise<Order | null> => {
    if (!orderId) return null;
    
    const token = await getAuthToken();
    if (!token) {
      console.log("No auth token available for fetching order");
      return null;
    }

    const res = await invokeCloudFunction<{ success: boolean; order: Order }>(
      "order-invoice",
      { order_id: orderId },
      token
    );

    if (res.error || !res.data?.order) {
      console.error("Failed to fetch order via backend:", res.error);
      return null;
    }

    return res.data.order;
  }, [orderId, getAuthToken]);

  // Attempt delivery via complete-payment
  const attemptDelivery = useCallback(async (opts?: { silent?: boolean }) => {
    if (!orderId || delivering) return;

    setDelivering(true);
    setDeliveryError(null);

    try {
      const token = await getAuthToken();

      if (!token) {
        if (!opts?.silent) {
          toast({
            title: "يرجى تسجيل الدخول",
            description: "لا يمكن إكمال التسليم بدون جلسة تسجيل دخول",
            variant: "destructive",
          });
        }
        return;
      }

      const res = await invokeCloudFunction<{ success?: boolean; error?: string }>(
        "complete-payment",
        { order_id: orderId },
        token
      );

      if (res.error) {
        const msg = res.error.message || "فشل تسليم الطلب";
        setDeliveryError(msg);
        if (!opts?.silent) {
          toast({
            title: "تعذر تسليم الحساب الآن",
            description: msg,
            variant: "destructive",
          });
        }
      } else {
        if (!opts?.silent) {
          toast({
            title: "تمت محاولة التسليم",
            description: "يتم تحديث صفحة الفاتورة الآن",
          });
        }
      }

      // Refetch order data
      const updatedOrder = await fetchOrderViaBackend();
      if (updatedOrder) {
        setOrder(updatedOrder);
      }

      // Re-fetch activation codes (may have been generated)
      try {
        const { data: codes } = await db
          .from("activation_codes")
          .select("code, product_id, status, expires_at, account_email")
          .eq("order_id", orderId!);
        if (codes && codes.length > 0) {
          setActivationCodes(codes as ActivationCode[]);
        }
      } catch (e) {
        console.warn("Failed to re-fetch activation codes:", e);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setDeliveryError(msg);
      if (!opts?.silent) {
        toast({
          title: "تعذر تسليم الحساب",
          description: msg,
          variant: "destructive",
        });
      }
    } finally {
      setDelivering(false);
    }
  }, [orderId, delivering, getAuthToken, fetchOrderViaBackend, toast]);

  // Refresh order data
  const refreshOrder = useCallback(async () => {
    const updatedOrder = await fetchOrderViaBackend();
    if (updatedOrder) {
      setOrder(updatedOrder);
    }
  }, [fetchOrderViaBackend]);

  // Initial fetch
  useEffect(() => {
    const initFetch = async () => {
      if (!orderId) return;

      const orderData = await fetchOrderViaBackend();

      if (!orderData) {
        toast({
          title: "خطأ",
          description: "لم يتم العثور على الطلب",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      setOrder(orderData);

      // Fetch activation codes for this order
      let codes: ActivationCode[] | null = null;
      try {
        const { data: codesData } = await db
          .from("activation_codes")
          .select("code, product_id, status, expires_at, account_email")
          .eq("order_id", orderId);
        if (codesData && codesData.length > 0) {
          codes = codesData as ActivationCode[];
          setActivationCodes(codes);
        }
      } catch (e) {
        console.warn("Failed to fetch activation codes:", e);
      }

      // Fetch telegram bot username
      try {
        const { data: botSetting } = await db
          .from("site_settings")
          .select("value")
          .eq("key", "telegram_bot_username")
          .maybeSingle();
        if (botSetting?.value) {
          const clean = botSetting.value.replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '').trim();
          setTelegramBotUsername(clean);
        }
      } catch (e) {
        console.warn("Failed to fetch bot username:", e);
      }

      // Check if user already reviewed this product
      const { data: { session: authSession } } = await getAuthClient().auth.getSession();
      if (authSession?.user && orderData.order_items?.[0]?.product_id) {
        const { data: existingReview } = await db
          .from("reviews")
          .select("id")
          .eq("product_id", orderData.order_items[0].product_id)
          .eq("user_id", authSession.user.id)
          .maybeSingle();

        if (existingReview) {
          setHasReviewed(true);
        }
      }

      // Auto-attempt delivery in two cases:
      // 1. Wallet orders that are not yet completed and missing delivered_data
      // 2. Completed orders that have no delivered_data AND no activation codes (unlimited products needing code generation)
      const needsDelivery =
        orderData.payment_method === "wallet" &&
        orderData.status !== "completed" &&
        Array.isArray(orderData.order_items) &&
        orderData.order_items.some((it) => !it?.delivered_data);

      const needsCodeGeneration =
        orderData.status === "completed" &&
        Array.isArray(orderData.order_items) &&
        orderData.order_items.every((it) => !it?.delivered_data) &&
        (!codes || codes.length === 0);

      if ((needsDelivery || needsCodeGeneration) && !autoDeliveryAttemptedRef.current) {
        autoDeliveryAttemptedRef.current = true;
        setTimeout(() => {
          attemptDelivery({ silent: true });
        }, 500);
      }

      setLoading(false);
    };

    initFetch();
  }, [orderId, fetchOrderViaBackend, toast, attemptDelivery]);

  // Polling for processing orders
  useEffect(() => {
    if (!order) return;

    // Start polling if order is still processing (for wallet payments)
    if (order.payment_method === "wallet" && order.status === "processing") {
      pollCountRef.current = 0;
      
      const poll = async () => {
        pollCountRef.current++;
        
        // Stop after 5 attempts (15 seconds)
        if (pollCountRef.current > 5) {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          return;
        }

        const updatedOrder = await fetchOrderViaBackend();
        if (updatedOrder) {
          setOrder(updatedOrder);
          
          // Stop polling if order is completed
          if (updatedOrder.status === "completed") {
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
          }
        }
      };

      pollingRef.current = setInterval(poll, 3000);

      return () => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      };
    }
  }, [order?.status, order?.payment_method, fetchOrderViaBackend]);

  // Warranty countdown
  useEffect(() => {
    if (!order?.warranty_expires_at) return;

    const updateCountdown = () => {
      const now = new Date();
      const expiry = new Date(order.warranty_expires_at!);
      const diff = expiry.getTime() - now.getTime();

      if (diff <= 0) {
        setWarrantyCountdown("انتهى الضمان");
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      setWarrantyCountdown(`${days} يوم، ${hours} ساعة، ${minutes} دقيقة`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);
    return () => clearInterval(interval);
  }, [order]);

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      toast({ title: "تم النسخ!", description: "تم نسخ البيانات للحافظة" });
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast({ title: "خطأ", description: "فشل في النسخ", variant: "destructive" });
    }
  };

  const handleSubmitReview = async () => {
    if (!order || !orderId) return;
    
    setSubmittingReview(true);
    
    try {
      const authClient = isExternalConfigured ? getAuthClient() : db;
      const { data: { session } } = await authClient.auth.getSession();
      if (!session) {
        toast({
          title: "خطأ",
          description: "يجب تسجيل الدخول لإضافة تقييم",
          variant: "destructive",
        });
        return;
      }

      // Get first product from order
      const firstItem = order.order_items[0];
      if (!firstItem) return;

      // Get user profile for reviewer name
      const { data: profileData } = await db
        .from("profiles")
        .select("full_name")
        .eq("user_id", session.user.id)
        .maybeSingle();

      const reviewerName = profileData?.full_name || session.user.email?.split("@")[0] || "عميل";

      // Insert review using the same client that has the auth session
      const { error } = await authClient.from("reviews").insert({
        product_id: firstItem.product_id,
        user_id: session.user.id,
        rating: reviewRating,
        comment: reviewComment || null,
        reviewer_name: reviewerName,
        order_id: orderId,
      });

      if (error) {
        console.error("Review insert error:", error);
        // Check if it's a duplicate review error
        if (error.code === "23505" || error.message?.includes("duplicate")) {
          toast({
            title: "ملاحظة",
            description: "لقد قمت بتقييم هذا الطلب مسبقاً",
          });
          setReviewDialogOpen(false);
          setHasReviewed(true);
          return;
        }
        throw error;
      }

      toast({
        title: "شكراً لك! ⭐",
        description: "تم إضافة تقييمك بنجاح",
      });
      
      setReviewDialogOpen(false);
      setHasReviewed(true);
    } catch (error: any) {
      console.error("Review error:", error);
      
      // Provide more specific error messages
      let errorMessage = "فشل في إضافة التقييم";
      
      if (error?.code === "42501" || error?.message?.includes("policy")) {
        errorMessage = "ليس لديك صلاحية لإضافة تقييم. تأكد من تسجيل الدخول";
      } else if (error?.code === "23503") {
        errorMessage = "المنتج أو الطلب غير موجود";
      } else if (error?.message) {
        errorMessage = `خطأ: ${error.message}`;
      }
      
      toast({
        title: "خطأ",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSubmittingReview(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500">مكتمل</Badge>;
      case "pending":
        return <Badge variant="secondary">قيد الانتظار</Badge>;
      case "processing":
        return <Badge className="bg-blue-500">قيد المعالجة</Badge>;
      case "cancelled":
        return <Badge variant="destructive">ملغي</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const renderStars = (interactive: boolean = false) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={!interactive}
            onClick={() => interactive && setReviewRating(star)}
            className={`transition-transform ${interactive ? "hover:scale-110 cursor-pointer" : ""}`}
          >
            <Star
              className={`h-8 w-8 ${
                star <= reviewRating
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-muted-foreground/30"
              }`}
            />
          </button>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Header />
        <main className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">لم يتم العثور على الطلب</h1>
          <Link to="/">
            <Button>العودة للرئيسية</Button>
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  const hasItems = order.order_items && order.order_items.length > 0;
  const needsDelivery = order.payment_method === "wallet" && order.status !== "completed";

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 mb-4">
              <Check className="h-8 w-8 text-green-500" />
            </div>
            <h1 className="text-3xl font-bold mb-2">شكراً لك!</h1>
            <p className="text-muted-foreground">تم استلام طلبك بنجاح</p>

            {/* Order Timeline */}
            <div className="mt-6">
              <OrderTimeline
                status={order.status}
                paymentStatus={order.payment_status}
                warrantyExpiresAt={order.warranty_expires_at}
                createdAt={order.created_at}
              />
            </div>
          </div>

          {/* Order Info */}
          <Card className="mb-6">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>تفاصيل الطلب</CardTitle>
              {getStatusBadge(order.status)}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">رقم الطلب:</span>
                  <p className="font-mono font-bold">{order.order_number}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">تاريخ الشراء:</span>
                  <p className="font-medium">
                    {formatDateTimeArabic(order.created_at)}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">طريقة الدفع:</span>
                  <p className="font-medium">
                    {order.payment_method === "wallet" ? "الرصيد" : "تحويل يدوي"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">الإجمالي:</span>
                  <p className="font-bold text-primary">${order.total_amount.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Warranty Card */}
          {order.warranty_expires_at && (
            <Card className="mb-6 border-primary/50 bg-primary/5">
              <CardContent className="flex items-center gap-4 py-4">
                <div className="p-3 rounded-full bg-primary/10">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">الضمان نشط</h3>
                  {(() => {
                    // Get variant warranty_days (priority) or product warranty_days
                    const firstItem = order.order_items?.[0];
                    const variantWarranty = firstItem?.product_accounts?.product_variants?.warranty_days;
                    const productWarranty = firstItem?.products?.warranty_days;
                    const warrantyDays = variantWarranty || productWarranty;
                    return (
                      <>
                        {warrantyDays && warrantyDays > 0 && (
                          <p className="text-sm font-medium text-primary">
                            مدة الضمان: {warrantyDays} يوم
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          ينتهي في: {formatDateShortArabic(order.warranty_expires_at!)}
                        </p>
                      </>
                    );
                  })()}
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-2 text-primary">
                    <Clock className="h-4 w-4" />
                    <span className="text-sm font-medium">{warrantyCountdown}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Delivery Error Banner */}
          {deliveryError && (
            <Card className="mb-6 border-destructive/50 bg-destructive/5">
              <CardContent className="flex items-center gap-4 py-4">
                <AlertCircle className="h-6 w-6 text-destructive" />
                <div className="flex-1">
                  <h3 className="font-semibold text-destructive">تعذر التسليم التلقائي</h3>
                  <p className="text-sm text-muted-foreground">{deliveryError}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => attemptDelivery()}
                  disabled={delivering}
                >
                  {delivering ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  <span className="mr-2">إعادة المحاولة</span>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Order Items & Delivered Data */}
          <Card className="mb-6">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>المنتجات والبيانات</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={refreshOrder}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                تحديث
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              {!hasItems ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="mb-4">لا توجد بيانات عناصر لهذا الطلب حالياً</p>
                  {needsDelivery && (
                    <Button
                      variant="outline"
                      onClick={() => attemptDelivery()}
                      disabled={delivering}
                    >
                      {delivering ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          جاري المعالجة...
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <RefreshCw className="h-4 w-4" />
                          إعادة محاولة التسليم
                        </span>
                      )}
                    </Button>
                  )}
                </div>
              ) : (
                order.order_items.map((item) => (
                  <div key={item.id} className="border rounded-lg p-4">
                    <div className="flex items-start gap-4 mb-4">
                      {item.products?.image_url && (
                        <img
                          src={item.products.image_url}
                          alt={item.products.name}
                          className="w-16 h-16 object-cover rounded-lg"
                        />
                      )}
                      <div className="flex-1">
                        <h4 className="font-semibold">{item.products?.name || "منتج"}</h4>
                        {item.product_accounts?.product_variants?.name && (
                          <p className="text-xs text-primary font-medium">
                            {item.product_accounts.product_variants.name}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          الكمية: {item.quantity} × ${item.price.toFixed(2)}
                        </p>
                        {(() => {
                          const variantWarranty = item.product_accounts?.product_variants?.warranty_days;
                          const productWarranty = item.products?.warranty_days;
                          const warranty = variantWarranty || productWarranty;
                          return warranty && warranty > 0 ? (
                            <p className="text-xs text-primary flex items-center gap-1 mt-1">
                              <Shield className="h-3 w-3" />
                              ضمان {warranty} يوم
                            </p>
                          ) : null;
                        })()}
                      </div>
                    </div>

                    {/* Delivered Data Box */}
                    {item.delivered_data ? (
                      <div className="bg-muted rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">بيانات الحساب:</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(item.delivered_data!, item.id)}
                          >
                            {copied === item.id ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                            <span className="mr-2">{copied === item.id ? "تم النسخ" : "نسخ"}</span>
                          </Button>
                        </div>
                        <pre className="bg-background rounded p-3 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                          {item.delivered_data}
                        </pre>
                      </div>
                    ) : (() => {
                      // Get ALL activation codes for this product item
                      const itemCodes = activationCodes.filter(c => c.product_id === item.product_id);
                      
                      if (itemCodes.length > 0 && order.status === "completed") {
                        return (
                          <div className="bg-muted rounded-lg p-4 space-y-4">
                            {/* Activation Codes Header */}
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">🔑 أكواد التفعيل ({itemCodes.length}):</span>
                            </div>

                            {/* All Activation Codes */}
                            <div className="space-y-3">
                              {itemCodes.map((ac, codeIndex) => (
                                <div key={`code-${item.id}-${codeIndex}`} className="bg-background rounded-lg p-3 border border-border/50">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs text-muted-foreground">
                                      كود {codeIndex + 1} من {itemCodes.length}
                                      {ac.status === 'used' && (
                                        <Badge className="mr-2 bg-green-500/20 text-green-500 text-[10px] px-1.5 py-0">مفعّل ✓</Badge>
                                      )}
                                      {ac.status === 'pending' && (
                                        <Badge variant="secondary" className="mr-2 text-[10px] px-1.5 py-0">غير مفعّل</Badge>
                                      )}
                                      {ac.status === 'expired' && (
                                        <Badge variant="destructive" className="mr-2 text-[10px] px-1.5 py-0">منتهي</Badge>
                                      )}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => copyToClipboard(ac.code, `code-${item.id}-${codeIndex}`)}
                                      className="h-7 px-2"
                                    >
                                      {copied === `code-${item.id}-${codeIndex}` ? (
                                        <Check className="h-3.5 w-3.5 text-green-500" />
                                      ) : (
                                        <Copy className="h-3.5 w-3.5" />
                                      )}
                                      <span className="mr-1 text-xs">{copied === `code-${item.id}-${codeIndex}` ? "تم" : "نسخ"}</span>
                                    </Button>
                                  </div>
                                  <pre className="text-base font-mono text-center tracking-widest font-bold py-1">
                                    {ac.code}
                                  </pre>
                                </div>
                              ))}
                            </div>

                            {/* Telegram Bot Link */}
                            {telegramBotUsername && (
                              <div className="bg-primary/10 rounded-lg p-3 text-center space-y-2">
                                <p className="text-sm">
                                  📲 أرسل الكود إلى بوت التيليجرام لاستلام حسابك:
                                </p>
                                <a
                                  href={`https://t.me/${telegramBotUsername}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium hover:opacity-90 transition-opacity"
                                >
                                  فتح البوت @{telegramBotUsername}
                                  <ArrowRight className="h-4 w-4" />
                                </a>
                              </div>
                            )}

                            {/* Expiry info */}
                            {itemCodes[0]?.expires_at && (
                              <p className="text-xs text-muted-foreground text-center">
                                ⏰ صلاحية الأكواد تنتهي: {formatDateTimeArabic(itemCodes[0].expires_at)}
                              </p>
                            )}
                          </div>
                        );
                      }

                      return (
                        <div className="bg-muted/50 rounded-lg p-4 text-center text-muted-foreground">
                          {order.status === "pending" ? "في انتظار تأكيد الدفع" : "لم يتم تسليم البيانات بعد"}

                          {needsDelivery && (
                            <div className="mt-3 flex flex-col items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={delivering}
                                onClick={() => attemptDelivery()}
                              >
                                {delivering ? (
                                  <span className="inline-flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    جاري التسليم...
                                  </span>
                                ) : (
                                  "إعادة محاولة التسليم"
                                )}
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Review CTA */}
          {order.status === "completed" && (
            <Card className="mb-6 bg-gradient-to-r from-primary/10 to-accent/10">
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <Star className="h-5 w-5 text-yellow-500" />
                  <span className="font-medium">
                    {hasReviewed ? "شكراً لتقييمك! ⭐" : "قيم تجربتك مع هذا المنتج"}
                  </span>
                </div>
                {!hasReviewed && (
                  <Button variant="outline" size="sm" onClick={() => setReviewDialogOpen(true)}>
                    أضف تقييم
                    <ArrowRight className="h-4 w-4 mr-2" />
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Print/PDF Button */}
          <div className="flex gap-4 justify-center mb-6">
            <Button 
              variant="outline" 
              onClick={() => window.print()}
              className="gap-2"
            >
              <Printer className="h-4 w-4" />
              طباعة / PDF
            </Button>
          </div>

          {/* Actions */}
          <div className="flex gap-4 justify-center print:hidden">
            <Link to="/my-orders">
              <Button variant="outline">طلباتي</Button>
            </Link>
            <Link to="/">
              <Button>تسوق المزيد</Button>
            </Link>
          </div>

          {/* Print-only Invoice */}
          <div className="hidden print:block mt-8 p-8 border rounded-lg">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold">إيصال رقمي</h2>
              <p className="text-muted-foreground">Digital Receipt</p>
            </div>
            
            <div className="border-t border-b py-4 mb-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <strong>رقم الطلب:</strong> {order.order_number}
                </div>
                <div>
                  <strong>التاريخ:</strong> {formatDateShortArabic(order.created_at)}
                </div>
              </div>
            </div>

            <table className="w-full mb-6 text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-right py-2">المنتج</th>
                  <th className="text-center py-2">الكمية</th>
                  <th className="text-left py-2">السعر</th>
                </tr>
              </thead>
              <tbody>
                {order.order_items.map((item) => (
                  <tr key={item.id} className="border-b">
                    <td className="py-2">{item.products?.name}</td>
                    <td className="text-center py-2">{item.quantity}</td>
                    <td className="text-left py-2">${item.price.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="text-left font-bold py-2">المجموع:</td>
                  <td className="text-left font-bold py-2">${order.total_amount.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>

            {order.warranty_expires_at && (
              <div className="bg-muted/30 p-4 rounded-lg mb-6 text-sm">
                {(() => {
                  const firstItem = order.order_items?.[0];
                  const variantWarranty = firstItem?.product_accounts?.product_variants?.warranty_days;
                  const productWarranty = firstItem?.products?.warranty_days;
                  const warrantyDays = variantWarranty || productWarranty;
                  return (
                    <>
                      <strong>الضمان:</strong> {warrantyDays && warrantyDays > 0 ? `${warrantyDays} يوم - ` : ''}ينتهي في {formatDateShortArabic(order.warranty_expires_at)}
                    </>
                  );
                })()}
              </div>
            )}

            <div className="flex justify-center">
              <div className="text-center">
                <QRCodeSVG 
                  value={`${window.location.origin}/order/${order.id}`}
                  size={100}
                  className="mx-auto mb-2"
                />
                <p className="text-xs text-muted-foreground">امسح للتحقق من صحة الإيصال</p>
              </div>
            </div>

            <div className="text-center mt-6 text-sm text-muted-foreground">
              شكراً لثقتك بنا! 💚
            </div>
          </div>
        </div>
      </main>

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-center">أضف تقييمك ⭐</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Stars */}
            <div className="flex flex-col items-center gap-2">
              <Label>كيف تقيم تجربتك؟</Label>
              {renderStars(true)}
              <span className="text-sm text-muted-foreground">
                {reviewRating === 5 && "ممتاز! 🎉"}
                {reviewRating === 4 && "جيد جداً 👍"}
                {reviewRating === 3 && "متوسط 😐"}
                {reviewRating === 2 && "سيء 😕"}
                {reviewRating === 1 && "سيء جداً 😞"}
              </span>
            </div>

            {/* Comment */}
            <div className="space-y-2">
              <Label htmlFor="review-comment">تعليقك (اختياري)</Label>
              <Textarea
                id="review-comment"
                placeholder="شاركنا تجربتك مع هذا المنتج..."
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                rows={4}
              />
            </div>

            {/* Submit */}
            <Button 
              className="w-full" 
              onClick={handleSubmitReview}
              disabled={submittingReview}
            >
              {submittingReview ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  جاري الإرسال...
                </>
              ) : (
                "إرسال التقييم"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* User Sidebar */}
      <UserSidebar 
        open={sidebarOpen} 
        onClose={() => setSidebarOpen(false)}
        onOpen={() => setSidebarOpen(true)}
      />

      <Footer />
    </div>
  );
};

export default OrderInvoice;
