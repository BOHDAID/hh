import { useState } from "react";
import { Send, Loader2, Clock, Square, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { invokeCloudFunctionPublic } from "@/lib/cloudFunctions";

interface TelegramGroup {
  id: string;
  title: string;
  username: string | null;
  photo: string | null;
  type: string;
}

interface AutoPublishPanelProps {
  sessionString: string;
  selectedGroups: TelegramGroup[];
}

const AutoPublishPanel = ({ sessionString, selectedGroups }: AutoPublishPanelProps) => {
  const [message, setMessage] = useState("");
  const [interval, setInterval] = useState("1");
  const [loading, setLoading] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [statusInfo, setStatusInfo] = useState<any>(null);

  const startPublish = async () => {
    if (!message.trim()) { toast.error("يرجى كتابة الرسالة"); return; }
    if (selectedGroups.length === 0) { toast.error("يرجى اختيار المجموعات أولاً"); return; }

    setLoading(true);
    const newTaskId = `ap-${Date.now()}`;
    try {
      const result = await invokeCloudFunctionPublic<any>("osn-session", {
        action: "tg-start-auto-publish",
        sessionString,
        groupIds: selectedGroups.map(g => g.id),
        message: message.trim(),
        intervalMinutes: parseFloat(interval) || 1,
        taskId: newTaskId,
      });
      if (result.error) throw new Error(result.error.message);
      if (!result.data?.success) throw new Error(result.data?.error || "فشل البدء");

      setTaskId(newTaskId);
      setIsRunning(true);
      toast.success(result.data.message || "بدأ النشر التلقائي!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const stopPublish = async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const result = await invokeCloudFunctionPublic<any>("osn-session", {
        action: "tg-stop-auto-publish",
        taskId,
      });
      if (result.error) throw new Error(result.error.message);
      setIsRunning(false);
      setTaskId(null);
      setStatusInfo(null);
      toast.success("تم إيقاف النشر التلقائي");
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
        action: "tg-auto-publish-status",
        taskId,
      });
      if (result.data) setStatusInfo(result.data);
    } catch {}
  };

  if (selectedGroups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3">
        <Send className="h-12 w-12 text-muted-foreground/50" />
        <p className="text-muted-foreground text-sm">يرجى اختيار المجموعات أولاً من قسم "المجموعات"</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* المجموعات المختارة */}
      <div className="bg-muted/50 rounded-xl p-4 border border-border">
        <p className="text-sm font-medium text-foreground mb-2">المجموعات المختارة ({selectedGroups.length})</p>
        <div className="flex flex-wrap gap-2">
          {selectedGroups.slice(0, 8).map(g => (
            <span key={g.id} className="bg-background border border-border rounded-lg px-2.5 py-1 text-xs text-foreground">
              {g.title}
            </span>
          ))}
          {selectedGroups.length > 8 && (
            <span className="text-xs text-muted-foreground py-1">+{selectedGroups.length - 8} أخرى</span>
          )}
        </div>
      </div>

      {/* الرسالة */}
      <div className="space-y-2">
        <Label>الرسالة</Label>
        <Textarea
          placeholder="اكتب الرسالة التي ستُنشر في المجموعات..."
          value={message}
          onChange={e => setMessage(e.target.value)}
          className="min-h-[120px]"
          disabled={isRunning}
        />
      </div>

      {/* الفاصل الزمني */}
      <div className="space-y-2">
        <Label>الفاصل الزمني (بالدقائق)</Label>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <Input
            type="number"
            min="0.5"
            step="0.5"
            value={interval}
            onChange={e => setInterval(e.target.value)}
            className="w-32"
            dir="ltr"
            disabled={isRunning}
          />
          <span className="text-xs text-muted-foreground">دقيقة بين كل مجموعة</span>
        </div>
      </div>

      {/* حالة النشر */}
      {isRunning && statusInfo && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-medium text-green-700 dark:text-green-300">النشر جاري...</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div>الرسائل المرسلة: <span className="font-semibold text-foreground">{statusInfo.sentCount || 0}</span></div>
            <div>المجموعات: <span className="font-semibold text-foreground">{statusInfo.groupsCount || 0}</span></div>
          </div>
        </div>
      )}

      {/* الأزرار */}
      <div className="flex gap-3">
        {!isRunning ? (
          <Button onClick={startPublish} disabled={loading || !message.trim()} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            بدء النشر التلقائي
          </Button>
        ) : (
          <>
            <Button variant="destructive" onClick={stopPublish} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
              إيقاف
            </Button>
            <Button variant="outline" onClick={checkStatus} className="gap-2">
              <Activity className="h-4 w-4" />
              تحديث الحالة
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default AutoPublishPanel;
