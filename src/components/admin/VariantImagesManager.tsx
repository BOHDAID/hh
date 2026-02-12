import { useState, useEffect } from "react";
import { db } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, Plus, Trash2, Loader2, ImageIcon } from "lucide-react";
import ImageUpload from "./ImageUpload";

interface VariantImage {
  id: string;
  variant_id: string;
  image_url: string;
  display_order: number;
}

interface VariantImagesManagerProps {
  variantId: string;
}

const VariantImagesManager = ({ variantId }: VariantImagesManagerProps) => {
  const [images, setImages] = useState<VariantImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    fetchImages();
  }, [variantId]);

  const fetchImages = async () => {
    setLoading(true);
    const { data, error } = await db
      .from("product_variant_images")
      .select("*")
      .eq("variant_id", variantId)
      .order("display_order", { ascending: true });

    if (error) {
      console.error("Error fetching variant images:", error);
    } else {
      setImages(data || []);
      setCurrentIndex(0);
    }
    setLoading(false);
  };

  const addImage = async (url: string) => {
    if (!url) return;
    setUploading(true);

    const { error } = await db.from("product_variant_images").insert({
      variant_id: variantId,
      image_url: url,
      display_order: images.length,
    });

    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "تم", description: "تم إضافة الصورة" });
      fetchImages();
      setShowUpload(false);
    }
    setUploading(false);
  };

  const deleteImage = async (imageId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذه الصورة؟")) return;

    const { error } = await db
      .from("product_variant_images")
      .delete()
      .eq("id", imageId);

    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "تم", description: "تم حذف الصورة" });
      fetchImages();
      if (currentIndex >= images.length - 1 && currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
      }
    }
  };

  const goNext = () => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };

  const goPrev = () => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium flex items-center gap-1.5">
          <ImageIcon className="h-3.5 w-3.5 text-primary" />
          صور الخيار ({images.length})
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowUpload(!showUpload)}
          className="h-7 text-xs gap-1"
        >
          <Plus className="h-3 w-3" />
          إضافة صورة
        </Button>
      </div>

      {showUpload && (
        <div className="border border-dashed border-border rounded-lg p-3 bg-muted/30">
          <ImageUpload
            value=""
            onChange={(url) => addImage(url)}
            bucket="product-images"
            label="رفع صورة جديدة"
            showMergeBox
          />
        </div>
      )}

      {images.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-border rounded-lg bg-muted/20">
          <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-xs text-muted-foreground">لا توجد صور</p>
          <p className="text-[10px] text-muted-foreground mt-1">أضف صور لعرضها للمشتري</p>
        </div>
      ) : (
        <div className="relative">
          {/* Main Image Display */}
          <div className="relative aspect-video rounded-lg overflow-hidden bg-muted border border-border">
            <img
              src={images[currentIndex]?.image_url}
              alt={`صورة ${currentIndex + 1}`}
              className="w-full h-full object-contain"
            />
            
            {/* Delete button */}
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2 h-7 w-7 opacity-80 hover:opacity-100"
              onClick={() => deleteImage(images[currentIndex].id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>

            {/* Navigation arrows */}
            {images.length > 1 && (
              <>
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full opacity-80 hover:opacity-100"
                  onClick={goPrev}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full opacity-80 hover:opacity-100"
                  onClick={goNext}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}

            {/* Image counter */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white px-2.5 py-1 rounded-full text-xs font-medium">
              {currentIndex + 1} / {images.length}
            </div>
          </div>

          {/* Thumbnail strip */}
          {images.length > 1 && (
            <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
              {images.map((img, idx) => (
                <button
                  key={img.id}
                  onClick={() => setCurrentIndex(idx)}
                  className={`flex-shrink-0 w-12 h-12 rounded border-2 overflow-hidden transition-all ${
                    idx === currentIndex
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-border opacity-60 hover:opacity-100"
                  }`}
                >
                  <img
                    src={img.image_url}
                    alt={`صورة ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VariantImagesManager;
