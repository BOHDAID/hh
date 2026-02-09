import { useEffect, useState, useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Users, Package, Star, Zap } from "lucide-react";
import { db } from "@/lib/supabaseClient";
import { useTranslation } from "react-i18next";

interface StatItem {
  icon: React.ElementType;
  value: number;
  suffix: string;
  label: string;
  color: string;
}

interface StatsData {
  happyCustomers: number;
  productsSold: number;
  averageRating: number;
}

const AnimatedCounter = ({ value, suffix, inView, decimals = 0 }: { value: number; suffix: string; inView: boolean; decimals?: number }) => {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    if (!inView) return;
    
    const duration = 2000;
    const steps = 60;
    const increment = value / steps;
    let current = 0;
    
    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setCount(value);
        clearInterval(timer);
      } else {
        setCount(decimals > 0 ? Number(current.toFixed(decimals)) : Math.floor(current));
      }
    }, duration / steps);
    
    return () => clearInterval(timer);
  }, [value, inView, decimals]);
  
  return (
    <span>
      {decimals > 0 ? count.toFixed(decimals) : count}
      {suffix}
    </span>
  );
};

const StatsSection = () => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [statsData, setStatsData] = useState<StatsData>({
    happyCustomers: 0,
    productsSold: 0,
    averageRating: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data: ordersData } = await db
          .from('orders')
          .select('user_id, payment_status')
          .eq('status', 'completed')
          .eq('payment_status', 'completed');
        
        const uniqueCustomers = ordersData 
          ? new Set(ordersData.map(o => o.user_id)).size 
          : 0;

        const { data: productsData } = await db
          .from('products')
          .select('sales_count');
        
        const totalSold = productsData 
          ? productsData.reduce((sum, p) => sum + (p.sales_count || 0), 0) 
          : 0;

        const { data: reviewsData } = await db
          .from('reviews')
          .select('rating')
          .eq('is_approved', true);
        
        const avgRating = reviewsData && reviewsData.length > 0
          ? reviewsData.reduce((sum, r) => sum + r.rating, 0) / reviewsData.length
          : 0;

        setStatsData({
          happyCustomers: uniqueCustomers || 0,
          productsSold: totalSold || 0,
          averageRating: Number(avgRating.toFixed(1)) || 0,
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const stats: StatItem[] = [
    { 
      icon: Users, 
      value: Math.max(statsData.happyCustomers, 1), 
      suffix: "+", 
      label: t('stats.happyCustomers'), 
      color: "text-primary" 
    },
    { 
      icon: Package, 
      value: Math.max(statsData.productsSold, 1), 
      suffix: "+", 
      label: t('stats.productsSold'), 
      color: "text-secondary" 
    },
    { 
      icon: Star, 
      value: statsData.averageRating > 0 ? statsData.averageRating : 5.0, 
      suffix: "", 
      label: t('stats.rating'), 
      color: "text-accent" 
    },
    { 
      icon: Zap, 
      value: 24, 
      suffix: "/7", 
      label: isRTL ? "دعم فني" : "Support", 
      color: "text-primary" 
    },
  ];

  return (
    <section ref={ref} className="py-16 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/30 to-transparent" />
      
      <div className="container mx-auto px-4 relative">
        <motion.div 
          className="grid grid-cols-2 md:grid-cols-4 gap-6"
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={{
            hidden: {},
            visible: {
              transition: { staggerChildren: 0.1 }
            }
          }}
        >
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              className="text-center p-6 rounded-2xl glass group hover:border-primary/30 transition-all duration-300"
              variants={{
                hidden: { opacity: 0, y: 30 },
                visible: { 
                  opacity: 1, 
                  y: 0,
                  transition: { duration: 0.5, delay: index * 0.1 }
                }
              }}
              whileHover={{ scale: 1.05 }}
            >
              <motion.div 
                className={`inline-flex items-center justify-center h-14 w-14 rounded-xl bg-card mb-4 ${stat.color} group-hover:scale-110 transition-transform`}
              >
                <stat.icon className="h-7 w-7" />
              </motion.div>
              <div className="text-3xl md:text-4xl font-bold text-foreground mb-2">
                {!loading ? (
                  <AnimatedCounter 
                    value={stat.value} 
                    suffix={stat.suffix} 
                    inView={isInView} 
                    decimals={stat.label === t('stats.rating') ? 1 : 0}
                  />
                ) : (
                  <span className="animate-pulse">...</span>
                )}
              </div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default StatsSection;
