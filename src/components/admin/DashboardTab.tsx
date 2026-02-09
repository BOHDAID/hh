import { useState, useEffect } from "react";
import { db } from "@/lib/supabaseClient";
import { Loader2, Package, ShoppingCart, Users, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Stats {
  totalProducts: number;
  totalOrders: number;
  completedOrders: number;
  totalCustomers: number;
  totalSales: number;
  availableAccounts: number;
}

const DashboardTab = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    totalProducts: 0,
    totalOrders: 0,
    completedOrders: 0,
    totalCustomers: 0,
    totalSales: 0,
    availableAccounts: 0,
  });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      // جلب عدد المنتجات
      const { count: productsCount } = await db
        .from("products")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);

      // جلب عدد الطلبات
      const { data: orders } = await db.from("orders").select("*");

      // جلب عدد المستخدمين
      const { count: customersCount } = await db
        .from("profiles")
        .select("*", { count: "exact", head: true });

      // جلب الحسابات المتوفرة (غير المباعة)
      const { count: accountsCount } = await db
        .from("product_accounts")
        .select("*", { count: "exact", head: true })
        .eq("is_sold", false);

      // جلب الخيارات الدائمة (unlimited) لإضافتها للمخزون
      const { count: unlimitedCount } = await db
        .from("product_variants")
        .select("*", { count: "exact", head: true })
        .eq("is_unlimited", true)
        .eq("is_active", true);

      // الطلبات المكتملة = status AND payment_status كلاهما completed
      const completedOrders = orders?.filter(
        (o) => o.status === "completed" && o.payment_status === "completed"
      ) || [];
      const totalSales = completedOrders.reduce(
        (sum, o) => sum + Number(o.total_amount),
        0
      );

      // الحسابات المتوفرة = الحسابات العادية + الخيارات الدائمة (كل واحد يحسب كـ ∞)
      const totalAvailable = (accountsCount || 0) + (unlimitedCount || 0);

      setStats({
        totalProducts: productsCount || 0,
        totalOrders: orders?.length || 0,
        completedOrders: completedOrders.length,
        totalCustomers: customersCount || 0,
        totalSales,
        availableAccounts: totalAvailable,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    }

    setLoading(false);
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
      <h1 className="text-2xl font-bold text-foreground mb-8">لوحة التحكم</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="glass">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              إجمالي المبيعات
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">${stats.totalSales}</p>
            <p className="text-xs text-muted-foreground mt-1">
              من {stats.completedOrders} طلب مكتمل
            </p>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              الطلبات
            </CardTitle>
            <ShoppingCart className="h-4 w-4 text-secondary" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{stats.totalOrders}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.completedOrders} مكتمل
            </p>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              العملاء
            </CardTitle>
            <Users className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              {stats.totalCustomers}
            </p>
            <p className="text-xs text-muted-foreground mt-1">مستخدم مسجل</p>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              المنتجات النشطة
            </CardTitle>
            <Package className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              {stats.totalProducts}
            </p>
            <p className="text-xs text-muted-foreground mt-1">منتج متاح</p>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              الحسابات المتوفرة
            </CardTitle>
            <Package className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-500">
              {stats.availableAccounts}
            </p>
            <p className="text-xs text-muted-foreground mt-1">حساب جاهز للبيع</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardTab;
