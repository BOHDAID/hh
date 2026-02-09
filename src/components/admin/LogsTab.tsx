import { useState, useEffect } from "react";
import { db } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, RefreshCcw, Mail, CreditCard, Search, CheckCircle, XCircle, Clock, ShoppingCart } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface EmailLog {
  id: string;
  order_id: string | null;
  user_id: string | null;
  email_type: string;
  recipient_email: string;
  subject: string | null;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

interface PaymentLog {
  id: string;
  order_id: string | null;
  user_id: string | null;
  amount: number;
  currency: string;
  payment_method: string;
  status: string;
  error_message: string | null;
  provider_payment_id: string | null;
  created_at: string;
  orders?: { order_number: string } | null;
}

interface OrderLog {
  id: string;
  order_number: string;
  user_id: string;
  total_amount: number;
  status: string;
  payment_method: string | null;
  payment_status: string | null;
  created_at: string;
  profiles?: { email: string | null; full_name: string | null } | null;
}

const LogsTab = () => {
  const [activeView, setActiveView] = useState<"orders" | "payments" | "emails">("orders");
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [paymentLogs, setPaymentLogs] = useState<PaymentLog[]>([]);
  const [orderLogs, setOrderLogs] = useState<OrderLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  // فلتر منفصل لكل تبويب
  const [ordersStatusFilter, setOrdersStatusFilter] = useState<string>("all");
  const [paymentsStatusFilter, setPaymentsStatusFilter] = useState<string>("completed");
  const [emailsStatusFilter, setEmailsStatusFilter] = useState<string>("all");
  const [tablesAvailable, setTablesAvailable] = useState({ payments: true, email_logs: true });

  const fetchEmailLogs = async () => {
    console.log("🔄 جلب سجلات الإيميل...");
    try {
      const { data, error } = await db
        .from("email_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      console.log("📧 نتيجة الإيميلات:", { data, error, count: data?.length });

      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') {
          setTablesAvailable(prev => ({ ...prev, email_logs: false }));
        }
        console.log("Email logs not available:", error.message);
        return;
      }
      if (data) {
        setEmailLogs(data as EmailLog[]);
        console.log("✅ تم تحديث emailLogs:", data.length);
      }
    } catch (e) {
      setTablesAvailable(prev => ({ ...prev, email_logs: false }));
      console.log("Email logs error:", e);
    }
  };

  const fetchPaymentLogs = async () => {
    console.log("🔄 جلب سجلات الدفع من الطلبات...");
    try {
      // استخراج سجلات الدفع من جدول orders مباشرة (بدلاً من جدول payments منفصل)
      const { data, error } = await db
        .from("orders")
        .select("*")
        .not("payment_method", "is", null)
        .order("created_at", { ascending: false })
        .limit(100);

      console.log("💳 نتيجة الدفعات من orders:", { data, error, count: data?.length });

      if (error) {
        console.log("Payment logs error:", error.message);
        return;
      }
      
      if (data && data.length > 0) {
        const mapped: PaymentLog[] = data.map((order: any) => ({
          id: order.id,
          order_id: order.id,
          user_id: order.user_id,
          amount: order.total_amount || 0,
          currency: 'USD',
          payment_method: order.payment_method || 'unknown',
          status: order.payment_status || order.status || 'pending',
          error_message: null,
          provider_payment_id: order.payment_address || null,
          created_at: order.created_at,
          orders: { order_number: order.order_number }
        }));
        setPaymentLogs(mapped);
        setTablesAvailable(prev => ({ ...prev, payments: true }));
        console.log("✅ تم تحديث paymentLogs:", mapped.length);
      } else {
        setPaymentLogs([]);
      }
    } catch (e) {
      console.log("Payments error:", e);
    }
  };

  const fetchOrderLogs = async () => {
    console.log("🔄 جلب الطلبات...");
    try {
      // تشخيص: التحقق من الجلسة الحالية
      const { data: sessionData } = await db.auth.getSession();
      console.log("🔐 جلسة المستخدم:", sessionData?.session?.user?.id || "لا يوجد مستخدم مسجل");
      
      if (sessionData?.session?.user?.id) {
        const { data: roleData } = await db
          .from("user_roles")
          .select("role")
          .eq("user_id", sessionData.session.user.id)
          .single();
        console.log("👤 دور المستخدم:", roleData?.role || "لم يتم العثور على دور");
      }

      const { data, error } = await db
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      console.log("📦 نتيجة الطلبات:", { data, error, count: data?.length });

      if (!error && data) {
        // تحويل البيانات مباشرة بدون mapping معقد
        const orderData: OrderLog[] = data.map((order: any) => ({
          id: order.id,
          order_number: order.order_number,
          user_id: order.user_id,
          total_amount: order.total_amount || 0,
          status: order.status || 'pending',
          payment_method: order.payment_method,
          payment_status: order.payment_status,
          created_at: order.created_at,
          profiles: null
        }));
        setOrderLogs(orderData);
        console.log("✅ تم تحديث orderLogs:", orderData.length);
      } else if (error) {
        console.log("❌ Orders fetch error:", error.message, error.code);
      }
    } catch (e) {
      console.log("Orders error:", e);
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    await Promise.all([fetchEmailLogs(), fetchPaymentLogs(), fetchOrderLogs()]);
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case "completed":
      case "success":
      case "sent":
      case "paid":
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 gap-1">
            <CheckCircle className="h-3 w-3" />
            نجح
          </Badge>
        );
      case "failed":
      case "error":
      case "expired":
      case "cancelled":
        return (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 gap-1">
            <XCircle className="h-3 w-3" />
            فشل/ملغي
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 gap-1">
            <Clock className="h-3 w-3" />
            قيد الانتظار
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const filteredEmailLogs = emailLogs.filter((log) => {
    const matchesSearch =
      !searchTerm ||
      log.recipient_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.subject?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = emailsStatusFilter === "all" || log.status === emailsStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredPaymentLogs = paymentLogs.filter((log) => {
    const matchesSearch =
      !searchTerm ||
      log.orders?.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.payment_method.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.provider_payment_id?.toLowerCase().includes(searchTerm.toLowerCase());
    
    // تحويل الحالات للفلتر - الافتراضي ناجح فقط
    let matchesStatus = paymentsStatusFilter === "all";
    if (paymentsStatusFilter === "completed") {
      matchesStatus = log.status === "paid" || log.status === "completed";
    } else if (paymentsStatusFilter === "failed") {
      matchesStatus = log.status === "failed" || log.status === "expired" || log.status === "cancelled";
    } else if (paymentsStatusFilter === "pending") {
      matchesStatus = log.status === "pending";
    }
    
    return matchesSearch && matchesStatus;
  });

  const filteredOrderLogs = orderLogs.filter((log) => {
    const matchesSearch =
      !searchTerm ||
      log.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.payment_method?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.profiles?.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = ordersStatusFilter === "all" || log.status === ordersStatusFilter || log.payment_status === ordersStatusFilter;
    return matchesSearch && matchesStatus;
  });

  // Stats - استخدم الطلبات كمصدر رئيسي
  const orderStats = {
    total: orderLogs.length,
    completed: orderLogs.filter((l) => l.status === "completed" || l.status === "delivered").length,
    pending: orderLogs.filter((l) => l.status === "pending").length,
    cancelled: orderLogs.filter((l) => l.status === "cancelled" || l.status === "expired").length,
  };

  const emailStats = {
    total: emailLogs.length,
    success: emailLogs.filter((l) => l.status === "sent" || l.status === "success").length,
    failed: emailLogs.filter((l) => l.status === "failed" || l.status === "error").length,
  };

  const paymentStats = {
    total: paymentLogs.length,
    success: paymentLogs.filter((l) => l.status === "completed" || l.status === "paid").length,
    failed: paymentLogs.filter((l) => l.status === "failed" || l.status === "expired").length,
    pending: paymentLogs.filter((l) => l.status === "pending").length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">سجلات النظام</h2>
          <p className="text-muted-foreground">متابعة حالة الدفعات والإيميلات</p>
        </div>
        <Button onClick={fetchLogs} variant="outline" className="gap-2">
          <RefreshCcw className="h-4 w-4" />
          تحديث
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <ShoppingCart className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{orderStats.total}</p>
              <p className="text-xs text-muted-foreground">إجمالي الطلبات</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-500">{orderStats.completed}</p>
              <p className="text-xs text-muted-foreground">طلبات مكتملة</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-500/10 rounded-lg">
              <Clock className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-500">{orderStats.pending}</p>
              <p className="text-xs text-muted-foreground">قيد الانتظار</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-destructive/10 rounded-lg">
              <XCircle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold text-destructive">{orderStats.cancelled}</p>
              <p className="text-xs text-muted-foreground">ملغية/منتهية</p>
            </div>
          </div>
        </div>
      </div>

      {/* View Tabs */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={activeView === "orders" ? "default" : "outline"}
          onClick={() => setActiveView("orders")}
          className="gap-2"
        >
          <ShoppingCart className="h-4 w-4" />
          سجل الطلبات ({orderStats.total})
        </Button>
        <Button
          variant={activeView === "payments" ? "default" : "outline"}
          onClick={() => setActiveView("payments")}
          className="gap-2"
          disabled={!tablesAvailable.payments && paymentLogs.length === 0}
        >
          <CreditCard className="h-4 w-4" />
          سجل الدفعات ({paymentStats.total})
        </Button>
        <Button
          variant={activeView === "emails" ? "default" : "outline"}
          onClick={() => setActiveView("emails")}
          className="gap-2"
          disabled={!tablesAvailable.email_logs && emailLogs.length === 0}
        >
          <Mail className="h-4 w-4" />
          سجل الإيميلات ({emailStats.total})
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pr-10"
          />
        </div>
        {activeView === "orders" && (
          <Select value={ordersStatusFilter} onValueChange={setOrdersStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="completed">مكتمل</SelectItem>
              <SelectItem value="pending">قيد الانتظار</SelectItem>
              <SelectItem value="cancelled">ملغي</SelectItem>
            </SelectContent>
          </Select>
        )}
        {activeView === "payments" && (
          <Select value={paymentsStatusFilter} onValueChange={setPaymentsStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="completed">ناجح</SelectItem>
              <SelectItem value="pending">قيد الانتظار</SelectItem>
              <SelectItem value="failed">فاشل</SelectItem>
            </SelectContent>
          </Select>
        )}
        {activeView === "emails" && (
          <Select value={emailsStatusFilter} onValueChange={setEmailsStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="sent">مرسل</SelectItem>
              <SelectItem value="failed">فاشل</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Orders Table */}
      {activeView === "orders" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">رقم الطلب</TableHead>
                <TableHead className="text-right">العميل</TableHead>
                <TableHead className="text-right">المبلغ</TableHead>
                <TableHead className="text-right">طريقة الدفع</TableHead>
                <TableHead className="text-right">حالة الطلب</TableHead>
                <TableHead className="text-right">حالة الدفع</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrderLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    لا توجد طلبات
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrderLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-sm font-bold">
                      {log.order_number}
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.profiles?.full_name || log.profiles?.email || "-"}
                    </TableCell>
                    <TableCell className="font-bold text-primary">
                      ${log.total_amount.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{log.payment_method || "-"}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(log.status)}</TableCell>
                    <TableCell>{getStatusBadge(log.payment_status || "pending")}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(log.created_at), {
                        addSuffix: true,
                        locale: ar,
                      })}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Payments Table */}
      {activeView === "payments" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">رقم الطلب</TableHead>
                <TableHead className="text-right">المبلغ</TableHead>
                <TableHead className="text-right">طريقة الدفع</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">تفاصيل</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPaymentLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {tablesAvailable.payments ? "لا توجد سجلات دفع" : "جدول الدفعات (payments/payment_proofs) غير موجود في قاعدة البيانات الخارجية - يجب إنشاؤه أولاً"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredPaymentLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-sm">
                      {log.orders?.order_number || "-"}
                    </TableCell>
                    <TableCell className="font-bold">
                      ${log.amount.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{log.payment_method}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(log.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(log.created_at), {
                        addSuffix: true,
                        locale: ar,
                      })}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {log.error_message || log.provider_payment_id || "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Emails Table */}
      {activeView === "emails" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">البريد الإلكتروني</TableHead>
                <TableHead className="text-right">النوع</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">خطأ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEmailLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    {tablesAvailable.email_logs ? "لا توجد سجلات إيميل" : "جدول email_logs غير موجود في قاعدة البيانات الخارجية - يجب إنشاؤه أولاً"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredEmailLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-sm">
                      {log.recipient_email}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{log.email_type}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(log.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(log.created_at), {
                        addSuffix: true,
                        locale: ar,
                      })}
                    </TableCell>
                    <TableCell className="text-xs text-destructive max-w-[200px] truncate">
                      {log.error_message || "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default LogsTab;
