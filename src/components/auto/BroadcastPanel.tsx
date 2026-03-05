import { useState } from "react";
import { MessageSquare, Loader2, Search, User, Ban, Check, Send, Users, Contact } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { invokeCloudFunctionPublic } from "@/lib/cloudFunctions";
import MediaAttachment from "./MediaAttachment";

const AVATAR_COLORS = [
  "bg-red-500/20 text-red-600 dark:text-red-400",
  "bg-blue-500/20 text-blue-600 dark:text-blue-400",
  "bg-green-500/20 text-green-600 dark:text-green-400",
  "bg-purple-500/20 text-purple-600 dark:text-purple-400",
  "bg-orange-500/20 text-orange-600 dark:text-orange-400",
  "bg-pink-500/20 text-pink-600 dark:text-pink-400",
  "bg-teal-500/20 text-teal-600 dark:text-teal-400",
  "bg-indigo-500/20 text-indigo-600 dark:text-indigo-400",
];

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

const getAvatarColor = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash) + id.charCodeAt(i);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

interface Person {
  id: string;
  firstName: string;
  lastName: string;
  username: string | null;
  phone: string | null;
  photo: string | null;
}

interface BroadcastPanelProps {
  sessionString: string;
}

const ITEMS_PER_PAGE = 10;

const BroadcastPanel = ({ sessionString }: BroadcastPanelProps) => {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [blacklist, setBlacklist] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [includeContacts, setIncludeContacts] = useState(false);
  const [media, setMedia] = useState<{ base64: string; fileName: string; mimeType: string } | null>(null);

  const fetchDialogs = async () => {
    setLoading(true);
    try {
      const res = await invokeCloudFunctionPublic<any>("osn-session", {
        action: "tg-fetch-dialogs",
        sessionString,
      });
      if (res.error) throw new Error(res.error.message);
      if (!res.data?.success) throw new Error(res.data?.error || "فشل الجلب");
      setPeople(res.data.users || []);
      setFetched(true);
      toast.success(`تم جلب ${res.data.users?.length || 0} شخص من المحادثات`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleBlacklist = (id: string) => {
    setBlacklist(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sendBroadcast = async () => {
    if (!message.trim() && !media) { toast.error("يرجى كتابة رسالة أو إرفاق ملف"); return; }
    setSending(true);
    setResult(null);
    try {
      const payload: any = {
        action: "tg-broadcast",
        sessionString,
        message: message.trim(),
        blacklistIds: Array.from(blacklist),
        includeContacts,
        taskId: `bc-${Date.now()}`,
      };
      if (media) {
        payload.mediaBase64 = media.base64;
        payload.mediaFileName = media.fileName;
        payload.mediaMimeType = media.mimeType;
      }
      const res = await invokeCloudFunctionPublic<any>("osn-session", payload);
      if (res.error) throw new Error(res.error.message);
      if (!res.data?.success) throw new Error(res.data?.error || "فشل البث");
      setResult(res.data);
      toast.success(res.data.message || "تم البث!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  const filtered = people.filter(c => {
    const name = `${c.firstName} ${c.lastName}`.toLowerCase();
    return name.includes(search.toLowerCase()) ||
      (c.username && c.username.toLowerCase().includes(search.toLowerCase()));
  });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const pagePeople = filtered.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  if (!fetched) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <MessageSquare className="h-12 w-12 text-muted-foreground/50" />
        <div className="text-center space-y-1">
          <p className="text-muted-foreground text-sm">جلب الأشخاص الذين راسلوك</p>
          <p className="text-muted-foreground/60 text-xs">سيتم جلب المحادثات الخاصة فقط</p>
        </div>
        <Button onClick={fetchDialogs} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
          جلب المحادثات
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* الرسالة */}
      <div className="space-y-2 max-w-2xl">
        <Label>رسالة البث</Label>
        <Textarea
          placeholder="اكتب الرسالة... (يدعم إيموجي بريميوم ✨)"
          value={message}
          onChange={e => setMessage(e.target.value)}
          className="min-h-[100px]"
        />
        <MediaAttachment onMediaChange={setMedia} disabled={sending} />
        />
      </div>

      {/* خيار تضمين جهات الاتصال */}
      <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card max-w-2xl">
        <Switch
          checked={includeContacts}
          onCheckedChange={setIncludeContacts}
        />
        <div className="flex-1">
          <Label className="text-sm font-medium flex items-center gap-2 cursor-pointer">
            <Contact className="h-4 w-4 text-primary" />
            تضمين جهات الاتصال أيضاً
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            إرسال الرسالة لجهات الاتصال بالإضافة للأشخاص الذين راسلوك
          </p>
        </div>
      </div>

      {/* نتيجة البث */}
      {result && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 max-w-2xl">
          <div className="flex items-center gap-2 mb-2">
            <Check className="h-4 w-4 text-green-500" />
            <span className="text-sm font-medium text-green-700 dark:text-green-300">{result.message}</span>
          </div>
          {result.failedCount > 0 && (
            <p className="text-xs text-muted-foreground">فشل {result.failedCount} رسالة</p>
          )}
        </div>
      )}

      {/* Blacklist */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            <Ban className="h-4 w-4 text-destructive" />
            القائمة السوداء ({blacklist.size})
          </Label>
          <Button variant="outline" size="sm" onClick={fetchDialogs} disabled={loading} className="gap-1 text-xs">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            تحديث
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث في الأشخاص..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pr-9"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          حدد الأشخاص الذين لن تصلهم الرسالة
        </p>

        <div className="space-y-2">
          {pagePeople.map(person => (
            <div
              key={person.id}
              onClick={() => toggleBlacklist(person.id)}
              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                blacklist.has(person.id)
                  ? "border-destructive/50 bg-destructive/5"
                  : "border-border bg-card hover:bg-muted/50"
              }`}
            >
              <Checkbox checked={blacklist.has(person.id)} />
              <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 overflow-hidden ${person.photo ? '' : getAvatarColor(person.id)}`}>
                {person.photo ? (
                  <img src={person.photo} alt="" className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <span className="text-xs font-bold">{getInitials(`${person.firstName} ${person.lastName}`)}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground truncate">
                  {person.firstName} {person.lastName}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {person.username && <span dir="ltr">@{person.username}</span>}
                  {person.phone && <span dir="ltr">+{person.phone}</span>}
                </div>
              </div>
              {blacklist.has(person.id) && (
                <Ban className="h-4 w-4 text-destructive shrink-0" />
              )}
            </div>
          ))}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 0}>
              السابق
            </Button>
            <span className="text-xs text-muted-foreground">{page + 1} / {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>
              التالي
            </Button>
          </div>
        )}
      </div>

      {/* زر البث */}
      <div className="pt-2 border-t border-border max-w-2xl">
        <Button onClick={sendBroadcast} disabled={sending || !message.trim()} className="gap-2">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          بث الرسالة ({people.length - blacklist.size} شخص{includeContacts ? " + جهات الاتصال" : ""})
        </Button>
      </div>
    </div>
  );
};

export default BroadcastPanel;
