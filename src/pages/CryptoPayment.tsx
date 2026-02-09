import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db, getAuthClient, isExternalConfigured } from "@/lib/supabaseClient";
import { invokeCloudFunction, invokeCloudFunctionPublic } from "@/lib/cloudFunctions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Loader2, CheckCircle2, Clock, Copy, ExternalLink } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";

interface Order {
  id: string;
  order_number: string;
  total_amount: number;
  payment_address: string;
  ltc_amount: number;
  payment_status: string;
  confirmations: number;
  status: string;
  expires_at?: string;
  created_at?: string;
  received_amount?: number;
  crypto_fee_percent?: number;
}

const REQUIRED_CONFIRMATIONS = 3;
const POLL_INTERVAL = 10000; // 10 seconds

const CryptoPayment = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [manualChecking, setManualChecking] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"awaiting" | "confirming" | "paid" | "expired" | "partial">("awaiting");
  const [confirmations, setConfirmations] = useState(0);
  const [copied, setCopied] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const [receivedAmount, setReceivedAmount] = useState(0);
  const [remainingAmount, setRemainingAmount] = useState(0);
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [displayLtcAmount, setDisplayLtcAmount] = useState<number | null>(null);
  const [priceCalculated, setPriceCalculated] = useState(false); // prevent repeated calls

  // Fetch order data
  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    const authClient = isExternalConfigured ? getAuthClient() : db;
    
    const { data: { session } } = await authClient.auth.getSession();
    if (!session) {
      navigate("/login");
      return;
    }

    const { data, error } = await db
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (error || !data) {
      toast({
        title: "خطأ",
        description: "لم يتم العثور على الطلب",
        variant: "destructive",
      });
      navigate("/my-orders");
      return;
    }

    setOrder(data as unknown as Order);
    setConfirmations(data.confirmations || 0);
    setReceivedAmount(data.received_amount || 0);

    // Prefer DB amount when available
    const dbAmount = Number((data as any).ltc_amount || 0);
    if (Number.isFinite(dbAmount) && dbAmount > 0) {
      setDisplayLtcAmount(dbAmount);
    }

    // SECURITY: Don't trust DB payment_status directly on initial load
    // Always wait for blockchain verification via checkPayment()
    // Only trust "expired" or "cancelled" status from DB
    if (data.payment_status === "expired" || data.status === "cancelled") {
      setPaymentStatus("expired");
    } else if (data.confirmations >= REQUIRED_CONFIRMATIONS && data.received_amount && data.received_amount >= (data.ltc_amount || 0) * 0.99) {
      // Only mark as paid if we have sufficient confirmations AND received amount
      setPaymentStatus("paid");
    } else if (data.confirmations > 0) {
      setPaymentStatus("confirming");
    } else if ((data.received_amount || 0) > 0 && (data.received_amount || 0) < (data.ltc_amount || 0) * 0.99) {
      setPaymentStatus("partial");
      setRemainingAmount((data.ltc_amount || 0) - (data.received_amount || 0));
    }
    // Otherwise keep as "awaiting" and let checkPayment() verify

    setLoading(false);
  }, [orderId, navigate, toast]);

  // UI fallback: if external crypto-generate-address returns ltc_amount=0,
  // compute the amount from crypto-get-price so the user can pay.
  const ensureDisplayAmount = useCallback(async () => {
    if (!orderId || priceCalculated) return;

    const authClient = isExternalConfigured ? getAuthClient() : db;
    const { data: { session } } = await authClient.auth.getSession();
    if (!session) return;

    const currentOrder = order;
    if (!currentOrder) return;

    const dbAmount = Number(currentOrder.ltc_amount || 0);
    if (Number.isFinite(dbAmount) && dbAmount > 0) {
      setDisplayLtcAmount(dbAmount);
      return;
    }

    // Compute amount from USD total and current LTC price
    // Helper to calculate and set LTC amount
    const calculateAndSetAmount = (price: number) => {
      const feePercent = Number(currentOrder.crypto_fee_percent ?? 3);
      const totalUSD = Number(currentOrder.total_amount || 0);
      if (!Number.isFinite(totalUSD) || totalUSD <= 0) return;

      const base = totalUSD / price;
      const withFee = base * (1 + feePercent / 100);
      const rounded = Math.round(withFee * 1e8) / 1e8;
      if (Number.isFinite(rounded) && rounded > 0) {
        setDisplayLtcAmount(rounded);
        setPriceCalculated(true); // mark as done so we don't recalculate
      }
    };

    // Try external edge function first
    try {
      const priceRes = await invokeCloudFunctionPublic<{ success: boolean; price?: number; price_usd?: number }>(
        "crypto-get-price",
        { crypto: "LTC" }
      );

      // invokeCloudFunctionPublic does not always throw on non-2xx; it may return { error }
      if (priceRes.error) {
        throw priceRes.error;
      }

      // Support both response formats: price (from Lovable Cloud) and price_usd (from external)
      const price = priceRes.data?.price ?? priceRes.data?.price_usd;
      if (priceRes.data?.success && price && price > 0) {
        calculateAndSetAmount(price);
        return;
      }

      // If response shape is unexpected, fall back.
      throw new Error("crypto-get-price returned no usable price");
    } catch (e) {
      console.warn("Edge function crypto-get-price failed, trying direct CoinGecko:", e);
    }

    // Fallback: fetch directly from CoinGecko (browser-side)
    try {
      const cgRes = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=usd");
      if (cgRes.ok) {
        const cgData = await cgRes.json();
        const price = cgData?.litecoin?.usd;
        if (price && price > 0) {
          console.log("Using CoinGecko fallback price:", price);
          calculateAndSetAmount(price);
        }
      }
    } catch (fallbackErr) {
      console.warn("CoinGecko fallback also failed:", fallbackErr);
    }
  }, [orderId, order, priceCalculated]);

  // Ensure crypto invoice (address + amount) is generated.
  // Some external deployments return an order with ltc_amount=0 until crypto-generate-address updates the DB.
  const ensureCryptoInvoice = useCallback(async () => {
    if (!orderId) return;
    if (generatingInvoice) return;

    const authClient = isExternalConfigured ? getAuthClient() : db;
    const { data: { session } } = await authClient.auth.getSession();
    if (!session) return;

    // Read current order snapshot
    const { data, error } = await db
      .from("orders")
      .select("id, payment_address, ltc_amount, payment_method, payment_status")
      .eq("id", orderId)
      .maybeSingle();

    if (error || !data) return;

    const currentAmount = Number(data.ltc_amount || 0);
    const needsAmount = !Number.isFinite(currentAmount) || currentAmount <= 0;
    const needsAddress = !data.payment_address;

    // Only attempt generation if invoice not ready and order still payable
    const isPayable = !["paid", "expired"].includes(String(data.payment_status || ""));
    if (!isPayable) return;
    if (!needsAmount && !needsAddress) return;

    setGeneratingInvoice(true);
    try {
      const res = await invokeCloudFunction<{ success: boolean; error?: string }>(
        "crypto-generate-address",
        { order_id: orderId, crypto: "LTC" },
        session.access_token
      );

      if (res.error || !res.data?.success) {
        throw new Error(res.data?.error || res.error?.message || "Failed to generate crypto invoice");
      }

      // Refresh order UI after generation
      await fetchOrder();
    } catch (e) {
      console.warn("ensureCryptoInvoice failed:", e);
    } finally {
      setGeneratingInvoice(false);
    }
  }, [orderId, generatingInvoice, fetchOrder]);

  // Check payment status (isManual = true when user clicks button)
  const checkPayment = useCallback(async (isManual = false) => {
    if (!orderId || paymentStatus === "paid" || paymentStatus === "expired") return;

    const authClient = isExternalConfigured ? getAuthClient() : db;
    const { data: { session } } = await authClient.auth.getSession();
    if (!session) return;

    if (isManual) setManualChecking(true);
    try {
      const response = await invokeCloudFunction<{
        success: boolean;
        status?: string;
        confirmations?: number;
        received?: number;
        remaining?: number;
        expected?: number;
        has_pending?: boolean;
      }>("crypto-check-payment", { order_id: orderId }, session.access_token);

      if (response.data?.success) {
        const { status, confirmations: newConfirmations, received, remaining } = response.data;
        setConfirmations(newConfirmations || 0);
        setLastChecked(new Date());
        
        if (received !== undefined) setReceivedAmount(received);
        if (remaining !== undefined) setRemainingAmount(remaining);

        if (status === "paid") {
          setPaymentStatus("paid");
          toast({
            title: "🎉 تم الدفع بنجاح!",
            description: "تم تأكيد الدفع وسيتم إرسال بيانات الحساب لبريدك الإلكتروني",
          });
          setTimeout(() => navigate(`/order/${orderId}`), 2000);
        } else if (status === "expired") {
          setPaymentStatus("expired");
          toast({
            title: "انتهت المهلة",
            description: "انتهت مهلة الدفع. يرجى إنشاء طلب جديد.",
            variant: "destructive",
          });
        } else if (status === "partial_payment") {
          setPaymentStatus("partial");
          if (isManual) {
            toast({
              title: "دفع جزئي",
              description: `تم استلام ${received?.toFixed(8)} LTC. المتبقي: ${remaining?.toFixed(8)} LTC`,
              variant: "destructive",
            });
          }
        } else if (status === "confirming") {
          setPaymentStatus("confirming");
        } else if (response.data.has_pending) {
          if (isManual) {
            toast({
              title: "تم استلام الدفع!",
              description: "في انتظار التأكيدات...",
            });
          }
          setPaymentStatus("confirming");
        }
      }
    } catch (error) {
      console.error("Check payment error:", error);
    } finally {
      if (isManual) setManualChecking(false);
    }
  }, [orderId, paymentStatus, toast, navigate]);

  // Cancel order in database when expired
  const cancelExpiredOrder = useCallback(async () => {
    if (!orderId) return;
    try {
      // Update order status to cancelled in database
      const { error } = await db
        .from("orders")
        .update({ 
          status: "cancelled", 
          payment_status: "expired" 
        })
        .eq("id", orderId)
        .eq("status", "pending"); // Only cancel if still pending
      
      if (error) {
        console.error("Failed to cancel expired order:", error);
      } else {
        console.log("Order cancelled due to expiry");
        toast({
          title: "انتهت المهلة",
          description: "تم إلغاء الطلب لانتهاء مهلة الدفع (60 دقيقة)",
          variant: "destructive",
        });
      }
    } catch (e) {
      console.error("Error cancelling order:", e);
    }
  }, [orderId, toast]);

  // Calculate expiry time - use expires_at from DB or calculate from created_at
  const expiryTime = order?.expires_at 
    ? new Date(order.expires_at)
    : order?.created_at 
      ? new Date(new Date(order.created_at).getTime() + 60 * 60 * 1000) // 60 minutes from creation
      : null;

  // Timer for payment expiry (60 minutes)
  useEffect(() => {
    if (!expiryTime || paymentStatus === "paid" || paymentStatus === "expired") return;

    const updateTimer = () => {
      const now = new Date();
      const diff = expiryTime.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeRemaining("00:00");
        setPaymentStatus("expired");
        // Cancel the order in database
        cancelExpiredOrder();
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeRemaining(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [expiryTime, paymentStatus, cancelExpiredOrder]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  useEffect(() => {
    // Fire-and-forget: if amount/address are missing, generate them then refresh.
    // This fixes the "LTC 0.00000000" display without requiring the user to re-create the order.
    ensureCryptoInvoice();
  }, [ensureCryptoInvoice]);

  // Only run ensureDisplayAmount after order is loaded and if ltc_amount is missing
  useEffect(() => {
    if (order && (!order.ltc_amount || order.ltc_amount <= 0)) {
      ensureDisplayAmount();
    }
  }, [order, ensureDisplayAmount]);

  // SECURITY: Verify payment status from blockchain immediately on load
  useEffect(() => {
    if (order && order.payment_address && paymentStatus !== "expired") {
      // Run blockchain verification immediately after order loads
      checkPayment(false);
    }
  }, [order?.id, order?.payment_address]);

  // Auto-poll for payment status (silent, no UI flicker)
  useEffect(() => {
    if (paymentStatus === "paid" || paymentStatus === "expired") return;

    const interval = setInterval(() => checkPayment(false), POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [checkPayment, paymentStatus]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ title: "تم النسخ!" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "فشل النسخ", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!order) {
    return null;
  }

  const amountForDisplay = displayLtcAmount ?? Number(order.ltc_amount || 0);
  const ltcUri = `litecoin:${order.payment_address}?amount=${amountForDisplay}`;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Status Header */}
        <div className="text-center mb-8">
          {paymentStatus === "paid" ? (
            <div className="space-y-4">
              <div className="w-20 h-20 mx-auto bg-emerald-500/10 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-500" />
              </div>
              <h1 className="text-3xl font-bold text-emerald-500">تم الدفع بنجاح! 🎉</h1>
              <p className="text-muted-foreground">سيتم إرسال بيانات الحساب تلقائياً إلى بريدك الإلكتروني</p>
              <p className="text-sm text-muted-foreground">جاري تحويلك لصفحة الطلب...</p>
            </div>
          ) : paymentStatus === "expired" ? (
            <div className="space-y-4">
              <div className="w-20 h-20 mx-auto bg-destructive/10 rounded-full flex items-center justify-center">
                <Clock className="w-12 h-12 text-destructive" />
              </div>
              <h1 className="text-3xl font-bold text-destructive">انتهت مهلة الدفع ⏰</h1>
              <p className="text-muted-foreground">انتهت مهلة الدفع. يرجى إنشاء طلب جديد.</p>
              <Button onClick={() => navigate("/cart")}>العودة للسلة</Button>
            </div>
          ) : paymentStatus === "partial" ? (
            <div className="space-y-4">
              <div className="w-20 h-20 mx-auto bg-amber-500/10 rounded-full flex items-center justify-center">
                <Clock className="w-12 h-12 text-amber-500" />
              </div>
              <h1 className="text-3xl font-bold text-amber-500">دفع جزئي ⚠️</h1>
              <p className="text-muted-foreground">
                تم استلام {receivedAmount.toFixed(8)} LTC
              </p>
              <p className="text-lg font-semibold text-destructive">
                المتبقي: {remainingAmount.toFixed(8)} LTC
              </p>
              <p className="text-sm text-muted-foreground">
                أرسل المبلغ المتبقي لإتمام الطلب
              </p>
            </div>
          ) : paymentStatus === "confirming" ? (
            <div className="space-y-4">
              <div className="w-20 h-20 mx-auto bg-amber-500/10 rounded-full flex items-center justify-center">
                <Clock className="w-12 h-12 text-amber-500 animate-pulse" />
              </div>
              <h1 className="text-3xl font-bold text-foreground">تم استلام الدفع! ⏳</h1>
              <p className="text-muted-foreground">
                في انتظار تأكيدات الشبكة: {confirmations}/{REQUIRED_CONFIRMATIONS}
              </p>
              <p className="text-sm text-muted-foreground">
                عند اكتمال التأكيدات، سيتم إرسال الحساب تلقائياً لبريدك الإلكتروني
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                <Clock className="w-12 h-12 text-primary" />
              </div>
              <h1 className="text-3xl font-bold text-foreground">في انتظار الدفع</h1>
              <p className="text-muted-foreground">أرسل المبلغ المطلوب للعنوان أدناه</p>
              
              {/* Timer - Always visible and prominent */}
              <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 mx-auto max-w-xs">
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 text-destructive">
                    <Clock className="w-5 h-5" />
                    <span className="text-sm font-medium">المهلة المتبقية</span>
                  </div>
                  <span className="font-mono text-4xl font-bold text-destructive">
                    {timeRemaining || "60:00"}
                  </span>
                  <p className="text-xs text-muted-foreground text-center">
                    سيتم إلغاء الطلب تلقائياً عند انتهاء المهلة
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Confirmation Progress */}
        {paymentStatus === "confirming" && (
          <div className="mb-8">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">التأكيدات</span>
              <span className="font-medium">{confirmations} / {REQUIRED_CONFIRMATIONS}</span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${(confirmations / REQUIRED_CONFIRMATIONS) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Payment Details Card */}
        {paymentStatus !== "paid" && (
          <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
            {/* QR Code */}
            <div className="flex justify-center">
              <div className="bg-white p-4 rounded-xl">
                <QRCodeSVG
                  value={ltcUri}
                  size={200}
                  level="H"
                  includeMargin
                />
              </div>
            </div>

            {/* Amount */}
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">المبلغ المطلوب</p>
              <p className="text-3xl font-bold text-primary">{amountForDisplay.toFixed(8)} LTC</p>
              <p className="text-sm text-muted-foreground">(${order.total_amount.toFixed(2)} USD)</p>
              {generatingInvoice && (
                <p className="text-xs text-muted-foreground">جاري حساب المبلغ وتحديث بيانات الدفع...</p>
              )}
              {Number(order.ltc_amount || 0) <= 0 && displayLtcAmount && (
                <p className="text-xs text-muted-foreground">
                  تم حساب المبلغ تلقائياً من سعر السوق (سيثبت نهائياً بعد تحديث دالة السيرفر).
                </p>
              )}
              {order.crypto_fee_percent && order.crypto_fee_percent > 0 && (
                <p className="text-xs text-muted-foreground">
                  (شامل {order.crypto_fee_percent}% رسوم شبكة)
                </p>
              )}
            </div>

            {/* Address */}
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground text-center">عنوان الدفع</p>
              <div className="flex items-center gap-2 bg-muted rounded-lg p-3">
                <code className="flex-1 text-sm break-all font-mono">{order.payment_address}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyToClipboard(order.payment_address)}
                  className={cn(copied && "text-green-500")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Copy Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={() => copyToClipboard(order.payment_address)}
              >
                <Copy className="h-4 w-4 ml-2" />
                نسخ العنوان
              </Button>
              <Button
                variant="outline"
                onClick={() => copyToClipboard(amountForDisplay.toString())}
              >
                <Copy className="h-4 w-4 ml-2" />
                نسخ المبلغ
              </Button>
            </div>

            {/* Manual Check Button */}
            <Button
              className="w-full"
              onClick={() => checkPayment(true)}
              disabled={manualChecking}
            >
              {manualChecking ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  جاري فحص حالة الدفع...
                </>
              ) : paymentStatus === "awaiting" ? (
                "✓ لقد أرسلت المبلغ - تحقق الآن"
              ) : (
                "🔄 تحديث حالة التأكيدات"
              )}
            </Button>

            {/* Info */}
            <div className="text-center space-y-2 text-sm text-muted-foreground">
              <p>⏱️ يتم فحص حالة الدفع تلقائياً كل 10 ثوانٍ</p>
              <p>🔒 مطلوب {REQUIRED_CONFIRMATIONS} تأكيدات لإتمام الطلب (~7.5 دقيقة)</p>
            </div>

            {/* Blockchain Explorer Link */}
            <div className="text-center">
              <a
                href={`https://blockchair.com/litecoin/address/${order.payment_address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                عرض على Blockchain Explorer
              </a>
            </div>
          </div>
        )}

        {/* Order Info */}
        <div className="mt-6 text-center text-sm text-muted-foreground">
          <p>رقم الطلب: {order.order_number}</p>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default CryptoPayment;
