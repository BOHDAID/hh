import { useState, useEffect, useCallback } from "react";
import { BarChart3, Send, MessageSquare, AtSign, RefreshCw, Loader2, TrendingUp, Clock, Users, Zap, CheckCircle2, XCircle, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { invokeCloudFunctionPublic } from "@/lib/cloudFunctions";

interface StatsData {
  autoPublish: {
    totalSent: number;
    totalFailed: number;
    successRate: number;
    forcedJoins: number;
    forcedLeaves: number;
    lastHour: { sent: number; failed: number };
    lastDay: { sent: number; failed: number };
    topGroups: { name: string; count: number }[];
    activeTasks: { taskId: string; groupsCount: number; intervalMinutes: number; sentCount: number; startedAt: number; runningMinutes: number }[];
    recentHistory: { timestamp: number; groupId: string; groupTitle: string; status: string; error?: string }[];
  };
  broadcast: {
    totalSent: number;
    totalFailed: number;
    lastRunAt: number | null;
    lastDay: { sent: number; failed: number };
  };
  mentions: {
    totalDetected: number;
    totalForwarded: number;
    lastDay: { detected: number };
  };
  connection: {
    connectedAt: number | null;
    reconnects: number;
    lastActivity: number | null;
    activeClients: number;
    forcedJoinsActive: number;
  };
}

const StatsPanel = () => {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invokeCloudFunctionPublic<any>("osn-session", { action: "tg-get-stats" });
      if (result.data?.success) setStats(result.data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Auto-refresh every 30s
  useEffect(() => {
    const iv = setInterval(fetchStats, 30000);
    return () => clearInterval(iv);
  }, [fetchStats]);

  const formatTime = (ts: number | null) => {
    if (!ts) return "—";
    return new Date(ts).toLocaleString("ar", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} دقيقة`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours} ساعة و ${mins} دقيقة` : `${hours} ساعة`;
  };

  if (!stats && loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
        <p className="text-sm text-muted-foreground">جاري تحميل الإحصائيات...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3">
        <BarChart3 className="h-12 w-12 text-muted-foreground/50" />
        <p className="text-muted-foreground text-sm">لا توجد إحصائيات متاحة</p>
        <Button variant="outline" size="sm" onClick={fetchStats} className="gap-2">
          <RefreshCw className="h-4 w-4" /> تحديث
        </Button>
      </div>
    );
  }

  const { autoPublish, broadcast, mentions, connection } = stats;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" /> التقارير والإحصائيات
        </h3>
        <Button variant="ghost" size="sm" onClick={fetchStats} disabled={loading} className="gap-2 text-xs">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          تحديث
        </Button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Send className="h-4 w-4" />} label="رسائل مرسلة" value={autoPublish.totalSent} color="text-green-500" bgColor="bg-green-500/10" />
        <StatCard icon={<XCircle className="h-4 w-4" />} label="فشل الإرسال" value={autoPublish.totalFailed} color="text-red-500" bgColor="bg-red-500/10" />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="معدل النجاح" value={`${autoPublish.successRate}%`} color="text-blue-500" bgColor="bg-blue-500/10" />
        <StatCard icon={<Zap className="h-4 w-4" />} label="اشتراكات إجبارية" value={autoPublish.forcedJoins} color="text-amber-500" bgColor="bg-amber-500/10" />
      </div>

      {/* Active Tasks */}
      {autoPublish.activeTasks.length > 0 && (
        <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-semibold text-green-700 dark:text-green-300 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            مهام نشطة ({autoPublish.activeTasks.length})
          </h4>
          {autoPublish.activeTasks.map(task => (
            <div key={task.taskId} className="bg-background/50 rounded-lg p-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div>المجموعات: <span className="font-semibold text-foreground">{task.groupsCount}</span></div>
              <div>الفاصل: <span className="font-semibold text-foreground">{task.intervalMinutes} د</span></div>
              <div>المرسلة: <span className="font-semibold text-foreground">{task.sentCount}</span></div>
              <div>المدة: <span className="font-semibold text-foreground">{formatDuration(task.runningMinutes)}</span></div>
            </div>
          ))}
        </div>
      )}

      {/* Time-based Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" /> آخر ساعة
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="مرسلة" value={autoPublish.lastHour.sent} color="text-green-500" />
            <MiniStat label="فاشلة" value={autoPublish.lastHour.failed} color="text-red-500" />
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" /> آخر 24 ساعة
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="مرسلة" value={autoPublish.lastDay.sent} color="text-green-500" />
            <MiniStat label="فاشلة" value={autoPublish.lastDay.failed} color="text-red-500" />
          </div>
        </div>
      </div>

      {/* Top Groups */}
      {autoPublish.topGroups.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" /> أكثر المجموعات نشاطاً (24 ساعة)
          </h4>
          <div className="space-y-2">
            {autoPublish.topGroups.map((g, i) => (
              <div key={i} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
                <span className="text-sm text-foreground truncate max-w-[70%]">{g.name}</span>
                <span className="text-xs font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5">{g.count} رسالة</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Broadcast & Mentions Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" /> البرودكاست
          </h4>
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div>إجمالي المرسلة: <span className="font-semibold text-foreground">{broadcast.totalSent}</span></div>
            <div>فاشلة: <span className="font-semibold text-foreground">{broadcast.totalFailed}</span></div>
            <div>اليوم: <span className="font-semibold text-foreground">{broadcast.lastDay.sent}</span></div>
            <div>آخر تشغيل: <span className="font-semibold text-foreground">{formatTime(broadcast.lastRunAt)}</span></div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <AtSign className="h-4 w-4 text-muted-foreground" /> المنشنات
          </h4>
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div>إجمالي المكتشفة: <span className="font-semibold text-foreground">{mentions.totalDetected}</span></div>
            <div>المحولة: <span className="font-semibold text-foreground">{mentions.totalForwarded}</span></div>
            <div>اليوم: <span className="font-semibold text-foreground">{mentions.lastDay.detected}</span></div>
          </div>
        </div>
      </div>

      {/* Recent History */}
      {autoPublish.recentHistory.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" /> آخر العمليات
          </h4>
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {autoPublish.recentHistory.map((h, i) => (
              <div key={i} className="flex items-center justify-between text-xs bg-muted/20 rounded-lg px-3 py-1.5">
                <div className="flex items-center gap-2 truncate max-w-[60%]">
                  {h.status === 'sent' ? <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" /> : <XCircle className="h-3 w-3 text-red-500 shrink-0" />}
                  <span className="truncate">{h.groupTitle || h.groupId}</span>
                </div>
                <span className="text-muted-foreground">{formatTime(h.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Connection Info */}
      <div className="bg-muted/30 rounded-lg p-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>عملاء متصلون: <span className="font-semibold text-foreground">{connection.activeClients}</span></span>
        <span>اشتراكات إجبارية نشطة: <span className="font-semibold text-foreground">{connection.forcedJoinsActive}</span></span>
        <span>آخر نشاط: <span className="font-semibold text-foreground">{formatTime(connection.lastActivity)}</span></span>
      </div>
    </div>
  );
};

const StatCard = ({ icon, label, value, color, bgColor }: { icon: React.ReactNode; label: string; value: string | number; color: string; bgColor: string }) => (
  <div className="bg-card border border-border rounded-xl p-4 space-y-2">
    <div className={`w-8 h-8 rounded-lg ${bgColor} flex items-center justify-center ${color}`}>{icon}</div>
    <p className="text-2xl font-bold text-foreground">{value}</p>
    <p className="text-xs text-muted-foreground">{label}</p>
  </div>
);

const MiniStat = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div className="text-center">
    <p className={`text-xl font-bold ${color}`}>{value}</p>
    <p className="text-xs text-muted-foreground">{label}</p>
  </div>
);

export default StatsPanel;
