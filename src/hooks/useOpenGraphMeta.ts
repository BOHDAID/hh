import { useEffect } from "react";
import { db } from "@/lib/supabaseClient";

/**
 * Dynamically updates Open Graph meta tags (og:title, og:description, og:image)
 * based on site_settings so the link preview on Telegram/WhatsApp etc. is correct.
 */
const useOpenGraphMeta = () => {
  useEffect(() => {
    const updateMeta = (property: string, content: string) => {
      let el = document.querySelector<HTMLMetaElement>(`meta[property='${property}']`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("property", property);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    const updateNameMeta = (name: string, content: string) => {
      let el = document.querySelector<HTMLMetaElement>(`meta[name='${name}']`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    const fetchAndSet = async () => {
      try {
        const { data } = await db
          .from("site_settings")
          .select("key, value")
          .in("key", ["og_title", "og_description", "og_image", "store_name", "store_logo_url"]);

        const settings: Record<string, string> = {};
        (data || []).forEach((s: { key: string; value: string | null }) => {
          if (s.value) settings[s.key] = s.value;
        });

        const title = settings.og_title || settings.store_name || "";
        const description = settings.og_description || "";
        const image = settings.og_image || settings.store_logo_url || "";

        if (title) {
          updateMeta("og:title", title);
          updateMeta("og:site_name", title);
          updateNameMeta("twitter:title", title);
        }
        if (description) {
          updateMeta("og:description", description);
          updateNameMeta("twitter:description", description);
          updateNameMeta("description", description);
        }
        if (image) {
          updateMeta("og:image", image);
          updateNameMeta("twitter:image", image);
        }
      } catch (err) {
        console.error("Failed to update OG meta:", err);
      }
    };

    fetchAndSet();
  }, []);
};

export default useOpenGraphMeta;
