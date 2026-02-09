import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { db, getAuthClient, isExternalConfigured } from "@/lib/supabaseClient";
import { invokeCloudFunction, invokeCloudFunctionPublic } from "@/lib/cloudFunctions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Loader2, ArrowRight, ShieldCheck } from "lucide-react";
import CompactPaymentOption from "@/components/checkout/CompactPaymentOption";
import OrderSummaryCard from "@/components/checkout/OrderSummaryCard";
import CryptoSelector from "@/components/checkout/CryptoSelector";
import CouponInput from "@/components/CouponInput";
import { SmallPayPalIcon, SmallCryptoIcon, SmallWalletIcon, SmallLemonIcon, SmallCryptomusIcon, SmallOxaPayIcon, SmallSellAuthIcon } from "@/components/checkout/PaymentIcons";
import PayPalSmartButtons from "@/components/checkout/PayPalSmartButtons";

interface Product {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  product_type: string;
  warranty_days: number;
  requires_activation?: boolean | null;
}

interface SelectedVariant {
  id: string;
  name: string;
  price: number;
  is_unlimited?: boolean | null;
}

type PaymentMethod = "paypal" | "crypto" | "wallet" | "lemonsqueezy" | "cryptomus" | "oxapay" | "sellauth";

const Checkout = () => {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [stockCount, setStockCount] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<SelectedVariant | null>(null);
  const [paypalEnabled, setPaypalEnabled] = useState(false);
  const [cryptoEnabled, setCryptoEnabled] = useState(false);
  const [directCryptoEnabled, setDirectCryptoEnabled] = useState(false);
  const [enabledDirectCryptos, setEnabledDirectCryptos] = useState<string[]>([]);
  const [selectedCrypto, setSelectedCrypto] = useState<string>("usdttrc20");
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [lemonSqueezyEnabled, setLemonSqueezyEnabled] = useState(false);
  const [cryptomusEnabled, setCryptomusEnabled] = useState(false);
  const [oxaPayEnabled, setOxaPayEnabled] = useState(false);
  const [sellAuthEnabled, setSellAuthEnabled] = useState(false);
  const [paypalClientId, setPaypalClientId] = useState<string>("");
  const [showPayPalButtons, setShowPayPalButtons] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string>("");
  const [contactLinks, setContactLinks] = useState<{whatsapp?: string; telegram?: string; instagram?: string}>({});
  const [appliedCoupon, setAppliedCoupon] = useState<{ id: string; code: string; discount: number } | null>(null);
  const [flashSalePrice, setFlashSalePrice] = useState<number | null>(null);
  const [originalPrice, setOriginalPrice] = useState<number | null>(null);
  const variantId = new URLSearchParams(location.search).get("variant");
  // Use flash sale price if available, otherwise use variant/product price
  const unitPrice = flashSalePrice ?? (selectedVariant?.price ?? product?.price ?? 0);
  const subtotal = unitPrice * quantity;
  const discountAmount = appliedCoupon?.discount ?? 0;
  const totalAmount = Math.max(0, subtotal - discountAmount);
  const hasEnoughBalance = walletBalance >= totalAmount;

  useEffect(() => {
    const authClient = isExternalConfigured ? getAuthClient() : db;
    const fetchData = async () => {
      // Check auth
      const { data: { session } } = await authClient.auth.getSession();
      if (!session) {
        toast({
          title: "يرجى تسجيل الدخول",
          description: "يجب تسجيل الدخول لإتمام عملية الشراء",
          variant: "destructive",
        });
        navigate("/login");
        return;
      }
      setUser(session.user);
      setSessionToken(session.access_token);

      // Fetch wallet balance (use maybeSingle to avoid error when wallet doesn't exist)
      const { data: walletData } = await db
        .from("wallets")
        .select("balance")
        .eq("user_id", session.user.id)
        .maybeSingle();
      
      if (walletData) {
        setWalletBalance(Number(walletData.balance) || 0);
      } else {
        setWalletBalance(0);
      }

      // Fetch product
      if (productId) {
        const { data: productData, error } = await db
          .from("products")
          .select("*")
          .eq("id", productId)
          .eq("is_active", true)
          .single();

        if (error || !productData) {
          toast({
            title: "خطأ",
            description: "لم يتم العثور على المنتج",
            variant: "destructive",
          });
          navigate("/");
          return;
        }
        setProduct(productData);

        // If a variant was selected via ?variant=, fetch it (price + name)
        if (variantId) {
          // First try with is_unlimited, fallback to basic fields if column doesn't exist
          let variantData = null;
          let variantError = null;

          const { data: vData, error: vError } = await db
            .from("product_variants")
            .select("id, name, price, is_unlimited")
            .eq("id", variantId)
            .eq("product_id", productId)
            .eq("is_active", true)
            .maybeSingle();

          if (!vError && vData) {
            variantData = vData;
          } else {
            variantError = vError;
          }

          if (!variantError && variantData) {
            setSelectedVariant(variantData);
          } else {
            // If the variant is invalid, continue as base product
            setSelectedVariant(null);
          }
        } else {
          setSelectedVariant(null);
        }

        // Check for active flash sale on this product/variant
        const now = new Date().toISOString();
        const flashSaleQuery = db
          .from("flash_sales")
          .select("sale_price, original_price")
          .eq("product_id", productId)
          .eq("is_active", true)
          .lte("starts_at", now)
          .gt("ends_at", now);
        
        // If variant is selected, check for variant-specific flash sale
        if (variantId) {
          flashSaleQuery.eq("variant_id", variantId);
        }

        const { data: flashSaleData } = await flashSaleQuery.maybeSingle();
        
        if (flashSaleData) {
          setFlashSalePrice(Number(flashSaleData.sale_price));
          setOriginalPrice(Number(flashSaleData.original_price));
        } else {
          setFlashSalePrice(null);
          setOriginalPrice(null);
        }

        // Check stock for account products
        // Products with requires_activation (OTP/QR) are ALWAYS available - no traditional stock needed
        if (productData.requires_activation) {
          console.log('✅ Product requires activation (OTP/QR) - always available');
          setStockCount(999999); // Unlimited for activation products
        } else if (productData.product_type === "account") {
          // Traditional stock check for non-activation products
          let stockFetched = false;

          // Unlimited variants are always available - skip this check if column doesn't exist
          // The external DB may not have is_unlimited column, so we rely on stock count instead

          // Prefer variant-specific stock when variant is selected
          if (!stockFetched) {
            const { data: variantStock, error: variantStockError } = await db
              .rpc("get_variant_stock", {
                p_product_id: productId,
                p_variant_id: variantId ? variantId : null,
              });

            if (!variantStockError && typeof variantStock === "number") {
              setStockCount(variantStock);
              stockFetched = true;
            }
          }
          
          // Backward-compat: try get_product_stock only for base products (no variant)
          if (!stockFetched && !variantId) {
            const { data: stockLevel, error: stockError } = await db
              .rpc('get_product_stock', { p_product_id: productId });
            
            // If function returns valid stock level text
            if (!stockError && stockLevel && typeof stockLevel === 'string') {
              const stockMap: Record<string, number> = {
                'out_of_stock': 0,
                'low_stock': 3,
                'in_stock': 10,
                'high_stock': 50
              };
              setStockCount(stockMap[stockLevel] ?? 10);
              stockFetched = true;
            }
            
            // If function returns a number (old behavior or external DB)
            if (!stockFetched && !stockError && typeof stockLevel === 'number') {
              setStockCount(stockLevel);
              stockFetched = true;
            }
          }
          
          // Fallback: direct count from product_accounts table
          if (!stockFetched) {
            console.warn('RPC failed, trying direct count');

            let q = db
              .from('product_accounts')
              .select('*', { count: 'exact', head: true })
              .eq('product_id', productId)
              .eq('is_sold', false);

            // IMPORTANT: isolate stock per variant
            q = variantId ? q.eq('variant_id', variantId) : q.is('variant_id', null);

            const { count, error: countError } = await q;
            
            if (!countError && count !== null) {
              setStockCount(count);
              stockFetched = true;
            }
          }
          
          // Final fallback - assume available if we can't determine
          if (!stockFetched) {
            console.warn('Could not determine stock, assuming available');
            setStockCount(10);
          }
        }
      }

        // Check payment methods availability
        // NOTE: Normal users cannot read sensitive settings keys directly due to backend policies.
        // We use a backend function that returns ONLY booleans (no secrets).
        try {
          // PUBLIC call to external Supabase (no Authorization header)
          // The external function must have verify_jwt = false
          const statusRes = await invokeCloudFunctionPublic<{
          paypalEnabled: boolean;
          cryptoEnabled: boolean;
          lemonSqueezyEnabled: boolean;
          directCryptoEnabled: boolean;
          enabledDirectCryptos: string[];
          cryptomusEnabled: boolean;
          oxaPayEnabled: boolean;
          sellAuthEnabled: boolean;
          }>("payment-methods-status", {});

          if (statusRes.error) throw statusRes.error;

        const s = statusRes.data;
        if (s) {
          setPaypalEnabled(!!s.paypalEnabled);
          setCryptoEnabled(!!s.cryptoEnabled);
          setLemonSqueezyEnabled(!!s.lemonSqueezyEnabled);
          setDirectCryptoEnabled(!!s.directCryptoEnabled);
          setEnabledDirectCryptos(Array.isArray(s.enabledDirectCryptos) ? s.enabledDirectCryptos : []);
          setCryptomusEnabled(!!s.cryptomusEnabled);
          setOxaPayEnabled(!!s.oxaPayEnabled);
          setSellAuthEnabled(!!s.sellAuthEnabled);
          // Store PayPal Client ID for Smart Buttons
          if ((s as any).paypalClientId) {
            setPaypalClientId((s as any).paypalClientId);
          }

          // Default to first enabled direct crypto
          if (Array.isArray(s.enabledDirectCryptos) && s.enabledDirectCryptos.length > 0) {
            setSelectedCrypto(s.enabledDirectCryptos[0].toLowerCase() + "_direct");
          }
        }
      } catch (e) {
        console.warn("Failed to load payment-methods-status, falling back to direct settings query", e);

        // Fallback for admin/dev environments where settings might be readable
        const { data: paymentSettings } = await db
          .from("site_settings")
          .select("key, value")
          .in("key", [
            "paypal_client_id",
            "nowpayments_api_key",
            "ltc_xpub",
            "btc_xpub",
            "enabled_cryptos",
            "lemonsqueezy_api_key",
            "lemonsqueezy_store_id",
            "cryptomus_merchant_id",
            "cryptomus_api_key",
            "oxapay_merchant_api_key",
          ]);

        if (paymentSettings) {
          let hasLtcXpub = false;
          let hasBtcXpub = false;
          let enabledCryptos: string[] = [];
          let hasLemonSqueezyApiKey = false;
          let hasLemonSqueezyStoreId = false;
          let hasCryptomusMerchantId = false;
          let hasCryptomusApiKey = false;
          let hasOxaPayKey = false;

          paymentSettings.forEach((setting) => {
            if (setting.key === "paypal_client_id" && setting.value) {
              setPaypalEnabled(true);
            }
            if (setting.key === "nowpayments_api_key" && setting.value) {
              setCryptoEnabled(true);
            }
            if (setting.key === "ltc_xpub" && setting.value) {
              hasLtcXpub = true;
            }
            if (setting.key === "btc_xpub" && setting.value) {
              hasBtcXpub = true;
            }
            if (setting.key === "enabled_cryptos" && setting.value) {
              enabledCryptos = setting.value.split(",").map((c) => c.trim().toUpperCase());
            }
            if (setting.key === "lemonsqueezy_api_key" && setting.value) {
              hasLemonSqueezyApiKey = true;
            }
            if (setting.key === "lemonsqueezy_store_id" && setting.value) {
              hasLemonSqueezyStoreId = true;
            }
            if (setting.key === "cryptomus_merchant_id" && setting.value) {
              hasCryptomusMerchantId = true;
            }
            if (setting.key === "cryptomus_api_key" && setting.value) {
              hasCryptomusApiKey = true;
            }
            if (setting.key === "oxapay_merchant_api_key" && setting.value) {
              hasOxaPayKey = true;
            }
          });

          if (hasLemonSqueezyApiKey && hasLemonSqueezyStoreId) {
            setLemonSqueezyEnabled(true);
          }

          if (hasCryptomusMerchantId && hasCryptomusApiKey) {
            setCryptomusEnabled(true);
          }

          if (hasOxaPayKey) {
            setOxaPayEnabled(true);
          }

          const directCryptos: string[] = [];
          if (hasLtcXpub && enabledCryptos.includes("LTC")) {
            directCryptos.push("LTC");
          }
          if (hasBtcXpub && enabledCryptos.includes("BTC")) {
            directCryptos.push("BTC");
          }

          if (directCryptos.length > 0) {
            setDirectCryptoEnabled(true);
            setEnabledDirectCryptos(directCryptos);
            setSelectedCrypto(directCryptos[0].toLowerCase() + "_direct");
          }
        }
      }

      // Fetch contact links from settings (username/number only, build full URLs)
      const { data: contactSettings } = await db
        .from("site_settings")
        .select("key, value")
        .in("key", ["whatsapp_number", "telegram_username", "instagram_username"])
        .eq("is_sensitive", false);

      if (contactSettings) {
        const links: {whatsapp?: string; telegram?: string; instagram?: string} = {};
        contactSettings.forEach((s: any) => {
          if (s.key === "whatsapp_number" && s.value) {
            // Remove any non-digit characters and build WhatsApp URL
            // Use wa.me which opens in a new tab (not embedded)
            const cleanNumber = s.value.replace(/\D/g, '');
            links.whatsapp = `https://wa.me/${cleanNumber}`;
          }
          if (s.key === "telegram_username" && s.value) {
            // Remove @ if present and build Telegram URL
            const cleanUsername = s.value.replace(/^@/, '');
            links.telegram = `https://t.me/${cleanUsername}`;
          }
          if (s.key === "instagram_username" && s.value) {
            // Remove @ if present and build Instagram URL
            const cleanUsername = s.value.replace(/^@/, '');
            links.instagram = `https://instagram.com/${cleanUsername}`;
          }
        });
        setContactLinks(links);
      }

      setLoading(false);
    };

    fetchData();
   }, [productId, location.search, navigate, toast]);

  const handleCheckout = async () => {
    if (!product || !user || !paymentMethod) return;

    setProcessing(true);
    const authClient = isExternalConfigured ? getAuthClient() : db;
    try {
      const { data: { session } } = await authClient.auth.getSession();
      if (!session) {
        throw new Error("Session expired");
      }

      // Handle wallet payment
      if (paymentMethod === "wallet") {
        if (!hasEnoughBalance) {
          throw new Error("رصيد المحفظة غير كافي");
        }

        // Create order with wallet payment via Cloud function
        // process-order handles: wallet deduction, transaction recording, order completion, and delivery
        const response = await invokeCloudFunction<{ success: boolean; order?: { id: string; order_number: string }; error?: string }>(
          "process-order",
          {
            items: [{ product_id: product.id, quantity, variant_id: variantId || null }],
            payment_method: "wallet",
          },
          session.access_token
        );

        if (response.error) {
          throw new Error(response.error.message || "Failed to process order");
        }

        const result = response.data;

        if (!result || !result.success) {
          throw new Error(result?.error || "Unknown error");
        }

        toast({
          title: "تم الشراء بنجاح! 🎉",
          description: "تم خصم المبلغ من رصيدك وإتمام الطلب",
        });

        // Ensure delivery happens immediately (accounts + email) for wallet payments
        // Some external deployments may not auto-complete delivery inside process-order.
        try {
          await invokeCloudFunction<{ success?: boolean; error?: string }>(
            "complete-payment",
            { order_id: result.order.id },
            session.access_token
          );
        } catch (e) {
          console.warn("complete-payment failed (will retry on invoice page):", e);
        }

        navigate(`/order/${result.order.id}`);
        return;
      }

       // First create the order via Cloud
       // NOTE: process-order currently supports only: wallet | manual
       // For PayPal/Crypto/LemonSqueezy we create a manual order first, then redirect to the gateway.
       const orderRes = await invokeCloudFunction<{ success: boolean; order?: { id: string; order_number: string }; error?: string }>(
         "process-order",
         {
           items: [{ product_id: product.id, quantity, variant_id: variantId || null }],
           payment_method: "manual",
         },
         session.access_token
       );

      if (orderRes.error) {
        throw new Error(orderRes.error.message || "Failed to process order");
      }

      const orderData = orderRes.data;

      if (!orderData || !orderData.success || !orderData.order) {
        throw new Error(orderData?.error || "Unknown error");
      }

      const orderId = orderData.order.id;

      if (paymentMethod === "crypto") {
        // Check if using direct crypto (Exodus wallet)
        if (selectedCrypto.endsWith("_direct")) {
          const cryptoType = selectedCrypto.replace("_direct", "").toUpperCase();
          
          // Generate address from xPub via Cloud
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

          // Redirect to crypto payment page
          navigate(`/payment/${orderId}`);
          return;
        }

        // Create NOWPayments payment via Cloud
        const nowPayRes = await invokeCloudFunction<{ success: boolean; payment_url?: string; error?: string }>(
          "nowpayments-create",
          { order_id: orderId, amount: totalAmount, currency: selectedCrypto },
          session.access_token
        );

        if (nowPayRes.error || !nowPayRes.data?.success) {
          throw new Error(nowPayRes.data?.error || "Failed to create crypto payment");
        }

        // Redirect to NOWPayments
        const paymentUrl = nowPayRes.data.payment_url;
        if (paymentUrl) window.location.href = paymentUrl;
        return;
      }

      if (paymentMethod === "paypal") {
        // Check minimum amount for PayPal ($5)
        const PAYPAL_MINIMUM = 5;
        if (totalAmount < PAYPAL_MINIMUM) {
          toast({
            title: "الحد الأدنى للطلب",
            description: `عذراً، أقل مبلغ للدفع عبر البطاقة البنكية/بايبال هو ${PAYPAL_MINIMUM} دولار`,
            variant: "destructive",
          });
          setProcessing(false);
          return;
        }

        // If we have PayPal Client ID, show Smart Buttons instead of redirect
        if (paypalClientId) {
          setPendingOrderId(orderId);
          setShowPayPalButtons(true);
          setProcessing(false);
          return;
        }

        // Fallback: Create PayPal order via Cloud and redirect
        const paypalRes = await invokeCloudFunction<{ success: boolean; approval_url?: string; error?: string }>(
          "paypal-create",
          { order_id: orderId, amount: totalAmount, currency: "USD" },
          session.access_token
        );

        if (paypalRes.error || !paypalRes.data?.success) {
          throw new Error(paypalRes.data?.error || "Failed to create PayPal payment");
        }

        // Redirect to PayPal approval
        const approvalUrl = paypalRes.data.approval_url;
        if (approvalUrl) {
          const newWindow = window.open(approvalUrl, "_blank");
          if (!newWindow) {
            window.location.href = approvalUrl;
          }
        }
        return;
      }

      if (paymentMethod === "lemonsqueezy") {
        // Get user profile for email
        const { data: profile } = await db
          .from("profiles")
          .select("email, full_name")
          .eq("user_id", user.id)
          .single();

        // Create Lemon Squeezy checkout via Cloud
        const lsRes = await invokeCloudFunction<{ success: boolean; checkout_url?: string; error?: string }>(
          "lemonsqueezy-create",
          {
            order_id: orderId,
            amount: totalAmount,
            product_name: product.name,
            customer_email: profile?.email || user.email,
            customer_name: profile?.full_name || "",
          },
          session.access_token
        );

        if (lsRes.error || !lsRes.data?.success) {
          throw new Error(lsRes.data?.error || "Failed to create Lemon Squeezy checkout");
        }

        // Redirect to Lemon Squeezy checkout
        const checkoutUrl = lsRes.data.checkout_url;
        if (checkoutUrl) window.location.href = checkoutUrl;
        return;
      }

      if (paymentMethod === "cryptomus") {
        // Create Cryptomus payment
        const cmRes = await invokeCloudFunction<{ success: boolean; payment_url?: string; error?: string }>(
          "cryptomus-create",
          {
            order_id: orderId,
            amount: totalAmount,
            currency: "USD",
          },
          session.access_token
        );

        if (cmRes.error || !cmRes.data?.success) {
          throw new Error(cmRes.data?.error || "Failed to create Cryptomus payment");
        }

        // Redirect to Cryptomus payment page
        const paymentUrl = cmRes.data.payment_url;
        if (paymentUrl) window.location.href = paymentUrl;
        return;
      }

      if (paymentMethod === "oxapay") {
        // Create OxaPay payment
        const oxaRes = await invokeCloudFunction<{ success: boolean; payment_url?: string; error?: string }>(
          "oxapay-create",
          {
            order_id: orderId,
            amount: totalAmount,
            currency: "USD",
          },
          session.access_token
        );

        if (oxaRes.error || !oxaRes.data?.success) {
          throw new Error(oxaRes.data?.error || "Failed to create OxaPay payment");
        }

        // Redirect to OxaPay payment page
        const paymentUrl = oxaRes.data.payment_url;
        if (paymentUrl) window.location.href = paymentUrl;
        return;
      }

      if (paymentMethod === "sellauth") {
        // SellAuth - بوابة اختيارية معزولة
        // أي خطأ في هذه البوابة لا يؤثر على باقي الموقع
        try {
          const sellAuthRes = await invokeCloudFunction<{ success: boolean; payment_url?: string; error?: string }>(
            "sellauth-create",
            {
              order_id: orderId,
              amount: totalAmount,
              currency: "USD",
            },
            session.access_token
          );

          if (sellAuthRes.error || !sellAuthRes.data?.success) {
            // رسالة واضحة للمستخدم بدون إيقاف الموقع
            const errorMsg = sellAuthRes.data?.error || "خدمة SellAuth غير متاحة حالياً";
            console.error("SellAuth payment failed:", errorMsg);
            toast({
              title: "خطأ في بوابة الدفع",
              description: `${errorMsg}. يمكنك اختيار طريقة دفع أخرى.`,
              variant: "destructive",
            });
            setProcessing(false);
            return;
          }

          // Redirect to SellAuth payment page
          const paymentUrl = sellAuthRes.data.payment_url;
          if (paymentUrl) {
            window.location.href = paymentUrl;
          } else {
            toast({
              title: "خطأ",
              description: "لم يتم استلام رابط الدفع. جرب طريقة دفع أخرى.",
              variant: "destructive",
            });
          }
          return;
        } catch (sellAuthError) {
          // عزل الخطأ - لا يؤثر على الموقع
          console.error("SellAuth gateway error (isolated):", sellAuthError);
          toast({
            title: "بوابة SellAuth غير متاحة",
            description: "يرجى اختيار طريقة دفع بديلة مثل المحفظة أو الكريبتو.",
            variant: "destructive",
          });
          setProcessing(false);
          return;
        }
      }
    } catch (error) {
      console.error("Checkout error:", error);
      toast({
        title: "خطأ في الطلب",
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

  if (!product) {
    return null;
  }

  const isUnlimited = selectedVariant?.is_unlimited === true;
  const requiresActivation = product.requires_activation === true;
  // Products with requires_activation (OTP/QR) are always available
  const isOutOfStock = product.product_type === "account" && stockCount === 0 && !isUnlimited && !requiresActivation;
  const isPayPalBelowMinimum = paymentMethod === "paypal" && totalAmount < 5;
  const canProceed = paymentMethod !== null && !isOutOfStock && 
    (paymentMethod !== "wallet" || hasEnoughBalance) &&
    (paymentMethod !== "crypto" || cryptoEnabled || directCryptoEnabled) &&
    (paymentMethod !== "lemonsqueezy" || lemonSqueezyEnabled) &&
    (paymentMethod !== "cryptomus" || cryptomusEnabled) &&
    (paymentMethod !== "oxapay" || oxaPayEnabled) &&
    (paymentMethod !== "sellauth" || sellAuthEnabled) &&
    !isPayPalBelowMinimum;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header />

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-5xl">
        <div className="mb-4 sm:mb-8">
          <h1 className="text-xl sm:text-3xl font-bold text-foreground">إتمام الشراء</h1>
          <p className="text-muted-foreground text-sm sm:text-base mt-1 sm:mt-2">اختر طريقة الدفع المفضلة لديك</p>
        </div>

        <div className="grid lg:grid-cols-5 gap-4 sm:gap-8">
          {/* Payment Selection */}
          <div className="lg:col-span-3 space-y-6">
          {/* Payment Methods - Compact List */}
            <div className="space-y-2 sm:space-y-3">
              {/* Wallet Payment - Always visible */}
              <CompactPaymentOption
                title={`الدفع من الرصيد ($${walletBalance.toFixed(2)})`}
                description="ادفع مباشرة من رصيد محفظتك"
                icon={<SmallWalletIcon />}
                isSelected={paymentMethod === "wallet"}
                onClick={() => hasEnoughBalance && setPaymentMethod("wallet")}
                disabled={!hasEnoughBalance}
                disabledReason={!hasEnoughBalance ? `تحتاج $${(totalAmount - walletBalance).toFixed(2)} إضافية` : undefined}
                actionButton={!hasEnoughBalance ? {
                  label: "شحن الرصيد",
                  onClick: () => navigate(`/checkout/wallet?amount=${Math.ceil(totalAmount - walletBalance)}`),
                } : undefined}
              />

              {/* PayPal */}
              {paypalEnabled && (
                <CompactPaymentOption
                  title="Card / PayPal"
                  description="ادفع ببطاقتك البنكية أو PayPal"
                  icon={<SmallPayPalIcon />}
                  isSelected={paymentMethod === "paypal"}
                  onClick={() => setPaymentMethod("paypal")}
                />
              )}

              {/* Crypto */}
              {(cryptoEnabled || directCryptoEnabled) && (
                <CompactPaymentOption
                  title="العملات الرقمية"
                  description={directCryptoEnabled 
                    ? `ادفع مباشرة بـ ${enabledDirectCryptos.join(" أو ")}`
                    : "BTC, USDT, ETH, LTC وأكثر"}
                  icon={<SmallCryptoIcon />}
                  isSelected={paymentMethod === "crypto"}
                  onClick={() => setPaymentMethod("crypto")}
                />
              )}

              {/* Lemon Squeezy */}
              {lemonSqueezyEnabled && (
                <CompactPaymentOption
                  title="Lemon Squeezy"
                  description="دفع سريع وآمن عبر البطاقات"
                  icon={<SmallLemonIcon />}
                  isSelected={paymentMethod === "lemonsqueezy"}
                  onClick={() => setPaymentMethod("lemonsqueezy")}
                />
              )}

              {/* Cryptomus */}
              {cryptomusEnabled && (
                <CompactPaymentOption
                  title="Cryptomus"
                  description="ادفع بالعملات الرقمية عبر Cryptomus"
                  icon={<SmallCryptomusIcon />}
                  isSelected={paymentMethod === "cryptomus"}
                  onClick={() => setPaymentMethod("cryptomus")}
                />
              )}

              {/* OxaPay - Crypto Payment - Hidden for orders below $1 minimum */}
              {oxaPayEnabled && totalAmount >= 1 && (
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

              {/* Contact for alternative payment - only show if at least one contact link is configured */}
              {(contactLinks.whatsapp || contactLinks.telegram || contactLinks.instagram) && (
                <div className="bg-muted/50 border border-border rounded-lg p-3 sm:p-4 mt-2">
                  <p className="text-sm text-muted-foreground text-center mb-2">
                    لا تملك أي من طرق الدفع المتاحة؟
                  </p>
                  <p className="text-sm font-medium text-foreground text-center mb-3">
                    تواصل معنا لترتيب طريقة دفع بديلة
                  </p>
                  <div className="flex items-center justify-center gap-3 flex-wrap">
                    {contactLinks.whatsapp && (
                      <a
                        href={contactLinks.whatsapp}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg text-sm font-medium transition-colors"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        واتساب
                      </a>
                    )}
                    {contactLinks.telegram && (
                      <a
                        href={contactLinks.telegram}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 rounded-lg text-sm font-medium transition-colors"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                        </svg>
                        تيليجرام
                      </a>
                    )}
                    {contactLinks.instagram && (
                      <a
                        href={contactLinks.instagram}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-pink-500/10 hover:bg-pink-500/20 text-pink-600 dark:text-pink-400 rounded-lg text-sm font-medium transition-colors"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.757-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z"/>
                        </svg>
                        انستجرام
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Crypto Selector */}
            {paymentMethod === "crypto" && (
              <CryptoSelector
                selectedCrypto={selectedCrypto}
                onSelect={setSelectedCrypto}
                directCryptos={enabledDirectCryptos}
                showNowPayments={cryptoEnabled}
              />
            )}

            {/* Coupon Input */}
            <div className="pt-2">
              <CouponInput
                orderTotal={subtotal}
                cartProductTypes={product?.product_type ? [product.product_type] : []}
                onApply={(discount, couponId, couponCode) => {
                  setAppliedCoupon({ id: couponId, code: couponCode, discount });
                }}
                onRemove={() => setAppliedCoupon(null)}
                appliedCoupon={appliedCoupon}
              />
              {appliedCoupon && (
                <div className="mt-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">المجموع قبل الخصم:</span>
                    <span className="line-through">${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-green-600 dark:text-green-400 font-medium">قيمة الخصم:</span>
                    <span className="text-green-600 dark:text-green-400 font-medium">-${discountAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-green-500/20">
                    <span className="font-semibold">المجموع النهائي:</span>
                    <span className="font-bold text-lg text-primary">${totalAmount.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Wallet Payment Preview */}
            {paymentMethod === "wallet" && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg sm:rounded-xl p-3 sm:p-4 space-y-1.5 sm:space-y-2">
                <div className="flex items-center justify-between text-sm sm:text-base">
                  <span className="text-muted-foreground">رصيدك الحالي:</span>
                  <span className="font-semibold text-foreground">${walletBalance.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm sm:text-base">
                  <span className="text-muted-foreground">سعر المنتج:</span>
                  <span className="font-semibold text-foreground">${totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm sm:text-lg border-t border-border pt-1.5 sm:pt-2">
                  <span className="text-muted-foreground">الرصيد بعد الشراء:</span>
                  <span className="font-bold text-primary">${(walletBalance - totalAmount).toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* PayPal Smart Buttons */}
            {showPayPalButtons && pendingOrderId && paypalClientId && (
              <div className="bg-muted/30 border border-border rounded-lg sm:rounded-xl p-4 sm:p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4 text-center">
                  اختر طريقة الدفع
                </h3>
                <PayPalSmartButtons
                  amount={totalAmount}
                  currency="USD"
                  orderId={pendingOrderId}
                  accessToken={sessionToken}
                  clientId={paypalClientId}
                  onSuccess={async (paypalOrderId) => {
                    toast({
                      title: "تم الدفع بنجاح! 🎉",
                      description: "جاري معالجة طلبك...",
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
                    navigate(`/order/${pendingOrderId}`);
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

            {/* PayPal Minimum Amount Warning */}
            {paymentMethod === "paypal" && totalAmount < 5 && !showPayPalButtons && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg sm:rounded-xl p-3 sm:p-4 text-center">
                <p className="text-destructive font-semibold text-sm sm:text-base">⚠️ الحد الأدنى للطلب</p>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  عذراً، أقل مبلغ للدفع عبر البطاقة البنكية/بايبال هو 5 دولار
                </p>
              </div>
            )}

            {/* Out of Stock Warning */}
            {isOutOfStock && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg sm:rounded-xl p-3 sm:p-4 text-center">
                <p className="text-destructive font-semibold text-sm sm:text-base">⚠️ نفذ المخزون</p>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  لا توجد حسابات متوفرة حالياً لهذا {selectedVariant ? "الخيار" : "المنتج"}
                </p>
              </div>
            )}


            {/* Proceed Button - Hide when PayPal buttons are shown */}
            {!showPayPalButtons && (
            <Button
              className="w-full h-11 sm:h-14 text-sm sm:text-lg font-bold"
              size="lg"
              onClick={handleCheckout}
              disabled={processing || !canProceed}
            >
              {processing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin ml-2" />
                  جاري المعالجة...
                </>
              ) : isOutOfStock ? (
                "المنتج غير متوفر حالياً"
              ) : (
                <>
                  {paymentMethod === "wallet"
                    ? "تأكيد الشراء من الرصيد"
                    : paymentMethod === "crypto"
                    ? "متابعة للدفع بالعملات الرقمية"
                    : paymentMethod === "paypal"
                    ? "Proceed to PayPal"
                    : paymentMethod === "lemonsqueezy"
                    ? "متابعة للدفع عبر Lemon Squeezy"
                    : paymentMethod === "cryptomus"
                    ? "متابعة للدفع عبر Cryptomus"
                    : paymentMethod === "oxapay"
                    ? "متابعة للدفع عبر OxaPay"
                    : "اختر طريقة الدفع"}
                  <ArrowRight className="h-5 w-5 mr-2" />
                </>
              )}
            </Button>
            )}
            {/* Security Badge */}
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span>معاملات آمنة ومشفرة 100%</span>
            </div>
          </div>

          {/* Order Summary - Sidebar */}
          <div className="lg:col-span-2">
            <div className="sticky top-24">
              <OrderSummaryCard
                product={product}
                unitPrice={unitPrice}
                variantName={selectedVariant?.name}
                quantity={quantity}
                onQuantityChange={setQuantity}
                stockCount={stockCount}
                flashSalePrice={flashSalePrice}
                originalPrice={originalPrice}
              />
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Checkout;
