import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Loader2, Construction } from "lucide-react";
import { motion } from "framer-motion";
import useDynamicFavicon from "./hooks/useDynamicFavicon";
import useOpenGraphMeta from "./hooks/useOpenGraphMeta";
import ErrorBoundary from "./components/ErrorBoundary";
import AppInitializer, { useAppData } from "./components/AppInitializer";

// Lazy-loaded pages
const Index = lazy(() => import("./pages/Index"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Contact = lazy(() => import("./pages/Contact"));
const Admin = lazy(() => import("./pages/Admin"));
const Checkout = lazy(() => import("./pages/Checkout"));
const OrderInvoice = lazy(() => import("./pages/OrderInvoice"));
const MyOrders = lazy(() => import("./pages/MyOrders"));
const CryptoPayment = lazy(() => import("./pages/CryptoPayment"));
const Cart = lazy(() => import("./pages/Cart"));
const Wallet = lazy(() => import("./pages/Wallet"));
const WalletTopUp = lazy(() => import("./pages/WalletTopUp"));
const Profile = lazy(() => import("./pages/Profile"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ProductRequests = lazy(() => import("./pages/ProductRequests"));
const Support = lazy(() => import("./pages/Support"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Wishlist = lazy(() => import("./pages/Wishlist"));
const Terms = lazy(() => import("./pages/Terms"));
const RefundPolicy = lazy(() => import("./pages/RefundPolicy"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const Demo = lazy(() => import("./pages/Demo"));
const Status = lazy(() => import("./pages/Status"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

// صفحة الصيانة
const MaintenancePage = () => {
  const { maintenanceMessage } = useAppData();
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
        <a href="/login" className="inline-block text-sm text-primary hover:underline mt-4">
          تسجيل دخول المسؤول
        </a>
      </motion.div>
    </div>
  );
};

const MAINTENANCE_ALLOWED_PATHS = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/admin"];

const MaintenanceGuard = ({ children }: { children: React.ReactNode }) => {
  const { maintenanceMode, isAdmin } = useAppData();
  const location = useLocation();

  if (maintenanceMode && !isAdmin) {
    const isAllowed = MAINTENANCE_ALLOWED_PATHS.some(p => location.pathname.startsWith(p));
    if (!isAllowed) {
      return <MaintenancePage />;
    }
  }

  return <>{children}</>;
};

const AppContent = () => {
  useDynamicFavicon();
  useOpenGraphMeta();
  return (
    <BrowserRouter>
      <MaintenanceGuard>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/checkout/wallet" element={<WalletTopUp />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/checkout/:productId" element={<Checkout />} />
            <Route path="/order/:orderId" element={<OrderInvoice />} />
            <Route path="/invoice/:orderId" element={<OrderInvoice />} />
            <Route path="/payment/:orderId" element={<CryptoPayment />} />
            <Route path="/my-orders" element={<MyOrders />} />
            <Route path="/product-requests" element={<ProductRequests />} />
            <Route path="/support" element={<Support />} />
            <Route path="/payment-success" element={<PaymentSuccess />} />
            <Route path="/wishlist" element={<Wishlist />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/refund-policy" element={<RefundPolicy />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/demo" element={<Demo />} />
            <Route path="/status" element={<Status />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </MaintenanceGuard>
    </BrowserRouter>
  );
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AppInitializer>
          <AppContent />
        </AppInitializer>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
