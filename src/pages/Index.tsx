import { useState } from "react";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import StatsSection from "@/components/StatsSection";
import ProductsSection from "@/components/ProductsSection";
import ReviewsSection from "@/components/ReviewsSection";
import Footer from "@/components/Footer";
import NewArrivalsSection from "@/components/NewArrivalsSection";
import TelegramPlansSection from "@/components/TelegramPlansSection";
import UserSidebar from "@/components/user/UserSidebar";
import FlashSaleBanner from "@/components/FlashSaleBanner";
import { useTrackVisit } from "@/hooks/useTrackVisit";
import { useAppData } from "@/components/AppInitializer";
import AIChatBot from "@/components/AIChatBot";
import { Construction } from "lucide-react";

const Index = () => {
  useTrackVisit("/");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, isAdmin, maintenanceMode } = useAppData();
  const isLoggedIn = !!user;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Admin banner when maintenance is active */}
      {maintenanceMode && isAdmin && (
        <div className="bg-destructive text-destructive-foreground text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2">
          <Construction className="h-4 w-4" />
          <span>وضع الصيانة مفعّل - أنت تشاهد المتجر كمسؤول. الزوار يرون صفحة الصيانة.</span>
        </div>
      )}
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
        <NewArrivalsSection />
        <ProductsSection />
        <div id="telegram-plans">
          <TelegramPlansSection />
        </div>
        <ReviewsSection />
      </main>
      <Footer />
      <AIChatBot />
    </div>
  );
};

export default Index;
