import { ShoppingBag, Send, Twitter, Instagram } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { db } from "@/lib/supabaseClient";
import { useTranslation } from "react-i18next";
import useStoreBranding from "@/hooks/useStoreBranding";

interface FooterProps {
  className?: string;
}

const Footer = ({ className }: FooterProps) => {
  const { t } = useTranslation();
  const { storeName, storeLogo } = useStoreBranding();
  const [socialLinks, setSocialLinks] = useState<{
    twitter?: string;
    instagram?: string;
    telegram?: string;
  }>({});

  useEffect(() => {
    const fetchSocialLinks = async () => {
      const { data } = await db
        .from("site_settings")
        .select("key, value")
        .in("key", ["twitter_username", "instagram_username", "telegram_username"]);

      if (data) {
        const links: { twitter?: string; instagram?: string; telegram?: string } = {};
        data.forEach((setting) => {
          if (setting.key === "twitter_username" && setting.value) {
            const cleanUsername = setting.value.replace(/^@/, '');
            links.twitter = `https://twitter.com/${cleanUsername}`;
          }
          if (setting.key === "instagram_username" && setting.value) {
            const cleanUsername = setting.value.replace(/^@/, '');
            links.instagram = `https://instagram.com/${cleanUsername}`;
          }
          if (setting.key === "telegram_username" && setting.value) {
            const cleanUsername = setting.value.replace(/^@/, '');
            links.telegram = `https://t.me/${cleanUsername}`;
          }
        });
        setSocialLinks(links);
      }
    };
    fetchSocialLinks();
  }, []);

  const hasSocialLinks = socialLinks.twitter || socialLinks.instagram || socialLinks.telegram;

  return (
    <footer className={`border-t border-border glass ${className || ""}`}>
      <div className="container mx-auto px-4 py-16">
        <div className="grid gap-12 md:grid-cols-4">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="mb-4 flex items-center gap-3">
              {storeLogo ? (
                <img src={storeLogo} alt={storeName} className="h-10 w-10 rounded-xl object-contain" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-glow-primary">
                  <ShoppingBag className="h-5 w-5 text-primary-foreground" />
                </div>
              )}
              <span className="text-xl font-bold text-foreground">{storeName}</span>
            </div>
            <p className="mb-6 text-sm text-muted-foreground">
              {t('footer.description')}
            </p>
            {hasSocialLinks && (
              <div className="flex gap-3">
                {socialLinks.twitter && (
                  <a href={socialLinks.twitter} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="icon" className="rounded-full glass">
                      <Twitter className="h-5 w-5" />
                    </Button>
                  </a>
                )}
                {socialLinks.instagram && (
                  <a href={socialLinks.instagram} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="icon" className="rounded-full glass">
                      <Instagram className="h-5 w-5" />
                    </Button>
                  </a>
                )}
                {socialLinks.telegram && (
                  <a href={socialLinks.telegram} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="icon" className="rounded-full glass">
                      <Send className="h-5 w-5" />
                    </Button>
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Links */}
          <div>
            <h4 className="mb-4 font-semibold text-foreground">{t('common.quickLinks')}</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link to="/" className="transition-colors hover:text-primary">{t('common.home')}</Link></li>
              <li><a href="/#products" className="transition-colors hover:text-primary">{t('common.products')}</a></li>
              <li><Link to="/contact" className="transition-colors hover:text-primary">{t('common.contactUs')}</Link></li>
              <li><Link to="/privacy-policy" className="transition-colors hover:text-primary">Privacy Policy</Link></li>
              <li><Link to="/refund-policy" className="transition-colors hover:text-primary">Refund Policy</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 font-semibold text-foreground">{t('common.account')}</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link to="/login" className="transition-colors hover:text-primary">{t('common.login')}</Link></li>
              <li><Link to="/register" className="transition-colors hover:text-primary">{t('common.register')}</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="mb-4 font-semibold text-foreground">{t('common.contactUs')}</h4>
            <p className="mb-4 text-sm text-muted-foreground">
              {t('common.inquiriesSupport')}
            </p>
            <Link to="/contact">
              <Button variant="hero" size="default" className="w-full shadow-glow-primary/50">
                <Send className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
                {t('common.messageUs')}
              </Button>
            </Link>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-12 border-t border-border pt-8 text-center text-sm text-muted-foreground">
          <div className="flex flex-wrap items-center justify-center gap-4 mb-3">
            <Link to="/privacy-policy" className="underline transition-colors hover:text-primary">Privacy Policy</Link>
            <span className="text-border">|</span>
            <Link to="/refund-policy" className="underline transition-colors hover:text-primary">Refund Policy</Link>
            <span className="text-border">|</span>
            <Link to="/terms" className="underline transition-colors hover:text-primary">Terms of Service</Link>
          </div>
          <p>© {new Date().getFullYear()} {storeName}. {t('footer.allRightsReserved')}.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
