import { useState } from "react";
import { MessageCircleReply, Loader2, Play, Square, Activity, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { invokeCloudFunctionPublic } from "@/lib/cloudFunctions";
import MediaAttachment from "./MediaAttachment";
import TelegramMessagePreview from "./TelegramMessagePreview";
import PremiumEmojiPicker from "./PremiumEmojiPicker";

interface AutoReplyPanelProps {
  sessionString: string;
  mentionsChannelId?: string | null;
}

const AutoReplyPanel = ({ sessionString, mentionsChannelId }: AutoReplyPanelProps) => {
  const [replyMessage, setReplyMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [repliedCount, setRepliedCount] = useState(0);
  const [media, setMedia] = useState<{ base64: string; fileName: string; mimeType: string } | null>(null);

  const startAutoReply = async () => {
    if (!replyMessage.trim() && !media) {
      toast.error("يرجى كتابة رسالة أو إرفاق ملف");
      return;
    }
    setLoading(true);
    const newTaskId = `ar-${Date.now()}`;
    try {
      const payload: any = {
        action: "tg-start-auto-reply",
        sessionString,
        replyMessage: replyMessage.trim(),
        taskId: newTaskId,
        mentionsChannelId: mentionsChannelId || undefined,
      };
      if (media) {
        payload.mediaBase64 = media.base64;
        payload.mediaFileName = media.fileName;
        payload.mediaMimeType = media.mimeType;
      }
      const result = await invokeCloudFunctionPublic<any>("osn-session", payload);
      if (result.error) throw new Error(result.error.message);
      if (!result.data?.success) throw new Error(result.data?.error || "فشل البدء");

      setTaskId(newTaskId);
      setIsRunning(true);
      setRepliedCount(0);
      toast.success("تم بدء الرد التلقائي في الخاص!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const stopAutoReply = async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const result = await invokeCloudFunctionPublic<any>("osn-session", {
        action: "tg-stop-auto-reply",
        taskId,
      });
      if (result.error) throw new Error(result.error.message);
      setIsRunning(false);
      setTaskId(null);
      toast.success(result.data?.message || "تم إيقاف الرد التلقائي");
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
        action: "tg-auto-reply-status",
        taskId,
      });
      if (result.data?.success) {
        setRepliedCount(result.data.repliedCount || 0);
      }
    } catch {}
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* الشرح */}
      <div className="bg-muted/50 rounded-xl p-4 border border-border space-y-2">
        <div className="flex items-center gap-2">
          <MessageCircleReply className="h-5 w-5 text-primary" />
          <p className="text-sm font-medium text-foreground">الرد التلقائي في الخاص</p>
        </div>
        <p className="text-xs text-muted-foreground">
          يرد تلقائياً على أي شخص يراسلك في الخاص <strong>لأول مرة فقط</strong>. يدعم النصوص والصور والإيموجي البريميوم ✨
        </p>
      </div>

      {/* رسالة الرد */}
      <div className="space-y-2">
        <Label>رسالة الرد التلقائي</Label>
        <Textarea
          placeholder="مرحباً! شكراً لتواصلك، سأرد عليك في أقرب وقت... ✨"
          value={replyMessage}
          onChange={(e) => setReplyMessage(e.target.value)}
          className="min-h-[120px]"
          disabled={isRunning}
        />
      </div>

      {/* معاينة الرسالة */}
      <TelegramMessagePreview message={replyMessage} />

      {/* المرفقات */}
      <MediaAttachment onMediaChange={setMedia} disabled={isRunning} />

      {/* حالة الرد */}
      {isRunning && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-medium text-green-700 dark:text-green-300">الرد التلقائي يعمل</span>
            </div>
            <Button variant="ghost" size="sm" onClick={checkStatus} className="gap-1 text-xs h-7">
              <Activity className="h-3 w-3" />
              تحديث
            </Button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span>تم الرد على <strong className="text-foreground">{repliedCount}</strong> شخص</span>
          </div>
        </div>
      )}

      {/* الأزرار */}
      <div className="flex gap-3">
        {!isRunning ? (
          <Button onClick={startAutoReply} disabled={loading || (!replyMessage.trim() && !media)} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            بدء الرد التلقائي
          </Button>
        ) : (
          <Button variant="destructive" onClick={stopAutoReply} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
            إيقاف
          </Button>
        )}
      </div>
    </div>
  );
};

export default AutoReplyPanel;
