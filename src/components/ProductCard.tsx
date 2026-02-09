import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Check, Package, Plus, Sparkles, Eye } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { db } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import ProductDetailsModal from "./ProductDetailsModal";
import WishlistButton from "./WishlistButton";
import { useTranslation } from "react-i18next";

interface ProductCardProps {
  id: string;
  title: string;
  description: string;
  price: number;
  currency?: string;
  image?: string;
  category?: string;
  stock?: number;
  platform?: string;
  warranty_days?: number;
}

const ProductCard = ({
  id,
  title,
  description,
  price,
  currency = "$",
  image,
  category,
  stock = 0,
  platform,
  warranty_days,
}: ProductCardProps) => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const navigate = useNavigate();
  const { toast } = useToast();
  const [addingToCart, setAddingToCart] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [hasVariants, setHasVariants] = useState(false);
  const [variantsCount, setVariantsCount] = useState(0);
  const [minPrice, setMinPrice] = useState<number | null>(null);

  // Check if product has variants
  useEffect(() => {
    const checkVariants = async () => {
      const { data, count } = await db
        .from("product_variants")
        .select("price", { count: "exact" })
        .eq("product_id", id)
        .eq("is_active", true);
      
      if (data && data.length > 0) {
        setHasVariants(true);
        setVariantsCount(count || data.length);
        const prices = data.map(v => v.price);
        setMinPrice(Math.min(...prices));
      } else {
        setHasVariants(false);
      }
    };
    checkVariants();
  }, [id]);

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

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
        .eq("product_id", id)
        .maybeSingle();

      if (existingItem) {
        await db
          .from("cart_items")
          .update({ 
            quantity: existingItem.quantity + 1,
            updated_at: new Date().toISOString()
          })
          .eq("id", existingItem.id);
      } else {
        await db
          .from("cart_items")
          .insert({
            user_id: session.user.id,
            product_id: id,
            quantity: 1,
          });
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

  return (
    <motion.div 
      className="group relative overflow-hidden rounded-2xl sm:rounded-3xl bg-card border border-border/50 transition-all duration-500 flex flex-row sm:flex-col"
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      whileHover={{ 
        boxShadow: "0 25px 50px -12px rgba(139, 92, 246, 0.25)",
        borderColor: "rgba(139, 92, 246, 0.3)"
      }}
    >
      {/* Glow Effect */}
      <motion.div 
        className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-secondary/20 opacity-0 pointer-events-none"
        animate={{ opacity: isHovered ? 1 : 0 }}
        transition={{ duration: 0.3 }}
      />

      {/* Image Container */}
      <div className="relative w-28 h-28 sm:w-full sm:h-auto sm:aspect-[4/3] overflow-hidden bg-muted/30 flex-shrink-0 rounded-r-2xl sm:rounded-r-none sm:rounded-t-3xl">
        {image ? (
          <motion.img
            src={image}
            alt={title}
            className="h-full w-full object-cover"
            animate={{ scale: isHovered ? 1.1 : 1 }}
            transition={{ duration: 0.5 }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted/50 to-muted">
            <motion.div
              animate={{ rotate: isHovered ? 360 : 0 }}
              transition={{ duration: 0.8 }}
            >
              <Package className="h-16 w-16 text-muted-foreground/30" />
            </motion.div>
          </div>
        )}
        
        {/* Overlay gradient */}
        <motion.div 
          className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent"
          animate={{ opacity: isHovered ? 1 : 0.5 }}
          transition={{ duration: 0.3 }}
        />
        
        {/* Category Badge */}
        {category && (
          <motion.span 
            className="absolute top-4 right-4 rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground shadow-lg"
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            {category}
          </motion.span>
        )}

        {/* Floating Sparkle */}
        <div className="absolute top-4 left-4">
          <WishlistButton productId={id} />
        </div>
      </div>

      {/* Content */}
      <div className="relative p-3 sm:p-6 flex-1 min-w-0">
        <motion.h3 
          className="mb-1 sm:mb-2 text-sm sm:text-lg font-bold text-foreground break-words line-clamp-2 sm:line-clamp-none"
          animate={{ x: isHovered ? (isRTL ? -5 : 5) : 0 }}
          transition={{ duration: 0.2 }}
        >
          {title}
        </motion.h3>
        <p className="mb-2 sm:mb-5 text-xs sm:text-sm text-muted-foreground line-clamp-2 sm:line-clamp-3 leading-relaxed hidden sm:block">
          {description}
        </p>

        <div className="flex items-center justify-between flex-wrap gap-2">
          {/* Show price based on variants */}
          <motion.div 
            className="flex items-baseline gap-1"
            animate={{ scale: isHovered ? 1.05 : 1 }}
            transition={{ duration: 0.2 }}
          >
            {hasVariants ? (
              <>
                <span className="text-xs sm:text-sm text-muted-foreground hidden sm:inline">
                  {isRTL ? "يبدأ من" : "From"}
                </span>
                <span className="text-lg sm:text-2xl font-extrabold text-primary">{minPrice}</span>
                <span className="text-xs sm:text-sm text-muted-foreground font-medium">{currency}</span>
              </>
            ) : (
              <>
                <span className="text-xl sm:text-3xl font-extrabold text-primary">{price}</span>
                <span className="text-xs sm:text-sm text-muted-foreground font-medium">{currency}</span>
              </>
            )}
          </motion.div>
          
          {/* Actions based on variants */}
          {hasVariants ? (
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button 
                variant="hero" 
                size="sm" 
                className="gap-1 sm:gap-2 rounded-lg sm:rounded-xl px-2 sm:px-5 shadow-lg text-xs sm:text-sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDetailsOpen(true);
                }}
              >
                <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">{isRTL ? "عرض الخيارات" : "View Options"}</span>
                <span className="sm:hidden">{isRTL ? "عرض" : "View"}</span>
                ({variantsCount})
              </Button>
            </motion.div>
          ) : (
            <div className="flex gap-1 sm:gap-2">
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="hidden sm:block">
                <Button 
                  variant="outline" 
                  size="icon"
                  className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl border-2"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDetailsOpen(true);
                  }}
                >
                  <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="hidden sm:block">
                <Button 
                  variant="outline" 
                  size="icon"
                  className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl border-2"
                  onClick={handleAddToCart}
                  disabled={addingToCart}
                >
                  <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
              </motion.div>
              <Link to={`/checkout/${id}`}>
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button variant="hero" size="sm" className="gap-1 sm:gap-2 rounded-lg sm:rounded-xl px-3 sm:px-5 shadow-lg text-xs sm:text-sm h-8 sm:h-auto">
                    <ShoppingCart className="h-3 w-3 sm:h-4 sm:w-4" />
                    {t('products.buyNow')}
                  </Button>
                </motion.div>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Product Details Modal */}
      <ProductDetailsModal
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        product={{
          id,
          name: title,
          description,
          price,
          image_url: image,
          category,
          platform,
          warranty_days,
        }}
      />
    </motion.div>
  );
};

export default ProductCard;
