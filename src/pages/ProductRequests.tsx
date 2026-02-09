import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { db, getAuthClient, isExternalConfigured } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import UserSidebar from "@/components/user/UserSidebar";
import { PackagePlus, Clock, CheckCircle, XCircle, Send, Loader2, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

interface ProductRequest {
  id: string;
  product_name: string;
  description: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
}

const ProductRequests = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [requests, setRequests] = useState<ProductRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const authClient = isExternalConfigured ? getAuthClient() : db;
      const { data: { session } } = await authClient.auth.getSession();
      if (session?.user) {
        setUserId(session.user.id);
        fetchRequests(session.user.id);
      } else {
        setLoading(false);
      }
    };
    init();
  }, []);

  const fetchRequests = async (uid: string) => {
    const { data } = await db
      .from("product_requests")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    if (data) setRequests(data);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !productName.trim()) {
      toast({ title: "خطأ", description: "يرجى إدخال اسم المنتج", variant: "destructive" });
      return;
    }

    // Validate product name length (RLS requires 2-200 chars)
    const trimmedName = productName.trim();
    if (trimmedName.length < 2) {
      toast({ title: "خطأ", description: "اسم المنتج يجب أن يكون أكثر من حرفين", variant: "destructive" });
      return;
    }
    if (trimmedName.length > 200) {
      toast({ title: "خطأ", description: "اسم المنتج طويل جداً (الحد الأقصى 200 حرف)", variant: "destructive" });
      return;
    }

    // Validate description length if provided
    const trimmedDesc = description.trim();
    if (trimmedDesc.length > 2000) {
      toast({ title: "خطأ", description: "الوصف طويل جداً (الحد الأقصى 2000 حرف)", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    
    // Use the same client that has the auth context
    const authClient = isExternalConfigured ? getAuthClient() : db;
    const { error } = await authClient.from("product_requests").insert({
      user_id: userId,
      product_name: trimmedName,
      description: trimmedDesc || null,
    });

    if (error) {
      console.error("Insert error:", error);
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "تم الإرسال", description: "تم إرسال طلبك بنجاح" });
      setProductName("");
      setDescription("");
      fetchRequests(userId);
    }
    setSubmitting(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "rejected":
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "approved":
        return "تمت الموافقة";
      case "rejected":
        return "مرفوض";
      default:
        return "قيد المراجعة";
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-green-500/20 text-green-500";
      case "rejected":
        return "bg-destructive/20 text-destructive";
      default:
        return "bg-yellow-500/20 text-yellow-500";
    }
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
      <UserSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpen={() => setSidebarOpen(true)}
      />

      <main className="container mx-auto px-4 py-8 pt-24">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link to="/" className="hover:text-primary">الرئيسية</Link>
          <ArrowRight className="h-4 w-4" />
          <span className="text-foreground">طلبات المنتجات</span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-3xl mx-auto"
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 rounded-xl bg-gradient-primary shadow-glow-primary">
              <PackagePlus className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">طلبات المنتجات</h1>
              <p className="text-muted-foreground">اطلب منتج غير متوفر وسنوفره لك</p>
            </div>
          </div>

          {/* Request Form */}
          <div className="glass rounded-2xl p-6 mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-4">طلب منتج جديد</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>اسم المنتج المطلوب *</Label>
                <Input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="مثال: اشتراك Spotify Premium"
                  className="glass"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>تفاصيل إضافية (اختياري)</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="أي تفاصيل إضافية عن المنتج..."
                  className="glass"
                  rows={3}
                />
              </div>
              <Button type="submit" variant="hero" disabled={submitting} className="gap-2">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                إرسال الطلب
              </Button>
            </form>
          </div>

          {/* My Requests */}
          <div className="glass rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">طلباتي السابقة</h2>
            
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : requests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                لا توجد طلبات سابقة
              </div>
            ) : (
              <div className="space-y-3">
                {requests.map((request) => (
                  <motion.div
                    key={request.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-4 rounded-xl bg-muted/30 border border-border"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="font-medium text-foreground">{request.product_name}</h3>
                        {request.description && (
                          <p className="text-sm text-muted-foreground mt-1">{request.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          {new Date(request.created_at).toLocaleDateString("ar-SA")}
                        </p>
                      </div>
                      <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${getStatusClass(request.status)}`}>
                        {getStatusIcon(request.status)}
                        {getStatusText(request.status)}
                      </span>
                    </div>
                    {request.admin_notes && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium">رد الإدارة:</span> {request.admin_notes}
                        </p>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
};

export default ProductRequests;
