import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db, getAuthClient, isExternalConfigured } from "@/lib/supabaseClient";
import { formatDateShortArabic } from "@/lib/formatDate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import UserLayout from "@/components/user/UserLayout";
import { 
  Loader2, 
  User, 
  Mail, 
  Save, 
  ShoppingBag,
  Calendar,
  AlertCircle
} from "lucide-react";
import { useTranslation } from "react-i18next";

interface ProfileData {
  id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
}

const Profile = () => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [fullName, setFullName] = useState("");
  const [nameError, setNameError] = useState("");
  const [successfulOrdersCount, setSuccessfulOrdersCount] = useState(0);
  const [joinDate, setJoinDate] = useState<string | null>(null);

  useEffect(() => {
    const authClient = isExternalConfigured ? getAuthClient() : db;
    const fetchProfile = async () => {
      const { data: { session } } = await authClient.auth.getSession();
      
      if (!session) {
        navigate("/login?redirect=/profile");
        return;
      }
      
      setUser(session.user);
      
      // Use user.created_at as join date (always available from auth)
      setJoinDate(session.user.created_at);

      // Fetch profile
      const { data: profileData, error: profileError } = await db
        .from("profiles")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (profileData) {
        setProfile(profileData);
        setFullName(profileData.full_name || "");
      } else if (!profileError || profileError.code === "PGRST116") {
        // Profile doesn't exist - create one
        const { data: newProfile } = await db
          .from("profiles")
          .insert({
            user_id: session.user.id,
            email: session.user.email,
            full_name: session.user.user_metadata?.full_name || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();
          
        if (newProfile) {
          setProfile(newProfile);
          setFullName(newProfile.full_name || "");
        }
      }

      // Fetch SUCCESSFUL orders count (completed or delivered)
      const { count } = await db
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("user_id", session.user.id)
        .in("status", ["completed", "delivered"]);

      setSuccessfulOrdersCount(count || 0);
      setLoading(false);
    };

    fetchProfile();
  }, [navigate]);

  const validateName = (name: string): boolean => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(isRTL ? "الاسم مطلوب" : "Name is required");
      return false;
    }
    if (trimmed.length < 2) {
      setNameError(isRTL ? "الاسم يجب أن يكون حرفين على الأقل" : "Name must be at least 2 characters");
      return false;
    }
    if (trimmed.length > 50) {
      setNameError(isRTL ? "الاسم يجب أن يكون أقل من 50 حرف" : "Name must be less than 50 characters");
      return false;
    }
    setNameError("");
    return true;
  };

  const handleSave = async () => {
    if (!user) return;
    
    if (!validateName(fullName)) {
      toast({
        title: t('common.error'),
        description: isRTL ? "يرجى إدخال اسم صحيح" : "Please enter a valid name",
        variant: "destructive",
      });
      return;
    }
    
    setSaving(true);

    const { error } = await db
      .from("profiles")
      .update({ 
        full_name: fullName.trim(),
        updated_at: new Date().toISOString()
      })
      .eq("user_id", user.id);

    if (error) {
      toast({
        title: t('common.error'),
        description: isRTL ? "فشل في حفظ التغييرات" : "Failed to save changes",
        variant: "destructive",
      });
    } else {
      toast({
        title: t('common.success'),
        description: isRTL ? "تم تحديث بياناتك بنجاح" : "Your profile has been updated",
      });
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const showNameWarning = !fullName.trim();

  return (
    <UserLayout 
      title={t('common.profile')} 
      subtitle={isRTL ? "إدارة بياناتك الشخصية" : "Manage your personal information"}
    >
      <div className="max-w-2xl mx-auto">
        {/* Name Required Alert */}
        {showNameWarning && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
            <p className="text-sm text-amber-600 dark:text-amber-400">
              {isRTL ? "يرجى إدخال اسمك لتتمكن من إضافة تقييمات على المنتجات" : "Please enter your name to be able to add product reviews"}
            </p>
          </div>
        )}

        {/* Profile Card */}
        <div className="glass rounded-2xl p-8 mb-6">
          {/* Avatar */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-24 h-24 rounded-full bg-gradient-primary flex items-center justify-center mb-4">
              <span className="text-4xl font-bold text-primary-foreground">
                {fullName?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "?"}
              </span>
            </div>
            <p className="text-lg font-semibold text-foreground">
              {fullName || (isRTL ? "مستخدم" : "User")}
            </p>
            <p className="text-sm text-muted-foreground" dir="ltr">
              {user?.email}
            </p>
          </div>

          {/* Form */}
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="fullName" className="flex items-center gap-1">
                {t('auth.fullName')}
                <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <User className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground`} />
                <Input
                  id="fullName"
                  type="text"
                  placeholder={isRTL ? "أدخل اسمك (مطلوب للتقييمات)" : "Enter your name (required for reviews)"}
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (nameError) validateName(e.target.value);
                  }}
                  className={`${isRTL ? 'pr-10' : 'pl-10'} glass ${nameError ? 'border-destructive' : ''}`}
                />
              </div>
              {nameError && (
                <p className="text-xs text-destructive">{nameError}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <div className="relative">
                <Mail className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground`} />
                <Input
                  id="email"
                  type="email"
                  value={user?.email || ""}
                  className={`${isRTL ? 'pr-10' : 'pl-10'} glass`}
                  disabled
                  dir="ltr"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {isRTL ? "لا يمكن تغيير البريد الإلكتروني" : "Email cannot be changed"}
              </p>
            </div>

            <Button
              variant="hero"
              className="w-full"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className={`h-5 w-5 animate-spin ${isRTL ? 'ml-2' : 'mr-2'}`} />
                  {isRTL ? "جاري الحفظ..." : "Saving..."}
                </>
              ) : (
                <>
                  <Save className={`h-5 w-5 ${isRTL ? 'ml-2' : 'mr-2'}`} />
                  {t('common.save')}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="glass rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20">
                <ShoppingBag className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{successfulOrdersCount}</p>
                <p className="text-sm text-muted-foreground">
                  {isRTL ? "طلبات ناجحة" : "Successful Orders"}
                </p>
              </div>
            </div>
          </div>
          <div className="glass rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <Calendar className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {joinDate 
                    ? (isRTL ? formatDateShortArabic(joinDate) : new Date(joinDate).toLocaleDateString('en-US'))
                    : "-"
                  }
                </p>
                <p className="text-sm text-muted-foreground">
                  {isRTL ? "تاريخ الانضمام" : "Join Date"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </UserLayout>
  );
};

export default Profile;