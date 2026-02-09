import { useState, useEffect } from "react";
import { db } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Loader2, Zap, Clock, CalendarIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatDate } from "@/lib/formatDate";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
 interface FlashSale {
   id: string;
   product_id: string;
   variant_id: string | null;
   original_price: number;
   sale_price: number;
   starts_at: string;
   ends_at: string;
   max_quantity: number | null;
   sold_quantity: number;
   is_active: boolean;
   products?: { name: string; image_url: string | null };
   product_variants?: { name: string } | null;
 }
 
 interface Product {
   id: string;
   name: string;
   price: number;
 }
 
 interface Variant {
   id: string;
   name: string;
   price: number;
 }
 
 const FlashSalesTab = () => {
   const [flashSales, setFlashSales] = useState<FlashSale[]>([]);
   const [products, setProducts] = useState<Product[]>([]);
   const [variants, setVariants] = useState<Variant[]>([]);
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);
   const [dialogOpen, setDialogOpen] = useState(false);
 
  // Form state
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [startsAtDate, setStartsAtDate] = useState<Date | undefined>();
  const [startsAtTime, setStartsAtTime] = useState("00:00");
  const [endsAtDate, setEndsAtDate] = useState<Date | undefined>();
  const [endsAtTime, setEndsAtTime] = useState("23:59");
  const [maxQuantity, setMaxQuantity] = useState("");
 
   useEffect(() => {
     fetchData();
   }, []);
 
   useEffect(() => {
     if (selectedProductId) {
       fetchVariants(selectedProductId);
     } else {
       setVariants([]);
       setSelectedVariantId("");
     }
   }, [selectedProductId]);
 
   const fetchData = async () => {
     const [salesRes, productsRes] = await Promise.all([
       db.from("flash_sales").select("*, products(name, image_url), product_variants(name)").order("created_at", { ascending: false }),
       db.from("products").select("id, name, price").eq("is_active", true).order("name"),
     ]);
 
     if (salesRes.data) setFlashSales(salesRes.data);
     if (productsRes.data) setProducts(productsRes.data);
     setLoading(false);
   };
 
   const fetchVariants = async (productId: string) => {
     const { data } = await db
       .from("product_variants")
       .select("id, name, price")
       .eq("product_id", productId)
       .eq("is_active", true);
     if (data) setVariants(data);
   };
 
   const getOriginalPrice = () => {
      if (selectedVariantId && selectedVariantId !== "__base__") {
       const variant = variants.find((v) => v.id === selectedVariantId);
       return variant?.price || 0;
     }
     const product = products.find((p) => p.id === selectedProductId);
     return product?.price || 0;
   };
 
  // Helper to combine date and time
  const combineDateAndTime = (date: Date | undefined, time: string): Date | null => {
    if (!date) return null;
    const [hours, minutes] = time.split(":").map(Number);
    const combined = new Date(date);
    combined.setHours(hours, minutes, 0, 0);
    return combined;
  };

  const handleCreate = async () => {
    if (!selectedProductId || !salePrice || !startsAtDate || !endsAtDate) {
      toast({ title: "خطأ", description: "يرجى ملء جميع الحقول المطلوبة", variant: "destructive" });
      return;
    }

    // Combine date and time
    const startsAtFull = combineDateAndTime(startsAtDate, startsAtTime);
    const endsAtFull = combineDateAndTime(endsAtDate, endsAtTime);
    
    if (!startsAtFull || !endsAtFull) {
      toast({ title: "خطأ", description: "يرجى إدخال تواريخ صحيحة", variant: "destructive" });
      return;
    }

    if (endsAtFull <= startsAtFull) {
      toast({ title: "خطأ", description: "تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية", variant: "destructive" });
      return;
    }

    const originalPrice = getOriginalPrice();
    if (Number(salePrice) >= originalPrice) {
      toast({ title: "خطأ", description: "سعر العرض يجب أن يكون أقل من السعر الأصلي", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { error } = await db.from("flash_sales").insert({
        product_id: selectedProductId,
        variant_id: selectedVariantId && selectedVariantId !== "__base__" ? selectedVariantId : null,
        original_price: originalPrice,
        sale_price: Number(salePrice),
        starts_at: startsAtFull.toISOString(),
        ends_at: endsAtFull.toISOString(),
        max_quantity: maxQuantity ? Number(maxQuantity) : null,
      });

      if (error) {
        console.error("Flash sale creation error:", error);
        toast({ title: "خطأ", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "تم إنشاء العرض بنجاح" });
        resetForm();
        setDialogOpen(false);
        fetchData();
      }
    } catch (err: any) {
      console.error("Unexpected error:", err);
      toast({ title: "خطأ غير متوقع", description: err.message || "حدث خطأ أثناء إنشاء العرض", variant: "destructive" });
    }
    setSaving(false);
  };
 
  const toggleActive = async (id: string, currentActive: boolean) => {
    await db.from("flash_sales").update({ is_active: !currentActive }).eq("id", id);
    fetchData();
  };
 
  const deleteSale = async (id: string) => {
    await db.from("flash_sales").delete().eq("id", id);
    toast({ title: "تم حذف العرض" });
    fetchData();
  };
 
  const resetForm = () => {
    setSelectedProductId("");
    setSelectedVariantId("");
    setSalePrice("");
    setStartsAtDate(undefined);
    setStartsAtTime("00:00");
    setEndsAtDate(undefined);
    setEndsAtTime("23:59");
    setMaxQuantity("");
  };
 
   const getTimeRemaining = (endsAt: string) => {
     const diff = new Date(endsAt).getTime() - Date.now();
     if (diff <= 0) return "انتهى";
     const hours = Math.floor(diff / (1000 * 60 * 60));
     const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
     if (hours > 24) return `${Math.floor(hours / 24)} يوم`;
     return `${hours}س ${minutes}د`;
   };
 
   const isActive = (sale: FlashSale) => {
     const now = Date.now();
     return sale.is_active && new Date(sale.starts_at).getTime() <= now && new Date(sale.ends_at).getTime() > now;
   };
 
   if (loading) {
     return (
       <div className="flex items-center justify-center py-20">
         <Loader2 className="h-8 w-8 animate-spin text-primary" />
       </div>
     );
   }
 
   return (
     <div className="space-y-6" dir="rtl">
       <div className="flex items-center justify-between">
         <div className="flex items-center gap-3">
           <div className="p-2.5 rounded-xl bg-orange-500/10">
             <Zap className="h-6 w-6 text-orange-500" />
           </div>
           <div>
             <h2 className="text-xl font-bold">العروض المحدودة</h2>
             <p className="text-sm text-muted-foreground">Flash Sales مع عداد تنازلي</p>
           </div>
         </div>
 
         <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
           <DialogTrigger asChild>
             <Button className="gap-2 bg-orange-500 hover:bg-orange-600">
               <Plus className="h-4 w-4" />
               عرض جديد
             </Button>
           </DialogTrigger>
           <DialogContent className="sm:max-w-md" dir="rtl">
             <DialogHeader>
               <DialogTitle>إنشاء عرض محدود</DialogTitle>
             </DialogHeader>
             <div className="space-y-4 py-4">
               <div className="space-y-2">
                 <Label>المنتج</Label>
                 <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                   <SelectTrigger>
                     <SelectValue placeholder="اختر المنتج" />
                   </SelectTrigger>
                   <SelectContent>
                     {products.map((p) => (
                       <SelectItem key={p.id} value={p.id}>
                         {p.name} (${p.price})
                       </SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
               </div>
 
               {variants.length > 0 && (
                 <div className="space-y-2">
                   <Label>الفئة (اختياري)</Label>
                   <Select value={selectedVariantId} onValueChange={setSelectedVariantId}>
                     <SelectTrigger>
                       <SelectValue placeholder="اختر الفئة" />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value="__base__">المنتج الأساسي</SelectItem>
                       {variants.map((v) => (
                         <SelectItem key={v.id} value={v.id}>
                           {v.name} (${v.price})
                         </SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                 </div>
               )}
 
               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                   <Label>السعر الأصلي</Label>
                   <Input value={`$${getOriginalPrice()}`} disabled dir="ltr" />
                 </div>
                 <div className="space-y-2">
                   <Label>سعر العرض ($)</Label>
                   <Input
                     type="number"
                     value={salePrice}
                     onChange={(e) => setSalePrice(e.target.value)}
                     placeholder="9.99"
                     dir="ltr"
                   />
                 </div>
               </div>
 
                {/* Start Date & Time */}
                <div className="space-y-2">
                  <Label>يبدأ في</Label>
                  <div className="flex gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "flex-1 justify-start text-left font-normal",
                            !startsAtDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="ml-2 h-4 w-4" />
                          {startsAtDate ? format(startsAtDate, "dd/MM/yyyy", { locale: ar }) : "اختر التاريخ"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={startsAtDate}
                          onSelect={setStartsAtDate}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <Input
                      type="time"
                      value={startsAtTime}
                      onChange={(e) => setStartsAtTime(e.target.value)}
                      className="w-24"
                      dir="ltr"
                    />
                  </div>
                </div>

                {/* End Date & Time */}
                <div className="space-y-2">
                  <Label>ينتهي في</Label>
                  <div className="flex gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "flex-1 justify-start text-left font-normal",
                            !endsAtDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="ml-2 h-4 w-4" />
                          {endsAtDate ? format(endsAtDate, "dd/MM/yyyy", { locale: ar }) : "اختر التاريخ"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={endsAtDate}
                          onSelect={setEndsAtDate}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <Input
                      type="time"
                      value={endsAtTime}
                      onChange={(e) => setEndsAtTime(e.target.value)}
                      className="w-24"
                      dir="ltr"
                    />
                  </div>
                </div>
 
               <div className="space-y-2">
                 <Label>الحد الأقصى للكمية (اختياري)</Label>
                 <Input
                   type="number"
                   value={maxQuantity}
                   onChange={(e) => setMaxQuantity(e.target.value)}
                   placeholder="غير محدود"
                   dir="ltr"
                 />
               </div>
 
               <Button onClick={handleCreate} disabled={saving} className="w-full bg-orange-500 hover:bg-orange-600">
                 {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "إنشاء العرض"}
               </Button>
             </div>
           </DialogContent>
         </Dialog>
       </div>
 
       <Card>
         <CardContent className="p-0">
           <Table>
             <TableHeader>
               <TableRow>
                 <TableHead>المنتج</TableHead>
                 <TableHead>السعر</TableHead>
                 <TableHead>الخصم</TableHead>
                 <TableHead>الوقت المتبقي</TableHead>
                 <TableHead>المبيعات</TableHead>
                 <TableHead>الحالة</TableHead>
                 <TableHead></TableHead>
               </TableRow>
             </TableHeader>
             <TableBody>
               {flashSales.length === 0 ? (
                 <TableRow>
                   <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                     لا توجد عروض حالياً
                   </TableCell>
                 </TableRow>
               ) : (
                 flashSales.map((sale) => (
                   <TableRow key={sale.id}>
                     <TableCell>
                       <div>
                         <p className="font-medium">{sale.products?.name}</p>
                         {sale.product_variants && (
                           <p className="text-xs text-muted-foreground">{sale.product_variants.name}</p>
                         )}
                       </div>
                     </TableCell>
                     <TableCell>
                       <div className="flex items-center gap-2">
                         <span className="text-destructive line-through">${sale.original_price}</span>
                         <span className="font-bold text-green-500">${sale.sale_price}</span>
                       </div>
                     </TableCell>
                     <TableCell>
                       <Badge variant="secondary">
                         {Math.round((1 - sale.sale_price / sale.original_price) * 100)}%
                       </Badge>
                     </TableCell>
                     <TableCell>
                       <div className="flex items-center gap-1 text-sm">
                         <Clock className="h-3 w-3" />
                         {getTimeRemaining(sale.ends_at)}
                       </div>
                     </TableCell>
                     <TableCell>
                       {sale.sold_quantity}
                       {sale.max_quantity ? ` / ${sale.max_quantity}` : ""}
                     </TableCell>
                     <TableCell>
                       <Badge
                         variant={isActive(sale) ? "default" : "secondary"}
                         className="cursor-pointer"
                         onClick={() => toggleActive(sale.id, sale.is_active)}
                       >
                         {isActive(sale) ? "نشط" : "متوقف"}
                       </Badge>
                     </TableCell>
                     <TableCell>
                       <Button
                         variant="ghost"
                         size="icon"
                         onClick={() => deleteSale(sale.id)}
                         className="text-destructive hover:text-destructive"
                       >
                         <Trash2 className="h-4 w-4" />
                       </Button>
                     </TableCell>
                   </TableRow>
                 ))
               )}
             </TableBody>
           </Table>
         </CardContent>
       </Card>
     </div>
   );
 };
 
 export default FlashSalesTab;