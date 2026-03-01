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

const Index = () => {
  useTrackVisit("/");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAppData();
  const isLoggedIn = !!user;

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
