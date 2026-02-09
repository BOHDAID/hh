import ProductCard from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/supabaseClient";
import { Loader2, PackageX, Sparkles } from "lucide-react";
import { motion, useInView, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";

interface Product {
  id: string;
  name: string;
  name_en: string | null;
  description: string | null;
  description_en: string | null;
  price: number;
  image_url: string | null;
  category_id: string | null;
  product_type: string | null;
  platform: string | null;
  warranty_days: number | null;
  categories?: { name: string; name_en: string | null } | null;
  available_stock?: number;
}

interface Category {
  id: string;
  name: string;
  name_en: string | null;
}

const ProductsSection = () => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  useEffect(() => {
    fetchCategories();
    fetchProducts();
  }, []);

  const fetchCategories = async () => {
    const { data } = await db.from('categories').select('*');
    if (data) setCategories(data);
  };

  const fetchProducts = async () => {
    setLoading(true);
    const { data } = await db
      .from('products')
      .select('*, categories(name, name_en)')
      .eq('is_active', true)
      .order('created_at', { ascending: false }) as { data: Product[] | null };
    
    if (data) {
      const productsWithStock = await Promise.all(
        data.map(async (product) => {
          const { data: variants, count: variantCount } = await db
            .from('product_variants')
            .select('id', { count: 'exact' })
            .eq('product_id', product.id)
            .eq('is_active', true);
          
          const hasVariants = variants && variants.length > 0;
          
          if (hasVariants) {
            return { ...product, available_stock: 999, has_variants: true };
          } else {
            return { ...product, available_stock: 999, has_variants: false };
          }
        })
      );
      setProducts(productsWithStock);
    }
    setLoading(false);
  };

  const filteredProducts = activeCategory === "all" 
    ? products 
    : products.filter(p => p.category_id === activeCategory);

  return (
    <section id="products" className="py-24 relative" ref={ref}>
      {/* Background Decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 relative">
        {/* Section Header */}
        <motion.div 
          className="mb-14 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
        >
          <motion.div 
            className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
            transition={{ delay: 0.2 }}
          >
            <Sparkles className="h-4 w-4" />
            <span>{t('products.latestProducts')}</span>
          </motion.div>
          <h2 className="mb-4 text-3xl font-bold text-foreground md:text-5xl">
            {t('products.title')} <span className="text-gradient-primary">{t('products.titleHighlight')}</span>
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground text-lg">
            {t('products.subtitle')}
          </p>
        </motion.div>

        {/* Category Filters */}
        <motion.div 
          className="mb-12 flex flex-wrap justify-center gap-3"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              variant={activeCategory === "all" ? "hero" : "outline"}
              size="sm"
              className="rounded-full px-6 transition-all duration-300"
              onClick={() => setActiveCategory("all")}
            >
              {t('common.all')}
            </Button>
          </motion.div>
          {categories.map((category) => (
            <motion.div 
              key={category.id}
              whileHover={{ scale: 1.05 }} 
              whileTap={{ scale: 0.95 }}
            >
              <Button
                variant={activeCategory === category.id ? "hero" : "outline"}
                size="sm"
                className="rounded-full px-6 transition-all duration-300"
                onClick={() => setActiveCategory(category.id)}
              >
                {isRTL ? category.name : (category.name_en || category.name)}
              </Button>
            </motion.div>
          ))}
        </motion.div>

        {/* Loading State */}
        <AnimatePresence mode="wait">
          {loading && (
            <motion.div 
              className="flex justify-center py-20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-muted-foreground">{t('products.loadingProducts')}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty State */}
        <AnimatePresence mode="wait">
          {!loading && filteredProducts.length === 0 && (
            <motion.div 
              className="flex flex-col items-center justify-center py-20 text-center"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="glass rounded-3xl p-12">
                <PackageX className="h-20 w-20 text-muted-foreground/50 mb-6 mx-auto" />
                <h3 className="text-2xl font-semibold text-foreground mb-3">{t('products.noProducts')}</h3>
                <p className="text-muted-foreground">{t('products.comingSoon')}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Products Grid */}
        <AnimatePresence mode="wait">
          {!loading && filteredProducts.length > 0 && (
            <motion.div 
              className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              key={activeCategory}
            >
              {filteredProducts.map((product, index) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 30, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ 
                    delay: index * 0.08,
                    duration: 0.4,
                  }}
                  whileHover={{ y: -8 }}
                >
                  <ProductCard
                    id={product.id}
                    title={isRTL ? product.name : (product.name_en || product.name)}
                    description={isRTL ? (product.description || '') : (product.description_en || product.description || '')}
                    price={Number(product.price)}
                    image={product.image_url || undefined}
                    category={isRTL ? product.categories?.name : (product.categories?.name_en || product.categories?.name)}
                    stock={product.available_stock}
                    platform={product.platform || undefined}
                    warranty_days={product.warranty_days || undefined}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
};

export default ProductsSection;
