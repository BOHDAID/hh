import { Eye, Sparkles, Image, Sticker, Bold, Italic, Strikethrough, Code, SmilePlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface TelegramMessagePreviewProps {
  message: string;
}

const features = [
  { icon: Sparkles, label: "إيموجي بريميوم", color: "text-yellow-500" },
  { icon: Image, label: "صور ومرفقات", color: "text-blue-500" },
  { icon: Sticker, label: "ستيكرات", color: "text-pink-500" },
  { icon: SmilePlus, label: "ردود فعل", color: "text-orange-500" },
  { icon: Bold, label: "عريض", color: "text-foreground" },
  { icon: Italic, label: "مائل", color: "text-foreground" },
  { icon: Strikethrough, label: "يتوسطه خط", color: "text-foreground" },
  { icon: Code, label: "كود", color: "text-foreground" },
];

const TelegramMessagePreview = ({ message }: TelegramMessagePreviewProps) => {
  const formatTelegramText = (text: string): string => {
    if (!text.trim()) return '<span class="text-muted-foreground italic text-xs">اكتب رسالة لمعاينتها...</span>';
    
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<em>$1</em>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      .replace(/`(.+?)`/g, '<code class="bg-muted px-1 rounded text-xs font-mono">$1</code>')
      .replace(/\n/g, "<br/>");
    
    return html;
  };

  return (
    <div className="space-y-3">
      {/* المميزات المدعومة */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">⚡ المميزات المدعومة:</p>
        <div className="flex flex-wrap gap-1.5">
          {features.map((f) => (
            <Badge
              key={f.label}
              variant="outline"
              className="gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-muted/50 border-border hover:bg-muted transition-colors"
            >
              <f.icon className={`h-3 w-3 ${f.color}`} />
              {f.label}
            </Badge>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="bg-muted/30 rounded-xl border border-border overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/50">
          <Eye className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-foreground">معاينة الرسالة في تليجرام</span>
        </div>
        <div className="p-4">
          <div className="bg-primary/10 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%] inline-block">
            <div
              className="text-sm text-foreground leading-relaxed break-words whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: formatTelegramText(message) }}
            />
          </div>
        </div>
      </div>

      {/* طريقة التنسيق */}
      <div className="bg-muted/30 rounded-xl border border-border p-3 space-y-2">
        <p className="text-xs font-medium text-foreground mb-2">📝 طريقة التنسيق:</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[10px]">**نص**</code>
            <span className="text-muted-foreground">← <strong>عريض</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[10px]">__نص__</code>
            <span className="text-muted-foreground">← <em>مائل</em></span>
          </div>
          <div className="flex items-center gap-2">
            <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[10px]">~~نص~~</code>
            <span className="text-muted-foreground">← <del>يتوسطه خط</del></span>
          </div>
          <div className="flex items-center gap-2">
            <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[10px]">`نص`</code>
            <span className="text-muted-foreground">← <code>كود</code></span>
          </div>
        </div>
        <div className="border-t border-border pt-2 mt-2">
          <p className="text-xs font-medium text-foreground mb-1">✨ إيموجي بريميوم:</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            انسخ الإيموجي البريميوم من تليجرام (📱 اضغط مطولاً على الإيموجي ← نسخ) والصقه هنا مباشرة.
          </p>
        </div>
      </div>
    </div>
  );
};

export default TelegramMessagePreview;
