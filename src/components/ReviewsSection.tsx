import { useState, useEffect } from "react";
import { db } from "@/lib/supabaseClient";
import { Star, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import ReviewsCarousel from "./ReviewsCarousel";

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer_name: string;
}

const ReviewsSection = () => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReviews = async () => {
      const { data, error } = await db
        .from("reviews")
        .select("id, rating, comment, created_at, reviewer_name")
        .eq("is_approved", true)
        .order("created_at", { ascending: false })
        .limit(12);

      if (!error && data) {
        setReviews(data);
      }
      setLoading(false);
    };

    fetchReviews();
  }, []);

  if (loading) {
    return (
      <section className="py-20 bg-gradient-to-b from-background to-muted/20">
        <div className="container mx-auto px-4">
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-muted rounded-xl w-64 mx-auto" />
            <div className="flex gap-6 overflow-hidden mt-8">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-48 w-80 flex-shrink-0 bg-muted/50 rounded-3xl" />
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  const hasReviews = reviews.length > 0;

  return (
    <section 
      className="py-24 bg-gradient-to-b from-background via-muted/10 to-background relative overflow-hidden"
    >
      {/* Animated Background */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div 
          className="absolute top-1/4 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px]"
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div 
          className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-secondary/5 rounded-full blur-[100px]"
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        />
      </div>

      <div className="container mx-auto px-4 relative">
        {/* Section Header */}
        <motion.div 
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <motion.div 
            className="inline-flex items-center gap-2 bg-primary/10 text-primary px-5 py-2.5 rounded-full text-sm font-semibold mb-6 border border-primary/20"
            initial={{ scale: 0.9, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <motion.div
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            >
              <Sparkles className="h-4 w-4" />
            </motion.div>
            <span>{t('reviews.title')}</span>
          </motion.div>
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-5">
            {isRTL ? (
              <>ماذا يقولون <span className="text-primary">عنّا</span>؟</>
            ) : (
              <>What They Say <span className="text-primary">About Us</span>?</>
            )}
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto text-lg">
            {isRTL ? "تجارب حقيقية من عملائنا الكرام" : "Real experiences from our valued customers"}
          </p>
        </motion.div>

        {/* Reviews Carousel */}
        {hasReviews ? (
          <ReviewsCarousel reviews={reviews} />
        ) : (
          <motion.div 
            className="text-center py-16"
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
          >
            <div className="bg-card border border-border/60 rounded-3xl p-10 max-w-md mx-auto">
              <motion.div 
                className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5"
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Star className="h-8 w-8 text-primary" />
              </motion.div>
              <h3 className="text-xl font-semibold text-foreground mb-2">{t('reviews.noReviews')}</h3>
              <p className="text-muted-foreground">
                {isRTL ? "كن أول من يشاركنا رأيه!" : "Be the first to share your feedback!"}
              </p>
            </div>
          </motion.div>
        )}

        {/* Stats Badge */}
        {hasReviews && (
          <motion.div 
            className="flex justify-center mt-14"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
          >
            <motion.div 
              className="inline-flex items-center gap-4 bg-card border border-border/60 px-8 py-4 rounded-2xl shadow-lg"
              whileHover={{ scale: 1.05, boxShadow: "0 20px 40px -15px rgba(0,0,0,0.2)" }}
            >
              <div className="flex items-center gap-1.5">
                <motion.div
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Star className="h-6 w-6 fill-amber-400 text-amber-400 drop-shadow-lg" />
                </motion.div>
                <span className="font-bold text-foreground text-2xl">
                  {(reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)}
                </span>
              </div>
              <div className="h-8 w-px bg-border" />
              <span className="text-muted-foreground text-lg">
                <span className="font-bold text-foreground">{reviews.length}+</span> {isRTL ? "تقييم" : "reviews"}
              </span>
            </motion.div>
          </motion.div>
        )}
      </div>
    </section>
  );
};

export default ReviewsSection;
