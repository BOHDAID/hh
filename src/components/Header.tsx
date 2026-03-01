import { Button } from "@/components/ui/button";
import { ShoppingBag, Menu, Home, Package, MessageCircle, Settings, ShoppingCart, Wallet } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher";
import ThemeToggle from "./ThemeToggle";
import { useAppData } from "./AppInitializer";

interface HeaderProps {
  onMenuClick?: () => void;
  showMenuButton?: boolean;
}

const Header = ({ onMenuClick, showMenuButton = false }: HeaderProps) => {
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user, isAdmin, storeName, storeLogo, cartCount } = useAppData();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 glass">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3">
          {storeLogo ? (
            <img src={storeLogo} alt={storeName} className="h-10 w-10 rounded-xl object-contain" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-glow-primary">
              <ShoppingBag className="h-5 w-5 text-primary-foreground" />
            </div>
          )}
          <span className="text-xl font-bold text-foreground">{storeName}</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-8 md:flex">
          <Link to="/" className="text-sm font-medium text-foreground transition-colors hover:text-primary flex items-center gap-1">
            <Home className="h-4 w-4" />
            {t('common.home')}
          </Link>
          <a href="/#products" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary flex items-center gap-1">
            <Package className="h-4 w-4" />
            {t('common.products')}
          </a>
          {user && (
            <>
              <Link to="/wallet" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary flex items-center gap-1">
                <Wallet className="h-4 w-4" />
                {t('common.myBalance')}
              </Link>
              <Link to="/cart" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary flex items-center gap-1 relative">
                <ShoppingCart className="h-4 w-4" />
                {t('common.cart')}
                {cartCount > 0 && (
                  <span className="absolute -top-2 -right-2 h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
                    {cartCount > 9 ? '9+' : cartCount}
                  </span>
                )}
              </Link>
            </>
          )}
          <Link to="/contact" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary flex items-center gap-1">
            <MessageCircle className="h-4 w-4" />
            {t('common.contactUs')}
          </Link>
          {isAdmin && (
            <Link to="/admin" className="text-sm font-medium text-primary transition-colors hover:text-primary/80 flex items-center gap-1">
              <Settings className="h-4 w-4" />
              {t('common.adminPanel')}
            </Link>
          )}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LanguageSwitcher />
          
          {user ? (
            <>
              {onMenuClick && (
                <Button variant="ghost" size="icon" className="hidden md:flex" onClick={onMenuClick}>
                  <Menu className="h-5 w-5" />
                </Button>
              )}
            </>
          ) : (
            <>
              <Link to="/login">
                <Button variant="outline" size="sm" className="hidden md:flex">{t('common.login')}</Button>
              </Link>
              <Link to="/register">
                <Button variant="hero" size="sm" className="hidden md:flex">{t('common.register')}</Button>
              </Link>
            </>
          )}
          
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => {
              if (user && onMenuClick) {
                onMenuClick();
              } else {
                setIsMenuOpen(!isMenuOpen);
              }
            }}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="border-t border-border/50 glass p-3 md:hidden">
          <nav className="flex flex-col gap-2">
            <Link to="/" className="text-xs font-medium text-foreground flex items-center gap-2 py-1.5" onClick={() => setIsMenuOpen(false)}>
              <Home className="h-3.5 w-3.5" />{t('common.home')}
            </Link>
            <a href="/#products" className="text-xs font-medium text-muted-foreground flex items-center gap-2 py-1.5" onClick={() => setIsMenuOpen(false)}>
              <Package className="h-3.5 w-3.5" />{t('common.products')}
            </a>
            {user && (
              <>
                <Link to="/wallet" className="text-xs font-medium text-muted-foreground flex items-center gap-2 py-1.5" onClick={() => setIsMenuOpen(false)}>
                  <Wallet className="h-3.5 w-3.5" />{t('common.myBalance')}
                </Link>
                <Link to="/cart" className="text-xs font-medium text-muted-foreground flex items-center gap-2 py-1.5" onClick={() => setIsMenuOpen(false)}>
                  <ShoppingCart className="h-3.5 w-3.5" />{t('common.cart')} {cartCount > 0 && `(${cartCount})`}
                </Link>
              </>
            )}
            <Link to="/contact" className="text-xs font-medium text-muted-foreground flex items-center gap-2 py-1.5" onClick={() => setIsMenuOpen(false)}>
              <MessageCircle className="h-3.5 w-3.5" />{t('common.contactUs')}
            </Link>
            {isAdmin && (
              <Link to="/admin" className="text-xs font-medium text-primary flex items-center gap-2 py-1.5" onClick={() => setIsMenuOpen(false)}>
                <Settings className="h-3.5 w-3.5" />{t('common.adminPanel')}
              </Link>
            )}
            <div className="flex flex-col gap-2 pt-3">
              {!user && (
                <>
                  <Link to="/login" onClick={() => setIsMenuOpen(false)}>
                    <Button variant="outline" className="w-full">{t('common.login')}</Button>
                  </Link>
                  <Link to="/register" onClick={() => setIsMenuOpen(false)}>
                    <Button variant="hero" className="w-full">{t('common.register')}</Button>
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
};

export default Header;
