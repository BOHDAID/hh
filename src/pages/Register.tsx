import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { getAuthClient } from "@/lib/supabaseClient";
import { toast } from "@/hooks/use-toast";
import { ShoppingBag, Mail, Lock, User, Loader2, Sparkles, Gift, Crown, Star } from "lucide-react";
import { motion } from "framer-motion";

const Register = () => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const authClient = getAuthClient();
    
    const checkAuth = async () => {
      const { data: { session } } = await authClient.auth.getSession();
      if (session?.user) {
        toast({
          title: t('auth.alreadyLoggedIn'),
          description: t('auth.redirecting'),
        });
        navigate("/");
        return;
      }
      setCheckingAuth(false);
    };

    checkAuth();

    const { data: { subscription } } = authClient.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        navigate("/");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, t]);

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir={isRTL ? "rtl" : "ltr"}>
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">{t('auth.checking')}</p>
        </div>
      </div>
    );
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!acceptTerms) {
      toast({
        title: t('auth.mustAcceptTerms'),
        description: t('auth.pleaseAcceptTerms'),
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);

    const authClient = getAuthClient();
    const { error } = await authClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      toast({
        title: t('auth.accountCreationError'),
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: t('auth.accountCreated'),
        description: t('auth.welcomeToStore'),
      });
      navigate("/");
    }

    setLoading(false);
  };

  const benefits = [
    { icon: Gift, text: t('auth.memberDiscounts') },
    { icon: Crown, text: t('auth.deliveryPriority') },
    { icon: Star, text: t('auth.rewardPoints') },
  ];

  return (
    <div className="min-h-screen flex relative overflow-hidden" dir={isRTL ? "rtl" : "ltr"}>
      {/* Right Side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12 relative order-1 lg:order-2">
        {/* Mobile Background */}
        <div className="absolute inset-0 bg-gradient-hero lg:hidden" />
        <div className="absolute inset-0 opacity-20 lg:hidden">
          <div className="absolute top-1/4 left-1/4 h-64 w-64 rounded-full bg-primary/30 blur-[80px]" />
        </div>

        <motion.div
          className="relative w-full max-w-md"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Mobile Logo */}
          <div className="text-center mb-8 lg:hidden">
            <Link to="/" className="inline-flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-primary shadow-glow-primary">
                <ShoppingBag className="h-6 w-6 text-primary-foreground" />
              </div>
              <span className="text-2xl font-bold text-foreground">{isRTL ? "متجر رقمي" : "Digital Store"}</span>
            </Link>
          </div>

          {/* Card */}
          <motion.div
            className="glass rounded-3xl p-8 shadow-2xl"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <div className="text-center mb-8">
              <motion.div
                className="inline-flex items-center gap-2 bg-secondary/10 text-secondary px-4 py-2 rounded-full text-sm font-medium mb-4"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Gift className="h-4 w-4" />
                <span>{t('auth.joinFree')}</span>
              </motion.div>
              <h1 className="text-2xl font-bold text-foreground mb-2">
                {t('auth.registerTitle')}
              </h1>
              <p className="text-muted-foreground">
                {t('auth.registerNow')}
              </p>
            </div>


            <form onSubmit={handleRegister} className="space-y-5">
              <motion.div
                className="space-y-2"
                initial={{ opacity: 0, x: isRTL ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Label htmlFor="fullName">{t('auth.fullName')}</Label>
                <div className="relative group">
                  <User className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors`} />
                  <Input
                    id="fullName"
                    type="text"
                    placeholder={t('auth.fullNamePlaceholder')}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className={`${isRTL ? 'pr-10' : 'pl-10'} h-12 glass border-2 border-transparent focus:border-primary/50 transition-all`}
                    required
                  />
                </div>
              </motion.div>

              <motion.div
                className="space-y-2"
                initial={{ opacity: 0, x: isRTL ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
              >
                <Label htmlFor="email">{t('auth.email')}</Label>
                <div className="relative group">
                  <Mail className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors`} />
                  <Input
                    id="email"
                    type="email"
                    placeholder="example@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`${isRTL ? 'pr-10' : 'pl-10'} h-12 glass border-2 border-transparent focus:border-primary/50 transition-all`}
                    required
                    dir="ltr"
                  />
                </div>
              </motion.div>

              <motion.div
                className="space-y-2"
                initial={{ opacity: 0, x: isRTL ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 }}
              >
                <Label htmlFor="password">{t('auth.password')}</Label>
                <div className="relative group">
                  <Lock className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors`} />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${isRTL ? 'pr-10' : 'pl-10'} h-12 glass border-2 border-transparent focus:border-primary/50 transition-all`}
                    required
                    minLength={6}
                    dir="ltr"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('auth.passwordMinLength')}
                </p>
              </motion.div>

              <motion.div
                className="flex items-start gap-3"
                initial={{ opacity: 0, x: isRTL ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 }}
              >
                <Checkbox
                  id="acceptTerms"
                  checked={acceptTerms}
                  onCheckedChange={(checked) => setAcceptTerms(checked === true)}
                  className="mt-1"
                />
                <Label htmlFor="acceptTerms" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
                  {t('auth.agreeToTerms')}{" "}
                  <Link to="/terms" target="_blank" className="text-primary hover:underline font-medium">
                    {t('auth.termsOfUse')}
                  </Link>
                  {" "}{t('auth.and')}{" "}
                  <Link to="/refund-policy" target="_blank" className="text-primary hover:underline font-medium">
                    {t('auth.refundPolicy')}
                  </Link>
                  {" "}{t('auth.and')}{" "}
                  <Link to="/privacy-policy" target="_blank" className="text-primary hover:underline font-medium">
                    {t('auth.privacyPolicy')}
                  </Link>
                </Label>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
              >
                <Button
                  type="submit"
                  variant="hero"
                  size="lg"
                  className="w-full h-12 shadow-glow-primary text-base"
                  disabled={loading || !acceptTerms}
                >
                  {loading ? (
                    <>
                      <Loader2 className={`h-5 w-5 animate-spin ${isRTL ? 'ml-2' : 'mr-2'}`} />
                      {t('auth.creatingAccount')}
                    </>
                  ) : (
                    <>
                      <Sparkles className={`h-5 w-5 ${isRTL ? 'ml-2' : 'mr-2'}`} />
                      {t('auth.createAccount')}
                    </>
                  )}
                </Button>
              </motion.div>
            </form>

            <motion.div
              className="mt-8 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              <p className="text-sm text-muted-foreground">
                {t('auth.alreadyHaveAccount')}{" "}
                <Link to="/login" className="text-primary font-semibold hover:underline">
                  {t('auth.loginTitle')}
                </Link>
              </p>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>

      {/* Left Side - Decorative */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-bl from-secondary/20 via-background to-primary/10 order-2 lg:order-1">
        {/* Animated Background */}
        <div className="absolute inset-0">
          <motion.div 
            className="absolute top-20 left-20 h-72 w-72 rounded-full bg-secondary/30 blur-[100px]"
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 4, repeat: Infinity }}
          />
          <motion.div 
            className="absolute bottom-20 right-20 h-56 w-56 rounded-full bg-primary/30 blur-[80px]"
            animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 5, repeat: Infinity, delay: 1 }}
          />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20">
          <motion.div
            initial={{ opacity: 0, x: isRTL ? -30 : 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Link to="/" className="inline-flex items-center gap-3 mb-12">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow-primary">
                <ShoppingBag className="h-7 w-7 text-primary-foreground" />
              </div>
              <span className="text-3xl font-bold text-foreground">{isRTL ? "متجر رقمي" : "Digital Store"}</span>
            </Link>
          </motion.div>

          <motion.h2
            className="text-4xl xl:text-5xl font-bold text-foreground mb-6 leading-tight"
            initial={{ opacity: 0, x: isRTL ? -30 : 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            {t('auth.joinFamily')}
            <br />
            <span className="text-gradient-secondary">{t('auth.enjoyBenefits')}</span>
          </motion.h2>

          <motion.p
            className="text-lg text-muted-foreground mb-10 max-w-md"
            initial={{ opacity: 0, x: isRTL ? -30 : 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            {t('auth.createAccountNow')}
          </motion.p>

          <motion.div
            className="space-y-4"
            initial={{ opacity: 0, x: isRTL ? -30 : 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            {benefits.map((benefit, index) => (
              <motion.div
                key={benefit.text}
                className="flex items-center gap-3"
                initial={{ opacity: 0, x: isRTL ? -20 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + index * 0.1 }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/10">
                  <benefit.icon className="h-5 w-5 text-secondary" />
                </div>
                <span className="text-foreground">{benefit.text}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Register;
