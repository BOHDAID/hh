import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Contact from "./pages/Contact";
import Admin from "./pages/Admin";
import Checkout from "./pages/Checkout";
import OrderInvoice from "./pages/OrderInvoice";
import MyOrders from "./pages/MyOrders";
import CryptoPayment from "./pages/CryptoPayment";
import Cart from "./pages/Cart";
import Wallet from "./pages/Wallet";
import WalletTopUp from "./pages/WalletTopUp";
import Profile from "./pages/Profile";
import VerifyEmail from "./pages/VerifyEmail";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ProductRequests from "./pages/ProductRequests";
import Support from "./pages/Support";
import PaymentSuccess from "./pages/PaymentSuccess";

import NotFound from "./pages/NotFound";
import Wishlist from "./pages/Wishlist";
import Terms from "./pages/Terms";
import RefundPolicy from "./pages/RefundPolicy";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import useDynamicFavicon from "./hooks/useDynamicFavicon";

const queryClient = new QueryClient();

const AppContent = () => {
  useDynamicFavicon();
  return (
    <BrowserRouter>
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
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppContent />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
