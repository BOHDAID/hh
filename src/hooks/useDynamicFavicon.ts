import { useEffect } from "react";
import { db } from "@/lib/supabaseClient";

// Default fallback favicon
const FALLBACK_FAVICON = "/favicon.svg";

/**
 * Dynamically updates the browser favicon and tab title
 * based on site_settings (store_logo_url, store_name).
 */
const useDynamicFavicon = () => {
  useEffect(() => {
    const setFavicon = (url: string, type: string) => {
      // Remove ALL existing favicon links to avoid conflicts
      const existingLinks = document.querySelectorAll<HTMLLinkElement>(
        "link[rel='icon'], link[rel='alternate icon'], link[rel='shortcut icon']"
      );
      existingLinks.forEach((el) => el.remove());

      // Create a single 32x32 favicon link
      const link = document.createElement("link");
      link.rel = "icon";
      link.type = type;
      link.sizes = "32x32";
      link.href = url;
      document.head.appendChild(link);
      
      console.log("🎨 Favicon set to:", url);
    };

    const fetchAndSetFavicon = async () => {
      try {
        // جلب الشعار واسم المتجر معاً
        const { data, error } = await db
          .from("site_settings")
          .select("key, value")
          .in("key", ["store_logo_url", "store_name", "store_favicon_url"]);

        if (error) {
          console.warn("Failed to fetch site settings:", error.message);
          setFavicon(FALLBACK_FAVICON, "image/svg+xml");
          return;
        }

        const settings: Record<string, string> = {};
        (data || []).forEach((s: { key: string; value: string | null }) => {
          if (s.value) settings[s.key] = s.value;
        });

        // تحديث عنوان التاب
        if (settings.store_name) {
          document.title = settings.store_name;
        }

        // أولوية للفافيكون المخصص، ثم الشعار
        const faviconUrl = settings.store_favicon_url || settings.store_logo_url;
        
        if (!faviconUrl) {
          console.log("No favicon/logo found, using fallback");
          setFavicon(FALLBACK_FAVICON, "image/svg+xml");
          return;
        }

        let type = "image/png";
        if (faviconUrl.endsWith(".svg")) {
          type = "image/svg+xml";
        } else if (faviconUrl.endsWith(".ico")) {
          type = "image/x-icon";
        }

        setFavicon(faviconUrl, type);
      } catch (err) {
        console.error("Failed to set dynamic favicon:", err);
        setFavicon(FALLBACK_FAVICON, "image/svg+xml");
      }
    };

    fetchAndSetFavicon();
  }, []);
};

export default useDynamicFavicon;
