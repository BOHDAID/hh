import { useEffect } from "react";
import { invokeCloudFunctionPublic } from "@/lib/cloudFunctions";

/**
 * Hook to track page visits
 * Sends visit data to the track-visit edge function on EXTERNAL Supabase
 */
export const useTrackVisit = (pagePath?: string) => {
  useEffect(() => {
    const trackVisit = async () => {
      try {
        const path = pagePath || window.location.pathname;
        const referrer = document.referrer || null;

        // Call the edge function on external Supabase
        const { error } = await invokeCloudFunctionPublic("track-visit", {
          page_path: path,
          referrer: referrer,
        });

        if (error) {
          console.log("Track visit error:", error);
        }
      } catch (err) {
        // Silently fail - tracking shouldn't break the app
        console.log("Track visit failed:", err);
      }
    };

    // Track after a small delay to not block page load
    const timer = setTimeout(trackVisit, 500);
    return () => clearTimeout(timer);
  }, [pagePath]);
};

export default useTrackVisit;
