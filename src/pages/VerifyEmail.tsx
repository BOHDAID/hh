import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { getAuthClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Mail, Loader2, CheckCircle, Sparkles, RefreshCw } from "lucide-react";
import StoreLogo from "@/components/StoreLogo";
import { motion } from "framer-motion";

const VerifyEmail = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    const authClient = getAuthClient();
    
    const checkVerification = async () => {
      const { data: { session } } = await authClient.auth.getSession();
      
      if (session?.user) {
        setEmail(session.user.email || "");
        
        // إذا كان البريد مُفعّل بالفعل، أظهر رسالة وحوّل للرئيسية
        if (session.user.email_confirmed_at) {
          toast({
            title: "بريدك مُفعّل بالفعل ✅",
            description: "سيتم تحويلك للصفحة الرئيسية",
          });
          setVerified(true);
          setTimeout(() => navigate("/"), 2000);
        }
      } else {
        // لا يوجد مستخدم مسجل، حوّله لصفحة الدخول
        toast({
          title: "يجب تسجيل الدخول أولاً",
          description: "سيتم تحويلك لصفحة تسجيل الدخول",
        });
        navigate("/login");
      }
    };

    checkVerification();

    const { data: { subscription } } = authClient.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN" && session?.user?.email_confirmed_at) {
          setVerified(true);
          toast({
            title: "تم التحقق بنجاح! ✅",
            description: "تم تأكيد بريدك الإلكتروني",
          });
          setTimeout(() => navigate("/"), 2000);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate, toast]);

  const handleResendEmail = async () => {
    if (!email) return;
    
    setResending(true);
    const authClient = getAuthClient();
    
    const { error } = await authClient.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: 'https://ninto.store',
      },
    });

    if (error) {
      toast({
        title: "خطأ",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "تم الإرسال ✉️",
        description: "تم إرسال رابط التحقق مرة أخرى",
      });
    }

    setResending(false);
  };

  if (verified) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12 relative" dir="rtl">
        <div className="absolute inset-0 bg-gradient-hero" />
        <motion.div
          className="relative w-full max-w-md"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="glass rounded-3xl p-10 text-center shadow-2xl">
            <motion.div 
              className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
            >
              <motion.div
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 1, delay: 0.5 }}
              >
                <CheckCircle className="h-12 w-12 text-green-500" />
              </motion.div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h1 className="text-3xl font-bold text-foreground mb-3">
                تم التحقق بنجاح! 🎉
              </h1>
              <p className="text-muted-foreground mb-6">
                تم تأكيد بريدك الإلكتروني. جاري تحويلك للصفحة الرئيسية...
              </p>
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-primary">جاري التحويل...</span>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative" dir="rtl">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-gradient-hero" />
      <motion.div 
        className="absolute top-1/4 right-1/4 h-96 w-96 rounded-full bg-primary/20 blur-[120px]"
        animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 4, repeat: Infinity }}
      />
      <motion.div 
        className="absolute bottom-1/4 left-1/4 h-72 w-72 rounded-full bg-secondary/20 blur-[100px]"
        animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 5, repeat: Infinity, delay: 1 }}
      />

      <motion.div
        className="relative w-full max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <StoreLogo size="md" animated />
        </div>

        {/* Card */}
        <motion.div 
          className="glass rounded-3xl p-8 text-center shadow-2xl"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <motion.div 
            className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-6"
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Mail className="h-10 w-10 text-primary" />
          </motion.div>

          <motion.div
            className="inline-flex items-center gap-2 bg-secondary/10 text-secondary px-4 py-2 rounded-full text-sm font-medium mb-4"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Sparkles className="h-4 w-4" />
            <span>خطوة أخيرة</span>
          </motion.div>

          <h1 className="text-2xl font-bold text-foreground mb-3">
            تحقق من بريدك الإلكتروني
          </h1>
          <p className="text-muted-foreground mb-4">
            أرسلنا رابط التحقق إلى
          </p>
          
          <motion.div 
            className="bg-muted/50 rounded-xl p-4 mb-6"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            <p className="font-mono text-primary text-lg" dir="ltr">{email}</p>
          </motion.div>

          <div className="bg-muted/30 rounded-xl p-4 mb-6 text-right">
            <p className="text-sm text-muted-foreground leading-relaxed">
              📧 انقر على الرابط في البريد الإلكتروني لتأكيد حسابك
              <br />
              📁 لم تجد الرسالة؟ تحقق من مجلد الرسائل غير المرغوب فيها (Spam)
            </p>
          </div>

          <div className="space-y-3">
            <Button
              variant="hero"
              className="w-full h-12"
              onClick={handleResendEmail}
              disabled={resending}
            >
              {resending ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin ml-2" />
                  جاري الإرسال...
                </>
              ) : (
                <>
                  <RefreshCw className="h-5 w-5 ml-2" />
                  إعادة إرسال الرابط
                </>
              )}
            </Button>

            <Button
              variant="outline"
              className="w-full h-12"
              onClick={() => navigate("/")}
            >
              العودة للرئيسية
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default VerifyEmail;
