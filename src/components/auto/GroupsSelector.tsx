import { useState } from "react";
import { Users, Loader2, RefreshCw, Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { invokeCloudFunctionPublic } from "@/lib/cloudFunctions";

interface TelegramGroup {
  id: string;
  title: string;
  username: string | null;
  participantsCount: number;
  photo: string | null;
  type: "channel" | "supergroup" | "group";
}

interface GroupsSelectorProps {
  sessionString: string;
  selectedGroups: TelegramGroup[];
  onSave: (groups: TelegramGroup[]) => void;
}

const ITEMS_PER_PAGE = 10;

const GroupsSelector = ({ sessionString, selectedGroups, onSave }: GroupsSelectorProps) => {
  const [groups, setGroups] = useState<TelegramGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedGroups.map(g => g.id)));
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const result = await invokeCloudFunctionPublic<any>("osn-session", {
        action: "tg-fetch-groups",
        sessionString,
      });
      if (result.error) throw new Error(result.error.message);
      if (!result.data?.success) throw new Error(result.data?.error || "فشل الجلب");
      setGroups(result.data.groups || []);
      setFetched(true);
      toast.success(`تم جلب ${result.data.groups?.length || 0} مجموعة`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleGroup = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(g => g.id)));
    }
  };

  const handleSave = () => {
    const savedGroups = groups.filter(g => selected.has(g.id));
    onSave(savedGroups);
    toast.success(`تم حفظ ${savedGroups.length} مجموعة`);
  };

  const filtered = groups.filter(g =>
    g.title.toLowerCase().includes(search.toLowerCase()) ||
    (g.username && g.username.toLowerCase().includes(search.toLowerCase()))
  );

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const pageGroups = filtered.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  if (!fetched) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <Users className="h-12 w-12 text-muted-foreground/50" />
        <p className="text-muted-foreground text-sm">اضغط لجلب جميع المجموعات والقنوات</p>
        <Button onClick={fetchGroups} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
          جلب المجموعات
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* شريط البحث والتحديث */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث في المجموعات..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pr-9"
          />
        </div>
        <Button variant="outline" size="icon" onClick={fetchGroups} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      {/* معلومات */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{filtered.length} مجموعة | {selected.size} مختارة</span>
        <button onClick={toggleAll} className="text-primary hover:underline text-xs">
          {selected.size === filtered.length ? "إلغاء الكل" : "تحديد الكل"}
        </button>
      </div>

      {/* القائمة */}
      <div className="space-y-2">
        {pageGroups.map(group => (
          <div
            key={group.id}
            onClick={() => toggleGroup(group.id)}
            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
              selected.has(group.id)
                ? "border-primary bg-primary/5"
                : "border-border bg-card hover:bg-muted/50"
            }`}
          >
            <Checkbox checked={selected.has(group.id)} />
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
              {group.photo ? (
                <img src={group.photo} alt="" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <Users className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-foreground truncate">{group.title}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {group.username && <span dir="ltr">@{group.username}</span>}
                <span className="bg-muted px-1.5 py-0.5 rounded text-[10px]">
                  {group.type === "channel" ? "قناة" : group.type === "supergroup" ? "مجموعة كبيرة" : "مجموعة"}
                </span>
                {group.participantsCount > 0 && <span>{group.participantsCount} عضو</span>}
              </div>
            </div>
            {selected.has(group.id) && <Check className="h-4 w-4 text-primary shrink-0" />}
          </div>
        ))}
      </div>

      {/* الصفحات */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 0}>
            السابق
          </Button>
          <span className="text-xs text-muted-foreground">
            {page + 1} / {totalPages}
          </span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>
            التالي
          </Button>
        </div>
      )}

      {/* حفظ */}
      <div className="pt-2 border-t border-border">
        <Button onClick={handleSave} disabled={selected.size === 0} className="gap-2">
          <Check className="h-4 w-4" />
          حفظ ({selected.size} مجموعة)
        </Button>
      </div>
    </div>
  );
};

export default GroupsSelector;
