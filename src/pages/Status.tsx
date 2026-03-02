import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { CheckCircle, XCircle, AlertCircle, RefreshCw, Globe, CreditCard, Coins, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/supabaseClient";
import { invokeCloudFunctionPublic } from "@/lib/cloudFunctions";
import { motion } from "framer-motion";

interface ServiceStatus {
  name: string;
  nameEn: string;
  status: "operational" | "down" | "checking";
  icon: React.ReactNode;
  category: "core" | "payment";
}

const Status = () => {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === "ar";
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkServices = async () => {
    setLoading(true);

    const initial: ServiceStatus[] = [
      { name: "الموقع", nameEn: "Website", status: "checking", icon: <Globe className="h-5 w-5" />, category: "core" },
      { name: "قاعدة البيانات", nameEn: "Database", status: "checking", icon: <Globe className="h-5 w-5" />, category: "core" },
      { name: "PayPal", nameEn: "PayPal", status: "checking", icon: <CreditCard className="h-5 w-5" />, category: "payment" },
      { name: "NowPayments", nameEn: "NowPayments", status: "checking", icon: <Coins className="h-5 w-5" />, category: "payment" },
      { name: "Cryptomus", nameEn: "Cryptomus", status: "checking", icon: <Coins className="h-5 w-5" />, category: "payment" },
      { name: "OxaPay", nameEn: "OxaPay", status: "checking", icon: <Coins className="h-5 w-5" />, category: "payment" },
      { name: "كريبتو مباشر", nameEn: "Direct Crypto", status: "checking", icon: <Coins className="h-5 w-5" />, category: "payment" },
      { name: "LemonSqueezy", nameEn: "LemonSqueezy", status: "checking", icon: <CreditCard className="h-5 w-5" />, category: "payment" },
      { name: "SellAuth", nameEn: "SellAuth", status: "checking", icon: <CreditCard className="h-5 w-5" />, category: "payment" },
      { name: "Ivno", nameEn: "Ivno", status: "checking", icon: <CreditCard className="h-5 w-5" />, category: "payment" },
    ];
    setServices(initial);

    const updated = [...initial];

    // Website check - if we're here, it's operational
    updated[0].status = "operational";

    // Database check
    try {
      const { error } = await db.from("categories").select("id").limit(1);
      updated[1].status = error ? "down" : "operational";
    } catch {
      updated[1].status = "down";
    }

    // Payment methods check
    try {
      const { data, error } = await invokeCloudFunctionPublic<any>("payment-methods-status", {});
      if (!error && data) {
        updated[2].status = data.paypalEnabled ? "operational" : "down";
        updated[3].status = data.cryptoEnabled ? "operational" : "down";
        updated[4].status = data.cryptomusEnabled ? "operational" : "down";
        updated[5].status = data.oxaPayEnabled ? "operational" : "down";
        updated[6].status = data.directCryptoEnabled ? "operational" : "down";
        updated[7].status = data.lemonSqueezyEnabled ? "operational" : "down";
        updated[8].status = data.sellAuthEnabled ? "operational" : "down";
        updated[9].status = data.ivnoEnabled ? "operational" : "down";
      } else {
        for (let i = 2; i <= 9; i++) updated[i].status = "down";
      }
    } catch {
      for (let i = 2; i <= 9; i++) updated[i].status = "down";
    }

    setServices(updated);
    setLastChecked(new Date());
    setLoading(false);
  };

  useEffect(() => {
    checkServices();
  }, []);

  const coreServices = services.filter(s => s.category === "core");
  const paymentServices = services.filter(s => s.category === "payment");
  const allOperational = services.every(s => s.status === "operational" || s.status === "checking");
  const someDown = services.some(s => s.status === "down");

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === "checking") return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
    if (status === "operational") return <CheckCircle className="h-5 w-5 text-green-500" />;
    return <XCircle className="h-5 w-5 text-destructive" />;
  };

  const StatusBadge = ({ status }: { status: string }) => {
    if (status === "checking") return <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">{isRTL ? "جاري الفحص" : "Checking"}</span>;
    if (status === "operational") return <span className="text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-400">{isRTL ? "يعمل" : "Operational"}</span>;
    return <span className="text-xs px-2 py-1 rounded-full bg-destructive/10 text-destructive">{isRTL ? "متوقف" : "Down"}</span>;
  };

  return (
    <div className="min-h-screen bg-background" dir={isRTL ? "rtl" : "ltr"}>
      <Header />
      <main className="container mx-auto px-4 py-12 max-w-2xl">
        {/* Overall Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          {loading ? (
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <h1 className="text-2xl font-bold">{isRTL ? "جاري فحص الخدمات..." : "Checking services..."}</h1>
            </div>
          ) : allOperational ? (
            <>
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-foreground">{isRTL ? "جميع الخدمات تعمل بشكل طبيعي" : "All Systems Operational"}</h1>
            </>
          ) : (
            <>
              <AlertCircle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-foreground">{isRTL ? "بعض الخدمات متأثرة" : "Some Services Affected"}</h1>
            </>
          )}
        </motion.div>

        {/* Core Services */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <h2 className="text-lg font-semibold mb-3 text-foreground">{isRTL ? "الخدمات الأساسية" : "Core Services"}</h2>
          <Card className="mb-8">
            <CardContent className="p-0 divide-y divide-border">
              {coreServices.map((service, i) => (
                <div key={i} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <StatusIcon status={service.status} />
                    <span className="font-medium text-foreground">{isRTL ? service.name : service.nameEn}</span>
                  </div>
                  <StatusBadge status={service.status} />
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Payment Services */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h2 className="text-lg font-semibold mb-3 text-foreground">{isRTL ? "بوابات الدفع" : "Payment Gateways"}</h2>
          <Card className="mb-8">
            <CardContent className="p-0 divide-y divide-border">
              {paymentServices.map((service, i) => (
                <div key={i} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <StatusIcon status={service.status} />
                    <span className="font-medium text-foreground">{isRTL ? service.name : service.nameEn}</span>
                  </div>
                  <StatusBadge status={service.status} />
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Refresh */}
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={checkServices} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            <span className="mr-2">{isRTL ? "تحديث" : "Refresh"}</span>
          </Button>
          {lastChecked && (
            <span className="text-xs text-muted-foreground">
              {isRTL ? "آخر فحص:" : "Last checked:"} {lastChecked.toLocaleTimeString()}
            </span>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Status;
