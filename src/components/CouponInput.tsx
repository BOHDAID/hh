 import { useState } from "react";
 import { db } from "@/lib/supabaseClient";
 import { Input } from "@/components/ui/input";
 import { Button } from "@/components/ui/button";
 import { Badge } from "@/components/ui/badge";
 import { Ticket, X, Loader2, Check } from "lucide-react";
 import { toast } from "@/hooks/use-toast";
 
 interface CouponInputProps {
   orderTotal: number;
  cartProductTypes?: string[];
   onApply: (discount: number, couponId: string, couponCode: string) => void;
   onRemove: () => void;
   appliedCoupon: { id: string; code: string; discount: number } | null;
 }
 
const CouponInput = ({ orderTotal, cartProductTypes = [], onApply, onRemove, appliedCoupon }: CouponInputProps) => {
   const [code, setCode] = useState("");
   const [loading, setLoading] = useState(false);
 
   const validateCoupon = async () => {
     if (!code.trim()) {
       toast({ title: "يرجى إدخال كود الخصم", variant: "destructive" });
       return;
     }
 
     setLoading(true);
 
      const { data: coupon, error } = await db
        .from("coupons")
        .select("*")
        .eq("code", code.toUpperCase())
        .eq("is_active", true)
        .maybeSingle();

      // If schema error (table not setup), silently skip validation
      if (error) {
        if (error.message?.includes("schema cache") || error.message?.includes("Could not find")) {
          console.warn("Coupons table not properly configured in external database");
          toast({ title: "نظام الكوبونات غير مفعّل حالياً", variant: "destructive" });
        } else {
          toast({ title: "كود خصم غير صالح", variant: "destructive" });
        }
        setLoading(false);
        return;
      }
      
      if (!coupon) {
        toast({ title: "كود خصم غير صالح", variant: "destructive" });
        setLoading(false);
        return;
      }
 
     // Check expiry
     if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
       toast({ title: "كود الخصم منتهي الصلاحية", variant: "destructive" });
       setLoading(false);
       return;
     }
 
     // Check max uses
     if (coupon.max_uses && coupon.used_count >= coupon.max_uses) {
       toast({ title: "تم استخدام كود الخصم بالكامل", variant: "destructive" });
       setLoading(false);
       return;
     }
 
     // Check minimum order
     if (coupon.min_order_amount && orderTotal < coupon.min_order_amount) {
       toast({
         title: `الحد الأدنى للطلب $${coupon.min_order_amount}`,
         variant: "destructive",
       });
       setLoading(false);
       return;
     }
 
    // Check product type restriction
    if (coupon.product_type_id && cartProductTypes.length > 0) {
      if (!cartProductTypes.includes(coupon.product_type_id)) {
        toast({
          title: "الكوبون غير صالح لهذه المنتجات",
          description: "هذا الكوبون مخصص لنوع منتج معين",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }
    }

    // Check per-user usage limit
    if (coupon.max_uses_per_user) {
      const { data: session } = await db.auth.getSession();
      if (session?.session?.user) {
        const { count } = await db
          .from("coupon_uses")
          .select("*", { count: "exact", head: true })
          .eq("coupon_id", coupon.id)
          .eq("user_id", session.session.user.id);

        if (count && count >= coupon.max_uses_per_user) {
          toast({
            title: "لقد استخدمت هذا الكوبون بالفعل",
            description: `الحد الأقصى للاستخدام: ${coupon.max_uses_per_user} مرة`,
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
      }
    }

     // Calculate discount
     let discount = 0;
     if (coupon.discount_type === "percentage") {
       discount = (orderTotal * coupon.discount_value) / 100;
     } else {
       discount = Math.min(coupon.discount_value, orderTotal);
     }
 
     onApply(discount, coupon.id, coupon.code);
     setCode("");
     toast({
       title: "تم تطبيق الخصم! 🎉",
       description: `وفّرت $${discount.toFixed(2)}`,
     });
 
     setLoading(false);
   };
 
   if (appliedCoupon) {
     return (
       <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
         <div className="flex items-center gap-2">
           <Check className="h-4 w-4 text-green-500" />
           <span className="text-sm">كوبون مطبق:</span>
           <Badge variant="secondary" className="font-mono">
             {appliedCoupon.code}
           </Badge>
           <span className="text-green-500 font-medium">
             -${appliedCoupon.discount.toFixed(2)}
           </span>
         </div>
         <button
           onClick={onRemove}
           className="p-1 hover:bg-destructive/20 rounded transition-colors"
         >
           <X className="h-4 w-4 text-destructive" />
         </button>
       </div>
     );
   }
 
   return (
     <div className="flex gap-2">
       <div className="relative flex-1">
         <Ticket className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
         <Input
           value={code}
           onChange={(e) => setCode(e.target.value.toUpperCase())}
           placeholder="كود الخصم"
           className="pr-10 font-mono"
           dir="ltr"
           onKeyDown={(e) => e.key === "Enter" && validateCoupon()}
         />
       </div>
       <Button onClick={validateCoupon} disabled={loading} variant="outline">
         {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "تطبيق"}
       </Button>
     </div>
   );
 };
 
 export default CouponInput;