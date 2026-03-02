import { useState, useEffect, forwardRef } from "react";
import { db } from "@/lib/supabaseClient";
import { ChevronRight, ChevronLeft, ImageOff } from "lucide-react";

interface VariantImageGalleryProps {
  variantId: string;
  variantImageUrl?: string | null;
}

const VariantImageGallery = forwardRef<HTMLDivElement, VariantImageGalleryProps>(
  ({ variantId, variantImageUrl }, ref) => {
    const [images, setImages] = useState<string[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
      const fetchImages = async () => {
        const { data } = await db
          .from("product_variant_images")
          .select("image_url, display_order")
          .eq("variant_id", variantId)
          .order("display_order", { ascending: true });

        const allImages: string[] = [];
        if (variantImageUrl) allImages.push(variantImageUrl);
        if (data) {
          data.forEach((img) => {
            if (img.image_url && !allImages.includes(img.image_url)) allImages.push(img.image_url);
          });
        }

        setImages(allImages.slice(0, 5));
        setCurrentIndex(0);
      };

      fetchImages();
    }, [variantId, variantImageUrl]);

    const handlePrev = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setCurrentIndex((i) => (i - 1 + images.length) % images.length);
    };

    const handleNext = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setCurrentIndex((i) => (i + 1) % images.length);
    };

    if (images.length === 0) {
      return (
        <div ref={ref} className="space-y-2">
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center max-w-[220px] mx-auto">
            <ImageOff className="h-5 w-5 mx-auto text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">لا توجد صور لهذا الخيار بعد</p>
          </div>
        </div>
      );
    }

    return (
      <div ref={ref} className="space-y-2">
        <div className="relative rounded-xl overflow-hidden bg-muted aspect-square w-full max-w-[220px] mx-auto">
          <img
            src={images[currentIndex]}
            alt="variant"
            className="w-full h-full object-cover transition-all duration-300"
            loading="lazy"
          />
          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                className="absolute left-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-background/80 flex items-center justify-center hover:bg-background"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-background/80 flex items-center justify-center hover:bg-background"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>

        {images.length > 1 && (
          <div className="flex justify-center gap-1.5">
            {images.map((_, i) => (
              <button
                type="button"
                key={i}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCurrentIndex(i);
                }}
                className={`h-2 rounded-full transition-all ${
                  i === currentIndex ? "bg-primary w-5" : "bg-muted-foreground/30 w-2"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
);

VariantImageGallery.displayName = "VariantImageGallery";

export default VariantImageGallery;
