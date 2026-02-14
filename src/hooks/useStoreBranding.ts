import { useState, useEffect } from "react";
import { db } from "@/lib/supabaseClient";

interface StoreBranding {
  storeName: string;
  storeLogo: string | null;
  loading: boolean;
}

/**
 * Shared hook to fetch store name and logo from site_settings.
 * Used across all pages to ensure consistent branding.
 */
const useStoreBranding = (): StoreBranding => {
  const [storeName, setStoreName] = useState("");
  const [storeLogo, setStoreLogo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBranding = async () => {
      try {
        const { data } = await db
          .from("site_settings")
          .select("key, value")
          .in("key", ["store_name", "store_logo_url"]);

        if (data) {
          data.forEach((setting) => {
            if (setting.key === "store_name" && setting.value) {
              setStoreName(setting.value);
            }
            if (setting.key === "store_logo_url" && setting.value) {
              setStoreLogo(setting.value);
            }
          });
        }
      } catch (err) {
        console.error("Failed to fetch store branding:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchBranding();
  }, []);

  return { storeName, storeLogo, loading };
};

export default useStoreBranding;
