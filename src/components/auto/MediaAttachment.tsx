import { useState, useRef } from "react";
import { ImagePlus, X, FileImage, Sticker } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface MediaAttachmentProps {
  onMediaChange: (media: { base64: string; fileName: string; mimeType: string } | null) => void;
  disabled?: boolean;
}

const MediaAttachment = ({ onMediaChange, disabled }: MediaAttachmentProps) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert("الحد الأقصى 10MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      const mimeType = file.type || "application/octet-stream";
      setPreview(reader.result as string);
      setFileName(file.name);
      onMediaChange({ base64, fileName: file.name, mimeType });
    };
    reader.readAsDataURL(file);
  };

  const clearMedia = () => {
    setPreview(null);
    setFileName(null);
    onMediaChange(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2 text-xs">
        <FileImage className="h-3.5 w-3.5 text-primary" />
        مرفق (صورة / ملف / ستيكر)
      </Label>

      {preview ? (
        <div className="relative inline-block">
          {preview.startsWith("data:image") ? (
            <img
              src={preview}
              alt="preview"
              className="h-24 w-24 rounded-xl object-cover border border-border"
            />
          ) : (
            <div className="h-24 w-40 rounded-xl border border-border bg-muted/50 flex items-center justify-center gap-2">
              <Sticker className="h-5 w-5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground truncate max-w-[80px]">{fileName}</span>
            </div>
          )}
          <button
            onClick={clearMedia}
            disabled={disabled}
            className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="gap-2 text-xs"
        >
          <ImagePlus className="h-4 w-4" />
          إرفاق صورة أو ملف
        </Button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,.webp,.tgs,.webm"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
};

export default MediaAttachment;
