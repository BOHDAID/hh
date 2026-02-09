import { useState, useEffect } from "react";
import { db } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Loader2, Trash2, Plus, Star, Check, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Review {
  id: string;
  product_id: string;
  rating: number;
  comment: string | null;
  reviewer_name: string;
  is_fake: boolean;
  is_approved: boolean;
  created_at: string;
  products?: { name: string };
}

interface Product {
  id: string;
  name: string;
}

const ReviewsTab = () => {
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newReview, setNewReview] = useState({
    product_id: "",
    reviewer_name: "",
    rating: "5",
    comment: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [reviewsRes, productsRes] = await Promise.all([
      db
        .from("reviews")
        .select("*, products(name)")
        .order("created_at", { ascending: false }),
      db.from("products").select("id, name").eq("is_active", true),
    ]);

    if (reviewsRes.data) setReviews(reviewsRes.data);
    if (productsRes.data) setProducts(productsRes.data);
    setLoading(false);
  };

  const addFakeReview = async () => {
    if (!newReview.product_id || !newReview.reviewer_name) {
      toast({
        title: "خطأ",
        description: "اختر المنتج وأدخل اسم المقيم",
        variant: "destructive",
      });
      return;
    }

    const { error } = await db.from("reviews").insert({
      product_id: newReview.product_id,
      reviewer_name: newReview.reviewer_name,
      rating: parseInt(newReview.rating),
      comment: newReview.comment || null,
      is_fake: true,
      is_approved: true,
    });

    if (error) {
      toast({
        title: "خطأ",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "تم الإضافة",
        description: "تم إضافة التقييم بنجاح",
      });
      setDialogOpen(false);
      setNewReview({
        product_id: "",
        reviewer_name: "",
        rating: "5",
        comment: "",
      });
      fetchData();
    }
  };

  const toggleApproval = async (id: string, currentStatus: boolean) => {
    const { error } = await db
      .from("reviews")
      .update({ is_approved: !currentStatus })
      .eq("id", id);

    if (error) {
      toast({
        title: "خطأ",
        description: error.message,
        variant: "destructive",
      });
    } else {
      fetchData();
    }
  };

  const deleteReview = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا التقييم؟")) return;

    const { error } = await db.from("reviews").delete().eq("id", id);

    if (error) {
      toast({
        title: "خطأ",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "تم الحذف",
        description: "تم حذف التقييم",
      });
      fetchData();
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${
              star <= rating
                ? "fill-yellow-500 text-yellow-500"
                : "text-muted-foreground"
            }`}
          />
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-foreground">إدارة التقييمات</h1>
        <Button variant="hero" onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          إضافة تقييم يدوي
        </Button>
      </div>

      {reviews.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          لا توجد تقييمات حتى الآن
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => (
            <div key={review.id} className="glass rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-semibold text-foreground">
                      {review.reviewer_name}
                    </span>
                    {renderStars(review.rating)}
                    {review.is_fake && (
                      <span className="text-xs bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded-full">
                        يدوي
                      </span>
                    )}
                    {!review.is_approved && (
                      <span className="text-xs bg-red-500/20 text-red-500 px-2 py-0.5 rounded-full">
                        غير معتمد
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">
                    {review.products?.name}
                  </p>
                  {review.comment && (
                    <p className="text-foreground">{review.comment}</p>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleApproval(review.id, review.is_approved)}
                    title={review.is_approved ? "إلغاء الاعتماد" : "اعتماد"}
                  >
                    {review.is_approved ? (
                      <X className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Check className="h-4 w-4 text-green-500" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteReview(review.id)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Fake Review Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="glass max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة تقييم يدوي</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>المنتج</Label>
              <Select
                value={newReview.product_id}
                onValueChange={(value) =>
                  setNewReview({ ...newReview, product_id: value })
                }
              >
                <SelectTrigger className="glass">
                  <SelectValue placeholder="اختر منتج..." />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>اسم المقيم</Label>
              <Input
                value={newReview.reviewer_name}
                onChange={(e) =>
                  setNewReview({ ...newReview, reviewer_name: e.target.value })
                }
                placeholder="أحمد محمد"
                className="glass"
              />
            </div>

            <div className="space-y-2">
              <Label>التقييم</Label>
              <Select
                value={newReview.rating}
                onValueChange={(value) =>
                  setNewReview({ ...newReview, rating: value })
                }
              >
                <SelectTrigger className="glass w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <SelectItem key={rating} value={String(rating)}>
                      {rating} نجوم
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>التعليق (اختياري)</Label>
              <Textarea
                value={newReview.comment}
                onChange={(e) =>
                  setNewReview({ ...newReview, comment: e.target.value })
                }
                placeholder="تجربة رائعة..."
                className="glass"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                إلغاء
              </Button>
              <Button variant="hero" onClick={addFakeReview}>
                إضافة التقييم
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReviewsTab;
