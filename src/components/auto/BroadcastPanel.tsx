import { useState } from "react";
import { MessageSquare, Loader2, Search, User, Ban, Check, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { invokeCloudFunctionPublic } from "@/lib/cloudFunctions";

interface Contact {
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
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [blacklist, setBlacklist] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<any>(null);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const res = await invokeCloudFunctionPublic<any>("osn-session", {
        action: "tg-fetch-contacts",
        sessionString,
      });
      if (res.error) throw new Error(res.error.message);
      if (!res.data?.success) throw new Error(res.data?.error || "فشل الجلب");
      setContacts(res.data.contacts || []);
      setFetched(true);
      toast.success(`تم جلب ${res.data.contacts?.length || 0} جهة اتصال`);
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
    if (!message.trim()) { toast.error("يرجى كتابة الرسالة"); return; }
    setSending(true);
    setResult(null);
    try {
      const res = await invokeCloudFunctionPublic<any>("osn-session", {
        action: "tg-broadcast",
        sessionString,
        message: message.trim(),
        blacklistIds: Array.from(blacklist),
        taskId: `bc-${Date.now()}`,
      });
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

  const filtered = contacts.filter(c => {
    const name = `${c.firstName} ${c.lastName}`.toLowerCase();
    return name.includes(search.toLowerCase()) ||
      (c.username && c.username.toLowerCase().includes(search.toLowerCase()));
  });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const pageContacts = filtered.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  if (!fetched) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <MessageSquare className="h-12 w-12 text-muted-foreground/50" />
        <p className="text-muted-foreground text-sm">اضغط لجلب جميع جهات الاتصال</p>
        <Button onClick={fetchContacts} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <User className="h-4 w-4" />}
          جلب جهات الاتصال
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
          placeholder="اكتب الرسالة التي ستُرسل لجميع جهات الاتصال..."
          value={message}
          onChange={e => setMessage(e.target.value)}
          className="min-h-[100px]"
        />
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
          <Button variant="outline" size="sm" onClick={fetchContacts} disabled={loading} className="gap-1 text-xs">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            تحديث
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث في جهات الاتصال..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pr-9"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          حدد الأشخاص الذين لن تصلهم الرسالة
        </p>

        <div className="space-y-2">
          {pageContacts.map(contact => (
            <div
              key={contact.id}
              onClick={() => toggleBlacklist(contact.id)}
              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                blacklist.has(contact.id)
                  ? "border-destructive/50 bg-destructive/5"
                  : "border-border bg-card hover:bg-muted/50"
              }`}
            >
              <Checkbox checked={blacklist.has(contact.id)} />
              <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                {contact.photo ? (
                  <img src={contact.photo} alt="" className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <User className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground truncate">
                  {contact.firstName} {contact.lastName}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {contact.username && <span dir="ltr">@{contact.username}</span>}
                  {contact.phone && <span dir="ltr">+{contact.phone}</span>}
                </div>
              </div>
              {blacklist.has(contact.id) && (
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
          بث الرسالة ({contacts.length - blacklist.size} شخص)
        </Button>
      </div>
    </div>
  );
};

export default BroadcastPanel;
