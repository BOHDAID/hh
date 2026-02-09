import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle, Mail, ArrowRight, Loader2, Key, Bot, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/supabaseClient";
import { toast } from "@/hooks/use-toast";

interface ActivationCode {
  code: string;
  product_name: string;
  product_id: string;
}

const PaymentSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orderId = searchParams.get("order_id");
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activationCodes, setActivationCodes] = useState<ActivationCode[]>([]);
  const [botUsername, setBotUsername] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrderAndActivationCodes = async () => {
      if (orderId) {
        // جلب معلومات الطلب
        const { data: orderData } = await db
          .from("orders")
          .select("order_number")
          .eq("id", orderId)
          .single();
        
        if (orderData) {
          setOrderNumber(orderData.order_number);
        }

        // جلب أكواد التفعيل للطلب
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
            product_name: c.products?.name || 'منتج',
            product_id: c.product_id,
          }));
          setActivationCodes(codes);
        }

        // جلب اسم البوت من الإعدادات
        const { data: botSetting } = await db
          .from("site_settings")
          .select("value")
          .eq("key", "telegram_bot_username")
          .single();
        
        if (botSetting?.value) {
          setBotUsername(botSetting.value);
        }
      }
      setLoading(false);
    };

    fetchOrderAndActivationCodes();
  }, [orderId]);

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({
      title: "تم النسخ!",
      description: "تم نسخ كود التفعيل",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-lg w-full text-center space-y-8">
        {/* Success Icon */}
        <div className="relative">
          <div className="w-24 h-24 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center animate-in zoom-in duration-500">
            <CheckCircle className="h-14 w-14 text-green-600 dark:text-green-400" />
          </div>
          <div className="absolute -top-2 -right-2 w-32 h-32 mx-auto">
            <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping" />
          </div>
        </div>

        {/* Success Message */}
        <div className="space-y-4">
          <h1 className="text-3xl font-bold text-foreground">
            تم الدفع بنجاح! 🎉
          </h1>
          <p className="text-lg text-muted-foreground">
            شكراً لثقتك بنا، تم استلام دفعتك بنجاح
          </p>
          {orderNumber && (
            <p className="text-sm text-muted-foreground">
              رقم الطلب: <span className="font-mono font-bold text-foreground">{orderNumber}</span>
            </p>
          )}
        </div>

        {/* Activation Codes Section */}
        {activationCodes.length > 0 && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-center gap-3">
                <Key className="h-6 w-6 text-primary" />
                <span className="text-lg font-semibold text-foreground">أكواد التفعيل</span>
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
                        نسخ
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {botUsername && (
                <div className="pt-4 border-t border-border/50">
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <Bot className="h-5 w-5 text-blue-500" />
                    <span className="text-sm font-medium">للحصول على رمز OTP:</span>
                  </div>
                  <a
                    href={`https://t.me/${botUsername}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button className="w-full gap-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700">
                      <Bot className="h-5 w-5" />
                      تواصل مع البوت @{botUsername}
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </a>
                  <p className="text-xs text-muted-foreground mt-2">
                    أرسل كود التفعيل للبوت للحصول على رمز OTP
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Email Notice */}
        <div className="bg-primary/10 border border-primary/30 rounded-2xl p-6 space-y-3">
          <div className="flex items-center justify-center gap-3">
            <Mail className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold text-foreground">تفقد إيميلك الآن!</span>
          </div>
          <p className="text-sm text-muted-foreground">
            تم إرسال تفاصيل الحساب وإيصال الدفع إلى بريدك الإلكتروني.
            <br />
            قد يستغرق الوصول بضع دقائق.
          </p>
          <p className="text-xs text-muted-foreground/80">
            💡 تأكد من فحص مجلد "الرسائل غير المرغوب فيها" (Spam) إذا لم تجد الرسالة.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {orderId && (
            <Button
              onClick={() => navigate(`/order/${orderId}`)}
              className="gap-2"
            >
              عرض تفاصيل الطلب
              <ArrowRight className="h-4 w-4 rotate-180" />
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => navigate("/my-orders")}
          >
            طلباتي
          </Button>
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
          >
            الصفحة الرئيسية
          </Button>
        </div>

        {/* Support Notice */}
        <p className="text-xs text-muted-foreground">
          هل واجهت مشكلة؟{" "}
          <button
            onClick={() => navigate("/support")}
            className="text-primary hover:underline"
          >
            تواصل مع الدعم
          </button>
        </p>
      </div>
    </div>
  );
};

export default PaymentSuccess;