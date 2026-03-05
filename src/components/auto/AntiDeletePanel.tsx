import { useEffect, useState } from "react";
import { Trash2, Loader2, Play, Square, Activity, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { invokeCloudFunctionPublic } from "@/lib/cloudFunctions";

interface AntiDeleteState {
  taskId: string | null;
  running: boolean;
}

interface AntiDeletePanelProps {
  sessionString: string;
  mentionsChannelId?: string | null;
  persistedState?: AntiDeleteState;
  onStateChange?: (state: AntiDeleteState) => void;
}

const AntiDeletePanel = ({ sessionString, mentionsChannelId, persistedState, onStateChange }: AntiDeletePanelProps) => {
  const [loading, setLoading] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(persistedState?.taskId || null);
  const [isRunning, setIsRunning] = useState(Boolean(persistedState?.running));
  const [cachedCount, setCachedCount] = useState(0);

  useEffect(() => {
    setTaskId(persistedState?.taskId || null);
    setIsRunning(Boolean(persistedState?.running));
  }, [persistedState?.taskId, persistedState?.running]);

  const startAntiDelete = async () => {
    if (!mentionsChannelId) {
      toast.error("يجب تحديد قناة الإشعارات أولاً من \"مراقب المنشنات\"");
      return;
    }

    setLoading(true);
    const newTaskId = `ad-${Date.now()}`;

    try {
      const result = await invokeCloudFunctionPublic<any>("osn-session", {
        action: "tg-start-anti-delete",
        sessionString,
        taskId: newTaskId,
        mentionsChannelId,
      });

      if (result.error) throw new Error(result.error.message);
      if (!result.data?.success) throw new Error(result.data?.error || "فشل البدء");

      setTaskId(newTaskId);
      setIsRunning(true);
      setCachedCount(0);
      onStateChange?.({ taskId: newTaskId, running: true });
      toast.success("تم بدء مراقبة الرسائل المحذوفة!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const stopAntiDelete = async () => {
    if (!taskId) return;

    setLoading(true);
    try {
      const result = await invokeCloudFunctionPublic<any>("osn-session", {
        action: "tg-stop-anti-delete",
        taskId,
      });

      if (result.error) throw new Error(result.error.message);

      setIsRunning(false);
      setTaskId(null);
      onStateChange?.({ taskId: null, running: false });
      toast.success("تم إيقاف مراقب الحذف");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async () => {
    if (!taskId) return;
    try {
      const result = await invokeCloudFunctionPublic<any>("osn-session", {
        action: "tg-anti-delete-status",
        taskId,
      });
      if (result.data?.success) {
        setCachedCount(result.data.cachedMessages || 0);
      }
    } catch {}
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-muted/50 rounded-xl p-4 border border-border space-y-2">
        <div className="flex items-center gap-2">
          <Trash2 className="h-5 w-5 text-primary" />
          <p className="text-sm font-medium text-foreground">مراقب الرسائل المحذوفة</p>
        </div>
        <p className="text-xs text-muted-foreground">
          يحفظ نسخة من كل رسالة تصلك. إذا حذف أي شخص رسالته (نص أو صورة أو ملف)، يتم إرسال نسخة منها فوراً إلى قناة الإشعارات.
        </p>
      </div>

      {!mentionsChannelId && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-sm text-destructive">
          ⚠️ يجب تحديد قناة الإشعارات أولاً من قسم "مراقب المنشنات"
        </div>
      )}

      {isRunning && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-medium text-green-700 dark:text-green-300">المراقبة تعمل</span>
            </div>
            <Button variant="ghost" size="sm" onClick={checkStatus} className="gap-1 text-xs h-7">
              <Activity className="h-3 w-3" />
              تحديث
            </Button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Database className="h-3.5 w-3.5" />
            <span>رسائل محفوظة في الذاكرة: <strong className="text-foreground">{cachedCount}</strong></span>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        {!isRunning ? (
          <Button onClick={startAntiDelete} disabled={loading || !mentionsChannelId} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            بدء المراقبة
          </Button>
        ) : (
          <Button variant="destructive" onClick={stopAntiDelete} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
            إيقاف
          </Button>
        )}
      </div>
    </div>
  );
};

export default AntiDeletePanel;
