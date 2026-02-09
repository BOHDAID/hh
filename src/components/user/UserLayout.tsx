import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Menu, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import UserSidebar from "./UserSidebar";
import { db, getAuthClient, isExternalConfigured } from "@/lib/supabaseClient";
import { useTranslation } from "react-i18next";

interface UserLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

const UserLayout = ({ children, title, subtitle }: UserLayoutProps) => {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [storeName, setStoreName] = useState(isRTL ? "متجر رقمي" : "Digital Store");
  const [storeLogo, setStoreLogo] = useState<string | null>(null);

  useEffect(() => {
    const authClient = isExternalConfigured ? getAuthClient() : db;

    // Fetch store settings
    const fetchStoreSettings = async () => {
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
    };
    fetchStoreSettings();

    // Check auth
    authClient.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/login");
      }
    });

    const {
      data: { subscription },
    } = authClient.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/login");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background" dir={isRTL ? "rtl" : "ltr"}>
      {/* Header - same for all screen sizes */}
      <header className="fixed top-0 right-0 left-0 h-14 bg-background/95 backdrop-blur-sm border-b border-border z-40 flex items-center justify-between px-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          {storeLogo ? (
            <img src={storeLogo} alt={storeName} className="h-8 w-8 rounded-lg object-contain" />
          ) : (
            <div className="h-8 w-8 rounded-lg bg-gradient-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
              <ShoppingBag className="h-4 w-4" />
            </div>
          )}
          <span className="font-semibold text-sm">{storeName}</span>
        </Link>

        {/* Title (Desktop only) */}
        <div className="hidden md:block">
          {title && <h1 className="text-lg font-bold">{title}</h1>}
        </div>

        {/* Menu Toggle Button */}
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
          <Menu className="h-5 w-5" />
        </Button>
      </header>

      {/* Sidebar */}
      <UserSidebar 
        open={sidebarOpen} 
        onClose={() => setSidebarOpen(false)} 
        onOpen={() => setSidebarOpen(true)}
      />

      {/* Main Content */}
      <main className="pt-14">
        {/* Page Title for Mobile */}
        {title && (
          <div className="md:hidden p-4 border-b border-border">
            <h1 className="text-xl font-bold">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        )}

        {/* Page Content */}
        <div className="p-4 lg:p-6">{children}</div>
      </main>
    </div>
  );
};

export default UserLayout;
