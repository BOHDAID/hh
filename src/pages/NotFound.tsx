import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Home, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 bg-gradient-hero pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl" />

      <motion.div
        className="text-center relative z-10 px-6"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
        >
          <SearchX className="h-20 w-20 text-primary mx-auto mb-6" />
        </motion.div>

        <motion.h1
          className="text-7xl md:text-9xl font-bold text-gradient-primary mb-4"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
        >
          404
        </motion.h1>

        <motion.p
          className="text-xl md:text-2xl font-semibold text-foreground mb-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          {isRTL ? 'الصفحة غير موجودة' : 'Page Not Found'}
        </motion.p>

        <motion.p
          className="text-muted-foreground mb-8 max-w-md mx-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {isRTL
            ? 'عذراً، الصفحة التي تبحث عنها غير موجودة أو تم نقلها.'
            : "Sorry, the page you're looking for doesn't exist or has been moved."}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Button
            variant="hero"
            size="lg"
            onClick={() => navigate('/')}
            className="gap-2"
          >
            <Home className="h-5 w-5" />
            {isRTL ? 'العودة للرئيسية' : 'Back to Home'}
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default NotFound;
