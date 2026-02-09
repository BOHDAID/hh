 import { useState, useEffect } from "react";
 import { db } from "@/lib/supabaseClient";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
 import { Badge } from "@/components/ui/badge";
 import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
 import { toast } from "@/hooks/use-toast";
 import { Plus, Trash2, Loader2, Ticket, Copy, Check } from "lucide-react";
 import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
 import { formatDate } from "@/lib/formatDate";
 
 interface Coupon {
   id: string;
   code: string;
   discount_type: "percentage" | "fixed";
   discount_value: number;
   min_order_amount: number;
   max_uses: number | null;
  max_uses_per_user: number | null;
  product_type_id: string | null;
   used_count: number;
   expires_at: string | null;
   is_active: boolean;
   created_at: string;
 }
 
interface ProductType {
  id: string;
  name: string;
}

 const CouponsTab = () => {
   const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);
   const [dialogOpen, setDialogOpen] = useState(false);
   const [copiedId, setCopiedId] = useState<string | null>(null);
 
   // Form state
   const [code, setCode] = useState("");
   const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
   const [discountValue, setDiscountValue] = useState("");
   const [minOrderAmount, setMinOrderAmount] = useState("");
   const [maxUses, setMaxUses] = useState("");
  const [maxUsesPerUser, setMaxUsesPerUser] = useState("");
  const [productTypeId, setProductTypeId] = useState("");
   const [expiresAt, setExpiresAt] = useState("");
 
  const [schemaError, setSchemaError] = useState(false);

  useEffect(() => {
    fetchCoupons();
    fetchProductTypes();
  }, []);

  const fetchCoupons = async () => {
    try {
      const { data, error } = await db
        .from("coupons")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching coupons:", error);
        // Any error related to schema/columns should show the helper UI
        setSchemaError(true);
        setLoading(false);
        return;
      }
      
      if (data) {
        setCoupons(data);
        setSchemaError(false);
      }
    } catch (err) {
      console.error("Error fetching coupons:", err);
      setSchemaError(true);
    }
    setLoading(false);
  };
 
  const fetchProductTypes = async () => {
    const { data } = await db
      .from("product_types")
      .select("id, name")
      .order("display_order");
    if (data) setProductTypes(data);
  };

   const generateCode = () => {
     const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
     let result = "";
     for (let i = 0; i < 8; i++) {
       result += chars.charAt(Math.floor(Math.random() * chars.length));
     }
     setCode(result);
   };
 
    const handleCreate = async () => {
      if (!code || !discountValue) {
        toast({ title: "خطأ", description: "يرجى ملء الحقول المطلوبة", variant: "destructive" });
        return;
      }

      setSaving(true);
      // Only include basic columns that are definitely in the schema
      const couponData: Record<string, unknown> = {
        code: code.toUpperCase(),
        discount_type: discountType,
        discount_value: Number(discountValue),
        min_order_amount: minOrderAmount ? Number(minOrderAmount) : 0,
        max_uses: maxUses ? Number(maxUses) : null,
        expires_at: expiresAt || null,
      };
      
      // Try to add advanced fields - they may not exist in external DB
      if (maxUsesPerUser) couponData.max_uses_per_user = Number(maxUsesPerUser);
      if (productTypeId && productTypeId !== "__all__") couponData.product_type_id = productTypeId;
      
      const { error } = await db.from("coupons").insert(couponData);

      if (error) {
        // Check for schema cache errors
        if (error.message?.includes("schema cache") || error.message?.includes("Could not find")) {
          setSchemaError(true);
          setDialogOpen(false);
        } else {
          toast({ title: "خطأ", description: error.message, variant: "destructive" });
        }
      } else {
        toast({ title: "تم إنشاء الكوبون بنجاح" });
        resetForm();
        setDialogOpen(false);
        fetchCoupons();
      }
      setSaving(false);
    };
 
   const toggleActive = async (id: string, currentActive: boolean) => {
     const { error } = await db
       .from("coupons")
       .update({ is_active: !currentActive })
       .eq("id", id);
 
     if (error) {
       toast({ title: "خطأ", description: error.message, variant: "destructive" });
     } else {
       fetchCoupons();
     }
   };
 
   const deleteCoupon = async (id: string) => {
     const { error } = await db.from("coupons").delete().eq("id", id);
     if (error) {
       toast({ title: "خطأ", description: error.message, variant: "destructive" });
     } else {
       toast({ title: "تم حذف الكوبون" });
       fetchCoupons();
     }
   };
 
   const copyCode = (id: string, codeText: string) => {
     navigator.clipboard.writeText(codeText);
     setCopiedId(id);
     setTimeout(() => setCopiedId(null), 2000);
   };
 
   const resetForm = () => {
     setCode("");
     setDiscountType("percentage");
     setDiscountValue("");
     setMinOrderAmount("");
     setMaxUses("");
    setMaxUsesPerUser("");
    setProductTypeId("");
     setExpiresAt("");
   };
 
   if (loading) {
     return (
       <div className="flex items-center justify-center py-20">
         <Loader2 className="h-8 w-8 animate-spin text-primary" />
       </div>
     );
   }
 
  if (schemaError) {
    return (
      <div className="space-y-6" dir="rtl">
        <Card className="border-destructive/50 bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <Ticket className="h-5 w-5" />
              خطأ في جدول الكوبونات
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              جدول الكوبونات غير موجود أو يحتاج لتحديث في قاعدة البيانات الخارجية.
            </p>
            <div className="bg-muted p-4 rounded-lg text-xs font-mono overflow-x-auto" dir="ltr">
              <pre>{`-- شغّل هذا في SQL Editor في قاعدة البيانات الخارجية:

CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL DEFAULT 'percentage',
  discount_value numeric NOT NULL DEFAULT 0,
  min_order_amount numeric DEFAULT 0,
  max_uses integer DEFAULT NULL,
  max_uses_per_user integer DEFAULT NULL,
  product_type_id uuid DEFAULT NULL,
  used_count integer DEFAULT 0,
  expires_at timestamptz DEFAULT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- ثم شغّل هذا لتحديث الذاكرة المؤقتة:
NOTIFY pgrst, 'reload schema';`}</pre>
            </div>
            <Button onClick={() => { setSchemaError(false); fetchCoupons(); }} variant="outline">
              إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Ticket className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">إدارة الكوبونات</h2>
            <p className="text-sm text-muted-foreground">إنشاء وإدارة أكواد الخصم</p>
          </div>
        </div>
 
         <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
           <DialogTrigger asChild>
             <Button className="gap-2">
               <Plus className="h-4 w-4" />
               كوبون جديد
             </Button>
           </DialogTrigger>
           <DialogContent className="sm:max-w-md" dir="rtl">
             <DialogHeader>
               <DialogTitle>إنشاء كوبون جديد</DialogTitle>
             </DialogHeader>
             <div className="space-y-4 py-4">
               <div className="space-y-2">
                 <Label>كود الكوبون</Label>
                 <div className="flex gap-2">
                   <Input
                     value={code}
                     onChange={(e) => setCode(e.target.value.toUpperCase())}
                     placeholder="SAVE20"
                     dir="ltr"
                     className="font-mono"
                   />
                   <Button type="button" variant="outline" onClick={generateCode}>
                     توليد
                   </Button>
                 </div>
               </div>
 
               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                   <Label>نوع الخصم</Label>
                   <Select value={discountType} onValueChange={(v: "percentage" | "fixed") => setDiscountType(v)}>
                     <SelectTrigger>
                       <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                       <SelectItem value="percentage">نسبة مئوية (%)</SelectItem>
                       <SelectItem value="fixed">مبلغ ثابت ($)</SelectItem>
                     </SelectContent>
                   </Select>
                 </div>
                 <div className="space-y-2">
                   <Label>قيمة الخصم</Label>
                   <Input
                     type="number"
                     value={discountValue}
                     onChange={(e) => setDiscountValue(e.target.value)}
                     placeholder={discountType === "percentage" ? "20" : "5"}
                     dir="ltr"
                   />
                 </div>
               </div>
 
               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                   <Label>الحد الأدنى للطلب ($)</Label>
                   <Input
                     type="number"
                     value={minOrderAmount}
                     onChange={(e) => setMinOrderAmount(e.target.value)}
                     placeholder="0"
                     dir="ltr"
                   />
                 </div>
                 <div className="space-y-2">
                   <Label>الحد الأقصى للاستخدام</Label>
                   <Input
                     type="number"
                     value={maxUses}
                     onChange={(e) => setMaxUses(e.target.value)}
                     placeholder="غير محدود"
                     dir="ltr"
                   />
                 </div>
               </div>
 
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>الحد لكل مستخدم</Label>
                    <Input
                      type="number"
                      value={maxUsesPerUser}
                      onChange={(e) => setMaxUsesPerUser(e.target.value)}
                      placeholder="غير محدود"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>نوع المنتج</Label>
                    <Select value={productTypeId} onValueChange={setProductTypeId}>
                      <SelectTrigger>
                        <SelectValue placeholder="جميع المنتجات" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">جميع المنتجات</SelectItem>
                        {productTypes.map((type) => (
                          <SelectItem key={type.id} value={type.id}>
                            {type.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

               <div className="space-y-2">
                 <Label>تاريخ الانتهاء (اختياري)</Label>
                 <Input
                   type="datetime-local"
                   value={expiresAt}
                   onChange={(e) => setExpiresAt(e.target.value)}
                   dir="ltr"
                 />
               </div>
 
               <Button onClick={handleCreate} disabled={saving} className="w-full">
                 {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "إنشاء الكوبون"}
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
                 <TableHead>الكود</TableHead>
                 <TableHead>الخصم</TableHead>
                 <TableHead>الحد الأدنى</TableHead>
                 <TableHead>الاستخدام</TableHead>
                    <TableHead>نوع المنتج</TableHead>
                 <TableHead>الانتهاء</TableHead>
                 <TableHead>الحالة</TableHead>
                 <TableHead></TableHead>
               </TableRow>
             </TableHeader>
             <TableBody>
               {coupons.length === 0 ? (
                 <TableRow>
                   <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                     لا توجد كوبونات حتى الآن
                   </TableCell>
                 </TableRow>
               ) : (
                 coupons.map((coupon) => (
                   <TableRow key={coupon.id}>
                     <TableCell>
                       <div className="flex items-center gap-2">
                         <code className="bg-muted px-2 py-1 rounded font-mono text-sm">
                           {coupon.code}
                         </code>
                         <button
                           onClick={() => copyCode(coupon.id, coupon.code)}
                           className="text-muted-foreground hover:text-foreground"
                         >
                           {copiedId === coupon.id ? (
                             <Check className="h-4 w-4 text-green-500" />
                           ) : (
                             <Copy className="h-4 w-4" />
                           )}
                         </button>
                       </div>
                     </TableCell>
                     <TableCell>
                       {coupon.discount_type === "percentage"
                         ? `${coupon.discount_value}%`
                         : `$${coupon.discount_value}`}
                     </TableCell>
                     <TableCell>${coupon.min_order_amount}</TableCell>
                     <TableCell>
                       {coupon.used_count}
                       {coupon.max_uses ? ` / ${coupon.max_uses}` : " / ∞"}
                        {coupon.max_uses_per_user && (
                          <span className="text-xs text-muted-foreground block">
                            ({coupon.max_uses_per_user} لكل مستخدم)
                          </span>
                        )}
                     </TableCell>
                      <TableCell>
                        {coupon.product_type_id
                          ? productTypes.find((t) => t.id === coupon.product_type_id)?.name || "—"
                          : "الكل"}
                      </TableCell>
                     <TableCell>
                       {coupon.expires_at
                         ? formatDate(coupon.expires_at)
                         : "—"}
                     </TableCell>
                     <TableCell>
                       <Badge
                         variant={coupon.is_active ? "default" : "secondary"}
                         className="cursor-pointer"
                         onClick={() => toggleActive(coupon.id, coupon.is_active)}
                       >
                         {coupon.is_active ? "مفعّل" : "معطّل"}
                       </Badge>
                     </TableCell>
                     <TableCell>
                       <Button
                         variant="ghost"
                         size="icon"
                         onClick={() => deleteCoupon(coupon.id)}
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
 
 export default CouponsTab;