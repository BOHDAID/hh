import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import useDynamicFavicon from "./hooks/useDynamicFavicon";
import useOpenGraphMeta from "./hooks/useOpenGraphMeta";
import ErrorBoundary from "./components/ErrorBoundary";
import AppInitializer from "./components/AppInitializer";

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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000, // 2 minutes default
      gcTime: 10 * 60 * 1000, // 10 minutes cache
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

const AppContent = () => {
  useDynamicFavicon();
  useOpenGraphMeta();
  return (
    <BrowserRouter>
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
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
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
