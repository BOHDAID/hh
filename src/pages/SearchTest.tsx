import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { db } from "@/lib/supabaseClient";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Package, Star, SlidersHorizontal, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAppData } from "@/components/AppInitializer";
import UserSidebar from "@/components/user/UserSidebar";
import { motion, AnimatePresence } from "framer-motion";

const SearchTest = () => {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === "ar";
  const { user } = useAppData();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 1000]);
  const [sortBy, setSortBy] = useState<"price_asc" | "price_desc" | "rating" | "sales">("sales");
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const [prodRes, catRes] = await Promise.all([
        db.from("products").select("*").eq("is_active", true),
        db.from("categories").select("*"),
      ]);
      setProducts(prodRes.data || []);
      setCategories(catRes.data || []);
      setLoading(false);
    };
    fetch();
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
      const matchesPrice = p.price >= priceRange[0] && p.price <= priceRange[1];
      return matchesQuery && matchesCat && matchesPrice;
    });

    switch (sortBy) {
      case "price_asc": result.sort((a, b) => a.price - b.price); break;
      case "price_desc": result.sort((a, b) => b.price - a.price); break;
      case "rating": result.sort((a, b) => (b.average_rating || 0) - (a.average_rating || 0)); break;
      case "sales": result.sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0)); break;
    }
    return result;
  }, [products, query, selectedCategory, priceRange, sortBy]);

  return (
    <div className="min-h-screen bg-background" dir={isRTL ? "rtl" : "ltr"}>
      <Header onMenuClick={user ? () => setSidebarOpen(!sidebarOpen) : undefined} />
      {user && <UserSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} onOpen={() => setSidebarOpen(true)} />}

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">{isRTL ? "البحث الذكي" : "Smart Search"}</h1>

        {/* Search Bar */}
        <div className="flex gap-2 mb-6">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground start-3" />
            <Input
              placeholder={isRTL ? "ابحث عن منتج..." : "Search for a product..."}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="ps-10 h-12 text-base"
              autoFocus
            />
            {query && (
              <button onClick={() => setQuery("")} className="absolute top-1/2 -translate-y-1/2 end-3">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <Button
            variant={showFilters ? "default" : "outline"}
            size="icon"
            className="h-12 w-12"
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal className="h-5 w-5" />
          </Button>
        </div>

        {/* Filters Panel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-6"
            >
              <Card>
                <CardContent className="p-4 space-y-4">
                  {/* Categories */}
                  <div>
                    <h3 className="text-sm font-semibold mb-2">{isRTL ? "التصنيفات" : "Categories"}</h3>
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant={!selectedCategory ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => setSelectedCategory(null)}
                      >
                        {isRTL ? "الكل" : "All"}
                      </Badge>
                      {categories.map((c) => (
                        <Badge
                          key={c.id}
                          variant={selectedCategory === c.id ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => setSelectedCategory(c.id)}
                        >
                          {c.icon} {isRTL ? c.name : (c.name_en || c.name)}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Sort */}
                  <div>
                    <h3 className="text-sm font-semibold mb-2">{isRTL ? "ترتيب حسب" : "Sort by"}</h3>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { key: "sales", label: isRTL ? "الأكثر مبيعاً" : "Best Selling" },
                        { key: "rating", label: isRTL ? "الأعلى تقييماً" : "Top Rated" },
                        { key: "price_asc", label: isRTL ? "السعر: الأقل" : "Price: Low" },
                        { key: "price_desc", label: isRTL ? "السعر: الأعلى" : "Price: High" },
                      ].map((s) => (
                        <Badge
                          key={s.key}
                          variant={sortBy === s.key ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => setSortBy(s.key as any)}
                        >
                          {s.label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results Count */}
        <p className="text-sm text-muted-foreground mb-4">
          {loading ? (isRTL ? "جاري البحث..." : "Searching...") : (
            isRTL ? `${filtered.length} نتيجة` : `${filtered.length} results`
          )}
        </p>

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
                transition={{ delay: i * 0.03 }}
              >
                <Link to={`/product-test/${p.id}`}>
                  <Card className="overflow-hidden hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer h-full">
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
                          <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                          <span className="text-xs text-muted-foreground">{p.average_rating?.toFixed(1) || "0"}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16">
            <Search className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold">{isRTL ? "لا توجد نتائج" : "No results found"}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {isRTL ? "جرب كلمات بحث مختلفة" : "Try different keywords"}
            </p>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default SearchTest;
