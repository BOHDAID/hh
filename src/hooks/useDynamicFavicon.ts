import { useEffect } from "react";
import { db } from "@/lib/supabaseClient";

// Default fallback favicon
const FALLBACK_FAVICON = "/favicon.svg";

/**
 * Trim transparent/white padding from image and return a clean square favicon data URL
 */
const processImageForFavicon = (src: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const size = 128; // optimal favicon size
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;

      // Detect content bounds (trim transparent areas)
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = img.naturalWidth;
      tempCanvas.height = img.naturalHeight;
      const tempCtx = tempCanvas.getContext("2d")!;
      tempCtx.drawImage(img, 0, 0);

      const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      const { data, width, height } = imageData;

      let top = height, bottom = 0, left = width, right = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const alpha = data[(y * width + x) * 4 + 3];
          if (alpha > 20) {
            if (y < top) top = y;
            if (y > bottom) bottom = y;
            if (x < left) left = x;
            if (x > right) right = x;
          }
        }
      }

      // Fill with rounded colored background
      ctx.fillStyle = "#1a1a2e";
      ctx.beginPath();
      ctx.roundRect(0, 0, size, size, size * 0.15);
      ctx.fill();

      if (top >= bottom || left >= right) {
        ctx.drawImage(img, 0, 0, size, size);
      } else {
        const contentW = right - left + 1;
        const contentH = bottom - top + 1;

        // Draw logo filling 95% of space — no wasted padding
        const maxDraw = size * 0.95;
        const scale = maxDraw / Math.max(contentW, contentH);
        const drawW = contentW * scale;
        const drawH = contentH * scale;
        const offsetX = (size - drawW) / 2;
        const offsetY = (size - drawH) / 2;

        ctx.drawImage(img, left, top, contentW, contentH, offsetX, offsetY, drawW, drawH);
      }

      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
};

/**
 * Dynamically updates the browser favicon and tab title
 */
const useDynamicFavicon = () => {
  useEffect(() => {
    const setFavicon = (url: string) => {
      const existingLinks = document.querySelectorAll<HTMLLinkElement>(
        "link[rel='icon'], link[rel='alternate icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']"
      );
      existingLinks.forEach((el) => el.remove());

      // Primary large favicon
      const link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/png";
      link.sizes = "256x256";
      link.href = url;
      document.head.appendChild(link);

      // Apple touch icon
      const appleLink = document.createElement("link");
      appleLink.rel = "apple-touch-icon";
      appleLink.sizes = "180x180";
      appleLink.href = url;
      document.head.appendChild(appleLink);

      console.log("🎨 Favicon set to processed image");
    };

    const fetchAndSetFavicon = async () => {
      try {
        const { data, error } = await db
          .from("site_settings")
          .select("key, value")
          .in("key", ["store_logo_url", "store_name", "store_favicon_url"]);

        if (error) {
          console.warn("Failed to fetch site settings:", error.message);
          setFavicon(FALLBACK_FAVICON);
          return;
        }

        const settings: Record<string, string> = {};
        (data || []).forEach((s: { key: string; value: string | null }) => {
          if (s.value) settings[s.key] = s.value;
        });

        if (settings.store_name) {
          document.title = settings.store_name;
        }

        const faviconUrl = settings.store_favicon_url || settings.store_logo_url;

        if (!faviconUrl) {
          setFavicon(FALLBACK_FAVICON);
          return;
        }

        // Process image: trim whitespace and maximize logo
        const processedUrl = await processImageForFavicon(faviconUrl);
        setFavicon(processedUrl);
      } catch (err) {
        console.error("Failed to set dynamic favicon:", err);
        setFavicon(FALLBACK_FAVICON);
      }
    };

    fetchAndSetFavicon();
  }, []);
};

export default useDynamicFavicon;
