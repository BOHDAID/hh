import { useState, useEffect } from "react";
import { Send, Loader2, Clock, Square, Activity, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { invokeCloudFunctionPublic } from "@/lib/cloudFunctions";
import MediaAttachment from "./MediaAttachment";
import TelegramMessagePreview from "./TelegramMessagePreview";
import PremiumEmojiPicker from "./PremiumEmojiPicker";

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
  mentionsChannelId?: string | null;
}

const AutoPublishPanel = ({ sessionString, selectedGroups, mentionsChannelId }: AutoPublishPanelProps) => {
  const [message, setMessage] = useState("");
  const [interval, setInterval] = useState("1");
  const [forcedSubscription, setForcedSubscription] = useState(true);
  const [loading, setLoading] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(() => {
    try { return localStorage.getItem("tg-autopublish-taskId") || null; } catch { return null; }
  });
  const [isRunning, setIsRunning] = useState(() => {
    try { return localStorage.getItem("tg-autopublish-running") === "true"; } catch { return false; }
  });
  const [statusInfo, setStatusInfo] = useState<any>(null);
  const [media, setMedia] = useState<{ base64: string; fileName: string; mimeType: string; sendType: string } | null>(null);
  const [customEmojis, setCustomEmojis] = useState<Array<{ documentId: string; accessHash: string; emoticon: string; offset: number }>>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("tg-autopublish-config");
      if (!raw) return;
      const config = JSON.parse(raw);
      if (typeof config?.message === "string") setMessage(config.message);
      if (typeof config?.intervalMinutes === "number") setInterval(String(config.intervalMinutes));
      if (typeof config?.forcedSubscription === "boolean") setForcedSubscription(config.forcedSubscription);
    } catch {}
  }, []);

  const handlePremiumEmojiSelect = (emoji: any) => {
    const offset = message.length;
    setMessage(prev => prev + emoji.emoticon);
    setCustomEmojis(prev => [...prev, { documentId: emoji.documentId, accessHash: emoji.accessHash, emoticon: emoji.emoticon, offset }]);
  };

  const startPublish = async () => {
    if (!message.trim() && !media) { toast.error("يرجى كتابة رسالة أو إرفاق ملف"); return; }
    if (selectedGroups.length === 0) { toast.error("يرجى اختيار المجموعات أولاً"); return; }

    setLoading(true);
    const newTaskId = `ap-${Date.now()}`;
    try {
      const payload: any = {
        action: "tg-start-auto-publish",
        sessionString,
        groupIds: selectedGroups.map(g => g.id),
        message: message.trim(),
        intervalMinutes: parseFloat(interval) || 1,
        taskId: newTaskId,
        mentionsChannelId: mentionsChannelId || undefined,
        forcedSubscription,
      };
      if (media) {
        payload.mediaBase64 = media.base64;
        payload.mediaFileName = media.fileName;
        payload.mediaMimeType = media.mimeType;
        payload.mediaSendType = media.sendType;
      }
      const result = await invokeCloudFunctionPublic<any>("osn-session", payload);
      if (result.error) throw new Error(result.error.message);
      if (!result.data?.success) throw new Error(result.data?.error || "فشل البدء");

      setTaskId(newTaskId);
      setIsRunning(true);
      localStorage.setItem("tg-autopublish-taskId", newTaskId);
      localStorage.setItem("tg-autopublish-running", "true");
      const mediaForResume = media && media.base64.length <= 600000 ? media : null;
      localStorage.setItem("tg-autopublish-config", JSON.stringify({
        message: message.trim(),
        intervalMinutes: parseFloat(interval) || 1,
        forcedSubscription,
        groupIds: selectedGroups.map(g => g.id),
        mentionsChannelId: mentionsChannelId || null,
        media: mediaForResume,
      }));
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
      localStorage.removeItem("tg-autopublish-taskId");
      localStorage.removeItem("tg-autopublish-running");
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
        <div className="flex gap-2">
          <PremiumEmojiPicker sessionString={sessionString} onEmojiSelect={handlePremiumEmojiSelect} disabled={isRunning} />
        </div>
      </div>

      {/* معاينة الرسالة */}
      <TelegramMessagePreview message={message} />

      {/* المرفقات */}
      <MediaAttachment onMediaChange={setMedia} disabled={isRunning} />

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

      {/* الاشتراك الإجباري */}
      <div className="flex items-center justify-between bg-muted/50 rounded-xl p-4 border border-border">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">الاشتراك الإجباري التلقائي</p>
            <p className="text-xs text-muted-foreground">
              الانضمام تلقائياً للقنوات المطلوبة والخروج بعد 24 ساعة
            </p>
          </div>
        </div>
        <Switch
          checked={forcedSubscription}
          onCheckedChange={setForcedSubscription}
          disabled={isRunning}
        />
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
          <Button onClick={startPublish} disabled={loading || (!message.trim() && !media)} className="gap-2">
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
