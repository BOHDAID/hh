import { useRef, useState, useEffect, useCallback } from "react";
import { Star, MessageSquareQuote } from "lucide-react";
import { motion, useMotionValue, useAnimation, PanInfo } from "framer-motion";
import { formatDateShortArabic } from "@/lib/formatDate";
import { useTranslation } from "react-i18next";

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer_name: string;
}

interface ReviewsCarouselProps {
  reviews: Review[];
}

const CARD_WIDTH = 344; // 320px card + 24px gap
const AUTO_SCROLL_SPEED = 0.8; // pixels per frame

const ReviewsCarousel = ({ reviews }: ReviewsCarouselProps) => {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  
  const containerRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const controls = useAnimation();
  
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const animationRef = useRef<number>();

  // Duplicate reviews for infinite scroll
  const duplicatedReviews = [...reviews, ...reviews, ...reviews];
  const singleSetWidth = reviews.length * CARD_WIDTH;

  // Reset position seamlessly when reaching bounds
  const resetPosition = useCallback((currentX: number) => {
    if (reviews.length === 0) return currentX;
    
    let newX = currentX;
    
    // Both RTL and LTR: we scroll in negative direction (left)
    // When we've scrolled past one full set, jump back
    if (newX <= -singleSetWidth) {
      newX += singleSetWidth;
    }
    // When dragging right and going past 0
    if (newX >= singleSetWidth) {
      newX -= singleSetWidth;
    }
    
    if (Math.abs(newX - currentX) > 0.1) {
      x.jump(newX);
    }
    return newX;
  }, [x, singleSetWidth, reviews.length]);

  // Auto-scroll animation
  useEffect(() => {
    if (reviews.length === 0) return;

    let currentPos = x.get();
    
    const animate = () => {
      if (!isDragging && !isHovering) {
        // RTL scrolls right (positive direction), LTR scrolls left (negative direction)
        const direction = isRTL ? 1 : -1;
        currentPos += AUTO_SCROLL_SPEED * direction;
        
        // Check and reset position for seamless loop
        currentPos = resetPosition(currentPos);
        
        x.set(currentPos);
      } else {
        currentPos = x.get();
      }
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isDragging, isHovering, isRTL, x, resetPosition, reviews.length]);

  // Set initial position - start from 0 so cards are visible
  useEffect(() => {
    if (reviews.length > 0) {
      x.jump(0);
    }
  }, [isRTL, x, reviews.length]);

  // Handle drag end with momentum
  const handleDragEnd = useCallback((_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false);
    
    const velocity = info.velocity.x;
    const currentX = x.get();
    
    // Calculate momentum distance
    const momentumMultiplier = 0.3;
    const momentumDistance = velocity * momentumMultiplier;
    
    let targetX = currentX + momentumDistance;
    
    // Calculate duration based on distance
    const distance = Math.abs(momentumDistance);
    const duration = Math.min(Math.max(distance / 500, 0.3), 1.2);
    
    controls.start({
      x: targetX,
      transition: {
        type: "tween",
        ease: [0.25, 0.1, 0.25, 1],
        duration: duration,
      }
    }).then(() => {
      // Reset position after momentum animation
      const finalX = x.get();
      resetPosition(finalX);
    });
  }, [x, controls, resetPosition]);

  const handleDragStart = () => {
    setIsDragging(true);
    controls.stop();
  };

  const handleDrag = () => {
    // Check bounds while dragging
    const currentX = x.get();
    resetPosition(currentX);
  };

  const getGradient = (index: number) => {
    const gradients = [
      "from-violet-500 to-purple-600",
      "from-blue-500 to-cyan-500",
      "from-emerald-500 to-teal-500",
      "from-orange-500 to-amber-500",
      "from-pink-500 to-rose-500",
      "from-indigo-500 to-blue-500",
    ];
    return gradients[index % gradients.length];
  };

  const getInitials = (name: string) => {
    if (!name) return "??";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const formatDate = (dateStr: string) => {
    if (isRTL) {
      return formatDateShortArabic(dateStr);
    }
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (reviews.length === 0) return null;

  return (
    <div 
      ref={containerRef}
      className="relative overflow-hidden cursor-grab active:cursor-grabbing"
      style={{ touchAction: 'pan-y' }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Gradient fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
      
      <motion.div
        className="flex gap-6 px-6"
        style={{ x }}
        animate={controls}
        drag="x"
        dragElastic={0.05}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        whileDrag={{ cursor: "grabbing" }}
      >
        {duplicatedReviews.map((review, index) => (
          <motion.div
            key={`${review.id}-${index}`}
            className="flex-shrink-0 w-[320px] group relative bg-card border border-border/60 rounded-3xl p-7 transition-colors duration-300 hover:border-primary/30 select-none"
            whileHover={!isDragging ? { 
              y: -10,
              boxShadow: "0 25px 50px -12px rgba(139, 92, 246, 0.2)"
            } : {}}
            transition={{ duration: 0.3 }}
          >
            {/* Quote Icon */}
            <MessageSquareQuote className="absolute top-6 left-6 h-8 w-8 text-primary/10 group-hover:text-primary/30 transition-colors duration-300" />

            {/* Header: Avatar + Name + Date */}
            <div className="flex items-center gap-4 mb-5">
              <div 
                className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${getGradient(index)} flex items-center justify-center text-white font-bold text-sm shadow-lg`}
              >
                {getInitials(review.reviewer_name)}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-foreground">{review.reviewer_name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(review.created_at)}
                </p>
              </div>
            </div>

            {/* Stars */}
            <div className="flex gap-1 mb-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`h-5 w-5 ${
                    star <= review.rating
                      ? "fill-amber-400 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)]"
                      : "text-muted-foreground/30"
                  }`}
                />
              ))}
            </div>

            {/* Comment */}
            <p className="text-foreground/80 leading-relaxed text-[15px] line-clamp-4">
              {review.comment || (isRTL ? "تجربة رائعة!" : "Great experience!")}
            </p>

            {/* Decorative corner */}
            <div className="absolute bottom-0 right-0 w-20 h-20 bg-gradient-to-tl from-primary/5 to-transparent rounded-tl-[60px] pointer-events-none" />
          </motion.div>
        ))}
      </motion.div>
      
      {/* Hint text */}
      <motion.p 
        className="text-center text-muted-foreground/60 text-sm mt-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
      >
        {isRTL ? "اسحب للتصفح ←→" : "←→ Drag to browse"}
      </motion.p>
    </div>
  );
};

export default ReviewsCarousel;
