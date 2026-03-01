import { useState, useEffect, useMemo, useRef } from "react";
import { db } from "@/lib/supabaseClient";
import ProductDetailsModal from "@/components/ProductDetailsModal";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Package, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion, useInView, AnimatePresence } from "framer-motion";

const SearchSection = () => {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === "ar";
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"sales" | "rating" | "price_asc" | "price_desc">("sales");
  const [loading, setLoading] = useState(true);

  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const [prodRes, catRes] = await Promise.all([
        db.from("products").select("*, categories(name, name_en)").eq("is_active", true),
        db.from("categories").select("*"),
      ]);
      setProducts(prodRes.data || []);
      setCategories(catRes.data || []);
      setLoading(false);
    };
    fetchData();
  }, []);

  const filtered = useMemo(() => {
    let result = products.filter((p) => {
      const q = query.toLowerCase();
      const matchesQuery = !q ||
        p.name?.toLowerCase().includes(q) ||
        p.name_en?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.platform?.toLowerCase().includes(q);
      const matchesCat = !selectedCategory || p.category_id === selectedCategory;
      return matchesQuery && matchesCat;
    });

    switch (sortBy) {
      case "price_asc": result.sort((a, b) => a.price - b.price); break;
      case "price_desc": result.sort((a, b) => b.price - a.price); break;
      case "rating": result.sort((a, b) => (b.average_rating || 0) - (a.average_rating || 0)); break;
      case "sales": result.sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0)); break;
    }
    return result;
  }, [products, query, selectedCategory, sortBy]);

  const handleProductClick = (product: any) => {
    setSelectedProduct({
      ...product,
      category: product.categories ? (isRTL ? product.categories.name : (product.categories.name_en || product.categories.name)) : undefined,
      description: isRTL ? product.description : (product.description_en || product.description),
      name: isRTL ? product.name : (product.name_en || product.name),
    });
    setModalOpen(true);
  };

  // Only show this section when user starts searching
  const showResults = query.length > 0 || selectedCategory;

  return (
    <section id="search" className="py-16 relative" ref={ref}>
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <motion.div
          className="mb-8 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-4">
            <Search className="h-4 w-4" />
            <span>{isRTL ? "البحث السريع" : "Quick Search"}</span>
          </div>
          <h2 className="text-2xl font-bold text-foreground md:text-4xl mb-2">
            {isRTL ? "ابحث عن منتجك" : "Find Your Product"}
          </h2>
          <p className="text-muted-foreground">
            {isRTL ? "ابحث بالاسم أو المنصة أو التصنيف" : "Search by name, platform, or category"}
          </p>
        </motion.div>

        {/* Search Bar */}
        <motion.div
          className="max-w-2xl mx-auto mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          <div className="relative">
            <Search className="absolute top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground start-4" />
            <Input
              placeholder={isRTL ? "ابحث عن منتج..." : "Search for a product..."}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="ps-12 h-14 text-base rounded-2xl border-2 border-border/50 focus:border-primary/50 bg-background/80 backdrop-blur-sm"
            />
          </div>
        </motion.div>

        {/* Filters */}
        <motion.div
          className="flex flex-wrap justify-center gap-2 mb-4"
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Badge variant={!selectedCategory ? "default" : "outline"} className="cursor-pointer" onClick={() => setSelectedCategory(null)}>
            {isRTL ? "الكل" : "All"}
          </Badge>
          {categories.map((c) => (
            <Badge key={c.id} variant={selectedCategory === c.id ? "default" : "outline"} className="cursor-pointer" onClick={() => setSelectedCategory(c.id)}>
              {c.icon} {isRTL ? c.name : (c.name_en || c.name)}
            </Badge>
          ))}
        </motion.div>

        {/* Sort */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {[
            { key: "sales", label: isRTL ? "الأكثر مبيعاً" : "Best Selling" },
            { key: "rating", label: isRTL ? "الأعلى تقييماً" : "Top Rated" },
            { key: "price_asc", label: isRTL ? "الأقل سعراً" : "Price: Low" },
            { key: "price_desc", label: isRTL ? "الأعلى سعراً" : "Price: High" },
          ].map((s) => (
            <Badge key={s.key} variant={sortBy === s.key ? "default" : "secondary"} className="cursor-pointer text-xs" onClick={() => setSortBy(s.key as any)}>
              {s.label}
            </Badge>
          ))}
        </div>

        {/* Results count */}
        {showResults && !loading && (
          <p className="text-sm text-muted-foreground text-center mb-6">
            {isRTL ? `${filtered.length} نتيجة` : `${filtered.length} results`}
          </p>
        )}

        {/* Results Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((p, i) => (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: i * 0.02 }}
              >
                <div onClick={() => handleProductClick(p)} className="cursor-pointer">
                  <Card className="overflow-hidden hover:shadow-lg transition-all hover:-translate-y-1 h-full">
                    <div className="aspect-square bg-muted relative">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-full h-full object-contain p-4" loading="lazy" />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <Package className="h-10 w-10 text-muted-foreground/30" />
                        </div>
                      )}
                      {p.platform && (
                        <Badge variant="secondary" className="absolute top-2 start-2 text-[10px]">
                          {p.platform}
                        </Badge>
                      )}
                    </div>
                    <CardContent className="p-3">
                      <p className="font-medium text-sm truncate">{isRTL ? p.name : (p.name_en || p.name)}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-primary font-bold">${p.price}</span>
                        <div className="flex items-center gap-1">
                          <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                          <span className="text-xs text-muted-foreground">{p.average_rating?.toFixed(1) || "0"}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {!loading && filtered.length === 0 && showResults && (
          <div className="text-center py-12">
            <Search className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="text-lg font-semibold">{isRTL ? "لا توجد نتائج" : "No results found"}</h3>
            <p className="text-sm text-muted-foreground mt-1">{isRTL ? "جرب كلمات بحث مختلفة" : "Try different keywords"}</p>
          </div>
        )}
      </div>

      <ProductDetailsModal open={modalOpen} onOpenChange={setModalOpen} product={selectedProduct} />
    </section>
  );
};

export default SearchSection;
