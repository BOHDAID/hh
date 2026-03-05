import { useState, useEffect } from "react";
import { Sparkles, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { invokeCloudFunctionPublic } from "@/lib/cloudFunctions";

interface PremiumEmoji {
  documentId: string;
  accessHash: string;
  emoticon: string; // fallback emoji
  stickerSetTitle: string;
}

interface PremiumEmojiPickerProps {
  sessionString: string;
  onEmojiSelect: (emoji: PremiumEmoji) => void;
  disabled?: boolean;
}

const PremiumEmojiPicker = ({ sessionString, onEmojiSelect, disabled }: PremiumEmojiPickerProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emojis, setEmojis] = useState<PremiumEmoji[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loaded, setLoaded] = useState(false);

  const fetchPremiumEmojis = async () => {
    if (loaded && emojis.length > 0) return;
    setLoading(true);
    try {
      const result = await invokeCloudFunctionPublic<any>("osn-session", {
        action: "tg-get-premium-emojis",
        sessionString,
      });
      if (result.error) throw new Error(result.error.message);
      if (!result.data?.success) throw new Error(result.data?.error || "فشل جلب الإيموجي");
      setEmojis(result.data.emojis || []);
      setLoaded(true);
      if ((result.data.emojis || []).length === 0) {
        toast.info("لا توجد إيموجي بريميوم في حسابك");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && !loaded) {
      fetchPremiumEmojis();
    }
  }, [open]);

  const filteredEmojis = searchQuery
    ? emojis.filter(
        (e) =>
          e.emoticon.includes(searchQuery) ||
          e.stickerSetTitle.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : emojis;

  // Group by sticker set
  const grouped = filteredEmojis.reduce<Record<string, PremiumEmoji[]>>((acc, emoji) => {
    const key = emoji.stickerSetTitle || "أخرى";
    if (!acc[key]) acc[key] = [];
    acc[key].push(emoji);
    return acc;
  }, {});

  const handleSelect = (emoji: PremiumEmoji) => {
    onEmojiSelect(emoji);
    toast.success(`تم إضافة إيموجي بريميوم: ${emoji.emoticon}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="gap-2 text-xs"
        >
          <Sparkles className="h-4 w-4 text-yellow-500" />
          إيموجي بريميوم
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-yellow-500" />
            إيموجي بريميوم
          </DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ابحث عن إيموجي..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-9"
            dir="rtl"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute left-3 top-1/2 -translate-y-1/2"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">جاري جلب الإيموجي البريميوم...</p>
          </div>
        ) : emojis.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Sparkles className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">لا توجد إيموجي بريميوم</p>
            <p className="text-xs text-muted-foreground">يحتاج حسابك اشتراك Telegram Premium</p>
            <Button variant="outline" size="sm" onClick={fetchPremiumEmojis}>
              إعادة المحاولة
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-1">
            <div className="space-y-4">
              {Object.entries(grouped).map(([setTitle, setEmojis]) => (
                <div key={setTitle}>
                  <p className="text-xs font-medium text-muted-foreground mb-2 sticky top-0 bg-background py-1 z-10">
                    {setTitle}
                  </p>
                  <div className="grid grid-cols-6 gap-1.5">
                    {setEmojis.map((emoji) => (
                      <button
                        key={emoji.documentId}
                        onClick={() => handleSelect(emoji)}
                        className="h-11 w-11 rounded-lg flex items-center justify-center text-xl hover:bg-muted/80 active:scale-90 transition-all border border-transparent hover:border-border"
                        title={`${emoji.emoticon} — ${emoji.stickerSetTitle}`}
                      >
                        {emoji.emoticon}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {filteredEmojis.length === 0 && searchQuery && (
                <p className="text-center text-sm text-muted-foreground py-8">
                  لا توجد نتائج لـ "{searchQuery}"
                </p>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PremiumEmojiPicker;
