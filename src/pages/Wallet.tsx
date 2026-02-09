import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db, getAuthClient } from "@/lib/supabaseClient";
import { formatDateShortArabic } from "@/lib/formatDate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import UserLayout from "@/components/user/UserLayout";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { 
  Loader2, 
  Wallet as WalletIcon, 
  Plus, 
  ArrowUpRight, 
  ArrowDownRight,
  Clock,
  CreditCard,
  Sparkles,
  TrendingUp,
  Zap
} from "lucide-react";
import { useTranslation } from "react-i18next";

interface WalletData {
  id: string;
  balance: number;
  total_earned?: number;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  created_at: string;
  status: string | null;
}

const Wallet = () => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const navigate = useNavigate();
  const { toast } = useToast();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [showTopUp, setShowTopUp] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");

  // جلب البيانات الأولية
  const fetchWalletData = async (userId: string): Promise<string | null> => {
    // جلب المحفظة
    const { data: walletData, error: walletError } = await db
      .from("wallets")
      .select("id, balance, total_earned")
      .eq("user_id", userId)
      .maybeSingle();

    if (walletError) {
      console.error("❌ [Wallet] Failed to fetch wallet:", walletError);
      toast({
        title: "خطأ",
        description: walletError.message,
        variant: "destructive",
      });
      return null;
    }

    // إذا ما فيه محفظة، ننشئها تلقائياً
    let effectiveWallet = walletData as WalletData | null;
    if (!effectiveWallet) {
      const { data: created, error: createError } = await db
        .from("wallets")
        .insert({ user_id: userId, balance: 0, total_earned: 0 })
        .select("id, balance, total_earned")
        .single();

      if (createError) {
        console.error("❌ [Wallet] Failed to create wallet:", createError);
        toast({
          title: "خطأ",
          description: createError.message,
          variant: "destructive",
        });
        setWallet({ id: "", balance: 0, total_earned: 0 });
        setTransactions([]);
        return null;
      }

      effectiveWallet = created as WalletData;
    }

    setWallet(effectiveWallet);

    // جلب العمليات
    const { data: txData, error: txError } = await db
      .from("wallet_transactions")
      .select("*")
      .eq("wallet_id", effectiveWallet.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (txError) {
      console.error("❌ [Wallet] Failed to fetch transactions:", txError);
    }
    setTransactions(txData || []);

    return effectiveWallet.id;
  };

  useEffect(() => {
    const authClient = getAuthClient();
    let walletChannel: ReturnType<typeof db.channel> | null = null;
    let txChannel: ReturnType<typeof db.channel> | null = null;
    let pollIntervalId: number | null = null;
    
    const initWallet = async () => {
      try {
        const { data: { session } } = await authClient.auth.getSession();
        
        if (!session) {
          navigate("/login?redirect=/wallet");
          return;
        }
        
        setUser(session.user);

        // جلب البيانات الأولية
        const walletId = await fetchWalletData(session.user.id);
        setLoading(false);

        // إعداد Realtime للمحفظة - تحديث فوري عند تغيير الرصيد
        walletChannel = db
          .channel('wallet-realtime')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'wallets',
              filter: `user_id=eq.${session.user.id}`
            },
            (payload) => {
              console.log("🔄 [Realtime] Wallet updated:", payload);
              if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
                const newData = payload.new as WalletData;
                setWallet(prev => ({
                  ...prev,
                  id: newData.id,
                  balance: newData.balance,
                  total_earned: newData.total_earned
                }));
                toast({
                  title: "🎉 تم شحن رصيدك بنجاح!",
                  description: `رصيدك الجديد: $${newData.balance?.toFixed(2)}`,
                  variant: "default",
                });
              }
            }
          )
          .subscribe((status) => {
            console.log('📡 [Realtime] wallet channel status:', status);
          });

        // إعداد Realtime للعمليات - تحديث فوري عند إضافة عملية جديدة
        if (walletId) {
          txChannel = db
            .channel('transactions-realtime')
            .on(
              'postgres_changes',
              {
                event: 'INSERT',
                schema: 'public',
                table: 'wallet_transactions',
                filter: `wallet_id=eq.${walletId}`
              },
              (payload) => {
                console.log("🔄 [Realtime] New transaction:", payload);
                const newTx = payload.new as Transaction;
                setTransactions(prev => [newTx, ...prev].slice(0, 20));
              }
            )
            .subscribe((status) => {
              console.log('📡 [Realtime] transactions channel status:', status);
            });
        }

        // Fallback مزامنة تلقائية حتى لو الـ Realtime مو مفعّل بالخارج
        pollIntervalId = window.setInterval(() => {
          fetchWalletData(session.user.id).catch((err) => {
            console.error('❌ [Wallet] Poll refresh failed:', err);
          });
        }, 15000);

      } catch (err) {
        console.error("❌ [Wallet] Error:", err);
        setLoading(false);
      }
    };

    initWallet();

    // تنظيف الـ subscriptions عند مغادرة الصفحة
    return () => {
      if (walletChannel) {
        db.removeChannel(walletChannel);
      }
      if (txChannel) {
        db.removeChannel(txChannel);
      }
      if (pollIntervalId) {
        window.clearInterval(pollIntervalId);
      }
    };
  }, [navigate, toast]);

  const parsedAmount = parseFloat(topUpAmount) || 0;
  const isValidAmount = parsedAmount >= 1; // Minimum $1 for general, $5 for PayPal is checked in WalletTopUp

  const handleTopUp = async () => {
    const amount = parseFloat(topUpAmount);
    if (isNaN(amount) || amount < 1) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال مبلغ صحيح (الحد الأدنى $1)",
        variant: "destructive",
      });
      return;
    }

    // Navigate with the original amount - fees are calculated in WalletTopUp based on payment method
    navigate(`/checkout/wallet?amount=${amount}`);
    setShowTopUp(false);
  };

  const getTransactionIcon = (type: string, amount: number) => {
    if (amount > 0) {
      return <ArrowDownRight className="h-5 w-5 text-emerald-500" />;
    }
    return <ArrowUpRight className="h-5 w-5 text-rose-500" />;
  };

  const getTransactionLabel = (type: string) => {
    switch (type) {
      case "deposit": return isRTL ? "إيداع" : "Deposit";
      case "purchase": return isRTL ? "شراء" : "Purchase";
      case "refund": return isRTL ? "استرداد" : "Refund";
      case "affiliate": return isRTL ? "عمولة تسويق" : "Affiliate Commission";
      default: return type;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <Loader2 className="h-10 w-10 text-primary" />
        </motion.div>
      </div>
    );
  }

  return (
    <UserLayout title={t('wallet.title')} subtitle={isRTL ? "إدارة رصيدك ومعاملاتك المالية" : "Manage your balance and transactions"}>
      <div className="max-w-2xl mx-auto space-y-8">
        
        {/* Wallet Balance Card */}
        <motion.div 
          className="relative rounded-3xl overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/80 to-secondary" />
          
          {/* Animated orbs */}
          <motion.div 
            className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl"
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3]
            }}
            transition={{ duration: 4, repeat: Infinity }}
          />
          <motion.div 
            className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full blur-3xl"
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.2, 0.4, 0.2]
            }}
            transition={{ duration: 4, repeat: Infinity, delay: 1 }}
          />

          {/* Content */}
          <div className="relative p-8 text-center text-white">
            <motion.div 
              className="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-6"
              whileHover={{ scale: 1.1, rotate: 5 }}
            >
              <WalletIcon className="h-10 w-10" />
            </motion.div>
            
            <p className="text-white/80 text-lg mb-2">{t('wallet.balance')}</p>
            
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
            >
              <p className="text-6xl font-extrabold mb-2">
                ${wallet?.balance?.toFixed(2) || "0.00"}
              </p>
            </motion.div>
            
            <p className="text-white/60 text-sm mb-8">{isRTL ? "متاح للاستخدام" : "Available to use"}</p>
            
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button 
                size="lg" 
                className="gap-2 bg-white text-primary hover:bg-white/90 font-bold px-8 py-6 text-lg rounded-2xl shadow-xl"
                onClick={() => setShowTopUp(true)}
              >
                <Plus className="h-5 w-5" />
                {t('wallet.topUp')}
              </Button>
            </motion.div>
          </div>
        </motion.div>

        {/* Quick Stats */}
        <motion.div 
          className="grid grid-cols-2 gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <motion.div 
            className="bg-card border border-border/50 rounded-2xl p-5 group hover:border-emerald-500/30 transition-colors"
            whileHover={{ y: -5 }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-emerald-500" />
              </div>
              <p className="text-sm text-muted-foreground">{isRTL ? "إجمالي المكتسب" : "Total Earned"}</p>
            </div>
            <p className="text-3xl font-bold text-emerald-500">
              ${(wallet?.total_earned ?? 0).toFixed(2)}
            </p>
          </motion.div>
          
          <motion.div 
            className="bg-card border border-border/50 rounded-2xl p-5 group hover:border-primary/30 transition-colors"
            whileHover={{ y: -5 }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">{isRTL ? "عدد العمليات" : "Transactions"}</p>
            </div>
            <p className="text-3xl font-bold text-foreground">
              {transactions.length}
            </p>
          </motion.div>
        </motion.div>

        {/* Transactions History */}
        <motion.div 
          className="bg-card border border-border/50 rounded-3xl p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{t('wallet.transactions')}</h2>
              <p className="text-sm text-muted-foreground">{isRTL ? "آخر 20 عملية" : "Last 20 transactions"}</p>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {transactions.length === 0 ? (
              <motion.div 
                className="text-center py-12"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.div
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <CreditCard className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
                </motion.div>
                <p className="text-muted-foreground font-medium">{t('wallet.noTransactions')}</p>
                <p className="text-sm text-muted-foreground/70 mt-1">{isRTL ? "ستظهر هنا عند إجراء أي معاملة" : "Will appear here when you make a transaction"}</p>
              </motion.div>
            ) : (
              <motion.div 
                className="space-y-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                {transactions.map((tx, index) => (
                  <motion.div
                    key={tx.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    whileHover={{ scale: 1.02, x: 5 }}
                    className="flex items-center gap-4 p-4 rounded-2xl bg-muted/30 border border-border/30 hover:border-primary/20 transition-all cursor-default"
                  >
                    <motion.div 
                      className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        tx.amount > 0 ? 'bg-emerald-500/10' : 'bg-rose-500/10'
                      }`}
                      whileHover={{ rotate: 10 }}
                    >
                      {getTransactionIcon(tx.type, tx.amount)}
                    </motion.div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground">
                        {getTransactionLabel(tx.type)}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {tx.description || "—"}
                      </p>
                    </div>
                    
                    <div className="text-left">
                      <p className={`text-lg font-bold ${
                        tx.amount > 0 ? 'text-emerald-500' : 'text-rose-500'
                      }`}>
                        {tx.amount > 0 ? '+' : ''}${Math.abs(tx.amount).toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateShortArabic(tx.created_at)}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Top Up Dialog */}
      <Dialog open={showTopUp} onOpenChange={setShowTopUp}>
        <DialogContent className="sm:max-w-md" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {t('wallet.topUp')}
            </DialogTitle>
            <DialogDescription>
              {isRTL ? "اختر المبلغ الذي تريد إضافته لمحفظتك" : "Choose the amount you want to add to your wallet"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Quick amounts */}
            <div className="grid grid-cols-4 gap-3">
              {[5, 10, 25, 50].map((amount) => (
                <motion.div key={amount} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    variant={topUpAmount === amount.toString() ? "default" : "outline"}
                    onClick={() => setTopUpAmount(amount.toString())}
                    className={`w-full h-14 text-lg font-bold rounded-xl ${
                      topUpAmount === amount.toString() 
                        ? "bg-primary" 
                        : "hover:border-primary/50"
                    }`}
                  >
                    ${amount}
                  </Button>
                </motion.div>
              ))}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-sm text-muted-foreground">{isRTL ? "أو أدخل مبلغ آخر" : "Or enter a custom amount"}</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Custom amount */}
            <div className="relative">
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xl font-bold text-muted-foreground">
                $
              </span>
              <Input
                type="number"
                placeholder="0.00"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                className="pr-10 h-14 text-2xl font-bold text-center rounded-xl"
                min={1}
              />
            </div>

            {/* Minimum Amount Warning */}
            {parsedAmount > 0 && parsedAmount < 1 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 text-center"
              >
              <p className="text-destructive text-sm font-medium">
                {isRTL ? "الحد الأدنى للشحن هو 1 دولار" : "Minimum top-up amount is $1"}
              </p>
              </motion.div>
            )}

            {/* Amount Preview */}
            {parsedAmount >= 1 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-muted/50 border border-border rounded-xl p-4 text-center"
              >
                <p className="text-muted-foreground text-sm mb-1">{isRTL ? "سيتم إضافة لرصيدك" : "Will be added to your balance"}</p>
                <p className="font-bold text-2xl text-primary">${parsedAmount.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  {isRTL ? "* قد تُضاف رسوم حسب طريقة الدفع المختارة" : "* Fees may apply depending on payment method"}
                </p>
              </motion.div>
            )}

            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                variant="hero"
                className="w-full h-14 text-lg rounded-xl"
                onClick={handleTopUp}
                disabled={!isValidAmount}
              >
                <CreditCard className={`h-5 w-5 ${isRTL ? 'ml-2' : 'mr-2'}`} />
                {isRTL ? "متابعة للدفع" : "Continue to Payment"}
              </Button>
            </motion.div>
          </div>
        </DialogContent>
      </Dialog>
    </UserLayout>
  );
};

export default Wallet;
