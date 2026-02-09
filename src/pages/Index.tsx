import { useState, useEffect } from "react";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import StatsSection from "@/components/StatsSection";
import ProductsSection from "@/components/ProductsSection";
import ReviewsSection from "@/components/ReviewsSection";
import Footer from "@/components/Footer";
import UserSidebar from "@/components/user/UserSidebar";
import FlashSaleBanner from "@/components/FlashSaleBanner";
import { db, getAuthClient, isExternalConfigured } from "@/lib/supabaseClient";
import { useTrackVisit } from "@/hooks/useTrackVisit";

const Index = () => {
  // Track page visit
  useTrackVisit("/");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const authClient = isExternalConfigured ? getAuthClient() : db;
    authClient.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session?.user);
    });

    const { data: { subscription } } = authClient.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session?.user);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header onMenuClick={isLoggedIn ? () => setSidebarOpen(!sidebarOpen) : undefined} />
      
      {/* Sidebar for logged-in users */}
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
    </div>
  );
};

export default Index;
