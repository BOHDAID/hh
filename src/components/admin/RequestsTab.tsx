import { useState, useEffect } from "react";
import { db } from "@/lib/supabaseClient";
import { invokeCloudFunctionPublic } from "@/lib/cloudFunctions";
import { formatDateShortArabic } from "@/lib/formatDate";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Loader2, MessageCircle, Check, X, Clock, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ProductRequest {
  id: string;
  user_id: string | null;
  product_name: string;
  description: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
}

const RequestsTab = () => {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<ProductRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<ProductRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    const { data, error } = await db
      .from("product_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) setRequests(data);
    setLoading(false);
  };

  const openRequest = (request: ProductRequest) => {
    setSelectedRequest(request);
    setAdminNotes(request.admin_notes || "");
    setDialogOpen(true);
  };

  const updateStatus = async (status: string) => {
    if (!selectedRequest) return;

    const { error } = await db
      .from("product_requests")
      .update({ status, admin_notes: adminNotes })
      .eq("id", selectedRequest.id);

    if (error) {
      toast({
        title: "خطأ",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    // If status is "fulfilled" and user_id exists, send email notification
    if (status === "fulfilled" && selectedRequest.user_id) {
      try {
        // Get current site URL for email links
        const storeUrl = window.location.origin;
        
        const { error: emailError } = await invokeCloudFunctionPublic(
          "send-request-fulfilled",
          {
            user_id: selectedRequest.user_id,
            product_name: selectedRequest.product_name,
            admin_notes: adminNotes || undefined,
            store_url: storeUrl,
          }
        );

        if (emailError) {
          console.error("Email error:", emailError);
          toast({
            title: "تم التحديث",
            description: "تم تحديث حالة الطلب، لكن فشل إرسال الإيميل",
            variant: "default",
          });
        } else {
          toast({
            title: "تم التحديث",
            description: "تم تحديث حالة الطلب وإرسال إشعار للعميل بالإيميل",
          });
        }
      } catch (err) {
        console.error("Email send error:", err);
        toast({
          title: "تم التحديث",
          description: "تم تحديث حالة الطلب",
        });
      }
    } else {
      toast({
        title: "تم التحديث",
        description: "تم تحديث حالة الطلب",
      });
    }

    setDialogOpen(false);
    fetchRequests();
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
      pending: {
        label: "قيد الانتظار",
        icon: <Clock className="h-3 w-3" />,
        className: "bg-yellow-500/20 text-yellow-500",
      },
      reviewed: {
        label: "تمت المراجعة",
        icon: <Check className="h-3 w-3" />,
        className: "bg-blue-500/20 text-blue-500",
      },
      fulfilled: {
        label: "تم التوفير",
        icon: <Check className="h-3 w-3" />,
        className: "bg-green-500/20 text-green-500",
      },
      rejected: {
        label: "مرفوض",
        icon: <X className="h-3 w-3" />,
        className: "bg-red-500/20 text-red-500",
      },
    };

    const config = statusConfig[status] || {
      label: status,
      icon: null,
      className: "",
    };

    return (
      <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${config.className}`}>
        {config.icon}
        {config.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-foreground">طلبات المنتجات</h1>
        <Badge variant="secondary">{requests.length} طلب</Badge>
      </div>

      {requests.length === 0 ? (
        <div className="text-center py-12">
          <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">لا توجد طلبات منتجات</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <div
              key={request.id}
              className="glass rounded-xl p-4 cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => openRequest(request)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">
                    {request.product_name}
                  </h3>
                  {request.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {request.description}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    {formatDateShortArabic(request.created_at)}
                  </p>
                </div>
                {getStatusBadge(request.status)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Request Details Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="glass max-w-md">
          <DialogHeader>
            <DialogTitle>تفاصيل طلب المنتج</DialogTitle>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">المنتج المطلوب</p>
                <p className="font-semibold text-foreground text-lg">
                  {selectedRequest.product_name}
                </p>
              </div>

              {selectedRequest.description && (
                <div>
                  <p className="text-sm text-muted-foreground">الوصف</p>
                  <p className="text-foreground">{selectedRequest.description}</p>
                </div>
              )}

              <div>
                <p className="text-sm text-muted-foreground">تاريخ الطلب</p>
                <p className="text-foreground">
                  {new Date(selectedRequest.created_at).toLocaleString("ar-SA")}
                </p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-2">الحالة الحالية</p>
                {getStatusBadge(selectedRequest.status)}
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">ملاحظات الإدارة</p>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="أضف ملاحظة..."
                  className="glass"
                />
              </div>

              <div className="flex flex-wrap gap-2 pt-4">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updateStatus("reviewed")}
                >
                  تمت المراجعة
                </Button>
                <Button
                  size="sm"
                  variant="hero"
                  onClick={() => updateStatus("fulfilled")}
                >
                  تم التوفير
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => updateStatus("rejected")}
                >
                  رفض
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RequestsTab;
