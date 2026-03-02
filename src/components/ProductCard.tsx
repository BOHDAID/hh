import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Check, Package, Plus, Sparkles, Eye } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { db } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { motion, useMotionValue, useTransform, useSpring } from "framer-motion";
import ProductDetailsModal from "./ProductDetailsModal";
import WishlistButton from "./WishlistButton";
import LiveViewers from "./LiveViewers";
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
  compact?: boolean;
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
  compact = false,
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

  if (compact) {
    return (
      <>
        <motion.div
          className="group relative overflow-hidden rounded-xl bg-card border border-border/50 flex flex-row items-center gap-3 p-2 cursor-pointer hover:border-primary/30 transition-colors"
          whileHover={{ scale: 1.01 }}
          onClick={() => setDetailsOpen(true)}
        >
          {/* Small image */}
          <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden bg-muted/30 flex-shrink-0">
            {image ? (
              <img src={image} alt={title} loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted">
                <Package className="h-6 w-6 text-muted-foreground/30" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h3 className="text-xs sm:text-sm font-bold text-foreground truncate">{title}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm font-extrabold text-primary">{hasVariants ? minPrice : price} <span className="text-[10px] text-muted-foreground">{currency}</span></span>
              {category && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{category}</span>}
            </div>
            <LiveViewers productId={id} salesCount={sales_count} />
          </div>

          {/* Action */}
          <Button
            variant="hero"
            size="sm"
            className="gap-1 rounded-lg px-2 sm:px-3 text-[10px] sm:text-xs h-7 sm:h-8 shrink-0"
            onClick={(e) => { e.stopPropagation(); setDetailsOpen(true); }}
            type="button"
          >
            <Eye className="h-3 w-3" />
            <span>{isRTL ? "عرض" : "View"}</span>
          </Button>
        </motion.div>

        <ProductDetailsModal
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          product={{ id, name: title, description, price, image_url: image, category, platform, warranty_days, sales_count, average_rating }}
        />
      </>
    );
  }

  return (
    <motion.div 
      ref={cardRef}
      className="group relative overflow-hidden rounded-xl sm:rounded-2xl bg-card border border-border/50 transition-colors duration-500 flex flex-col"
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
        className="absolute inset-0 pointer-events-none z-10 rounded-xl sm:rounded-2xl"
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
          className="absolute -inset-[1px] rounded-xl sm:rounded-2xl pointer-events-none z-0"
          style={{
            background: "linear-gradient(135deg, hsl(var(--primary) / 0.4), hsl(280 80% 60% / 0.3), hsl(200 80% 60% / 0.3), hsl(var(--primary) / 0.4))",
            backgroundSize: "300% 300%",
          }}
          animate={{ backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"] }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        />
      )}

      <div className="absolute inset-[1px] rounded-xl sm:rounded-2xl bg-card z-[1]" />

      <motion.div 
        className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-secondary/20 opacity-0 pointer-events-none z-[2]"
        animate={{ opacity: isHovered ? 1 : 0 }}
        transition={{ duration: 0.3 }}
      />

      {/* Image Container */}
      <div className="relative w-full aspect-square overflow-hidden bg-muted/30 flex-shrink-0 rounded-t-xl sm:rounded-t-2xl z-[3]">
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
            <motion.div animate={{ rotate: isHovered ? 360 : 0 }} transition={{ duration: 0.8 }}>
              <Package className="h-12 w-12 text-muted-foreground/30" />
            </motion.div>
          </div>
        )}
        
        <motion.div 
          className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent"
          animate={{ opacity: isHovered ? 1 : 0.5 }}
          transition={{ duration: 0.3 }}
        />
        
        {category && (
          <motion.span 
            className="absolute top-2 right-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow-lg"
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            {category}
          </motion.span>
        )}

        <div className="absolute top-2 left-2">
          <WishlistButton productId={id} />
        </div>
      </div>

      {/* Content */}
      <div className="relative p-2.5 sm:p-3 flex-1 min-w-0 z-[3]">
        <motion.h3 
          className="mb-1 text-xs sm:text-sm font-bold text-foreground break-words line-clamp-2"
          animate={{ x: isHovered ? (isRTL ? -5 : 5) : 0 }}
          transition={{ duration: 0.2 }}
        >
          {title}
        </motion.h3>
        <div className="mb-1.5">
          <LiveViewers productId={id} salesCount={sales_count} />
        </div>

        <div className="flex items-center justify-between gap-1">
          <div className="flex items-baseline gap-0.5">
            <span className="text-sm sm:text-base font-extrabold text-primary">
              {hasVariants ? minPrice : price}
            </span>
            <span className="text-[10px] sm:text-xs text-muted-foreground font-medium">{currency}</span>
          </div>
          
          <Button 
            variant="hero" 
            size="sm" 
            className="gap-1 rounded-lg px-2 sm:px-3 shadow-lg text-[10px] sm:text-xs h-7 sm:h-8"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDetailsOpen(true);
            }}
            type="button"
          >
            <Eye className="h-3 w-3" />
            <span>{isRTL ? "عرض" : "View"}</span>
          </Button>
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
