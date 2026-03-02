import { useRef, useState, useEffect } from "react";
import { db } from "@/lib/supabaseClient";
import { motion, useInView } from "framer-motion";
import { Sparkles, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import ProductCard from "@/components/ProductCard";

const fetchNewArrivals = async () => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data } = await db
    .from("products")
    .select("*, categories(name, name_en)")
    .eq("is_active", true)
    .gte("created_at", sevenDaysAgo.toISOString())
    .order("created_at", { ascending: false })
    .limit(6);

  return data || [];
};

const NewArrivalsSection = () => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === "ar";
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  const { data: products = [] } = useQuery({
    queryKey: ["new-arrivals"],
    queryFn: fetchNewArrivals,
    staleTime: 5 * 60 * 1000,
  });

  if (products.length === 0) return null;

  return (
    <section className="py-16 relative" ref={ref}>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[600px] h-[300px] bg-green-500/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 relative">
        <motion.div
          className="mb-10 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
        >
          <motion.div
            className="inline-flex items-center gap-2 bg-green-500/10 text-green-600 dark:text-green-400 px-4 py-2 rounded-full text-sm font-medium mb-4"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
            transition={{ delay: 0.2 }}
          >
            <motion.div
              animate={{ rotate: [0, 15, -15, 0] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <Sparkles className="h-4 w-4" />
            </motion.div>
            <span>{isRTL ? "وصل حديثاً" : "New Arrivals"}</span>
            <Clock className="h-3.5 w-3.5" />
          </motion.div>
          <h2 className="text-2xl md:text-4xl font-bold text-foreground">
            {isRTL ? "أحدث المنتجات" : "Latest Products"}{" "}
            <span className="text-green-500">
              {isRTL ? "هذا الأسبوع ✨" : "This Week ✨"}
            </span>
          </h2>
        </motion.div>

        <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {products.map((product: any, index: number) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              className="relative"
            >
              {/* NEW badge */}
              <motion.div
                className="absolute -top-2 -start-2 z-20 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg"
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                {isRTL ? "جديد ✨" : "NEW ✨"}
              </motion.div>
              <ProductCard
                id={product.id}
                title={isRTL ? product.name : (product.name_en || product.name)}
                description={isRTL ? (product.description || "") : (product.description_en || product.description || "")}
                price={Number(product.price)}
                image={product.image_url || undefined}
                category={isRTL ? product.categories?.name : (product.categories?.name_en || product.categories?.name)}
                platform={product.platform || undefined}
                warranty_days={product.warranty_days || undefined}
                sales_count={product.sales_count || 0}
                average_rating={product.average_rating || 0}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default NewArrivalsSection;
