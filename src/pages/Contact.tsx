import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/supabaseClient";
import { toast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import UserSidebar from "@/components/user/UserSidebar";
import { Send, Mail, User, MessageSquare, Loader2, CheckCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

// Social media icons as SVG components
const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
  </svg>
);

const TikTokIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
  </svg>
);

const TelegramIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);

const DiscordIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);

const TwitterIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

interface SocialLink {
  key: string;
  name: string;
  nameEn: string;
  icon: React.ReactNode;
  color: string;
  hoverColor: string;
}

const Contact = () => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>({});

  // Social media configuration - uses username/invite keys from admin settings
  const socialConfig: SocialLink[] = [
    { key: "instagram_username", name: "انستقرام", nameEn: "Instagram", icon: <InstagramIcon />, color: "bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400", hoverColor: "hover:from-purple-600 hover:via-pink-600 hover:to-orange-500" },
    { key: "tiktok_username", name: "تيك توك", nameEn: "TikTok", icon: <TikTokIcon />, color: "bg-black dark:bg-white dark:text-black", hoverColor: "hover:bg-gray-800 dark:hover:bg-gray-200" },
    { key: "telegram_username", name: "تيليجرام", nameEn: "Telegram", icon: <TelegramIcon />, color: "bg-[#0088cc]", hoverColor: "hover:bg-[#0077b5]" },
    { key: "telegram_channel", name: "قناة تيليجرام", nameEn: "Telegram Channel", icon: <TelegramIcon />, color: "bg-[#0088cc]", hoverColor: "hover:bg-[#0077b5]" },
    { key: "discord_invite", name: "ديسكورد", nameEn: "Discord", icon: <DiscordIcon />, color: "bg-[#5865F2]", hoverColor: "hover:bg-[#4752c4]" },
    { key: "twitter_username", name: "إكس", nameEn: "X", icon: <TwitterIcon />, color: "bg-black dark:bg-white dark:text-black", hoverColor: "hover:bg-gray-800 dark:hover:bg-gray-200" },
    { key: "whatsapp_url", name: "واتساب", nameEn: "WhatsApp", icon: <WhatsAppIcon />, color: "bg-[#25D366]", hoverColor: "hover:bg-[#20bd5a]" },
  ];

  // Build full URL from username/invite code
  const buildSocialUrl = (key: string, value: string): string => {
    const clean = value.replace(/^@/, '');
    switch (key) {
      case "instagram_username": return `https://instagram.com/${clean}`;
      case "tiktok_username": return `https://tiktok.com/@${clean}`;
      case "telegram_username": return `https://t.me/${clean}`;
      case "telegram_channel": return `https://t.me/${clean}`;
      case "discord_invite": return `https://discord.gg/${clean}`;
      case "twitter_username": return `https://x.com/${clean}`;
      case "whatsapp_url": return value.startsWith("http") ? value : `https://wa.me/${value}`;
      default: return value;
    }
  };

  useEffect(() => {
    const fetchSocialLinks = async () => {
      const { data } = await db
        .from("site_settings")
        .select("key, value")
        .in("key", socialConfig.map(s => s.key));
      
      if (data) {
        const links: Record<string, string> = {};
        data.forEach((setting: { key: string; value: string | null }) => {
          if (setting.value) {
            links[setting.key] = setting.value;
          }
        });
        setSocialLinks(links);
      }
    };
    fetchSocialLinks();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await db.from('contact_messages').insert({
      name,
      email,
      message,
    });

    if (error) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    } else {
      setSent(true);
      toast({
        title: t('contact.sent'),
        description: isRTL ? "سنرد عليك في أقرب وقت ممكن" : "We will reply to you as soon as possible",
      });
      setName("");
      setEmail("");
      setMessage("");
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col" dir={isRTL ? "rtl" : "ltr"}>
      <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
      <UserSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpen={() => setSidebarOpen(true)}
      />
      <main className="flex-1 py-20 relative">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-gradient-hero" />
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-1/3 right-1/4 h-80 w-80 rounded-full bg-primary/30 blur-[100px]" />
          <div className="absolute bottom-1/3 left-1/4 h-60 w-60 rounded-full bg-secondary/20 blur-[80px]" />
        </div>

        <div className="container relative mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            {/* Header */}
            <div className="text-center mb-12">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-primary shadow-glow-primary mb-6">
                <MessageSquare className="h-8 w-8 text-primary-foreground" />
              </div>
              <h1 className="text-3xl font-bold text-foreground mb-4 md:text-4xl">
                {isRTL ? "تواصل" : "Contact"} <span className="text-gradient-primary">{isRTL ? "معنا" : "Us"}</span>
              </h1>
              <p className="text-muted-foreground">
                {isRTL ? "لديك سؤال أو استفسار؟ نحن هنا لمساعدتك" : "Have a question or inquiry? We're here to help"}
              </p>
            </div>

            {/* Form Card */}
            <div className="glass rounded-2xl p-8">
              {sent ? (
                <div className="text-center py-12">
                  <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-green-500/20 mb-6">
                    <CheckCircle className="h-10 w-10 text-green-500" />
                  </div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">
                    {isRTL ? "تم إرسال رسالتك!" : "Message sent!"}
                  </h2>
                  <p className="text-muted-foreground mb-6">
                    {isRTL ? "شكراً لتواصلك معنا، سنرد عليك في أقرب وقت ممكن" : "Thank you for contacting us, we will reply as soon as possible"}
                  </p>
                  <Button variant="hero" onClick={() => setSent(false)}>
                    {isRTL ? "إرسال رسالة أخرى" : "Send another message"}
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t('contact.name')}</Label>
                    <div className="relative">
                      <User className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground`} />
                      <Input
                        id="name"
                        type="text"
                        placeholder={isRTL ? "أدخل اسمك" : "Enter your name"}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={`${isRTL ? 'pr-10' : 'pl-10'} glass`}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">{t('contact.email')}</Label>
                    <div className="relative">
                      <Mail className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground`} />
                      <Input
                        id="email"
                        type="email"
                        placeholder="example@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={`${isRTL ? 'pr-10' : 'pl-10'} glass`}
                        required
                        dir="ltr"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message">{t('contact.message')}</Label>
                    <Textarea
                      id="message"
                      placeholder={isRTL ? "اكتب رسالتك هنا..." : "Write your message here..."}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="min-h-[150px] glass"
                      required
                    />
                  </div>

                  <Button
                    type="submit"
                    variant="hero"
                    size="lg"
                    className="w-full shadow-glow-primary"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className={`h-5 w-5 animate-spin ${isRTL ? 'ml-2' : 'mr-2'}`} />
                        {t('contact.sending')}
                      </>
                    ) : (
                      <>
                        <Send className={`h-5 w-5 ${isRTL ? 'ml-2' : 'mr-2'}`} />
                        {t('contact.send')}
                      </>
                    )}
                  </Button>
                </form>
              )}
            </div>

            {/* Social Media Links */}
            {Object.keys(socialLinks).length > 0 && (
              <div className="mt-12">
                <h2 className="text-xl font-bold text-foreground text-center mb-6">
                  {isRTL ? "تواصل معنا عبر" : "Reach us on"}
                </h2>
                <div className="flex flex-wrap justify-center gap-4">
                  {socialConfig.map((social) => {
                    const value = socialLinks[social.key];
                    if (!value) return null;
                    
                    const finalUrl = buildSocialUrl(social.key, value);
                    
                    return (
                      <a
                        key={social.key}
                        href={finalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center gap-3 px-5 py-3 rounded-xl text-white transition-all duration-300 transform hover:scale-105 hover:shadow-lg ${social.color} ${social.hoverColor}`}
                      >
                        {social.icon}
                        <span className="font-medium">{isRTL ? social.name : social.nameEn}</span>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Contact;