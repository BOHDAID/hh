import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Package,
  Clock,
  ShoppingCart,
  Loader2,
  Check,
  Star,
  Zap,
} from "lucide-react";
import { db } from "@/lib/supabaseClient";
import { Link, useNavigate } from "react-router-dom";
import { formatWarrantyDays } from "@/lib/warrantyUtils";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";

interface ProductVariant {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  image_url: string | null;
  is_active: boolean;
}

interface ProductDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: {
    id: string;
    name: string;
    description?: string;
    price: number;
    image_url?: string;
    category?: string;
    warranty_days?: number;
    platform?: string;
    sales_count?: number;
    average_rating?: number;
  } | null;
}

const ProductDetailsModal = ({
  open,
  onOpenChange,
  product,
}: ProductDetailsModalProps) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isRTL = i18n.language === 'ar';
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [stockCount, setStockCount] = useState(0);
  const [addingToCart, setAddingToCart] = useState(false);

  useEffect(() => {
    if (open && product) {
      fetchProductDetails();
      setSelectedVariant(null);
    }
  }, [open, product]);

  const fetchProductDetails = async () => {
    if (!product) return;

    setLoading(true);
    try {
      // Get variants for this product
      const { data: variantsData } = await db
        .from("product_variants")
        .select("id, product_id, name, name_en, description, description_en, price, stock, image_url, is_active, is_unlimited, warranty_days, display_order, created_at, updated_at")
        .eq("product_id", product.id)
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      // For each variant, get actual stock using secure function
      if (variantsData && variantsData.length > 0) {
      const variantsWithStock = await Promise.all(
          variantsData.map(async (variant: any) => {
            // Check if variant is unlimited
            if (variant.is_unlimited) {
              return { ...variant, stock: -1 };
            }
            
            // Use secure database function to get stock count
            const { data: stockData } = await db
              .rpc("get_variant_stock", {
                p_product_id: product.id,
                p_variant_id: variant.id,
              });
            
            return { ...variant, stock: stockData || 0 };
          })
        );
        setVariants(variantsWithStock);
      } else {
        setVariants([]);
      }

      // Get available accounts count (for products without variants)
      const { data: stockData } = await db
        .rpc("get_variant_stock", {
          p_product_id: product.id,
          p_variant_id: null,
        });

      setStockCount(stockData || 0);
    } catch (error) {
      console.error("Error fetching product details:", error);
    }
    setLoading(false);
  };

  if (!product) return null;

  const handleAddToCart = async () => {
    const { data: { session } } = await db.auth.getSession();
    if (!session) {
      toast({
        title: t('auth.loginTitle'),
        description: isRTL ? "سجل دخولك لإضافة المنتجات للسلة" : "Login to add products to cart",
      });
      navigate(`/login?redirect=/`);
      return;
    }

    setAddingToCart(true);
    try {
      const { data: existingItem } = await db
        .from("cart_items")
        .select("id, quantity")
        .eq("user_id", session.user.id)
        .eq("product_id", product.id)
        .maybeSingle();

      if (existingItem) {
        await db
          .from("cart_items")
          .update({ quantity: existingItem.quantity + 1, updated_at: new Date().toISOString() })
          .eq("id", existingItem.id);
      } else {
        await db
          .from("cart_items")
          .insert({ user_id: session.user.id, product_id: product.id, quantity: 1 });
      }

      toast({
        title: t('common.success'),
        description: isRTL ? "تم إضافة المنتج للسلة" : "Product added to cart",
      });
      window.dispatchEvent(new Event('cart-updated'));
    } catch (error) {
      toast({
        title: t('common.error'),
        description: isRTL ? "فشل في إضافة المنتج للسلة" : "Failed to add product to cart",
        variant: "destructive",
      });
    }
    setAddingToCart(false);
  };
  const hasVariants = variants.length > 0;
  const salesCount = product.sales_count || 0;
  const averageRating = product.average_rating || 0;
  // For unlimited products (stock = -1), show as unlimited, otherwise sum the stock
  const totalVariantStock = variants.reduce((sum, v) => {
    if (v.stock === -1) return sum + 999; // Treat unlimited as high number for display
    return sum + v.stock;
  }, 0);
  const hasUnlimitedVariant = variants.some(v => v.stock === -1);
  // No variants = service/virtual product = always available (999)
  const effectiveStock = hasVariants ? totalVariantStock : 999;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden mx-4" dir={isRTL ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            {product.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Product Image & Basic Info */}
          <div className="flex gap-4">
            <div className="w-28 h-28 rounded-xl overflow-hidden bg-muted flex-shrink-0">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="h-10 w-10 text-muted-foreground" />
                </div>
              )}
            </div>

            <div className="flex-1 space-y-2 min-w-0">
              {/* Description - now scrollable for long text */}
              <div className="max-h-24 overflow-y-auto">
                <p className="text-muted-foreground text-sm whitespace-pre-wrap break-words">
                  {product.description}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {product.category && (
                  <Badge variant="secondary">{product.category}</Badge>
                )}
                {product.platform && (
                  <Badge variant="outline">{product.platform}</Badge>
                )}
              </div>

              <div className="flex items-center gap-1 text-sm text-emerald-500 mt-2">
                <Package className="h-4 w-4" />
                <span>
                  {hasVariants 
                    ? (hasUnlimitedVariant 
                        ? (isRTL ? "متوفر دائماً" : "Always Available") 
                        : `${effectiveStock} ${isRTL ? "متوفر" : "in stock"}`) 
                    : (isRTL ? "متاح للطلب" : "Available to order")}
                </span>
              </div>
              {salesCount > 0 && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                  <span>🔥</span>
                  <span>{isRTL ? `تم البيع ${salesCount} مرة` : `${salesCount} sold`}</span>
                </div>
              )}
              {/* Star Rating - show 5 full stars if no rating, otherwise show actual */}
              <div className="flex items-center gap-1 mt-1">
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => {
                    const displayRating = averageRating > 0 ? averageRating : 5;
                    return (
                      <Star
                        key={star}
                        className={`h-4 w-4 ${
                          star <= Math.round(displayRating)
                            ? "text-yellow-500 fill-yellow-500"
                            : "text-muted-foreground/30"
                        }`}
                      />
                    );
                  })}
                </div>
                {averageRating > 0 && (
                  <span className="text-sm text-muted-foreground">({averageRating.toFixed(1)})</span>
                )}
              </div>
            </div>
          </div>

          {/* Loading State */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : hasVariants ? (
            /* Variants Selection */
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">
                {isRTL ? "اختر الخيار المناسب:" : "Select an option:"}
              </h3>
              <div className="max-h-64 overflow-y-auto space-y-2">
                  {variants.map((variant) => (
                    <div
                      key={variant.id}
                      onClick={() => (variant.stock > 0 || variant.stock === -1) && setSelectedVariant(variant)}
                      className={`p-3 rounded-xl border-2 transition-all cursor-pointer ${
                        selectedVariant?.id === variant.id
                          ? "border-primary bg-primary/5"
                          : variant.stock > 0 || variant.stock === -1
                          ? "border-border hover:border-primary/50 bg-background"
                          : "border-border/50 bg-muted/30 opacity-60 cursor-not-allowed"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Checkmark circle - first element, always visible */}
                        <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
                          style={{ minWidth: '20px', minHeight: '20px' }}
                        >
                          {selectedVariant?.id === variant.id ? (
                            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                              <Check className="h-3 w-3 text-primary-foreground" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/40" />
                          )}
                        </div>
                        
                        {variant.image_url && (
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                            <img
                              src={variant.image_url}
                              alt={variant.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-semibold text-sm leading-snug break-words flex-1">{variant.name}</h4>
                            <span className="text-base font-bold text-primary flex-shrink-0">${variant.price}</span>
                          </div>
                          {variant.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {variant.description}
                            </p>
                          )}
                          <div className="mt-1 flex items-center gap-2">
                            <span className={`text-xs ${variant.stock === -1 ? "text-amber-500" : variant.stock > 0 ? "text-emerald-500" : "text-destructive"}`}>
                              {variant.stock === -1 
                                ? (isRTL ? "∞ دائم" : "∞ Unlimited") 
                                : variant.stock > 0 
                                  ? `${variant.stock} ${isRTL ? "متوفر" : "in stock"}` 
                                  : (isRTL ? "نفذ المخزون" : "Out of stock")}
                            </span>
                            {(variant as any).warranty_days > 0 && (
                              <span className="text-xs text-blue-500">
                                🛡️ {formatWarrantyDays((variant as any).warranty_days)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            /* No Variants - Service/Virtual product - always available */
            <div className="text-center py-6 border border-dashed border-border rounded-xl bg-amber-500/5">
              <Clock className="h-10 w-10 mx-auto text-amber-500 mb-2" />
              <p className="text-muted-foreground">
                {isRTL ? "سيتم توفير المنتج في أقرب وقت ممكن" : "Product will be available as soon as possible"}
              </p>
            </div>
          )}

          {/* Price & Action */}
          <div className="flex flex-col gap-3 pt-4 border-t">
            <div className="text-3xl font-bold text-primary">
              {selectedVariant ? (
                `$${selectedVariant.price}`
              ) : hasVariants && variants.length > 0 ? (
                <>
                  <span className={`text-base text-muted-foreground font-normal ${isRTL ? "ml-1" : "mr-1"}`}>
                    {isRTL ? "يبدأ من" : "From"}
                  </span>
                  ${Math.min(...variants.map(v => v.price))}
                </>
              ) : (
                `$${product.price}`
              )}
            </div>
            {effectiveStock > 0 ? (
              hasVariants ? (
                selectedVariant ? (
                  <div className="flex items-center gap-2">
                    <Button
                      size="lg"
                      variant="outline"
                      className="flex-1 gap-2"
                      onClick={handleAddToCart}
                      disabled={addingToCart}
                    >
                      {addingToCart ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <ShoppingCart className="h-5 w-5" />
                      )}
                      {isRTL ? "أضف للسلة" : "Add to Cart"}
                    </Button>
                    <Link to={`/checkout/${product.id}?variant=${selectedVariant.id}`} className="flex-1">
                      <Button size="lg" className="w-full gap-2">
                        <Zap className="h-5 w-5" />
                        {t('products.buyNow')}
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <Button size="lg" disabled className="gap-2">
                    <ShoppingCart className="h-5 w-5" />
                    {isRTL ? "اختر خياراً أولاً" : "Select an option first"}
                  </Button>
                )
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    size="lg"
                    variant="outline"
                    className="flex-1 gap-2"
                    onClick={handleAddToCart}
                    disabled={addingToCart}
                  >
                    {addingToCart ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <ShoppingCart className="h-5 w-5" />
                    )}
                    {isRTL ? "أضف للسلة" : "Add to Cart"}
                  </Button>
                  <Link to={`/checkout/${product.id}`} className="flex-1">
                    <Button size="lg" className="w-full gap-2">
                      <Zap className="h-5 w-5" />
                      {t('products.buyNow')}
                    </Button>
                  </Link>
                </div>
              )
            ) : (
              <Button size="lg" disabled>
                {t('products.outOfStock')}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProductDetailsModal;
