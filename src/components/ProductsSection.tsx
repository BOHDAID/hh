import ProductCard from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useRef } from "react";
import { db } from "@/lib/supabaseClient";
import { PackageX, Sparkles, Search, X, LayoutGrid, List } from "lucide-react";
import { motion, useInView, AnimatePresence } from "framer-motion";
import { ProductGridSkeleton } from "@/components/ProductCardSkeleton";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

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
  sales_count: number | null;
  average_rating: number | null;
  categories?: { name: string; name_en: string | null } | null;
  available_stock?: number;
}

interface Category {
  id: string;
  name: string;
  name_en: string | null;
}

const fetchCategories = async (): Promise<Category[]> => {
  const { data } = await db.from('categories').select('*');
  return data || [];
};

const fetchProducts = async (): Promise<Product[]> => {
  const { data } = await db
    .from('products')
    .select('*, categories(name, name_en)')
    .eq('is_active', true)
    .order('created_at', { ascending: false }) as { data: Product[] | null };

  if (!data) return [];

  const productsWithStock = await Promise.all(
    data.map(async (product) => {
      const { data: variants } = await db
        .from('product_variants')
        .select('id', { count: 'exact' })
        .eq('product_id', product.id)
        .eq('is_active', true);

      const hasVariants = variants && variants.length > 0;
      return { ...product, available_stock: 999, has_variants: hasVariants };
    })
  );
  return productsWithStock;
};

const ProductsSection = () => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });

  const { data: products = [], isLoading: loading } = useQuery({
    queryKey: ['products'],
    queryFn: fetchProducts,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const filteredProducts = products.filter(p => {
    const matchesCat = activeCategory === "all" || p.category_id === activeCategory;
    if (!searchQuery) return matchesCat;
    const q = searchQuery.toLowerCase();
    const matchesSearch = p.name?.toLowerCase().includes(q) ||
      p.name_en?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.platform?.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

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

        {/* Search Bar + View Toggle */}
        <motion.div
          className="max-w-xl mx-auto mb-10"
          initial={{ opacity: 0, y: 10 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          transition={{ delay: 0.4, duration: 0.4 }}
        >
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground start-4" />
              <Input
                placeholder={isRTL ? "ابحث عن منتج..." : "Search for a product..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ps-12 h-12 text-base rounded-full border-2 border-border/50 focus:border-primary/50"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute top-1/2 -translate-y-1/2 end-4">
                  <X className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
                </button>
              )}
            </div>
            <div className="flex gap-1 bg-muted rounded-full p-1 h-12">
              <Button
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="icon"
                className="rounded-full h-10 w-10"
                onClick={() => setViewMode("grid")}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="icon"
                className="rounded-full h-10 w-10"
                onClick={() => setViewMode("list")}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <ProductGridSkeleton count={6} />
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
              className={viewMode === "grid" 
                ? "grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
                : "grid gap-2 grid-cols-1 sm:grid-cols-2"
              }
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              key={activeCategory}
            >
              {filteredProducts.map((product, index) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 60, scale: 0.85, rotateX: 15 }}
                  animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
                  transition={{ 
                    delay: index * 0.1,
                    duration: 0.6,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  whileHover={{ y: -8, transition: { duration: 0.3 } }}
                  style={{ perspective: 1000 }}
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
                    sales_count={product.sales_count || 0}
                    average_rating={product.average_rating || 0}
                    compact={viewMode === "list"}
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
