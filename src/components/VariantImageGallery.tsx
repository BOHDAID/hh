import { useState, useEffect } from "react";
import { db } from "@/lib/supabaseClient";
import { ChevronRight, ChevronLeft } from "lucide-react";

interface VariantImageGalleryProps {
  variantId: string;
  variantImageUrl?: string | null;
  productImageUrl?: string;
}

const VariantImageGallery = ({ variantId, variantImageUrl, productImageUrl }: VariantImageGalleryProps) => {
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
          if (!allImages.includes(img.image_url)) allImages.push(img.image_url);
        });
      }
      if (allImages.length === 0 && productImageUrl) allImages.push(productImageUrl);
      
      setImages(allImages);
      setCurrentIndex(0);
    };

    fetchImages();
  }, [variantId, variantImageUrl, productImageUrl]);

  if (images.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl overflow-hidden bg-muted aspect-square w-full max-w-[200px] mx-auto">
        <img
          src={images[currentIndex]}
          alt="variant"
          className="w-full h-full object-cover transition-all duration-300"
        />
        {images.length > 1 && (
          <>
            <button
              onClick={() => setCurrentIndex((i) => (i - 1 + images.length) % images.length)}
              className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-background/80 flex items-center justify-center hover:bg-background"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
            <button
              onClick={() => setCurrentIndex((i) => (i + 1) % images.length)}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-background/80 flex items-center justify-center hover:bg-background"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex justify-center gap-1">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              className={`w-2 h-2 rounded-full transition-all ${
                i === currentIndex ? "bg-primary w-4" : "bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default VariantImageGallery;
