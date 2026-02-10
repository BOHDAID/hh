import { useState, useEffect } from "react";
import { db } from "@/lib/supabaseClient";
import { formatDateShortArabic } from "@/lib/formatDate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Loader2, Eye, RefreshCw, Package, Search, Copy, Check, Shield, Clock, FileText, User, Mail, Filter } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { invokeCloudFunctionPublic } from "@/lib/cloudFunctions";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Order {
  id: string;
  order_number: string;
  user_id: string;
  total_amount: number;
  payment_method: string | null;
  payment_status: string;
  status: string;
  warranty_expires_at: string | null;
  created_at: string;
}

interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  price: number;
  delivered_data: string | null;
  products?: { name: string };
}

interface BuyerProfile {
  email: string | null;
  full_name: string | null;
}

const OrdersTab = () => {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [buyerProfile, setBuyerProfile] = useState<BuyerProfile | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [warrantyCountdown, setWarrantyCountdown] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    fetchOrders();
  }, []);

  useEffect(() => {
    if (!selectedOrder?.warranty_expires_at) return;

    const updateCountdown = () => {
      const now = new Date();
      const expiry = new Date(selectedOrder.warranty_expires_at!);
      const diff = expiry.getTime() - now.getTime();

      if (diff <= 0) {
        setWarrantyCountdown("انتهى الضمان");
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      setWarrantyCountdown(`${days} يوم و ${hours} ساعة`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);
    return () => clearInterval(interval);
  }, [selectedOrder]);

  const fetchOrders = async () => {
    const { data, error } = await db
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) setOrders(data);
    setLoading(false);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      fetchOrders();
      return;
    }

    setLoading(true);
    const { data, error } = await db
      .from("orders")
      .select("*")
      .ilike("order_number", `%${searchQuery.trim()}%`)
      .order("created_at", { ascending: false });

    if (data) setOrders(data);
    setLoading(false);
  };

  const viewOrderDetails = async (order: Order) => {
    setSelectedOrder(order);
    setDialogOpen(true);
    setBuyerProfile(null);

    // Fetch order items
    const { data: items } = await db
      .from("order_items")
      .select("*, products(name)")
      .eq("order_id", order.id);

    if (items) setOrderItems(items);

    // Fetch buyer profile
    const { data: profile } = await db
      .from("profiles")
      .select("email, full_name")
      .eq("user_id", order.user_id)
      .maybeSingle();

    if (profile) setBuyerProfile(profile);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ title: "تم النسخ!", description: "تم نسخ البيانات للحافظة" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "خطأ", description: "فشل في النسخ", variant: "destructive" });
    }
  };

  const handlePrintInvoice = () => {
    if (!selectedOrder) return;
    window.open(`/order/${selectedOrder.id}`, "_blank");
  };

  const updateOrderStatus = async (orderId: string, status: string) => {
    const { error } = await db
      .from("orders")
      .update({ status })
      .eq("id", orderId);

    if (error) {
      toast({
        title: "خطأ",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    // If marking as completed, send email notification
    if (status === "completed" && selectedOrder) {
      try {
        const storeUrl = window.location.origin;
        await invokeCloudFunctionPublic("send-delivery-email", {
          order_id: orderId,
          store_url: storeUrl,
        });
      } catch (err) {
        console.error("Email error:", err);
      }
    }

    toast({
      title: "تم التحديث",
      description: status === "completed" ? "تم إكمال الطلب وإشعار العميل" : "تم تحديث حالة الطلب",
    });
    fetchOrders();
    if (selectedOrder?.id === orderId) {
      setSelectedOrder({ ...selectedOrder, status });
    }
  };

  const filteredOrders = orders.filter((order) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "completed") return order.status === "completed";
    if (statusFilter === "pending_activation") return order.payment_status === "completed" && order.status !== "completed";
    if (statusFilter === "pending_payment") return order.payment_status !== "completed";
    return true;
  });

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { label: "قيد الانتظار", variant: "secondary" },
      completed: { label: "مكتمل", variant: "default" },
      cancelled: { label: "ملغي", variant: "destructive" },
      refunded: { label: "مسترجع", variant: "outline" },
    };

    const config = statusConfig[status] || { label: status, variant: "secondary" as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getPaymentStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      pending: { label: "معلق", className: "bg-yellow-500/20 text-yellow-500" },
      completed: { label: "مدفوع", className: "bg-green-500/20 text-green-500" },
      failed: { label: "فشل", className: "bg-red-500/20 text-red-500" },
      refunded: { label: "مسترجع", className: "bg-gray-500/20 text-gray-500" },
    };

    const config = statusConfig[status] || { label: status, className: "" };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full ${config.className}`}>
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
        <h1 className="text-2xl font-bold text-foreground">إدارة الطلبات</h1>
        <Button variant="ghost" onClick={fetchOrders} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          تحديث
        </Button>
      </div>

      {/* Search Bar */}
      <div className="flex gap-3 mb-4">
        <Input
          placeholder="ابحث برقم الطلب (مثال: ORD-20260129)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="glass max-w-md"
          dir="ltr"
        />
        <Button variant="outline" onClick={handleSearch} className="gap-2">
          <Search className="h-4 w-4" />
          بحث
        </Button>
      </div>

      {/* Filter Tabs */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter} className="mb-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">الكل ({orders.length})</TabsTrigger>
          <TabsTrigger value="completed">
            مكتمل ({orders.filter(o => o.status === "completed").length})
          </TabsTrigger>
          <TabsTrigger value="pending_activation">
            قيد التفعيل ({orders.filter(o => o.payment_status === "completed" && o.status !== "completed").length})
          </TabsTrigger>
          <TabsTrigger value="pending_payment">
            قيد الدفع ({orders.filter(o => o.payment_status !== "completed").length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {filteredOrders.length === 0 ? (
        <div className="text-center py-12">
          <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">لا توجد طلبات في هذا التصنيف</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => (
            <div
              key={order.id}
              className="glass rounded-xl p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <div>
                  <p className="font-semibold text-foreground font-mono">
                    {order.order_number}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateShortArabic(order.created_at)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-left">
                  <p className="font-bold text-primary">${order.total_amount}</p>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(order.status)}
                    {getPaymentStatusBadge(order.payment_status)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => viewOrderDetails(order)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Order Details Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="glass max-w-lg">
          <DialogHeader>
            <DialogTitle>تفاصيل الطلب {selectedOrder?.order_number}</DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Buyer Info */}
              <div className="bg-muted/30 rounded-xl p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  معلومات المشتري
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">الاسم</p>
                    <p className="font-medium">{buyerProfile?.full_name || "غير معروف"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      البريد الإلكتروني
                    </p>
                    <p className="font-medium font-mono text-xs">{buyerProfile?.email || "غير معروف"}</p>
                  </div>
                </div>
              </div>

              {/* Order Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">تاريخ الطلب</p>
                  <p className="font-medium">
                    {new Date(selectedOrder.created_at).toLocaleString("ar-SA")}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">المبلغ الإجمالي</p>
                  <p className="font-bold text-primary">
                    ${selectedOrder.total_amount}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">طريقة الدفع</p>
                  <p className="font-medium">{selectedOrder.payment_method || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">حالة الدفع</p>
                  {getPaymentStatusBadge(selectedOrder.payment_status)}
                </div>
              </div>

              {/* Warranty */}
              {selectedOrder.warranty_expires_at && (
                <div className="bg-primary/10 border border-primary/30 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      <span className="font-semibold">الضمان</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>{warrantyCountdown}</span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    ينتهي في: {formatDateShortArabic(selectedOrder.warranty_expires_at)}
                  </p>
                </div>
              )}

              {/* Products & Account Data */}
              <div className="border-t border-border pt-4">
                <h3 className="font-semibold mb-3">المنتجات وبيانات الحسابات</h3>
                <div className="space-y-3">
                  {orderItems.map((item) => (
                    <div
                      key={item.id}
                      className="bg-muted/30 rounded-xl p-4"
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">{item.products?.name || "منتج محذوف"}</span>
                        <span className="font-mono text-sm">
                          ${item.price} × {item.quantity}
                        </span>
                      </div>
                      
                      {/* Account Data */}
                      {item.delivered_data && (
                        <div className="bg-background rounded-lg p-3 mt-2">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-muted-foreground">بيانات الحساب المسلّمة:</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(item.delivered_data!)}
                              className="h-7 text-xs"
                            >
                              {copied ? (
                                <Check className="h-3 w-3 text-green-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                              <span className="mr-1">{copied ? "تم" : "نسخ"}</span>
                            </Button>
                          </div>
                          <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/50 rounded p-2 overflow-x-auto">
                            {item.delivered_data}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="border-t border-border pt-4">
                <h3 className="font-semibold mb-3">الإجراءات</h3>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={selectedOrder.status === "completed" ? "hero" : "outline"}
                    onClick={() => updateOrderStatus(selectedOrder.id, "completed")}
                  >
                    مكتمل
                  </Button>
                  <Button
                    size="sm"
                    variant={selectedOrder.status === "cancelled" ? "destructive" : "outline"}
                    onClick={() => updateOrderStatus(selectedOrder.id, "cancelled")}
                  >
                    إلغاء
                  </Button>
                  <Button
                    size="sm"
                    variant={selectedOrder.status === "refunded" ? "secondary" : "outline"}
                    onClick={() => updateOrderStatus(selectedOrder.id, "refunded")}
                  >
                    استرجاع
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handlePrintInvoice}
                    className="gap-1"
                  >
                    <FileText className="h-4 w-4" />
                    PDF
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrdersTab;
