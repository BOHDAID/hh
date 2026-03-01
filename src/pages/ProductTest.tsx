import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { db } from "@/lib/supabaseClient";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Star, ShoppingCart, Shield, ArrowRight, Flame, Package } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAppData } from "@/components/AppInitializer";
import UserSidebar from "@/components/user/UserSidebar";
import { motion } from "framer-motion";

const ProductTest = () => {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === "ar";
  const { user } = useAppData();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [product, setProduct] = useState<any>(null);
  const [variants, setVariants] = useState<any[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [similarProducts, setSimilarProducts] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // UUID validation
  const isValidUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

  useEffect(() => {
    if (!id || !isValidUUID(id)) {
      // Invalid ID - fetch all products to show as fallback
      const fetchAll = async () => {
        setLoading(true);
        const { data } = await db.from("products").select("*").eq("is_active", true).order("sales_count", { ascending: false });
        setAllProducts(data || []);
        setLoading(false);
      };
      fetchAll();
      return;
    }

    const fetchProduct = async () => {
      setLoading(true);
      const [prodRes, varRes, revRes] = await Promise.all([
        db.from("products").select("*").eq("id", id).maybeSingle(),
        db.from("product_variants").select("*").eq("product_id", id).eq("is_active", true).order("display_order"),
        db.from("reviews").select("*").eq("product_id", id).eq("is_approved", true).order("created_at", { ascending: false }).limit(10),
      ]);

      if (prodRes.data) {
        setProduct(prodRes.data);
        const { data: similar } = await db
          .from("products")
          .select("*")
          .eq("is_active", true)
          .eq("category_id", prodRes.data.category_id)
          .neq("id", id)
          .limit(4);
        setSimilarProducts(similar || []);
      } else {
        // Product not found - fetch all products
        const { data } = await db.from("products").select("*").eq("is_active", true).order("sales_count", { ascending: false });
        setAllProducts(data || []);
      }
      setVariants(varRes.data || []);
      setReviews(revRes.data || []);
      setLoading(false);
    };
    fetchProduct();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background" dir={isRTL ? "rtl" : "ltr"}>
        <Header />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-background" dir={isRTL ? "rtl" : "ltr"}>
        <Header onMenuClick={user ? () => setSidebarOpen(!sidebarOpen) : undefined} />
        {user && <UserSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} onOpen={() => setSidebarOpen(true)} />}
        <main className="container mx-auto px-4 py-8">
          <h1 className="text-2xl font-bold mb-2">{isRTL ? "اختر منتج لعرض تفاصيله" : "Select a product to view details"}</h1>
          <p className="text-muted-foreground mb-6">{isRTL ? "اضغط على أي منتج لتشوف صفحته المستقلة" : "Click any product to see its standalone page"}</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {allProducts.map((p) => (
              <Link key={p.id} to={`/product-test/${p.id}`}>
                <Card className="overflow-hidden hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer h-full">
                  <div className="aspect-square bg-muted">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="w-full h-full object-contain p-4" />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <Package className="h-10 w-10 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                  <CardContent className="p-3">
                    <p className="font-medium text-sm truncate">{isRTL ? p.name : (p.name_en || p.name)}</p>
                    <p className="text-primary font-bold text-sm mt-1">${p.price}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
          {allProducts.length === 0 && !loading && (
            <div className="text-center py-16">
              <Package className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">{isRTL ? "لا توجد منتجات" : "No products found"}</p>
            </div>
          )}
        </main>
        <Footer />
      </div>
    );
  }

  const productName = isRTL ? product.name : (product.name_en || product.name);
  const productDesc = isRTL ? product.description : (product.description_en || product.description);

  return (
    <div className="min-h-screen bg-background" dir={isRTL ? "rtl" : "ltr"}>
      <Header onMenuClick={user ? () => setSidebarOpen(!sidebarOpen) : undefined} />
      {user && <UserSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} onOpen={() => setSidebarOpen(true)} />}

      <main className="container mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link to="/" className="hover:text-primary">{isRTL ? "الرئيسية" : "Home"}</Link>
          <ArrowRight className="h-3 w-3 rotate-180" />
          <span className="text-foreground font-medium">{productName}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Product Image */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="relative rounded-2xl overflow-hidden bg-muted aspect-square"
          >
            {product.image_url ? (
              <img src={product.image_url} alt={productName} className="w-full h-full object-contain p-8" />
            ) : (
              <div className="flex items-center justify-center h-full">
                <Package className="h-24 w-24 text-muted-foreground/30" />
              </div>
            )}
            {product.sales_count > 0 && (
              <Badge className="absolute top-4 left-4 bg-orange-500/90 text-white">
                <Flame className="h-3 w-3 mr-1" /> {product.sales_count}+ {isRTL ? "مبيعة" : "sold"}
              </Badge>
            )}
          </motion.div>

          {/* Product Info */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col gap-5"
          >
            <div>
              {product.platform && (
                <Badge variant="secondary" className="mb-2">{product.platform}</Badge>
              )}
              <h1 className="text-3xl font-bold text-foreground">{productName}</h1>
            </div>

            {/* Rating */}
            <div className="flex items-center gap-2">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    className={`h-5 w-5 ${s <= Math.round(product.average_rating || 0) ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/30"}`}
                  />
                ))}
              </div>
              <span className="text-sm text-muted-foreground">
                ({product.average_rating?.toFixed(1) || "0.0"}) · {reviews.length} {isRTL ? "تقييم" : "reviews"}
              </span>
            </div>

            {/* Description */}
            {productDesc && (
              <p className="text-muted-foreground leading-relaxed">{productDesc}</p>
            )}

            {/* Warranty */}
            {product.warranty_days > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-600 dark:text-green-400">
                <Shield className="h-5 w-5" />
                <span className="text-sm font-medium">
                  {isRTL ? `ضمان ${product.warranty_days} يوم` : `${product.warranty_days} day warranty`}
                </span>
              </div>
            )}

            {/* Variants */}
            {variants.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold">{isRTL ? "اختر الباقة" : "Select Option"}</h3>
                <div className="grid grid-cols-2 gap-2">
                  {variants.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVariant(v)}
                      className={`p-3 rounded-xl border-2 text-start transition-all ${
                        selectedVariant?.id === v.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <p className="font-medium text-sm">{isRTL ? v.name : (v.name_en || v.name)}</p>
                      <p className="text-primary font-bold mt-1">${v.price}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Price & Actions */}
            <div className="mt-auto pt-4 border-t border-border space-y-4">
              <div className="text-3xl font-bold text-primary">
                ${selectedVariant?.price || product.price}
              </div>
              <div className="flex gap-3">
                <Button size="lg" className="flex-1 gap-2" disabled={variants.length > 0 && !selectedVariant}>
                  <ShoppingCart className="h-5 w-5" />
                  {isRTL ? "أضف للسلة" : "Add to Cart"}
                </Button>
                <Button size="lg" variant="outline" className="flex-1" disabled={variants.length > 0 && !selectedVariant}>
                  {isRTL ? "اشترِ الآن" : "Buy Now"}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Reviews Section */}
        {reviews.length > 0 && (
          <section className="mt-16">
            <h2 className="text-2xl font-bold mb-6">{isRTL ? "تقييمات العملاء" : "Customer Reviews"}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {reviews.map((r) => (
                <Card key={r.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{r.reviewer_name}</span>
                      <div className="flex">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star key={s} className={`h-3.5 w-3.5 ${s <= r.rating ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/20"}`} />
                        ))}
                      </div>
                    </div>
                    {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Similar Products */}
        {similarProducts.length > 0 && (
          <section className="mt-16">
            <h2 className="text-2xl font-bold mb-6">{isRTL ? "منتجات مشابهة" : "Similar Products"}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {similarProducts.map((p) => (
                <Link key={p.id} to={`/product-test/${p.id}`}>
                  <Card className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer">
                    <div className="aspect-square bg-muted">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-full h-full object-contain p-4" />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <Package className="h-8 w-8 text-muted-foreground/30" />
                        </div>
                      )}
                    </div>
                    <CardContent className="p-3">
                      <p className="font-medium text-sm truncate">{isRTL ? p.name : (p.name_en || p.name)}</p>
                      <p className="text-primary font-bold text-sm mt-1">${p.price}</p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default ProductTest;
