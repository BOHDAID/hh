import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAuthClient } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { ShoppingBag, Lock, Loader2, CheckCircle } from "lucide-react";

const ResetPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const authClient = getAuthClient();
    // Check if we have a valid recovery session
    const checkSession = async () => {
      const { data: { session } } = await authClient.auth.getSession();
      
      // The session should be from a recovery flow
      // If no session and no hash, redirect to forgot password
      const hash = window.location.hash;
      
      // إذا كان المستخدم مسجل دخول بدون hash للـ recovery، حوله للصفحة الرئيسية
      if (session?.user && !hash.includes("access_token") && !hash.includes("type=recovery")) {
        navigate("/");
        return;
      }
      
      if (!session && !hash.includes("access_token")) {
        setError("رابط غير صالح أو منتهي الصلاحية");
      }
    };

    checkSession();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
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
      setSuccess(true);
      toast({
        title: "تم التحديث",
        description: "تم تحديث كلمة المرور بنجاح",
      });
      // Redirect after a delay
      setTimeout(() => navigate("/login"), 2000);
    }

    setLoading(false);
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12 relative" dir="rtl">
        <div className="absolute inset-0 bg-gradient-hero" />
        <div className="relative w-full max-w-md">
          <div className="glass rounded-2xl p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              تم التحديث!
            </h1>
            <p className="text-muted-foreground mb-6">
              تم تحديث كلمة المرور بنجاح. جاري تحويلك لتسجيل الدخول...
            </p>
            <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12 relative" dir="rtl">
        <div className="absolute inset-0 bg-gradient-hero" />
        <div className="relative w-full max-w-md">
          <div className="glass rounded-2xl p-8 text-center">
            <h1 className="text-2xl font-bold text-foreground mb-2">
              رابط غير صالح
            </h1>
            <p className="text-muted-foreground mb-6">{error}</p>
            <Link to="/forgot-password">
              <Button variant="hero">طلب رابط جديد</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative" dir="rtl">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-gradient-hero" />
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-1/4 right-1/4 h-96 w-96 rounded-full bg-primary/30 blur-[100px]" />
        <div className="absolute bottom-1/4 left-1/4 h-72 w-72 rounded-full bg-secondary/20 blur-[80px]" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-primary shadow-glow-primary">
              <ShoppingBag className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold text-foreground">متجر رقمي</span>
          </Link>
        </div>

        {/* Card */}
        <div className="glass rounded-2xl p-8">
          <h1 className="text-2xl font-bold text-center text-foreground mb-2">
            إعادة تعيين كلمة المرور
          </h1>
          <p className="text-center text-muted-foreground mb-8">
            أدخل كلمة المرور الجديدة
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور الجديدة</Label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10 glass"
                  required
                  minLength={6}
                  dir="ltr"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">تأكيد كلمة المرور</Label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pr-10 glass"
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
              className="w-full shadow-glow-primary"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin ml-2" />
                  جاري التحديث...
                </>
              ) : (
                "تحديث كلمة المرور"
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
