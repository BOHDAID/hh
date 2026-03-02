import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { db, getAuthClient, isExternalConfigured } from "@/lib/supabaseClient";
import { formatDateArabic } from "@/lib/formatDate";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import UserLayout from "@/components/user/UserLayout";
import { Package, Eye, Loader2, Shield, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Order {
  id: string;
  order_number: string;
  total_amount: number;
  status: string;
  payment_status: string;
  created_at: string;
  warranty_expires_at: string | null;
  order_items: Array<{
    id: string;
    quantity: number;
    products: { name: string; warranty_days: number | null } | null;
  }>;
}

const WarrantyIndicator = ({ order }: { order: Order }) => {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';

  if (order.status !== "completed" || !order.warranty_expires_at) return null;

  const now = new Date();
  const expiresAt = new Date(order.warranty_expires_at);
  const createdAt = new Date(order.created_at);

  const totalMs = expiresAt.getTime() - createdAt.getTime();
  const remainingMs = expiresAt.getTime() - now.getTime();

  if (totalMs <= 0) return null;

  const isExpired = remainingMs <= 0;
  const progressPercent = isExpired ? 0 : Math.round((remainingMs / totalMs) * 100);

  const remainingDays = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
  const isLow = remainingDays <= 3 && !isExpired;

  const label = isExpired
    ? (isRTL ? "انتهى الضمان" : "Warranty expired")
    : isRTL
      ? `باقي ${remainingDays} ${remainingDays <= 2 ? "يوم" : remainingDays <= 10 ? "أيام" : "يوم"} على انتهاء الضمان`
      : `${remainingDays} day${remainingDays !== 1 ? "s" : ""} left on warranty`;

  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs">
        {isExpired ? (
          <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
        ) : isLow ? (
          <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
        ) : (
          <Shield className="h-3.5 w-3.5 text-green-500" />
        )}
        <span className={
          isExpired ? "text-muted-foreground" : isLow ? "text-yellow-500 font-medium" : "text-green-500 font-medium"
        }>
          {label}
        </span>
      </div>
      <Progress
        value={progressPercent}
        className={`h-1.5 ${isExpired ? "[&>div]:bg-muted-foreground" : isLow ? "[&>div]:bg-yellow-500" : "[&>div]:bg-green-500"}`}
      />
    </div>
  );
};

const MyOrders = () => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const authClient = isExternalConfigured ? getAuthClient() : db;
    const fetchOrders = async () => {
      const { data: { session } } = await authClient.auth.getSession();
      if (!session) {
        navigate("/login");
        return;
      }

      const { data, error } = await db
        .from("orders")
        .select(`
          *,
          order_items (
            id,
            quantity,
            products:product_id (name, warranty_days)
          )
        `)
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setOrders(data);
      }
      setLoading(false);
    };

    fetchOrders();
  }, [navigate]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500">{t('orders.completed')}</Badge>;
      case "pending":
        return <Badge variant="secondary">{t('orders.pending')}</Badge>;
      case "processing":
        return <Badge className="bg-blue-500">{t('orders.processing')}</Badge>;
      case "cancelled":
        return <Badge variant="destructive">{t('orders.cancelled')}</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <UserLayout 
      title={t('orders.title')} 
      subtitle={isRTL ? "عرض جميع طلباتك السابقة" : "View all your previous orders"}
    >
      {orders.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">{t('orders.noOrders')}</h3>
            <p className="text-muted-foreground mb-6">
              {isRTL ? "لم تقم بأي عملية شراء بعد" : "You haven't made any purchases yet"}
            </p>
            <Link to="/">
              <Button>{isRTL ? "تصفح المنتجات" : "Browse Products"}</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <Card key={order.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold">{order.order_number}</span>
                      {getStatusBadge(order.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {isRTL ? formatDateArabic(order.created_at) : new Date(order.created_at).toLocaleDateString('en-US')}
                    </p>
                    <p className="text-sm">
                      {order.order_items?.reduce((sum, i) => sum + (i.quantity || 1), 0) || 0} {isRTL ? "منتج" : "items"} • {order.order_items?.map(i => i.products?.name).filter(Boolean).join(", ").slice(0, 50) || ""}
                      {(order.order_items?.map(i => i.products?.name).filter(Boolean).join(", ").length || 0) > 50 && "..."}
                    </p>
                    <WarrantyIndicator order={order} />
                  </div>

                  <div className="flex items-center gap-4">
                    <div className={isRTL ? "text-left" : "text-right"}>
                      <p className="text-2xl font-bold text-primary">
                        ${order.total_amount.toFixed(2)}
                      </p>
                    </div>
                    <Link to={`/order/${order.id}`}>
                      <Button variant="outline" size="sm">
                        <Eye className={`h-4 w-4 ${isRTL ? 'ml-2' : 'mr-2'}`} />
                        {t('orders.details')}
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </UserLayout>
  );
};

export default MyOrders;