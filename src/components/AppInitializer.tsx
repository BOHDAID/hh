import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { db, getAuthClient, isExternalConfigured } from "@/lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";

interface AppContext {
  user: any;
  isAdmin: boolean;
  storeName: string;
  storeLogo: string | null;
  walletBalance: number | null;
  cartCount: number;
  refreshCart: () => void;
  maintenanceMode: boolean;
  maintenanceMessage: string;
}

const AppDataContext = createContext<AppContext>({
  user: null,
  isAdmin: false,
  storeName: "",
  storeLogo: null,
  walletBalance: null,
  cartCount: 0,
  refreshCart: () => {},
  maintenanceMode: false,
  maintenanceMessage: "",
});

export const useAppData = () => useContext(AppDataContext);

const AppInitializer = ({ children }: { children: ReactNode }) => {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [storeLogo, setStoreLogo] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");

  const authClient = isExternalConfigured ? getAuthClient() : db;

  const fetchUserData = async (userId: string) => {
    // Fetch admin role, cart count, wallet in parallel
    const [roleRes, cartRes, walletRes] = await Promise.all([
      db.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
      db.from("cart_items").select("*", { count: "exact", head: true }).eq("user_id", userId),
      db.from("wallets").select("balance").eq("user_id", userId).maybeSingle(),
    ]);

    setIsAdmin(roleRes.data?.role === "admin");
    setCartCount(cartRes.count || 0);
    setWalletBalance(walletRes.data?.balance ?? null);
  };

  const refreshCart = async () => {
    if (!user) return;
    const { count } = await db
      .from("cart_items")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);
    setCartCount(count || 0);
  };

  const fetchBrandingSettings = async () => {
    const { data } = await db
      .from("site_settings")
      .select("key, value")
      .in("key", ["store_name", "store_logo_url", "maintenance_mode", "maintenance_message"]);

    // Reset defaults first to avoid stale UI when settings are removed
    setStoreName("");
    setStoreLogo(null);
    setMaintenanceMode(false);
    setMaintenanceMessage("");

    if (data) {
      for (const s of data) {
        if (s.key === "store_name" && s.value) setStoreName(s.value);
        if (s.key === "store_logo_url" && s.value) setStoreLogo(s.value);
        if (s.key === "maintenance_mode") {
          const normalized = String(s.value ?? "").toLowerCase();
          setMaintenanceMode(["true", "1", "yes", "on"].includes(normalized));
        }
        if (s.key === "maintenance_message" && s.value) setMaintenanceMessage(s.value);
      }
    }
  };

  useEffect(() => {
    const init = async () => {
      // Fetch branding + auth session in parallel
      const [, sessionRes] = await Promise.all([
        fetchBrandingSettings(),
        authClient.auth.getSession(),
      ]);

      // Set user + fetch user data
      const session = sessionRes.data.session;
      if (session?.user) {
        setUser(session.user);
        await fetchUserData(session.user.id);
      }

      setReady(true);
    };

    init();

    // Listen for auth changes
    const { data: { subscription } } = authClient.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        fetchUserData(u.id);
      } else {
        setIsAdmin(false);
        setCartCount(0);
        setWalletBalance(null);
      }
    });

    // Listen for cart updates
    const handleCartUpdate = () => refreshCart();
    window.addEventListener("cart-updated", handleCartUpdate);

    // Listen for settings updates (e.g. maintenance mode toggled from admin)
    const handleSiteSettingsUpdated = () => {
      fetchBrandingSettings();
    };
    window.addEventListener("site-settings-updated", handleSiteSettingsUpdated);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("cart-updated", handleCartUpdate);
      window.removeEventListener("site-settings-updated", handleSiteSettingsUpdated);
    };
  }, []);

  return (
    <>
      <AnimatePresence>
        {!ready && (
          <motion.div
            key="splash"
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-background"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <motion.div
              className="flex flex-col items-center gap-4"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {ready && (
        <AppDataContext.Provider
          value={{ user, isAdmin, storeName, storeLogo, walletBalance, cartCount, refreshCart, maintenanceMode, maintenanceMessage }}
        >
          {children}
        </AppDataContext.Provider>
      )}
    </>
  );
};

export default AppInitializer;
