import { useState, useEffect } from "react";
import { AtSign, Loader2, Play, Square, Hash, ExternalLink, User, Clock, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { invokeCloudFunction, invokeCloudFunctionPublic } from "@/lib/cloudFunctions";
import { getAuthClient } from "@/lib/supabaseClient";

interface Channel {
  id: string;
  title: string;
  username: string | null;
  photo: string | null;
}

interface MentionEvent {
  fromUser: { id: string; firstName: string; lastName: string; username: string | null };
  groupTitle: string;
  groupId: string;
  message: string;
  messageLink: string | null;
  date: string;
}

interface MentionsMonitorPanelProps {
  sessionString: string;
  savedChannelId?: string | null;
  onChannelSave?: (channelId: string | null) => void;
}

const MentionsMonitorPanel = ({ sessionString, savedChannelId, onChannelSave }: MentionsMonitorPanelProps) => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(savedChannelId || null);
  const [monitoring, setMonitoring] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [mentions, setMentions] = useState<MentionEvent[]>([]);
  const [taskId] = useState(`mentions-${Date.now()}`);
  const [fetched, setFetched] = useState(false);

  // Pre-select saved channel
  useEffect(() => {
    if (savedChannelId) setSelectedChannelId(savedChannelId);
  }, [savedChannelId]);

  const callAccountAction = async (action: string, extra: Record<string, unknown> = {}) => {
    const authClient = getAuthClient();
    const { data: { session } } = await authClient.auth.getSession();
    if (!session?.access_token) return;
    await invokeCloudFunction<any>("osn-session", { action, ...extra }, session.access_token);
  };

  const saveChannelToAccount = async (channelId: string | null) => {
    try {
      await callAccountAction("tg-save-mentions-channel", { mentionsChannelId: channelId });
    } catch {}
  };

  const fetchChannels = async () => {
    setLoadingChannels(true);
    try {
      const res = await invokeCloudFunctionPublic<any>("osn-session", {
        action: "tg-fetch-channels",
        sessionString,
      });
      if (res.error) throw new Error(res.error.message);
      if (!res.data?.success) throw new Error(res.data?.error || "فشل جلب القنوات");
      const fetchedChannels = res.data.channels || [];
      setChannels(fetchedChannels);
      setFetched(true);

      // إذا كانت هناك قناة محفوظة، حددها تلقائياً
      if (savedChannelId && fetchedChannels.some((c: Channel) => c.id === savedChannelId)) {
        setSelectedChannelId(savedChannelId);
      } else if (fetchedChannels.length === 1) {
        // إذا قناة واحدة فقط (ربما أنشئت تلقائياً)، حددها
        setSelectedChannelId(fetchedChannels[0].id);
        saveChannelToAccount(fetchedChannels[0].id);
      }

      toast.success(`تم جلب ${fetchedChannels.length} قناة`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoadingChannels(false);
    }
  };

  const handleSelectChannel = (channelId: string) => {
    if (monitoring) return;
    setSelectedChannelId(channelId);
    saveChannelToAccount(channelId);
  };

  const startMonitoring = async () => {
    if (!selectedChannelId) {
      toast.error("يرجى اختيار قناة أولاً");
      return;
    }
    setStarting(true);
    try {
      const res = await invokeCloudFunctionPublic<any>("osn-session", {
        action: "tg-start-mentions-monitor",
        sessionString,
        channelId: selectedChannelId,
        taskId,
      });
      if (res.error) throw new Error(res.error.message);
      if (!res.data?.success) throw new Error(res.data?.error || "فشل بدء المراقبة");
      setMonitoring(true);
      toast.success("تم بدء مراقبة المنشنات والردود!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setStarting(false);
    }
  };

  const stopMonitoring = async () => {
    setStopping(true);
    try {
      const res = await invokeCloudFunctionPublic<any>("osn-session", {
        action: "tg-stop-mentions-monitor",
        taskId,
      });
      if (res.error) throw new Error(res.error.message);
      setMonitoring(false);
      toast.success("تم إيقاف المراقبة");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setStopping(false);
    }
  };

  // Poll for new mentions while monitoring
  useEffect(() => {
    if (!monitoring) return;
    const interval = setInterval(async () => {
      try {
        const res = await invokeCloudFunctionPublic<any>("osn-session", {
          action: "tg-get-mentions",
          taskId,
        });
        if (res.data?.success && res.data.mentions?.length) {
          setMentions(prev => {
            const existingKeys = new Set(prev.map(m => m.date + m.message));
            const newOnes = res.data.mentions.filter((m: MentionEvent) => !existingKeys.has(m.date + m.message));
            return [...newOnes, ...prev].slice(0, 100);
          });
        }
      } catch {}
    }, 10000);
    return () => clearInterval(interval);
  }, [monitoring, taskId]);

  if (!fetched) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <AtSign className="h-12 w-12 text-muted-foreground/50" />
        <div className="text-center space-y-1">
          <p className="text-muted-foreground text-sm">مراقبة المنشنات والردود في المجموعات</p>
          <p className="text-muted-foreground/60 text-xs">سيتم إرسال إشعار للقناة المختارة عند أي منشن أو رد</p>
          <p className="text-muted-foreground/60 text-xs">إذا لم تكن لديك قناة، سيتم إنشاء واحدة تلقائياً</p>
        </div>
        <Button onClick={fetchChannels} disabled={loadingChannels} className="gap-2">
          {loadingChannels ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hash className="h-4 w-4" />}
          جلب القنوات
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* اختيار القناة */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-primary" />
            اختر القناة لإرسال الإشعارات
          </Label>
          <Button variant="outline" size="sm" onClick={fetchChannels} disabled={loadingChannels} className="gap-1 text-xs">
            {loadingChannels ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            تحديث
          </Button>
        </div>

        {channels.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            لا توجد قنوات. جرب تحديث القائمة.
          </div>
        ) : (
          <div className="grid gap-2">
            {channels.map(ch => (
              <div
                key={ch.id}
                onClick={() => handleSelectChannel(ch.id)}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  selectedChannelId === ch.id
                    ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                    : "border-border bg-card hover:bg-muted/50"
                } ${monitoring ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                  {ch.photo ? (
                    <img src={ch.photo} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <Hash className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">{ch.title}</p>
                  {ch.username && (
                    <span className="text-xs text-muted-foreground" dir="ltr">@{ch.username}</span>
                  )}
                </div>
                {selectedChannelId === ch.id && (
                  <div className="h-3 w-3 rounded-full bg-primary shrink-0" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* زر البدء/الإيقاف */}
      <div className="flex items-center gap-3 pt-2 border-t border-border">
        {!monitoring ? (
          <Button
            onClick={startMonitoring}
            disabled={starting || !selectedChannelId}
            className="gap-2"
          >
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            بدء المراقبة
          </Button>
        ) : (
          <Button
            onClick={stopMonitoring}
            disabled={stopping}
            variant="destructive"
            className="gap-2"
          >
            {stopping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
            إيقاف المراقبة
          </Button>
        )}
        {monitoring && (
          <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            جاري المراقبة...
          </span>
        )}
      </div>

      {/* قائمة المنشنات */}
      {mentions.length > 0 && (
        <div className="space-y-3">
          <Label className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            آخر المنشنات ({mentions.length})
          </Label>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {mentions.map((m, i) => (
              <div key={i} className="p-3 rounded-xl border border-border bg-card space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">
                      {m.fromUser.firstName} {m.fromUser.lastName}
                    </span>
                    {m.fromUser.username && (
                      <span className="text-xs text-muted-foreground" dir="ltr">@{m.fromUser.username}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {new Date(m.date).toLocaleString("ar")}
                  </div>
                </div>
                <p className="text-sm text-foreground/80 bg-muted/50 rounded-lg p-2">{m.message}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>في: {m.groupTitle}</span>
                  {m.messageLink && (
                    <a
                      href={m.messageLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      رابط الرسالة
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MentionsMonitorPanel;
