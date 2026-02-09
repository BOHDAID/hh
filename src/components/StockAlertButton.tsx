 import { useState, useEffect } from "react";
 import { db, getAuthClient, isExternalConfigured } from "@/lib/supabaseClient";
 import { Button } from "@/components/ui/button";
 import { Bell, BellOff, Loader2 } from "lucide-react";
 import { toast } from "@/hooks/use-toast";
 import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 
 interface StockAlertButtonProps {
   productId: string;
   variantId?: string | null;
   productName: string;
 }
 
 const StockAlertButton = ({ productId, variantId, productName }: StockAlertButtonProps) => {
   const [isSubscribed, setIsSubscribed] = useState(false);
   const [loading, setLoading] = useState(false);
   const [email, setEmail] = useState("");
   const [dialogOpen, setDialogOpen] = useState(false);
   const [userId, setUserId] = useState<string | null>(null);
   const [userEmail, setUserEmail] = useState("");
 
   useEffect(() => {
     checkSubscription();
   }, [productId, variantId]);
 
   const checkSubscription = async () => {
     const authClient = isExternalConfigured ? getAuthClient() : db;
     const { data: { session } } = await authClient.auth.getSession();
     if (!session) return;
 
     setUserId(session.user.id);
     setUserEmail(session.user.email || "");
     setEmail(session.user.email || "");
 
     let query = db
       .from("stock_alerts")
       .select("id")
       .eq("user_id", session.user.id)
       .eq("product_id", productId);
 
     if (variantId) {
       query = query.eq("variant_id", variantId);
     } else {
       query = query.is("variant_id", null);
     }
 
     const { data } = await query.maybeSingle();
     setIsSubscribed(!!data);
   };
 
   const subscribe = async () => {
     if (!userId) {
       toast({ title: "يرجى تسجيل الدخول أولاً", variant: "destructive" });
       return;
     }
 
     if (!email) {
       toast({ title: "يرجى إدخال البريد الإلكتروني", variant: "destructive" });
       return;
     }
 
     setLoading(true);
 
     const { error } = await db.from("stock_alerts").insert({
       user_id: userId,
       product_id: productId,
       variant_id: variantId || null,
       email,
     });
 
     if (error) {
       toast({ title: "خطأ", description: error.message, variant: "destructive" });
     } else {
       setIsSubscribed(true);
       setDialogOpen(false);
       toast({
         title: "تم التسجيل للتنبيه 🔔",
         description: `سنخبرك عند توفر "${productName}"`,
       });
     }
 
     setLoading(false);
   };
 
   const unsubscribe = async () => {
     if (!userId) return;
 
     setLoading(true);
 
     let query = db
       .from("stock_alerts")
       .delete()
       .eq("user_id", userId)
       .eq("product_id", productId);
 
     if (variantId) {
       query = query.eq("variant_id", variantId);
     } else {
       query = query.is("variant_id", null);
     }
 
     const { error } = await query;
 
     if (!error) {
       setIsSubscribed(false);
       toast({ title: "تم إلغاء التنبيه" });
     }
 
     setLoading(false);
   };
 
   if (isSubscribed) {
     return (
       <Button
         variant="outline"
         size="sm"
         onClick={unsubscribe}
         disabled={loading}
         className="gap-2"
       >
         {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellOff className="h-4 w-4" />}
         إلغاء التنبيه
       </Button>
     );
   }
 
   return (
     <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
       <DialogTrigger asChild>
         <Button variant="secondary" size="sm" className="gap-2">
           <Bell className="h-4 w-4" />
           أخبرني عند التوفر
         </Button>
       </DialogTrigger>
       <DialogContent className="sm:max-w-md" dir="rtl">
         <DialogHeader>
           <DialogTitle>تنبيه توفر المنتج</DialogTitle>
         </DialogHeader>
         <div className="space-y-4 py-4">
           <p className="text-sm text-muted-foreground">
             سنرسل لك إشعاراً عندما يتوفر "{productName}" مرة أخرى
           </p>
           <div className="space-y-2">
             <Label>البريد الإلكتروني</Label>
             <Input
               type="email"
               value={email}
               onChange={(e) => setEmail(e.target.value)}
               placeholder="your@email.com"
               dir="ltr"
             />
           </div>
           <Button onClick={subscribe} disabled={loading} className="w-full">
             {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "تفعيل التنبيه"}
           </Button>
         </div>
       </DialogContent>
     </Dialog>
   );
 };
 
 export default StockAlertButton;