import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Zap, ArrowLeft, ArrowRight, Shield, Clock, Sparkles, Star, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { db } from "@/lib/supabaseClient";

const Hero = () => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';

  const [heroTexts, setHeroTexts] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchHeroTexts = async () => {
      const { data } = await db
        .from("site_settings")
        .select("key, value")
        .in("key", [
          "hero_badge", "hero_title1", "hero_title2", "hero_title3",
          "hero_subtitle", "hero_subtitle_desc",
          "hero_badge_en", "hero_title1_en", "hero_title2_en", "hero_title3_en",
          "hero_subtitle_en", "hero_subtitle_desc_en"
        ]);
      if (data) {
        const map: Record<string, string> = {};
        data.forEach((s) => {
          if (s.key && s.value) map[s.key] = s.value;
        });
        setHeroTexts(map);
      }
    };
    fetchHeroTexts();
  }, []);

  const h = (key: string, fallbackKey: string) => {
    if (i18n.language === 'en') {
      return heroTexts[`${key}_en`] || t(fallbackKey);
    }
    return heroTexts[key] || t(fallbackKey);
  };

  const features = [
    {
      icon: Shield,
      title: t('hero.feature1Title'),
      subtitle: t('hero.feature1Subtitle'),
      gradient: "bg-gradient-primary",
      glow: "shadow-glow-primary",
    },
    {
      icon: Clock,
      title: t('hero.feature2Title'),
      subtitle: t('hero.feature2Subtitle'),
      gradient: "bg-gradient-secondary",
      glow: "shadow-glow-secondary",
    },
    {
      icon: Zap,
      title: t('hero.feature3Title'),
      subtitle: t('hero.feature3Subtitle'),
      gradient: "bg-gradient-accent",
      glow: "",
    },
  ];

  return (
    <section className="relative overflow-hidden py-24 md:py-36">
      {/* Animated Background Effects */}
      <div className="absolute inset-0 bg-gradient-hero" />
      
      {/* Animated Glow Orbs */}
      <div className="absolute -top-40 right-1/4 h-[500px] w-[500px] rounded-full bg-primary/30 blur-[120px] opacity-40" />
      <div className="absolute top-1/2 -left-20 h-[400px] w-[400px] rounded-full bg-secondary/20 blur-[100px] opacity-40" />
      <div className="absolute bottom-0 right-1/3 h-[300px] w-[300px] rounded-full bg-accent/20 blur-[80px] opacity-40" />

      {/* Floating Elements */}
      <motion.div
        className="absolute top-32 left-[15%] hidden lg:block"
        animate={{ y: [-10, 10, -10] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="h-20 w-20 rounded-2xl glass flex items-center justify-center shadow-glow-primary/30">
          <Star className="h-10 w-10 text-accent fill-accent" />
        </div>
      </motion.div>
      
      <motion.div
        className="absolute top-32 right-[15%] hidden lg:block"
        animate={{ y: [10, -10, 10] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      >
        <div className="h-20 w-20 rounded-2xl glass flex items-center justify-center shadow-glow-secondary/30">
          <TrendingUp className="h-10 w-10 text-secondary" />
        </div>
      </motion.div>


      <div className="container relative mx-auto px-4">
        <motion.div
          className="mx-auto max-w-4xl text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
          >
            <div className="mb-8 inline-flex items-center gap-2 rounded-full glass px-5 py-2.5 text-sm font-medium text-primary border border-primary/20">
              <Sparkles className="h-4 w-4" />
              <span>{h('hero_badge', 'hero.badge')}</span>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
            </div>
          </motion.div>

          {/* Heading */}
          <motion.h1 
            className="mb-8 text-4xl font-extrabold leading-relaxed text-foreground md:text-5xl lg:text-7xl"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            {h('hero_title1', 'hero.title1')}
            <br />
            <span className="text-gradient-primary inline-block relative pb-3">
              {h('hero_title2', 'hero.title2')}
              <motion.span
                className="absolute bottom-0 left-0 right-0 h-1.5 bg-gradient-primary rounded-full origin-right"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.8, duration: 0.6 }}
                style={{ transformOrigin: isRTL ? 'right' : 'left' }}
              />
            </span>
            <br />
            <span className="text-muted-foreground text-3xl md:text-4xl lg:text-5xl">{h('hero_title3', 'hero.title3')}</span>
          </motion.h1>

          {/* Subheading */}
          <motion.p
            className="mx-auto mb-10 max-w-2xl text-lg md:text-xl text-muted-foreground leading-relaxed"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            {h('hero_subtitle', 'hero.subtitle')}
            <br className="hidden sm:block" />
            {h('hero_subtitle_desc', 'hero.subtitleDesc')}
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            className="flex flex-col items-center justify-center gap-4 sm:flex-row"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
            >
              <a href="#products">
                <Button variant="hero" size="xl" className="gap-2 shadow-glow-primary text-lg px-8 py-6">
                  {t('hero.browseProducts')}
                  {isRTL ? <ArrowLeft className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
                </Button>
              </a>
            </motion.div>
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
            >
              <Link to="/contact">
                <Button variant="outline" size="xl" className="text-lg px-8 py-6 border-2">
                  {t('hero.contactUs')}
                </Button>
              </Link>
            </motion.div>
          </motion.div>

          {/* Features */}
          <motion.div
            className="mt-20 grid grid-cols-1 gap-6 sm:grid-cols-3"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.5 }}
          >
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                className="group flex flex-col items-center gap-4 rounded-3xl glass p-8"
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -8, boxShadow: "0 20px 40px -15px rgba(139, 92, 246, 0.3)" }}
                transition={{ delay: 0.6 + index * 0.15, duration: 0.5 }}
              >
                <motion.div 
                  className={`flex h-16 w-16 items-center justify-center rounded-2xl ${feature.gradient} ${feature.glow}`}
                  whileHover={{ scale: 1.1 }}
                >
                  <feature.icon className="h-8 w-8 text-primary-foreground" />
                </motion.div>
                <div className="text-center">
                  <div className="text-xl font-bold text-foreground mb-1">{feature.title}</div>
                  <div className="text-sm text-muted-foreground">{feature.subtitle}</div>
                </div>
              </motion.div>
            ))}
          </motion.div>

        </motion.div>
      </div>
    </section>
  );
};

export default Hero;
