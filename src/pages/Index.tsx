import { useState } from "react";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import StatsSection from "@/components/StatsSection";
import ProductsSection from "@/components/ProductsSection";
import ReviewsSection from "@/components/ReviewsSection";
import Footer from "@/components/Footer";
import UserSidebar from "@/components/user/UserSidebar";
import FlashSaleBanner from "@/components/FlashSaleBanner";
import { useTrackVisit } from "@/hooks/useTrackVisit";
import { useAppData } from "@/components/AppInitializer";
import AIChatBot from "@/components/AIChatBot";
import { motion } from "framer-motion";
import { Construction } from "lucide-react";

const Index = () => {
  useTrackVisit("/");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, isAdmin, maintenanceMode, maintenanceMessage } = useAppData();
  const isLoggedIn = !!user;

  // Show maintenance page for non-admin users
  if (maintenanceMode && !isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6" dir="rtl">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md space-y-6"
        >
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
          >
            <Construction className="h-20 w-20 text-primary mx-auto" />
          </motion.div>
          <h1 className="text-3xl font-bold text-foreground">المتجر مغلق مؤقتاً</h1>
          <p className="text-muted-foreground text-lg">
            {maintenanceMessage || "نقوم بأعمال صيانة وتحديثات. سنعود قريباً!"}
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header onMenuClick={isLoggedIn ? () => setSidebarOpen(!sidebarOpen) : undefined} />
      
      {isLoggedIn && (
        <UserSidebar 
          open={sidebarOpen} 
          onClose={() => setSidebarOpen(false)} 
          onOpen={() => setSidebarOpen(true)}
        />
      )}

      <main>
        <FlashSaleBanner />
        <Hero />
        <StatsSection />
        <ProductsSection />
        <ReviewsSection />
      </main>
      <Footer />
      <AIChatBot />
    </div>
  );
};

export default Index;
