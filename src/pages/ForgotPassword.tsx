import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAuthClient } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { ShoppingBag, Mail, Loader2, ArrowRight, Lock, KeyRound, CheckCircle, Shield } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { motion, AnimatePresence } from "framer-motion";

type Step = "email" | "otp" | "password";

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [step, setStep] = useState<Step>("email");
  const { toast } = useToast();

  // التحقق من حالة المستخدم عند تحميل الصفحة
  useEffect(() => {
    const authClient = getAuthClient();
    
    const checkAuth = async () => {
      const { data: { session } } = await authClient.auth.getSession();
      if (session?.user) {
        toast({
          title: "أنت مسجل دخول بالفعل",
          description: "سيتم تحويلك للصفحة الرئيسية",
        });
        navigate("/");
        return;
      }
      setCheckingAuth(false);
    };

    checkAuth();

    const { data: { subscription } } = authClient.auth.onAuthStateChange((_event, session) => {
      if (session?.user && step !== "password") {
        navigate("/");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, step]);

  // عرض شاشة تحميل أثناء التحقق
  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">جاري التحقق...</p>
        </div>
      </div>
    );
  }

  // Step 1: Send OTP to email
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({
        title: "خطأ",
        description: "أدخل البريد الإلكتروني",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const authClient = getAuthClient();
    
    const { error } = await authClient.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
      }
    });

    if (error) {
      if (error.message.includes("Signups not allowed") || error.message.includes("User not found")) {
        toast({
          title: "تم الإرسال",
          description: "إذا كان البريد مسجلاً، ستصلك رسالة تحتوي على رمز التحقق",
        });
        setStep("otp");
      } else {
        toast({
          title: "خطأ",
          description: error.message,
          variant: "destructive",
        });
      }
    } else {
      toast({
        title: "تم الإرسال ✉️",
        description: "تم إرسال رمز التحقق إلى بريدك الإلكتروني",
      });
      setStep("otp");
    }

    setLoading(false);
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      toast({
        title: "خطأ",
        description: "أدخل رمز التحقق المكون من 6 أرقام",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const authClient = getAuthClient();
    
    const { error } = await authClient.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });

    if (error) {
      toast({
        title: "خطأ",
        description: "رمز التحقق غير صحيح أو منتهي الصلاحية",
        variant: "destructive",
      });
    } else {
      toast({
        title: "تم التحقق ✓",
        description: "أدخل كلمة المرور الجديدة",
      });
      setStep("password");
    }

    setLoading(false);
  };

  // Step 3: Set new password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({
        title: "خطأ",
        description: "كلمات المرور غير متطابقة",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "خطأ",
        description: "يجب أن تكون كلمة المرور 6 أحرف على الأقل",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const authClient = getAuthClient();
    
    const { error } = await authClient.auth.updateUser({
      password,
    });

    if (error) {
      toast({
        title: "خطأ",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "تم بنجاح! 🎉",
        description: "تم تحديث كلمة المرور وتسجيل دخولك تلقائياً",
      });
      navigate("/");
    }

    setLoading(false);
  };

  // Resend OTP
  const handleResendOtp = async () => {
    setLoading(true);
    const authClient = getAuthClient();
    
    const { error } = await authClient.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
      }
    });

    if (error) {
      toast({
        title: "خطأ",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "تم الإرسال",
        description: "تم إرسال رمز جديد إلى بريدك الإلكتروني",
      });
      setOtp("");
    }

    setLoading(false);
  };

  const steps = [
    { id: "email", label: "البريد", icon: Mail },
    { id: "otp", label: "التحقق", icon: KeyRound },
    { id: "password", label: "كلمة المرور", icon: Lock },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === step);

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
          <Link to="/" className="inline-flex items-center gap-3">
            <motion.div 
              className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-primary shadow-glow-primary"
              whileHover={{ scale: 1.05, rotate: 5 }}
            >
              <ShoppingBag className="h-6 w-6 text-primary-foreground" />
            </motion.div>
            <span className="text-2xl font-bold text-foreground">متجر رقمي</span>
          </Link>
        </div>

        {/* Card */}
        <motion.div 
          className="glass rounded-3xl p-8 shadow-2xl"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          {/* Progress Steps */}
          <div className="flex items-center justify-between mb-8 px-4">
            {steps.map((s, index) => (
              <div key={s.id} className="flex items-center">
                <motion.div
                  className={`flex flex-col items-center ${index <= currentStepIndex ? 'text-primary' : 'text-muted-foreground'}`}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <motion.div
                    className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${
                      index < currentStepIndex 
                        ? 'bg-primary text-primary-foreground' 
                        : index === currentStepIndex 
                          ? 'bg-primary/20 text-primary border-2 border-primary' 
                          : 'bg-muted text-muted-foreground'
                    }`}
                    whileHover={{ scale: 1.1 }}
                  >
                    {index < currentStepIndex ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : (
                      <s.icon className="h-5 w-5" />
                    )}
                  </motion.div>
                  <span className="text-xs font-medium">{s.label}</span>
                </motion.div>
                {index < steps.length - 1 && (
                  <div className={`w-12 h-0.5 mx-2 mt-[-20px] ${index < currentStepIndex ? 'bg-primary' : 'bg-muted'}`} />
                )}
              </div>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {/* Step 1: Email */}
            {step === "email" && (
              <motion.div
                key="email"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="text-center mb-6">
                  <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
                    <Shield className="h-8 w-8 text-primary" />
                  </div>
                  <h1 className="text-2xl font-bold text-foreground mb-2">
                    نسيت كلمة المرور؟
                  </h1>
                  <p className="text-muted-foreground">
                    لا تقلق! أدخل بريدك وسنرسل لك رمز التحقق
                  </p>
                </div>

                <form onSubmit={handleSendOtp} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="email">البريد الإلكتروني</Label>
                    <div className="relative group">
                      <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="example@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pr-10 h-12 glass border-2 border-transparent focus:border-primary/50 transition-all"
                        required
                        dir="ltr"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    variant="hero"
                    size="lg"
                    className="w-full h-12 shadow-glow-primary"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin ml-2" />
                        جاري الإرسال...
                      </>
                    ) : (
                      "إرسال رمز التحقق"
                    )}
                  </Button>
                </form>
              </motion.div>
            )}

            {/* Step 2: OTP */}
            {step === "otp" && (
              <motion.div
                key="otp"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="text-center mb-6">
                  <motion.div 
                    className="w-16 h-16 rounded-full bg-secondary/20 flex items-center justify-center mx-auto mb-4"
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <KeyRound className="h-8 w-8 text-secondary" />
                  </motion.div>
                  <h1 className="text-2xl font-bold text-foreground mb-2">
                    أدخل رمز التحقق
                  </h1>
                  <p className="text-muted-foreground mb-1">
                    أرسلنا رمز مكون من 6 أرقام إلى
                  </p>
                  <p className="font-mono text-primary" dir="ltr">{email}</p>
                </div>

                <form onSubmit={handleVerifyOtp} className="space-y-6">
                  <div className="flex justify-center">
                    <InputOTP
                      maxLength={6}
                      value={otp}
                      onChange={(value) => setOtp(value)}
                    >
                      <InputOTPGroup className="gap-2" dir="ltr">
                        {[0, 1, 2, 3, 4, 5].map((index) => (
                          <InputOTPSlot 
                            key={index} 
                            index={index} 
                            className="glass w-12 h-14 text-xl border-2 border-transparent focus:border-primary/50" 
                          />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  <Button
                    type="submit"
                    variant="hero"
                    size="lg"
                    className="w-full h-12 shadow-glow-primary"
                    disabled={loading || otp.length !== 6}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin ml-2" />
                        جاري التحقق...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-5 w-5 ml-2" />
                        تحقق من الرمز
                      </>
                    )}
                  </Button>

                  <div className="flex flex-col gap-3 text-center">
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={loading}
                      className="text-sm text-primary hover:underline disabled:opacity-50"
                    >
                      لم تستلم الرمز؟ إعادة الإرسال
                    </button>

                    <button
                      type="button"
                      onClick={() => { setStep("email"); setOtp(""); }}
                      className="text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
                    >
                      <ArrowRight className="h-4 w-4" />
                      تغيير البريد الإلكتروني
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            {/* Step 3: New Password */}
            {step === "password" && (
              <motion.div
                key="password"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="text-center mb-6">
                  <motion.div 
                    className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-4"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200 }}
                  >
                    <Lock className="h-8 w-8 text-accent" />
                  </motion.div>
                  <h1 className="text-2xl font-bold text-foreground mb-2">
                    كلمة المرور الجديدة
                  </h1>
                  <p className="text-muted-foreground">
                    اختر كلمة مرور قوية لحماية حسابك
                  </p>
                </div>

                <form onSubmit={handleResetPassword} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="password">كلمة المرور الجديدة</Label>
                    <div className="relative group">
                      <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pr-10 h-12 glass border-2 border-transparent focus:border-primary/50 transition-all"
                        required
                        minLength={6}
                        dir="ltr"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">تأكيد كلمة المرور</Label>
                    <div className="relative group">
                      <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input
                        id="confirmPassword"
                        type="password"
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="pr-10 h-12 glass border-2 border-transparent focus:border-primary/50 transition-all"
                        required
                        minLength={6}
                        dir="ltr"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    variant="hero"
                    size="lg"
                    className="w-full h-12 shadow-glow-primary"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin ml-2" />
                        جاري التحديث...
                      </>
                    ) : (
                      "تحديث كلمة المرور وتسجيل الدخول"
                    )}
                  </Button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div 
            className="mt-8 text-center text-sm text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            تذكرت كلمة المرور؟{" "}
            <Link to="/login" className="text-primary font-semibold hover:underline">
              تسجيل الدخول
            </Link>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default ForgotPassword;
