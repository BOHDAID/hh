import { useState, useEffect } from "react";
import { db } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Package, ShoppingCart, Loader2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface RecommendedProduct {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  sales_count: number;
  average_rating: number;
}

interface CartRecommendationsProps {
  cartProductIds: string[];
  userId: string;
  onAddedToCart?: () => void;
}

const CartRecommendations = ({ cartProductIds, userId, onAddedToCart }: CartRecommendationsProps) => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === "ar";
  const { toast } = useToast();
  const [products, setProducts] = useState<RecommendedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    if (cartProductIds.length === 0) {
      setLoading(false);
      return;
    }
    fetchRecommendations();
  }, [cartProductIds.join(",")]);

  const fetchRecommendations = async () => {
    try {
      // 1. Get categories of cart products
      const { data: cartProducts } = await db
        .from("products")
        .select("category_id")
        .in("id", cartProductIds);

      const categoryIds = [...new Set(cartProducts?.map(p => p.category_id).filter(Boolean))] as string[];

      // 2. Get products that other buyers also purchased
      const { data: coOrders } = await db
        .from("order_items")
        .select("order_id")
        .in("product_id", cartProductIds);

      const orderIds = [...new Set(coOrders?.map(o => o.order_id))] as string[];

      let coPurchasedIds: string[] = [];
      if (orderIds.length > 0) {
        const { data: coItems } = await db
          .from("order_items")
          .select("product_id")
          .in("order_id", orderIds.slice(0, 50))
          .not("product_id", "in", `(${cartProductIds.join(",")})`);

        coPurchasedIds = [...new Set(coItems?.map(i => i.product_id))] as string[];
      }

      // 3. Query recommended products
      let recommended: RecommendedProduct[] = [];

      if (coPurchasedIds.length > 0) {
        const { data } = await db
          .from("products")
          .select("id, name, price, image_url, sales_count, average_rating")
          .in("id", coPurchasedIds.slice(0, 10))
          .eq("is_active", true)
          .order("sales_count", { ascending: false })
          .limit(6);
        if (data) recommended = data;
      }

      // Fill remaining from same category
      if (recommended.length < 6 && categoryIds.length > 0) {
        const excludeIds = [...cartProductIds, ...recommended.map(r => r.id)];
        const { data } = await db
          .from("products")
          .select("id, name, price, image_url, sales_count, average_rating")
          .in("category_id", categoryIds)
          .eq("is_active", true)
          .not("id", "in", `(${excludeIds.join(",")})`)
          .order("sales_count", { ascending: false })
          .limit(6 - recommended.length);
        if (data) recommended = [...recommended, ...data];
      }

      // Fill remaining with best sellers
      if (recommended.length < 4) {
        const excludeIds = [...cartProductIds, ...recommended.map(r => r.id)];
        const { data } = await db
          .from("products")
          .select("id, name, price, image_url, sales_count, average_rating")
          .eq("is_active", true)
          .not("id", "in", `(${excludeIds.join(",")})`)
          .order("sales_count", { ascending: false })
          .limit(6 - recommended.length);
        if (data) recommended = [...recommended, ...data];
      }

      // Fetch min variant prices for all recommended products
      if (recommended.length > 0) {
        const recIds = recommended.map(r => r.id);
        const { data: variants } = await db
          .from("product_variants")
          .select("product_id, price")
          .in("product_id", recIds)
          .eq("is_active", true)
          .gt("price", 0);

        if (variants) {
          const minPriceMap: Record<string, number> = {};
          for (const v of variants) {
            if (!minPriceMap[v.product_id] || v.price < minPriceMap[v.product_id]) {
              minPriceMap[v.product_id] = v.price;
            }
          }
          // Apply variant prices
          for (const product of recommended) {
            if (minPriceMap[product.id]) {
              product.price = minPriceMap[product.id];
            }
          }
        }
      }

      setProducts(recommended);
    } catch (err) {
      console.error("Recommendations error:", err);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = async (productId: string) => {
    setAddingId(productId);
    try {
      const { data: { session } } = await db.auth.getSession();
      if (!session) return;

      const { data: existing } = await db
        .from("cart_items")
        .select("id, quantity")
        .eq("user_id", session.user.id)
        .eq("product_id", productId)
        .maybeSingle();

      if (existing) {
        await db
          .from("cart_items")
          .update({ quantity: existing.quantity + 1, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await db
          .from("cart_items")
          .insert({ user_id: session.user.id, product_id: productId, quantity: 1 });
      }

      toast({
        title: isRTL ? "تمت الإضافة" : "Added",
        description: isRTL ? "تم إضافة المنتج للسلة" : "Product added to cart",
      });

      onAddedToCart?.();
    } catch (err) {
      toast({
        title: isRTL ? "خطأ" : "Error",
        description: isRTL ? "فشل في إضافة المنتج" : "Failed to add product",
        variant: "destructive",
      });
    }
    setAddingId(null);
  };

  if (loading || products.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-primary" />
        <h3 className="font-bold text-foreground text-lg">
          {isRTL ? "عملاء اشتروا أيضاً..." : "Customers also bought..."}
        </h3>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        <AnimatePresence>
          {products.map((product, index) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ delay: index * 0.05 }}
              className="w-40 flex-shrink-0 rounded-xl border border-border bg-card overflow-hidden group hover:border-primary/50 transition-colors"
            >
              {/* Image */}
              <div className="w-full h-28 bg-muted overflow-hidden relative">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                {product.sales_count > 10 && (
                  <Badge className="absolute top-1.5 start-1.5 text-[10px] px-1.5 py-0.5 bg-primary/90">
                    🔥 {isRTL ? "رائج" : "Hot"}
                  </Badge>
                )}
              </div>

              {/* Info */}
              <div className="p-2.5 space-y-2">
                <h4 className="text-xs font-semibold text-foreground line-clamp-2 leading-tight min-h-[2rem]">
                  {product.name}
                </h4>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-primary">
                    ${product.price.toFixed(2)}
                  </span>
                  {product.average_rating > 0 && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      ⭐ {product.average_rating.toFixed(1)}
                    </span>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-7 text-xs"
                  onClick={() => addToCart(product.id)}
                  disabled={addingId === product.id}
                >
                  {addingId === product.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <ShoppingCart className="h-3 w-3 me-1" />
                      {isRTL ? "أضف" : "Add"}
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default CartRecommendations;