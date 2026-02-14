import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAuthClient } from "@/lib/supabaseClient";
import { toast } from "@/hooks/use-toast";
import { Mail, Lock, Loader2, Sparkles, Shield, Zap, Eye, EyeOff } from "lucide-react";
import StoreLogo from "@/components/StoreLogo";
import { motion } from "framer-motion";

const Login = () => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const authClient = getAuthClient();
    const { error } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast({
        title: t('auth.loginError'),
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: t('auth.loginSuccess'),
        description: t('auth.welcomeMessage'),
      });
      navigate("/");
    }

    setLoading(false);
  };

  const features = [
    { icon: Shield, text: t('auth.dataProtection') },
    { icon: Zap, text: t('auth.instantDelivery') },
    { icon: Sparkles, text: t('auth.memberExclusives') },
  ];

  return (
    <div className="min-h-screen flex relative overflow-hidden" dir={isRTL ? "rtl" : "ltr"}>
      {/* Left Side - Decorative */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-primary/20 via-background to-secondary/10">
        {/* Animated Background */}
        <div className="absolute inset-0">
          <motion.div 
            className="absolute top-20 right-20 h-72 w-72 rounded-full bg-primary/30 blur-[100px]"
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 4, repeat: Infinity }}
          />
          <motion.div 
            className="absolute bottom-20 left-20 h-56 w-56 rounded-full bg-secondary/30 blur-[80px]"
            animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 5, repeat: Infinity, delay: 1 }}
          />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20">
          <motion.div
            initial={{ opacity: 0, x: isRTL ? 30 : -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <StoreLogo size="lg" className="mb-12" />
          </motion.div>

          <motion.h2
            className="text-4xl xl:text-5xl font-bold text-foreground mb-6 leading-tight"
            initial={{ opacity: 0, x: isRTL ? 30 : -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            {t('auth.welcomeBack')}
            <br />
            <span className="text-gradient-primary">{t('auth.loginNow')}</span>
          </motion.h2>

          <motion.p
            className="text-lg text-muted-foreground mb-10 max-w-md"
            initial={{ opacity: 0, x: isRTL ? 30 : -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            {t('auth.loginSubtitle')}
          </motion.p>

          <motion.div
            className="space-y-4"
            initial={{ opacity: 0, x: isRTL ? 30 : -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            {features.map((feature, index) => (
              <motion.div
                key={feature.text}
                className="flex items-center gap-3"
                initial={{ opacity: 0, x: isRTL ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + index * 0.1 }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <span className="text-foreground">{feature.text}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12 relative">
        {/* Mobile Background */}
        <div className="absolute inset-0 bg-gradient-hero lg:hidden" />
        <div className="absolute inset-0 opacity-20 lg:hidden">
          <div className="absolute top-1/4 right-1/4 h-64 w-64 rounded-full bg-primary/30 blur-[80px]" />
        </div>

        <motion.div
          className="relative w-full max-w-md"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Mobile Logo */}
          <div className="text-center mb-8 lg:hidden">
            <StoreLogo size="md" />
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
                className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-4"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Sparkles className="h-4 w-4" />
                <span>{t('auth.welcome')}</span>
              </motion.div>
              <h1 className="text-2xl font-bold text-foreground mb-2">
                {t('auth.loginTitle')}
              </h1>
              <p className="text-muted-foreground">
                {t('auth.enterCredentials')}
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <motion.div
                className="space-y-2"
                initial={{ opacity: 0, x: isRTL ? -20 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
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
                initial={{ opacity: 0, x: isRTL ? -20 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
              >
                <Label htmlFor="password">{t('auth.password')}</Label>
                <div className="relative group">
                  <Lock className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors`} />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${isRTL ? 'pr-10 pl-10' : 'pl-10 pr-10'} h-12 glass border-2 border-transparent focus:border-primary/50 transition-all`}
                    required
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={`absolute ${isRTL ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors`}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </motion.div>

              <motion.div
                className={`flex ${isRTL ? 'justify-end' : 'justify-start'}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <Link 
                  to="/forgot-password" 
                  className="text-sm text-primary hover:underline"
                >
                  {t('auth.forgotPassword')}
                </Link>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
              >
                <Button
                  type="submit"
                  variant="hero"
                  size="lg"
                  className="w-full h-12 shadow-glow-primary text-base"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className={`h-5 w-5 animate-spin ${isRTL ? 'ml-2' : 'mr-2'}`} />
                      {t('auth.loggingIn')}
                    </>
                  ) : (
                    t('auth.loginButton')
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
                {t('auth.noAccount')}{" "}
                <Link to="/register" className="text-primary font-semibold hover:underline">
                  {t('auth.createNewAccount')}
                </Link>
              </p>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
