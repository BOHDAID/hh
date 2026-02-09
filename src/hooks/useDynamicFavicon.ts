import { useEffect } from "react";
import { db } from "@/lib/supabaseClient";

// Default fallback favicon
const FALLBACK_FAVICON = "/favicon.svg";

/**
 * Dynamically updates the browser favicon based on the store logo URL
 * stored in site_settings (key: 'store_logo_url').
 * Falls back to /favicon.svg if no custom logo is set.
 */
const useDynamicFavicon = () => {
  useEffect(() => {
    const setFavicon = (url: string, type: string) => {
      // Remove ALL existing favicon links to avoid conflicts
      const existingLinks = document.querySelectorAll<HTMLLinkElement>(
        "link[rel='icon'], link[rel='alternate icon'], link[rel='shortcut icon']"
      );
      existingLinks.forEach((el) => el.remove());

      // Create a fresh favicon link
      const link = document.createElement("link");
      link.rel = "icon";
      link.type = type;
      link.href = url;
      document.head.appendChild(link);
      
      console.log("🎨 Favicon set to:", url);
    };

    const fetchAndSetFavicon = async () => {
      try {
        const { data, error } = await db
          .from("site_settings")
          .select("value")
          .eq("key", "store_logo_url")
          .maybeSingle();

        if (error) {
          console.warn("Failed to fetch store logo, using fallback:", error.message);
          setFavicon(FALLBACK_FAVICON, "image/svg+xml");
          return;
        }

        const logoUrl = data?.value;
        
        if (!logoUrl) {
          // No custom logo set, use fallback
          console.log("No store_logo_url found, using fallback favicon");
          setFavicon(FALLBACK_FAVICON, "image/svg+xml");
          return;
        }

        // Detect type from URL
        let type = "image/png";
        if (logoUrl.endsWith(".svg")) {
          type = "image/svg+xml";
        } else if (logoUrl.endsWith(".ico")) {
          type = "image/x-icon";
        }

        setFavicon(logoUrl, type);
      } catch (err) {
        console.error("Failed to set dynamic favicon:", err);
        // Use fallback on error
        setFavicon(FALLBACK_FAVICON, "image/svg+xml");
      }
    };

    fetchAndSetFavicon();
  }, []);
};

export default useDynamicFavicon;
