import { useState, useEffect } from "react";
import { db } from "@/lib/supabaseClient";
import { Loader2, Activity, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface ActivityLog {
  id: string;
  user_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

const actionLabels: Record<string, { label: string; color: string }> = {
  create: { label: "إنشاء", color: "bg-green-500/10 text-green-500" },
  update: { label: "تعديل", color: "bg-blue-500/10 text-blue-500" },
  delete: { label: "حذف", color: "bg-red-500/10 text-red-500" },
  login: { label: "تسجيل دخول", color: "bg-primary/10 text-primary" },
  logout: { label: "تسجيل خروج", color: "bg-muted text-muted-foreground" },
  ban: { label: "حظر", color: "bg-red-500/10 text-red-500" },
  unban: { label: "إلغاء حظر", color: "bg-green-500/10 text-green-500" },
  approve: { label: "موافقة", color: "bg-green-500/10 text-green-500" },
  reject: { label: "رفض", color: "bg-red-500/10 text-red-500" },
};

const targetLabels: Record<string, string> = {
  product: "منتج",
  order: "طلب",
  user: "مستخدم",
  category: "تصنيف",
  coupon: "كوبون",
  review: "تقييم",
  ticket: "تذكرة",
  setting: "إعداد",
  flash_sale: "عرض خاطف",
  variant: "خيار",
  account: "حساب",
  team: "فريق",
  policy: "سياسة",
};

const ActivityLogsTab = () => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  useEffect(() => {
    fetchLogs();
  }, [filterType, filterAction, page]);

  const fetchLogs = async () => {
    setLoading(true);
    let query = db
      .from("admin_activity_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (filterType !== "all") query = query.eq("target_type", filterType);
    if (filterAction !== "all") query = query.eq("action", filterAction);

    const { data } = await query;
    setLogs(data || []);
    setLoading(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Activity className="h-6 w-6 text-primary" />
          سجل الأنشطة
        </h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filterType} onValueChange={(v) => { setFilterType(v); setPage(0); }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="النوع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {Object.entries(targetLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Select value={filterAction} onValueChange={(v) => { setFilterAction(v); setPage(0); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="الإجراء" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            {Object.entries(actionLabels).map(([key, { label }]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : logs.length === 0 ? (
        <Card className="glass">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Activity className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">لا توجد سجلات بعد</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {logs.map((log) => {
              const actionInfo = actionLabels[log.action] || { label: log.action, color: "bg-muted text-muted-foreground" };
              return (
                <Card key={log.id} className="glass">
                  <CardContent className="py-3 px-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge className={`${actionInfo.color} shrink-0`}>{actionInfo.label}</Badge>
                      <span className="text-sm text-foreground">
                        {targetLabels[log.target_type] || log.target_type}
                      </span>
                      {log.target_id && (
                        <span className="text-xs text-muted-foreground font-mono truncate max-w-[120px]">
                          {log.target_id.substring(0, 8)}...
                        </span>
                      )}
                      {log.details && Object.keys(log.details).length > 0 && (
                        <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {JSON.stringify(log.details).substring(0, 60)}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ar })}
                    </span>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex justify-center gap-2 mt-6">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              السابق
            </Button>
            <span className="text-sm text-muted-foreground flex items-center px-3">
              صفحة {page + 1}
            </span>
            <Button variant="outline" size="sm" disabled={logs.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)}>
              التالي
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default ActivityLogsTab;
