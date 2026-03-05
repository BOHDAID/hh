import { useState } from "react";
import { Users, Loader2, RefreshCw, Check, Search, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { invokeCloudFunctionPublic } from "@/lib/cloudFunctions";

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
  const [editMode, setEditMode] = useState(false);

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
      setEditMode(true);
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
    const allGroups = fetched ? groups : selectedGroups;
    const savedGroups = allGroups.filter(g => selected.has(g.id));
    onSave(savedGroups);
    setEditMode(false);
    toast.success(`تم حفظ ${savedGroups.length} مجموعة`);
  };

  const removeGroup = (id: string) => {
    const updated = selectedGroups.filter(g => g.id !== id);
    setSelected(new Set(updated.map(g => g.id)));
    onSave(updated);
  };

  // Show saved groups view
  if (!editMode && selectedGroups.length > 0 && !fetched) {
    const savedSearch = search.toLowerCase();
    const filteredSaved = selectedGroups.filter(g =>
      g.title.toLowerCase().includes(savedSearch) ||
      (g.username && g.username.toLowerCase().includes(savedSearch))
    );

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-foreground">المجموعات المحفوظة ({selectedGroups.length})</h3>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setEditMode(true); fetchGroups(); }} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
              تعديل
            </Button>
          </div>
        </div>

        {selectedGroups.length > 5 && (
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث في المجموعات المحفوظة..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pr-9"
            />
          </div>
        )}

        <div className="space-y-2">
          {filteredSaved.map(group => (
            <div
              key={group.id}
              className="flex items-center gap-3 p-3 rounded-xl border border-primary/20 bg-primary/5 transition-all"
            >
              <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 overflow-hidden ${group.photo ? '' : getAvatarColor(group.id)}`}>
                {group.photo ? (
                  <img src={group.photo} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <span className="text-sm font-bold">{getInitials(group.title)}</span>
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
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => removeGroup(group.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Show fetch button if no saved groups and not fetched
  if (!fetched && selectedGroups.length === 0) {
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

  // Edit mode / fetched groups list
  const filtered = groups.filter(g =>
    g.title.toLowerCase().includes(search.toLowerCase()) ||
    (g.username && g.username.toLowerCase().includes(search.toLowerCase()))
  );

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const pageGroups = filtered.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

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
        {selectedGroups.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => { setEditMode(false); setFetched(false); setSearch(""); }}>
            إلغاء
          </Button>
        )}
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
             <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 overflow-hidden ${group.photo ? '' : getAvatarColor(group.id)}`}>
               {group.photo ? (
                 <img src={group.photo} alt="" className="h-10 w-10 rounded-full object-cover" />
               ) : (
                 <span className="text-sm font-bold">{getInitials(group.title)}</span>
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
