import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db, getAuthClient, isExternalConfigured } from "@/lib/supabaseClient";
import { invokeCloudFunction } from "@/lib/cloudFunctions";
import { toast } from "@/hooks/use-toast";
import { Upload, Loader2, X, Image as ImageIcon, Wand2, Package } from "lucide-react";

const BOX_FRAME_URL = "https://wueacwqzafxsvowlqbwh.supabase.co/storage/v1/object/public/product-images/box-frame-template.png";

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
  bucket?: string;
  label?: string;
  placeholder?: string;
  removeBackground?: boolean;
  showMergeBox?: boolean;
}

const ImageUpload = ({
  value,
  onChange,
  bucket = "product-images",
  label = "الصورة",
  placeholder = "اختر صورة أو أدخل رابط",
  removeBackground = false,
  showMergeBox = false,
}: ImageUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const [processingBg, setProcessingBg] = useState(false);
  const [mergingBox, setMergingBox] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upscale and enhance image to 4K quality
  const enhance4KImage = async (file: File): Promise<File> => {
    const imageUrl = URL.createObjectURL(file);

    try {
      // Load image
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("فشل تحميل الصورة"));
        image.src = imageUrl;
      });

      // 4K target dimensions
      const TARGET_4K_WIDTH = 3840;
      const TARGET_4K_HEIGHT = 2160;

      // Calculate new dimensions - ALWAYS upscale to 4K if smaller
      let newWidth = img.naturalWidth;
      let newHeight = img.naturalHeight;
      const aspectRatio = newWidth / newHeight;

      // Upscale small images to 4K
      if (newWidth < TARGET_4K_WIDTH && newHeight < TARGET_4K_HEIGHT) {
        if (aspectRatio > TARGET_4K_WIDTH / TARGET_4K_HEIGHT) {
          newWidth = TARGET_4K_WIDTH;
          newHeight = Math.round(TARGET_4K_WIDTH / aspectRatio);
        } else {
          newHeight = TARGET_4K_HEIGHT;
          newWidth = Math.round(TARGET_4K_HEIGHT * aspectRatio);
        }
      }
      // Limit max size if larger than 4K
      else if (newWidth > TARGET_4K_WIDTH) {
        newWidth = TARGET_4K_WIDTH;
        newHeight = Math.round(TARGET_4K_WIDTH / aspectRatio);
      } else if (newHeight > TARGET_4K_HEIGHT) {
        newHeight = TARGET_4K_HEIGHT;
        newWidth = Math.round(TARGET_4K_HEIGHT * aspectRatio);
      }

      // Step 1: Create intermediate canvas for multi-step upscaling (better quality)
      const steps = Math.ceil(Math.log2(Math.max(newWidth / img.naturalWidth, newHeight / img.naturalHeight, 1)));
      
      let currentCanvas = document.createElement("canvas");
      let currentWidth = img.naturalWidth;
      let currentHeight = img.naturalHeight;
      currentCanvas.width = currentWidth;
      currentCanvas.height = currentHeight;
      
      let ctx = currentCanvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0);

      // Multi-step upscaling for smoother results
      for (let i = 0; i < steps; i++) {
        const nextWidth = Math.min(currentWidth * 2, newWidth);
        const nextHeight = Math.min(currentHeight * 2, newHeight);

        const nextCanvas = document.createElement("canvas");
        nextCanvas.width = nextWidth;
        nextCanvas.height = nextHeight;

        const nextCtx = nextCanvas.getContext("2d")!;
        nextCtx.imageSmoothingEnabled = true;
        nextCtx.imageSmoothingQuality = "high";
        nextCtx.drawImage(currentCanvas, 0, 0, nextWidth, nextHeight);

        currentCanvas = nextCanvas;
        currentWidth = nextWidth;
        currentHeight = nextHeight;
      }

      // Final resize to exact dimensions
      const finalCanvas = document.createElement("canvas");
      finalCanvas.width = newWidth;
      finalCanvas.height = newHeight;

      const finalCtx = finalCanvas.getContext("2d")!;
      finalCtx.imageSmoothingEnabled = true;
      finalCtx.imageSmoothingQuality = "high";
      finalCtx.drawImage(currentCanvas, 0, 0, newWidth, newHeight);

      // Apply subtle sharpening filter for clearer edges
      const imageData = finalCtx.getImageData(0, 0, newWidth, newHeight);
      const sharpenedData = applySharpen(imageData);
      finalCtx.putImageData(sharpenedData, 0, 0);

      // Export as high-quality JPEG (0.98 quality)
      const blob = await new Promise<Blob>((resolve, reject) => {
        finalCanvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("فشل تحويل الصورة"))),
          "image/jpeg",
          0.98
        );
      });

      const enhancedFile = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
        type: "image/jpeg",
        lastModified: Date.now(),
      });

      console.log(`✨ Enhanced: ${img.naturalWidth}x${img.naturalHeight} → ${newWidth}x${newHeight}`);
      return enhancedFile;

    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  };

  // Simple sharpening filter for better clarity
  const applySharpen = (imageData: ImageData): ImageData => {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const result = new Uint8ClampedArray(data);

    // Sharpen kernel
    const kernel = [0, -0.5, 0, -0.5, 3, -0.5, 0, -0.5, 0];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const idx = ((y + ky) * width + (x + kx)) * 4 + c;
              sum += data[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
            }
          }
          result[(y * width + x) * 4 + c] = Math.min(255, Math.max(0, sum));
        }
      }
    }

    return new ImageData(result, width, height);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "خطأ",
        description: "يرجى اختيار ملف صورة فقط",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 10MB before optimization)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "خطأ",
        description: "حجم الصورة يجب أن يكون أقل من 10 ميجابايت",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      // Enhance image to 4K quality
      const optimizedFile = await enhance4KImage(file);

      // Generate unique filename
      const fileExt = optimizedFile.type === "image/png" ? "png" : "jpg";
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = fileName;

      // Upload to Lovable Cloud Storage (has proper RLS policies)
      const { error: uploadError } = await db.storage
        .from(bucket)
        .upload(filePath, optimizedFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: optimizedFile.type,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL from Lovable Cloud
      const { data: { publicUrl } } = db.storage
        .from(bucket)
        .getPublicUrl(filePath);

      // If removeBackground is enabled, process the image
      if (removeBackground) {
        setProcessingBg(true);
        try {
          const processedUrl = await processBackgroundRemoval(publicUrl);
          onChange(processedUrl);
          toast({
            title: "تم الرفع",
            description: "تم رفع الصورة بأعلى جودة وإزالة الخلفية بنجاح",
          });
        } catch (bgError) {
          console.error("Background removal error:", bgError);
          onChange(publicUrl);
          toast({
            title: "تم الرفع",
            description: "تم رفع الصورة بأعلى جودة (إزالة الخلفية غير متاحة)",
          });
        } finally {
          setProcessingBg(false);
        }
      } else {
        onChange(publicUrl);
        toast({
          title: "تم الرفع",
          description: "تم رفع الصورة بأعلى جودة بنجاح ✨",
        });
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "خطأ في الرفع",
        description: error instanceof Error ? error.message : "حدث خطأ أثناء رفع الصورة",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const processBackgroundRemoval = async (imageUrl: string): Promise<string> => {
    const authClient = isExternalConfigured ? getAuthClient() : db;
    const { data: { session } } = await authClient.auth.getSession();
    
    if (!session) {
      throw new Error("يجب تسجيل الدخول");
    }

    const response = await invokeCloudFunction<{ processedImageUrl?: string }>(
      "remove-background",
      { imageUrl },
      session.access_token
    );

    if (response.error) throw response.error;
    return response.data?.processedImageUrl || imageUrl;
  };

  const handleMergeWithBox = async () => {
    if (!value) return;
    setMergingBox(true);
    try {
      const authClient = isExternalConfigured ? getAuthClient() : db;
      const { data: { session } } = await authClient.auth.getSession();
      if (!session) throw new Error("يجب تسجيل الدخول");

      const response = await invokeCloudFunction<{ mergedImageUrl?: string }>(
        "merge-product-image",
        { productImageUrl: value, boxFrameUrl: BOX_FRAME_URL },
        session.access_token
      );

      if (response.error) throw response.error;
      if (response.data?.mergedImageUrl) {
        onChange(response.data.mergedImageUrl);
        toast({ title: "تم الدمج", description: "تم دمج المنتج مع العلبة بنجاح ✨" });
      }
    } catch (error) {
      console.error("Merge error:", error);
      toast({
        title: "خطأ في الدمج",
        description: error instanceof Error ? error.message : "حدث خطأ",
        variant: "destructive",
      });
    } finally {
      setMergingBox(false);
    }
  };

  const handleRemove = () => {
    onChange("");
  };

  const isProcessing = uploading || processingBg || mergingBox;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label>{label}</Label>
        {removeBackground && (
          <span className="inline-flex items-center gap-1 text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">
            <Wand2 className="h-3 w-3" />
            إزالة الخلفية تلقائياً
          </span>
        )}
      </div>
      
      {/* Preview */}
      {value && (
        <div className="relative w-full h-32 rounded-lg overflow-hidden bg-muted border border-border">
          {/* Checkerboard background for transparency */}
          <div 
            className="absolute inset-0"
            style={{
              backgroundImage: `linear-gradient(45deg, hsl(var(--muted)) 25%, transparent 25%), 
                               linear-gradient(-45deg, hsl(var(--muted)) 25%, transparent 25%), 
                               linear-gradient(45deg, transparent 75%, hsl(var(--muted)) 75%), 
                               linear-gradient(-45deg, transparent 75%, hsl(var(--muted)) 75%)`,
              backgroundSize: '20px 20px',
              backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
            }}
          />
          <img
            src={value}
            alt="Preview"
            className="relative w-full h-full object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/placeholder.svg";
            }}
          />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-2 left-2 h-8 w-8"
            onClick={handleRemove}
          >
            <X className="h-4 w-4" />
          </Button>
          {showMergeBox && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="absolute bottom-2 right-2 gap-1 text-xs"
              onClick={handleMergeWithBox}
              disabled={mergingBox}
            >
              {mergingBox ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  جاري الدمج...
                </>
              ) : (
                <>
                  <Package className="h-3 w-3" />
                  دمج مع العلبة
                </>
              )}
            </Button>
          )}
        </div>
      )}

      {/* Upload Controls */}
      {!value && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {processingBg ? "جاري إزالة الخلفية..." : "جاري الرفع..."}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  رفع صورة
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowUrlInput(!showUrlInput)}
              title="إدخال رابط يدوي"
            >
              <ImageIcon className="h-4 w-4" />
            </Button>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Manual URL input */}
          {showUrlInput && (
            <Input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className="glass"
              dir="ltr"
            />
          )}
        </div>
      )}

      {/* Show URL if exists */}
      {value && (
        <p className="text-xs text-muted-foreground truncate" dir="ltr">
          {value}
        </p>
      )}
    </div>
  );
};

export default ImageUpload;
