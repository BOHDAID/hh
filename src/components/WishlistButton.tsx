 import { useState, useEffect } from "react";
 import { db, getAuthClient, isExternalConfigured } from "@/lib/supabaseClient";
 import { Button } from "@/components/ui/button";
 import { Heart } from "lucide-react";
 import { toast } from "@/hooks/use-toast";
 import { cn } from "@/lib/utils";
 
 interface WishlistButtonProps {
   productId: string;
   variant?: "icon" | "button";
   className?: string;
 }
 
 const WishlistButton = ({ productId, variant = "icon", className }: WishlistButtonProps) => {
   const [isInWishlist, setIsInWishlist] = useState(false);
   const [loading, setLoading] = useState(false);
   const [userId, setUserId] = useState<string | null>(null);
 
   useEffect(() => {
     checkWishlistStatus();
   }, [productId]);
 
   const checkWishlistStatus = async () => {
     const authClient = isExternalConfigured ? getAuthClient() : db;
     const { data: { session } } = await authClient.auth.getSession();
     if (!session) return;
 
     setUserId(session.user.id);
 
     const { data } = await db
       .from("wishlist_items")
       .select("id")
       .eq("user_id", session.user.id)
       .eq("product_id", productId)
       .maybeSingle();
 
     setIsInWishlist(!!data);
   };
 
   const toggleWishlist = async (e: React.MouseEvent) => {
     e.preventDefault();
     e.stopPropagation();
 
     if (!userId) {
       toast({ title: "يرجى تسجيل الدخول أولاً", variant: "destructive" });
       return;
     }
 
     setLoading(true);
 
     if (isInWishlist) {
       const { error } = await db
         .from("wishlist_items")
         .delete()
         .eq("user_id", userId)
         .eq("product_id", productId);
 
       if (!error) {
         setIsInWishlist(false);
         toast({ title: "تمت الإزالة من المفضلة" });
       }
     } else {
       const { error } = await db
         .from("wishlist_items")
         .insert({ user_id: userId, product_id: productId });
 
       if (!error) {
         setIsInWishlist(true);
         toast({ title: "تمت الإضافة للمفضلة ❤️" });
       }
     }
 
     setLoading(false);
   };
 
   if (variant === "icon") {
     return (
       <button
         onClick={toggleWishlist}
         disabled={loading}
         className={cn(
           "p-2 rounded-full bg-background/80 backdrop-blur-sm transition-all",
           isInWishlist
             ? "text-pink-500 hover:bg-pink-500/20"
             : "text-muted-foreground hover:text-pink-500 hover:bg-background",
           className
         )}
       >
         <Heart
           className={cn("h-5 w-5 transition-all", isInWishlist && "fill-current")}
         />
       </button>
     );
   }
 
   return (
     <Button
       variant={isInWishlist ? "secondary" : "outline"}
       size="sm"
       onClick={toggleWishlist}
       disabled={loading}
       className={cn("gap-2", className)}
     >
       <Heart
         className={cn("h-4 w-4", isInWishlist && "fill-current text-pink-500")}
       />
       {isInWishlist ? "في المفضلة" : "أضف للمفضلة"}
     </Button>
   );
 };
 
 export default WishlistButton;