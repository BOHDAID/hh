import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Check, Package, Plus, Sparkles, Eye } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { db } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { motion, useMotionValue, useTransform, useSpring } from "framer-motion";
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
  sales_count?: number;
  average_rating?: number;
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
  sales_count,
  average_rating,
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

  // 3D Tilt effect
  const cardRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(mouseY, [0, 1], [8, -8]), { stiffness: 300, damping: 30 });
  const rotateY = useSpring(useTransform(mouseX, [0, 1], [-8, 8]), { stiffness: 300, damping: 30 });
  const shineX = useTransform(mouseX, [0, 1], [0, 100]);
  const shineY = useTransform(mouseY, [0, 1], [0, 100]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width);
    mouseY.set((e.clientY - rect.top) / rect.height);
  }, [mouseX, mouseY]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    mouseX.set(0.5);
    mouseY.set(0.5);
  }, [mouseX, mouseY]);


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
      ref={cardRef}
      className="group relative overflow-hidden rounded-2xl sm:rounded-3xl bg-card border border-border/50 transition-colors duration-500 flex flex-row sm:flex-col"
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX: isHovered ? rotateX : 0,
        rotateY: isHovered ? rotateY : 0,
        transformPerspective: 800,
        transformStyle: "preserve-3d",
      }}
      whileHover={{ 
        boxShadow: "0 25px 50px -12px hsl(var(--primary) / 0.25)",
        borderColor: "hsl(var(--primary) / 0.4)",
        scale: 1.02,
      }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      {/* Holographic Shine Effect */}
      <motion.div 
        className="absolute inset-0 pointer-events-none z-10 rounded-2xl sm:rounded-3xl"
        style={{
          background: isHovered 
            ? `radial-gradient(circle at ${shineX.get()}% ${shineY.get()}%, hsl(var(--primary) / 0.15) 0%, transparent 60%)`
            : "none",
          opacity: isHovered ? 1 : 0,
        }}
      />
      
      {/* Rainbow edge glow */}
      {isHovered && (
        <motion.div 
          className="absolute -inset-[1px] rounded-2xl sm:rounded-3xl pointer-events-none z-0"
          style={{
            background: "linear-gradient(135deg, hsl(var(--primary) / 0.4), hsl(280 80% 60% / 0.3), hsl(200 80% 60% / 0.3), hsl(var(--primary) / 0.4))",
            backgroundSize: "300% 300%",
          }}
          animate={{ 
            backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        />
      )}

      {/* Card inner bg to cover rainbow border */}
      <div className="absolute inset-[1px] rounded-2xl sm:rounded-3xl bg-card z-[1]" />

      {/* Glow Effect */}
      <motion.div 
        className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-secondary/20 opacity-0 pointer-events-none z-[2]"
        animate={{ opacity: isHovered ? 1 : 0 }}
        transition={{ duration: 0.3 }}
      />

      {/* Image Container */}
      <div className="relative w-28 h-28 sm:w-full sm:h-auto sm:aspect-[4/3] overflow-hidden bg-muted/30 flex-shrink-0 rounded-r-2xl sm:rounded-r-none sm:rounded-t-3xl z-[3]">
        {image ? (
          <motion.img
            src={image}
            alt={title}
            loading="lazy"
            decoding="async"
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
      <div className="relative p-3 sm:p-6 flex-1 min-w-0 z-[3]">
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
            <span className="text-lg sm:text-2xl font-extrabold text-primary">
              {hasVariants ? minPrice : price}
            </span>
            <span className="text-xs sm:text-sm text-muted-foreground font-medium">{currency}</span>
          </motion.div>
          
          {/* Actions - consistent layout for all products */}
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
              <span className="hidden sm:inline">{hasVariants ? (isRTL ? "عرض الخيارات" : "View Options") : (isRTL ? "عرض التفاصيل" : "View Details")}</span>
              <span className="sm:hidden">{isRTL ? "عرض" : "View"}</span>
              {hasVariants && ` (${variantsCount})`}
            </Button>
          </motion.div>
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
          sales_count,
          average_rating,
        }}
      />
    </motion.div>
  );
};

export default ProductCard;
