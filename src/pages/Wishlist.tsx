import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db, getAuthClient, isExternalConfigured } from "@/lib/supabaseClient";
import UserLayout from "@/components/user/UserLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Heart, ShoppingCart, Trash2, Loader2, HeartOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
 
 interface WishlistItem {
   id: string;
   product_id: string;
   products: {
     id: string;
     name: string;
     price: number;
     image_url: string | null;
   };
 }
 
 const Wishlist = () => {
   const { t, i18n } = useTranslation();
   const isRTL = i18n.language === 'ar';
   const navigate = useNavigate();
   const [items, setItems] = useState<WishlistItem[]>([]);
   const [loading, setLoading] = useState(true);
   const [removingId, setRemovingId] = useState<string | null>(null);
 
   useEffect(() => {
     fetchWishlist();
   }, []);
 
   const fetchWishlist = async () => {
     const authClient = isExternalConfigured ? getAuthClient() : db;
     const { data: { session } } = await authClient.auth.getSession();
 
     if (!session) {
       navigate("/login");
       return;
     }
 
     const { data, error } = await db
       .from("wishlist_items")
       .select("id, product_id, products(id, name, price, image_url)")
       .eq("user_id", session.user.id);
 
     if (data) setItems(data as unknown as WishlistItem[]);
     if (error) console.error("Error fetching wishlist:", error);
     setLoading(false);
   };
 
   const removeFromWishlist = async (id: string) => {
     setRemovingId(id);
     const { error } = await db.from("wishlist_items").delete().eq("id", id);
 
     if (error) {
       toast({ title: t('common.error'), description: error.message, variant: "destructive" });
     } else {
       setItems((prev) => prev.filter((item) => item.id !== id));
       toast({ title: isRTL ? "تمت الإزالة من المفضلة" : "Removed from wishlist" });
     }
     setRemovingId(null);
   };
 
   const addToCart = async (productId: string) => {
     const authClient = isExternalConfigured ? getAuthClient() : db;
     const { data: { session } } = await authClient.auth.getSession();
 
     if (!session) {
       navigate("/login");
       return;
     }
 
     const { error } = await db.from("cart_items").upsert(
       { user_id: session.user.id, product_id: productId, quantity: 1 },
       { onConflict: "user_id,product_id" }
     );
 
     if (error) {
       toast({ title: t('common.error'), description: error.message, variant: "destructive" });
     } else {
       toast({ title: isRTL ? "تمت الإضافة للسلة" : "Added to cart" });
     }
   };
 
  return (
    <UserLayout 
      title={t('common.wishlist')} 
      subtitle={isRTL ? "المنتجات المحفوظة للشراء لاحقاً" : "Products saved for later"}
    >
      <div className="max-w-5xl mx-auto">
 
         {loading ? (
           <div className="flex items-center justify-center py-20">
             <Loader2 className="h-8 w-8 animate-spin text-primary" />
           </div>
         ) : items.length === 0 ? (
           <Card className="text-center py-16">
             <CardContent>
               <HeartOff className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
               <h3 className="text-lg font-semibold mb-2">
                 {isRTL ? "قائمة الأمنيات فارغة" : "Wishlist is empty"}
               </h3>
               <p className="text-muted-foreground mb-6">
                 {isRTL ? "لم تضف أي منتجات للمفضلة بعد" : "You haven't added any products to wishlist yet"}
               </p>
               <Button onClick={() => navigate("/")} variant="outline">
                 {isRTL ? "تصفح المنتجات" : "Browse Products"}
               </Button>
             </CardContent>
           </Card>
         ) : (
           <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
             <AnimatePresence>
               {items.map((item) => (
                 <motion.div
                   key={item.id}
                   layout
                   initial={{ opacity: 0, scale: 0.9 }}
                   animate={{ opacity: 1, scale: 1 }}
                   exit={{ opacity: 0, scale: 0.9 }}
                 >
                   <Card className="overflow-hidden group hover:shadow-lg transition-shadow">
                     <div className="relative aspect-video bg-muted">
                       {item.products.image_url ? (
                         <img
                           src={item.products.image_url}
                           alt={item.products.name}
                           className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                         />
                       ) : (
                         <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                           <ShoppingCart className="h-10 w-10" />
                         </div>
                       )}
                       <button
                         onClick={() => removeFromWishlist(item.id)}
                         disabled={removingId === item.id}
                         className={`absolute top-2 ${isRTL ? 'left-2' : 'right-2'} p-2 rounded-full bg-background/80 backdrop-blur-sm hover:bg-destructive hover:text-destructive-foreground transition-colors`}
                       >
                         {removingId === item.id ? (
                           <Loader2 className="h-4 w-4 animate-spin" />
                         ) : (
                           <Trash2 className="h-4 w-4" />
                         )}
                       </button>
                     </div>
                     <CardContent className="p-4">
                       <h3 className="font-semibold mb-2 line-clamp-1">{item.products.name}</h3>
                       <div className="flex items-center justify-between">
                         <span className="text-lg font-bold text-primary">
                           ${item.products.price}
                         </span>
                         <Button
                           size="sm"
                           onClick={() => navigate(`/checkout/${item.products.id}`)}
                           className="gap-1"
                         >
                           <ShoppingCart className="h-4 w-4" />
                           {t('products.buyNow')}
                         </Button>
                       </div>
                     </CardContent>
                   </Card>
                 </motion.div>
               ))}
             </AnimatePresence>
           </div>
          )}
        </div>
      </UserLayout>
    );
  };
  
  export default Wishlist;