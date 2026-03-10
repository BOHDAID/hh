import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle, Mail, ArrowRight, Loader2, Key, Bot, Copy, ExternalLink, PartyPopper, MessageCircle, Camera, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/supabaseClient";
import { toast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";

interface ActivationCode {
  code: string;
  product_name: string;
  product_id: string;
}

const PaymentSuccess = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orderId = searchParams.get("order_id");
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activationCodes, setActivationCodes] = useState<ActivationCode[]>([]);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [isOnDemand, setIsOnDemand] = useState(false);
  const [onDemandContact, setOnDemandContact] = useState<{ telegram?: string; whatsapp?: string; instructions?: string }>({});

  // 🎆 Confetti celebration
  const hasLaunched = useRef(false);

  useEffect(() => {
    if (hasLaunched.current) return;
    hasLaunched.current = true;

    const burst = () => {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['hsl(262,83%,58%)', '#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1'],
      });
    };

    const sideCannon = (x: number) => {
      confetti({
        particleCount: 50,
        angle: x < 0.5 ? 60 : 120,
        spread: 55,
        origin: { x, y: 0.65 },
        colors: ['hsl(262,83%,58%)', '#FFD700', '#FF6B6B', '#4ECDC4'],
      });
    };

    setTimeout(burst, 300);
    setTimeout(() => sideCannon(0.1), 600);
    setTimeout(() => sideCannon(0.9), 800);
    setTimeout(burst, 1200);

    setTimeout(() => {
      confetti({
        particleCount: 30,
        spread: 160,
        startVelocity: 25,
        decay: 0.92,
        origin: { y: 0 },
        shapes: ['star'],
        colors: ['#FFD700', '#FFA500'],
      });
    }, 1500);
  }, []);

  useEffect(() => {
    const fetchOrderAndActivationCodes = async () => {
      if (orderId) {
        // Fetch order details
        const { data: orderData } = await db
          .from("orders")
          .select("order_number, status, payment_status")
          .eq("id", orderId)
          .single();
        
        if (orderData) {
          setOrderNumber(orderData.order_number);
        }

        // Check if any order items have no delivered_data (on-demand)
        const { data: orderItems } = await db
          .from("order_items")
          .select("id, delivered_data, product_id")
          .eq("order_id", orderId);

        const hasUndelivered = orderItems?.some(item => !item.delivered_data);

        // Check activation codes
        const { data: codesData } = await db
          .from("activation_codes")
          .select(`
            code,
            product_id,
            products:product_id (name)
          `)
          .eq("order_id", orderId);
        
        if (codesData && codesData.length > 0) {
          const codes: ActivationCode[] = codesData.map((c: any) => ({
            code: c.code,
            product_name: c.products?.name || t('products.title'),
            product_id: c.product_id,
          }));
          setActivationCodes(codes);
        }

        // If no activation codes AND has undelivered items, it's on-demand
        if (hasUndelivered && (!codesData || codesData.length === 0)) {
          setIsOnDemand(true);

          // Fetch contact info from site_settings
          const { data: settings } = await db
            .from("site_settings")
            .select("key, value")
            .in("key", [
              "telegram_support_username",
              "telegram_bot_username",
              "whatsapp_number",
              "on_demand_instructions",
              "store_phone",
            ]);

          const settingsMap: Record<string, string> = {};
          settings?.forEach((s: any) => {
            if (s.value) settingsMap[s.key] = s.value;
          });

          setOnDemandContact({
            telegram: settingsMap.telegram_support_username || settingsMap.telegram_bot_username,
            whatsapp: settingsMap.whatsapp_number || settingsMap.store_phone,
            instructions: settingsMap.on_demand_instructions,
          });
        }

        // Fetch bot username
        const { data: botSetting } = await db
          .from("site_settings")
          .select("value")
          .eq("key", "telegram_bot_username")
          .maybeSingle();
        
        if (botSetting?.value) {
          const clean = botSetting.value.replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '').trim();
          setBotUsername(clean);
        }
      }
      setLoading(false);
    };

    fetchOrderAndActivationCodes();
  }, [orderId, t]);

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({
      title: t('paymentSuccess.copied'),
      description: t('paymentSuccess.codeCopied'),
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const cleanTelegram = (val?: string) => val?.replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '').trim();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 overflow-hidden">
      <motion.div 
        className="max-w-lg w-full text-center space-y-8"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        {/* Success Icon with celebration */}
        <div className="relative">
          <motion.div 
            className="w-28 h-28 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.2 }}
          >
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.4 }}
            >
              <CheckCircle className="h-16 w-16 text-green-600 dark:text-green-400" />
            </motion.div>
          </motion.div>
          
          <motion.div 
            className="absolute inset-0 flex items-center justify-center"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 0.5 }}
          >
            <div className="w-28 h-28 rounded-full border-2 border-green-500/40" />
          </motion.div>

          <motion.div
            className="absolute -top-3 -right-3"
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.8, type: "spring" }}
          >
            <PartyPopper className="h-8 w-8 text-yellow-500" />
          </motion.div>
          <motion.div
            className="absolute -top-3 -left-3"
            initial={{ scale: 0, rotate: 30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 1, type: "spring" }}
          >
            <PartyPopper className="h-8 w-8 text-primary -scale-x-100" />
          </motion.div>
        </div>

        {/* Success Message */}
        <motion.div 
          className="space-y-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <h1 className="text-3xl font-bold text-foreground">
            🎉 {t('paymentSuccess.title')}
          </h1>
          <p className="text-lg text-muted-foreground">
            {t('paymentSuccess.subtitle')}
          </p>
          {orderNumber && (
            <motion.p 
              className="text-sm text-muted-foreground"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
            >
              {t('paymentSuccess.orderNumber')}: <span className="font-mono font-bold text-foreground">{orderNumber}</span>
            </motion.p>
          )}
        </motion.div>

        {/* ON-DEMAND Instructions Section */}
        {isOnDemand && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-center gap-3">
                  <Clock className="h-6 w-6 text-amber-500" />
                  <span className="text-lg font-semibold text-foreground">طلبك قيد التفعيل</span>
                </div>
                
                <p className="text-sm text-muted-foreground">
                  {onDemandContact.instructions || "تم استلام طلبك بنجاح! يرجى التواصل معنا وإرسال صورة الإيصال لتفعيل طلبك."}
                </p>

                <div className="space-y-3 pt-2">
                  {/* Telegram Contact */}
                  {onDemandContact.telegram && (
                    <a
                      href={`https://t.me/${cleanTelegram(onDemandContact.telegram)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <Button className="w-full gap-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700" type="button">
                        <MessageCircle className="h-5 w-5" />
                        تواصل معنا عبر تيليجرام
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </a>
                  )}

                  {/* WhatsApp Contact */}
                  {onDemandContact.whatsapp && (
                    <a
                      href={`https://wa.me/${onDemandContact.whatsapp.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <Button className="w-full gap-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700" type="button">
                        <MessageCircle className="h-5 w-5" />
                        تواصل معنا عبر واتساب
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </a>
                  )}

                  {/* Fallback if no contact configured */}
                  {!onDemandContact.telegram && !onDemandContact.whatsapp && botUsername && (
                    <a
                      href={`https://t.me/${botUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <Button className="w-full gap-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700" type="button">
                        <Bot className="h-5 w-5" />
                        تواصل معنا عبر البوت
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </a>
                  )}
                </div>

                <div className="bg-background/50 rounded-lg p-3 border border-border/30">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Camera className="h-4 w-4 flex-shrink-0" />
                    <span>أرسل لنا صورة الإيصال أو رقم الطلب <strong className="text-foreground">{orderNumber}</strong> وسنقوم بتفعيل طلبك في أقرب وقت</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Activation Codes Section */}
        {activationCodes.length > 0 && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-center gap-3">
                <Key className="h-6 w-6 text-primary" />
                <span className="text-lg font-semibold text-foreground">{t('paymentSuccess.activationCodes')}</span>
              </div>
              
              <div className="space-y-3">
                {activationCodes.map((ac, index) => (
                  <div 
                    key={index}
                    className="bg-background rounded-xl p-4 border border-border/50"
                  >
                    <p className="text-sm text-muted-foreground mb-2">{ac.product_name}</p>
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-xl font-bold font-mono text-primary tracking-wider">
                        {ac.code}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyCode(ac.code)}
                        className="gap-2"
                      >
                        <Copy className="h-4 w-4" />
                        {t('paymentSuccess.copy')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {botUsername && (
                <div className="pt-4 border-t border-border/50">
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <Bot className="h-5 w-5 text-blue-500" />
                    <span className="text-sm font-medium">{t('paymentSuccess.getOtp')}</span>
                  </div>
                  <a
                    href={`https://t.me/${botUsername}?start=activate`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <Button className="w-full gap-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700" type="button">
                      <Bot className="h-5 w-5" />
                      {t('paymentSuccess.contactBot')} @{botUsername}
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </a>
                  <p className="text-xs text-muted-foreground mt-2">
                    {t('paymentSuccess.sendCodeToBot')}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Email Notice - only show if NOT on-demand */}
        {!isOnDemand && (
          <div className="bg-primary/10 border border-primary/30 rounded-2xl p-6 space-y-3">
            <div className="flex items-center justify-center gap-3">
              <Mail className="h-6 w-6 text-primary" />
              <span className="text-lg font-semibold text-foreground">{t('paymentSuccess.checkEmail')}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('paymentSuccess.emailSent')}
              <br />
              {t('paymentSuccess.emailDelay')}
            </p>
            <p className="text-xs text-muted-foreground/80">
              {t('paymentSuccess.checkSpam')}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {orderId && (
            <Button
              onClick={() => navigate(`/order/${orderId}`)}
              className="gap-2"
            >
              {t('paymentSuccess.viewOrderDetails')}
              <ArrowRight className="h-4 w-4 rotate-180" />
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => navigate("/my-orders")}
          >
            {t('paymentSuccess.myOrders')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
          >
            {t('paymentSuccess.homepage')}
          </Button>
        </div>

        {/* Support Notice */}
        <p className="text-xs text-muted-foreground">
          {t('paymentSuccess.needHelp')}{" "}
          <button
            onClick={() => navigate("/support")}
            className="text-primary hover:underline"
          >
            {t('paymentSuccess.contactSupport')}
          </button>
        </p>
      </motion.div>
    </div>
  );
};

export default PaymentSuccess;
