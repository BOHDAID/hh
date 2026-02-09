import { Link, useLocation, useNavigate } from "react-router-dom";
import { Home, Package, Wallet, User, MessageCircle, ShoppingCart, Settings, X, Menu, LogOut, PackagePlus, HeadphonesIcon, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { db, getAuthClient, isExternalConfigured } from "@/lib/supabaseClient";
import { useTranslation } from "react-i18next";

interface UserSidebarProps {
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
}

const UserSidebar = ({ open, onClose, onOpen }: UserSidebarProps) => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const location = useLocation();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);

  const navItems = [
    { to: "/", label: t('common.home'), icon: Home },
    { to: "/my-orders", label: t('common.myOrders'), icon: Package },
    { to: "/wallet", label: t('common.myBalance'), icon: Wallet },
    { to: "/cart", label: t('common.cart'), icon: ShoppingCart },
    { to: "/wishlist", label: t('common.wishlist'), icon: Heart },
    { to: "/product-requests", label: isRTL ? "طلب منتج" : "Request Product", icon: PackagePlus },
    { to: "/support", label: t('common.support'), icon: HeadphonesIcon },
    { to: "/profile", label: t('common.profile'), icon: User },
    { to: "/contact", label: t('common.contactUs'), icon: MessageCircle },
  ];

  useEffect(() => {
    const checkAdmin = async () => {
      const authClient = isExternalConfigured ? getAuthClient() : db;
      const { data: { session } } = await authClient.auth.getSession();
      if (session?.user) {
        const { data } = await db
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .maybeSingle();
        setIsAdmin(data?.role === "admin" || data?.role === "full_access");
      }
    };
    checkAdmin();
  }, []);

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const handleLogout = async () => {
    const authClient = isExternalConfigured ? getAuthClient() : db;
    await authClient.auth.signOut();
    onClose();
    navigate("/");
  };

  return (
    <>

      {/* Overlay - works on all screen sizes when sidebar is open */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={onClose}
        />
      )}

      {/* Sidebar - Slides from Left */}
      <aside
        className={cn(
          "fixed left-0 top-0 h-full w-64 border-r border-border bg-background/95 backdrop-blur-sm overflow-y-auto z-50",
          "transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header with Close Button */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              {isRTL ? "حسابي" : "My Account"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {isRTL ? "إدارة حسابك وطلباتك" : "Manage your account and orders"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to);
            return (
              <Link key={item.to} to={item.to} onClick={onClose}>
                <Button
                  variant={active ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start gap-3 text-sm",
                    active && "bg-primary/10 text-primary font-medium"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Button>
              </Link>
            );
          })}

          {/* Admin Link */}
          {isAdmin && (
            <Link to="/admin" onClick={onClose}>
              <Button
                variant={location.pathname.startsWith("/admin") ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start gap-3 text-sm",
                  location.pathname.startsWith("/admin") && "bg-primary/10 text-primary font-medium"
                )}
              >
                <Settings className="h-4 w-4" />
                {t('common.adminPanel')}
              </Button>
            </Link>
          )}
        </nav>

        {/* Logout Button at Bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border bg-background/95">
          <Button
            variant="outline"
            className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            {t('common.logout')}
          </Button>
        </div>
      </aside>
    </>
  );
};

export default UserSidebar;