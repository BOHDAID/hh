import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { db, getAuthClient, isExternalConfigured } from "@/lib/supabaseClient";
import { invokeCloudFunction, invokeCloudFunctionPublic } from "@/lib/cloudFunctions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import UserLayout from "@/components/user/UserLayout";
import { Loader2, ArrowRight, Wallet } from "lucide-react";
import CompactPaymentOption from "@/components/checkout/CompactPaymentOption";
import CryptoSelector from "@/components/checkout/CryptoSelector";
import { SmallPayPalIcon, SmallCryptoIcon, SmallLemonIcon, SmallOxaPayIcon, SmallSellAuthIcon } from "@/components/checkout/PaymentIcons";
import PayPalSmartButtons from "@/components/checkout/PayPalSmartButtons";

type PaymentMethod = "paypal" | "crypto" | "lemonsqueezy" | "oxapay" | "sellauth";

const WalletTopUp = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const baseAmount = parseFloat(searchParams.get("amount") || "0");

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [paypalEnabled, setPaypalEnabled] = useState(false);
  const [cryptoEnabled, setCryptoEnabled] = useState(false);
  const [directCryptoEnabled, setDirectCryptoEnabled] = useState(false);
  const [enabledDirectCryptos, setEnabledDirectCryptos] = useState<string[]>([]);
  const [selectedCrypto, setSelectedCrypto] = useState<string>("usdttrc20");
  const [lemonSqueezyEnabled, setLemonSqueezyEnabled] = useState(false);
  const [oxaPayEnabled, setOxaPayEnabled] = useState(false);
  const [sellAuthEnabled, setSellAuthEnabled] = useState(false);
  const [paypalClientId, setPaypalClientId] = useState<string>("");
  const [showPayPalButtons, setShowPayPalButtons] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string>("");

  // Calculate fees only for PayPal: amount + 10% + $0.50
  const isPayPalSelected = paymentMethod === "paypal";
  const serviceFee = isPayPalSelected ? (baseAmount * 0.10 + 0.50) : 0;
  const totalAmount = baseAmount + serviceFee;
  
  // PayPal requires minimum $5
  const isPayPalBelowMinimum = isPayPalSelected && baseAmount < 5;

  useEffect(() => {
    if (!baseAmount || baseAmount < 1) {
      toast({
        title: "خطأ",
        description: "مبلغ الشحن غير صحيح",
        variant: "destructive",
      });
      navigate("/wallet");
      return;
    }

    const authClient = isExternalConfigured ? getAuthClient() : db;
    const fetchData = async () => {
      const { data: { session } } = await authClient.auth.getSession();
      if (!session) {
        navigate("/login?redirect=/wallet");
        return;
      }
      setUser(session.user);
      setSessionToken(session.access_token);

      // Check payment methods availability
      try {
        // PUBLIC call to external Supabase (no Authorization header)
        // The external function must have verify_jwt = false
        const statusRes = await invokeCloudFunctionPublic<{
          paypalEnabled: boolean;
          paypalClientId?: string;
          cryptoEnabled: boolean;
          lemonSqueezyEnabled: boolean;
          directCryptoEnabled: boolean;
          enabledDirectCryptos: string[];
          oxaPayEnabled: boolean;
          sellAuthEnabled: boolean;
        }>("payment-methods-status", {});

        if (statusRes.error) throw statusRes.error;

        if (statusRes.data) {
          const s = statusRes.data;
          setPaypalEnabled(!!s.paypalEnabled);
          setCryptoEnabled(!!s.cryptoEnabled);
          setLemonSqueezyEnabled(!!s.lemonSqueezyEnabled);
          setDirectCryptoEnabled(!!s.directCryptoEnabled);
          setEnabledDirectCryptos(Array.isArray(s.enabledDirectCryptos) ? s.enabledDirectCryptos : []);
          setOxaPayEnabled(!!s.oxaPayEnabled);
          setSellAuthEnabled(!!s.sellAuthEnabled);
          if (s.paypalClientId) {
            setPaypalClientId(s.paypalClientId);
          }

          if (Array.isArray(s.enabledDirectCryptos) && s.enabledDirectCryptos.length > 0) {
            setSelectedCrypto(s.enabledDirectCryptos[0].toLowerCase() + "_direct");
          }
        }
      } catch (e) {
        console.warn("Failed to load payment-methods-status", e);
      }

      setLoading(false);
    };

    fetchData();
  }, [baseAmount, navigate, toast]);

  const handleTopUp = async () => {
    if (!user || !paymentMethod) return;

    setProcessing(true);
    const authClient = isExternalConfigured ? getAuthClient() : db;
    
    try {
      const { data: { session } } = await authClient.auth.getSession();
      if (!session) {
        throw new Error("Session expired");
      }

      // Create a wallet top-up order
      const orderRes = await invokeCloudFunction<{ 
        success: boolean; 
        order?: { id: string; order_number: string }; 
        error?: string 
      }>(
        "process-order",
        {
          items: [], // No products - this is a wallet top-up
          payment_method: "manual",
          wallet_topup: true,
          topup_amount: baseAmount, // Always use base amount for wallet credit
        },
        session.access_token
      );

      if (orderRes.error || !orderRes.data?.success || !orderRes.data?.order) {
        throw new Error(orderRes.data?.error || "Failed to create top-up order");
      }

      const orderId = orderRes.data.order.id;

      if (paymentMethod === "crypto") {
        if (selectedCrypto.endsWith("_direct")) {
          const cryptoType = selectedCrypto.replace("_direct", "").toUpperCase();
          
          const addressRes = await invokeCloudFunction<{
            success: boolean;
            address?: string;
            error?: string;
          }>(
            "crypto-generate-address",
            { order_id: orderId, crypto: cryptoType },
            session.access_token
          );

          if (addressRes.error || !addressRes.data?.success) {
            throw new Error(addressRes.data?.error || "Failed to generate payment address");
          }

          navigate(`/payment/${orderId}`);
          return;
        }

        const nowPayRes = await invokeCloudFunction<{ 
          success: boolean; 
          payment_url?: string; 
          error?: string 
        }>(
          "nowpayments-create",
          { order_id: orderId, amount: baseAmount, currency: selectedCrypto },
          session.access_token
        );

        if (nowPayRes.error || !nowPayRes.data?.success) {
          throw new Error(nowPayRes.data?.error || "Failed to create crypto payment");
        }

        if (nowPayRes.data.payment_url) {
          window.location.href = nowPayRes.data.payment_url;
        }
        return;
      }

      if (paymentMethod === "paypal") {
        // If we have PayPal Client ID, show Smart Buttons instead of redirect
        if (paypalClientId) {
          setPendingOrderId(orderId);
          setShowPayPalButtons(true);
          setProcessing(false);
          return;
        }

        // Fallback: redirect to PayPal
        const paypalRes = await invokeCloudFunction<{ 
          success: boolean; 
          approval_url?: string; 
          error?: string 
        }>(
          "paypal-create",
          { order_id: orderId, amount: totalAmount, currency: "USD" }, // PayPal gets total with fees
          session.access_token
        );

        if (paypalRes.error || !paypalRes.data?.success) {
          throw new Error(paypalRes.data?.error || "Failed to create PayPal payment");
        }

        if (paypalRes.data.approval_url) {
          window.location.href = paypalRes.data.approval_url;
        }
        return;
      }

      if (paymentMethod === "lemonsqueezy") {
        const { data: profile } = await db
          .from("profiles")
          .select("email, full_name")
          .eq("user_id", user.id)
          .single();

        const lsRes = await invokeCloudFunction<{ 
          success: boolean; 
          checkout_url?: string; 
          error?: string 
        }>(
          "lemonsqueezy-create",
          {
            order_id: orderId,
            amount: baseAmount,
            product_name: `شحن رصيد $${baseAmount}`,
            customer_email: profile?.email || user.email,
            customer_name: profile?.full_name || "",
          },
          session.access_token
        );

        if (lsRes.error || !lsRes.data?.success) {
          throw new Error(lsRes.data?.error || "Failed to create checkout");
        }

        if (lsRes.data.checkout_url) {
          window.location.href = lsRes.data.checkout_url;
        }
        return;
      }

      if (paymentMethod === "oxapay") {
        const oxaRes = await invokeCloudFunction<{ 
          success: boolean; 
          payment_url?: string; 
          error?: string 
        }>(
          "oxapay-create",
          { order_id: orderId, amount: baseAmount, currency: "USD" },
          session.access_token
        );

        if (oxaRes.error || !oxaRes.data?.success) {
          throw new Error(oxaRes.data?.error || "Failed to create OxaPay payment");
        }

        if (oxaRes.data.payment_url) {
          window.location.href = oxaRes.data.payment_url;
        }
        return;
      }

      if (paymentMethod === "sellauth") {
        const sellAuthRes = await invokeCloudFunction<{ 
          success: boolean; 
          payment_url?: string; 
          error?: string 
        }>(
          "sellauth-create",
          { order_id: orderId, amount: baseAmount, currency: "USD" },
          session.access_token
        );

        if (sellAuthRes.error || !sellAuthRes.data?.success) {
          throw new Error(sellAuthRes.data?.error || "Failed to create SellAuth invoice");
        }

        if (sellAuthRes.data.payment_url) {
          window.location.href = sellAuthRes.data.payment_url;
        }
        return;
      }
    } catch (error) {
      console.error("Top-up error:", error);
      toast({
        title: "خطأ",
        description: error instanceof Error ? error.message : "حدث خطأ غير متوقع",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const canProceed = paymentMethod !== null &&
    (paymentMethod !== "crypto" || cryptoEnabled || directCryptoEnabled) &&
    (paymentMethod !== "lemonsqueezy" || lemonSqueezyEnabled) &&
    (paymentMethod !== "paypal" || (paypalEnabled && !isPayPalBelowMinimum)) &&
    (paymentMethod !== "oxapay" || oxaPayEnabled) &&
    (paymentMethod !== "sellauth" || sellAuthEnabled);

  return (
    <UserLayout title="شحن الرصيد" subtitle={`شحن $${baseAmount.toFixed(2)}`}>
      <div className="max-w-2xl mx-auto">
        {/* Amount Summary */}
        <div className="glass rounded-2xl p-6 mb-6">
          <div className="text-center mb-4">
            <Wallet className="h-12 w-12 text-primary mx-auto mb-3" />
            <p className="text-muted-foreground mb-2">مبلغ الشحن</p>
            <p className="text-4xl font-bold text-foreground">${baseAmount.toFixed(2)}</p>
          </div>
          
          {/* Fee Breakdown - Only show when PayPal is selected */}
          {isPayPalSelected && (
            <div className="mt-4 pt-4 border-t border-border space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">مبلغ الشحن</span>
                <span className="font-medium text-foreground">${baseAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">رسوم PayPal (10% + $0.50)</span>
                <span className="font-medium text-foreground">${serviceFee.toFixed(2)}</span>
              </div>
              <div className="border-t border-border pt-3 flex justify-between">
                <span className="font-bold text-foreground">الإجمالي المطلوب دفعه</span>
                <span className="font-bold text-xl text-primary">${totalAmount.toFixed(2)}</span>
              </div>
              <p className="text-xs text-center text-muted-foreground">
                سيتم إضافة ${baseAmount.toFixed(2)} لرصيدك بعد إتمام الدفع
              </p>
            </div>
          )}

          {/* PayPal Minimum Warning */}
          {isPayPalBelowMinimum && (
            <div className="mt-4 bg-destructive/10 border border-destructive/30 rounded-xl p-3 text-center">
              <p className="text-destructive text-sm font-medium">
                ⚠️ أقل مبلغ للشحن عبر PayPal هو 5 دولار
              </p>
            </div>
          )}
        </div>

        {/* Payment Methods */}
        <div className="space-y-4 mb-6">
          <h2 className="text-lg font-semibold">اختر طريقة الدفع</h2>

          <div className="space-y-3">
            {paypalEnabled && (
              <CompactPaymentOption
                title="PayPal"
                description="ادفع بأمان عبر PayPal"
                icon={<SmallPayPalIcon />}
                isSelected={paymentMethod === "paypal"}
                onClick={() => setPaymentMethod("paypal")}
              />
            )}

            {lemonSqueezyEnabled && (
              <CompactPaymentOption
                title="Lemon Squeezy"
                description="Visa, Mastercard, وغيرها"
                icon={<SmallLemonIcon />}
                isSelected={paymentMethod === "lemonsqueezy"}
                onClick={() => setPaymentMethod("lemonsqueezy")}
              />
            )}

            {(cryptoEnabled || directCryptoEnabled) && (
              <CompactPaymentOption
                title="عملات رقمية"
                description="Bitcoin, Litecoin, USDT وغيرها"
                icon={<SmallCryptoIcon />}
                isSelected={paymentMethod === "crypto"}
                onClick={() => setPaymentMethod("crypto")}
              />
            )}

            {/* OxaPay - Crypto Payment - Hidden for amounts below $1 minimum */}
            {oxaPayEnabled && baseAmount >= 1 && (
              <CompactPaymentOption
                title="OxaPay"
                description="Bitcoin / Litecoin / USDT"
                icon={<SmallOxaPayIcon />}
                isSelected={paymentMethod === "oxapay"}
                onClick={() => setPaymentMethod("oxapay")}
              />
            )}

            {/* SellAuth - Visa, Mastercard, Apple Pay */}
            {sellAuthEnabled && (
              <CompactPaymentOption
                title="Visa / Mastercard / Apple Pay"
                description="دفع آمن بالبطاقات البنكية و Apple Pay"
                icon={<SmallSellAuthIcon />}
                isSelected={paymentMethod === "sellauth"}
                onClick={() => setPaymentMethod("sellauth")}
              />
            )}
          </div>

          {paymentMethod === "crypto" && (
            <CryptoSelector
              selectedCrypto={selectedCrypto}
              onSelect={setSelectedCrypto}
              directCryptos={enabledDirectCryptos}
              showNowPayments={cryptoEnabled}
            />
          )}

          {!paypalEnabled && !cryptoEnabled && !directCryptoEnabled && !lemonSqueezyEnabled && !oxaPayEnabled && !sellAuthEnabled && (
            <div className="text-center py-8 text-muted-foreground">
              <p>لا توجد طرق دفع متاحة حالياً</p>
              <p className="text-sm mt-2">يرجى التواصل مع الدعم</p>
            </div>
          )}
        </div>

        {/* PayPal Smart Buttons */}
        {showPayPalButtons && pendingOrderId && paypalClientId && (
          <div className="bg-muted/30 border border-border rounded-xl p-4 sm:p-6 mb-6">
            <h3 className="text-lg font-semibold text-foreground mb-4 text-center">
              اختر طريقة الدفع
            </h3>
            <PayPalSmartButtons
              amount={totalAmount}
              currency="USD"
              orderId={pendingOrderId}
              accessToken={sessionToken}
              clientId={paypalClientId}
              onSuccess={async () => {
                toast({
                  title: "تم الدفع بنجاح! 🎉",
                  description: "جاري إضافة الرصيد لمحفظتك...",
                });
                // Complete the order
                const authClient = isExternalConfigured ? getAuthClient() : db;
                const { data: { session } } = await authClient.auth.getSession();
                if (session) {
                  await invokeCloudFunction(
                    "complete-payment",
                    { order_id: pendingOrderId },
                    session.access_token
                  );
                }
                navigate(`/payment-success?order_id=${pendingOrderId}`);
              }}
              onError={(error) => {
                toast({
                  title: "خطأ في الدفع",
                  description: error,
                  variant: "destructive",
                });
                setShowPayPalButtons(false);
                setPendingOrderId(null);
              }}
              onCancel={() => {
                setShowPayPalButtons(false);
                setPendingOrderId(null);
              }}
            />
          </div>
        )}

        {/* Proceed Button - Hide when PayPal buttons are shown */}
        {!showPayPalButtons && (
        <Button
          variant="hero"
          size="lg"
          className="w-full gap-2"
          disabled={!canProceed || processing}
          onClick={handleTopUp}
        >
          {processing ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              جاري المعالجة...
            </>
          ) : (
            <>
              متابعة للدفع
              <ArrowRight className="h-5 w-5" />
            </>
          )}
        </Button>
        )}

        {/* Back Button */}
        <Button
          variant="ghost"
          className="w-full mt-3"
          onClick={() => navigate("/wallet")}
        >
          العودة للمحفظة
        </Button>
      </div>
    </UserLayout>
  );
};

export default WalletTopUp;
