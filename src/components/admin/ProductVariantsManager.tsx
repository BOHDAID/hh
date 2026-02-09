import { useState, useEffect } from "react";
import { db } from "@/lib/supabaseClient";
import { translateVariant } from "@/lib/translateApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Edit,
  Trash2,
  Loader2,
  Save,
  Package,
  GripVertical,
  Key,
  Languages,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import VariantImagesManager from "./VariantImagesManager";

interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  image_url: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  warranty_days: number;
}

interface ProductAccount {
  id: string;
  product_id: string;
  variant_id: string | null;
  account_data: string;
  is_sold: boolean;
}

interface ProductVariantsManagerProps {
  productId: string;
  productName: string;
}

const ProductVariantsManager = ({ productId, productName }: ProductVariantsManagerProps) => {
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [variantStocks, setVariantStocks] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState<ProductVariant | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Accounts state
  const [variantAccounts, setVariantAccounts] = useState<ProductAccount[]>([]);
  const [accountsTextarea, setAccountsTextarea] = useState("");
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  
  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    is_active: true,
    warranty_days: "0",
  });

  useEffect(() => {
    fetchVariants();
  }, [productId]);

  const fetchVariants = async () => {
    setLoading(true);
    const { data, error } = await db
      .from("product_variants")
      .select("*")
      .eq("product_id", productId)
      .order("display_order", { ascending: true });

    if (error) {
      console.error("Error fetching variants:", error);
    } else {
      setVariants(data || []);
      // Fetch stock counts for each variant
      if (data && data.length > 0) {
        const stockCounts: Record<string, number> = {};
        for (const variant of data) {
          const { count } = await db
            .from("product_accounts")
            .select("*", { count: "exact", head: true })
            .eq("variant_id", variant.id)
            .eq("is_sold", false);
          stockCounts[variant.id] = count || 0;
        }
        setVariantStocks(stockCounts);
      }
    }
    setLoading(false);
  };

  const fetchVariantAccounts = async (variantId: string) => {
    setLoadingAccounts(true);
    const { data } = await db
      .from("product_accounts")
      .select("*")
      .eq("variant_id", variantId)
      .order("is_sold", { ascending: true });
    
    if (data) {
      setVariantAccounts(data);
      const unsoldAccounts = data.filter(a => !a.is_sold).map(a => a.account_data);
      setAccountsTextarea(unsoldAccounts.join('\n'));
    }
    setLoadingAccounts(false);
  };

  const openDialog = (variant?: ProductVariant) => {
    if (variant) {
      setEditingVariant(variant);
      setForm({
        name: variant.name,
        description: variant.description || "",
        price: String(variant.price),
        is_active: variant.is_active,
        warranty_days: String(variant.warranty_days || 0),
      });
      fetchVariantAccounts(variant.id);
    } else {
      setEditingVariant(null);
      setVariantAccounts([]);
      setAccountsTextarea("");
      setForm({
        name: "",
        description: "",
        price: "",
        is_active: true,
        warranty_days: "0",
      });
    }
    setDialogOpen(true);
  };

  const saveVariant = async () => {
    if (!form.name || !form.price) {
      toast({
        title: "خطأ",
        description: "الاسم والسعر مطلوبان",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    // Auto-translate to English
    toast({ title: "جاري الترجمة...", description: "يتم ترجمة الخيار للإنجليزية تلقائياً" });
    const translations = await translateVariant({
      name: form.name,
      description: form.description,
    });

    const variantData = {
      product_id: productId,
      name: form.name,
      name_en: translations.name_en || null,
      description: form.description || null,
      description_en: translations.description_en || null,
      price: parseFloat(form.price),
      is_active: form.is_active,
      display_order: editingVariant?.display_order ?? variants.length,
      warranty_days: parseInt(form.warranty_days) || 0,
    };

    try {
      let variantId = editingVariant?.id;
      
      if (editingVariant) {
        const { error } = await db
          .from("product_variants")
          .update(variantData)
          .eq("id", editingVariant.id);

        if (error) throw error;
      } else {
        const { data, error } = await db.from("product_variants").insert(variantData).select().single();
        if (error) throw error;
        variantId = data.id;
      }

      // حفظ الحسابات تلقائياً إذا كان هناك variant موجود
      if (variantId && accountsTextarea.trim()) {
        const newAccounts = accountsTextarea
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0);

        const existingUnsold = variantAccounts
          .filter(a => !a.is_sold)
          .map(a => a.account_data);

        const toDelete = variantAccounts
          .filter(a => !a.is_sold && !newAccounts.includes(a.account_data))
          .map(a => a.id);

        const toAdd = newAccounts.filter(acc => !existingUnsold.includes(acc));

        if (toDelete.length > 0) {
          await db.from('product_accounts').delete().in('id', toDelete);
        }

        if (toAdd.length > 0) {
          await db.from('product_accounts').insert(toAdd.map(acc => ({
            product_id: productId,
            variant_id: variantId,
            account_data: acc,
          })));
        }
      }

      toast({ 
        title: editingVariant ? "تم التحديث" : "تم الإضافة", 
        description: editingVariant ? "تم حفظ الخيار وترجمته بنجاح ✨" : "تم إضافة الخيار وترجمته بنجاح ✨" 
      });

      setDialogOpen(false);
      fetchVariants();
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };


  const deleteVariant = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الخيار؟")) return;

    const { error } = await db.from("product_variants").delete().eq("id", id);
    if (error) {
      toast({
        title: "خطأ",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({ title: "تم الحذف", description: "تم حذف الخيار بنجاح" });
      fetchVariants();
    }
  };

  const toggleActive = async (variant: ProductVariant) => {
    const { error } = await db
      .from("product_variants")
      .update({ is_active: !variant.is_active })
      .eq("id", variant.id);

    if (error) {
      toast({
        title: "خطأ",
        description: error.message,
        variant: "destructive",
      });
    } else {
      fetchVariants();
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-2">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="border-t border-border pt-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <Label className="text-sm font-medium flex items-center gap-1.5">
          <Package className="h-3.5 w-3.5 text-primary" />
          الخيارات الفرعية
        </Label>
        <Button variant="outline" size="sm" onClick={() => openDialog()} className="gap-1 h-7 text-xs">
          <Plus className="h-3 w-3" />
          إضافة
        </Button>
      </div>

      {variants.length === 0 ? (
        <div className="text-center py-4 border border-dashed border-border rounded-lg">
          <Package className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
          <p className="text-xs text-muted-foreground">لا توجد خيارات</p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {variants.map((variant) => (
            <div
              key={variant.id}
              className={`flex items-center gap-2 p-2 rounded-lg border text-sm ${
                variant.is_active ? "border-border bg-background" : "border-border/50 bg-muted/30 opacity-60"
              }`}
            >
              <GripVertical className="h-3 w-3 text-muted-foreground" />
              
              <div className="h-8 w-8 rounded bg-muted overflow-hidden flex-shrink-0 flex items-center justify-center">
                <Package className="h-4 w-4 text-muted-foreground" />
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-xs truncate">{variant.name}</h4>
                <div className="flex items-center gap-2">
                  <span className="text-primary text-xs font-semibold">${variant.price}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    (variantStocks[variant.id] || 0) > 0 
                      ? "bg-green-500/20 text-green-500" 
                      : "bg-amber-500/20 text-amber-600"
                  }`}>
                    {(variantStocks[variant.id] || 0) > 0 
                      ? `${variantStocks[variant.id]} حساب متوفر`
                      : "⚠️ لا حسابات - أضف حسابات"
                    }
                  </span>
                </div>
              </div>

              <Switch
                checked={variant.is_active}
                onCheckedChange={() => toggleActive(variant)}
                className="scale-75"
              />

              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openDialog(variant)}>
                <Edit className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive"
                onClick={() => deleteVariant(variant.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Variant Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="glass max-w-lg max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="p-4 pb-2 border-b border-border shrink-0">
            <DialogTitle className="text-base">{editingVariant ? "تعديل الخيار" : "إضافة خيار جديد"}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">اسم الخيار *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="مثال: حساب مع 50 لعبة"
                  className="glass h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">السعر *</Label>
                <Input
                  type="number"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="0"
                  className="glass h-8 text-sm"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">فترة الضمان (بالأيام)</Label>
              <Input
                type="number"
                value={form.warranty_days}
                onChange={(e) => setForm({ ...form, warranty_days: e.target.value })}
                placeholder="0 = بدون ضمان"
                className="glass h-8 text-sm"
                min="0"
              />
              <p className="text-[10px] text-muted-foreground">0 = بدون ضمان، 30 = شهر، 365 = سنة</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">الوصف</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="الألعاب أو المميزات..."
                className="glass text-sm min-h-[50px]"
              />
            </div>
            
            {/* Images Section - Only when editing */}
            {editingVariant && (
              <div className="border-t border-border pt-3 mt-3">
                <VariantImagesManager variantId={editingVariant.id} />
              </div>
            )}
            
            <div className="flex items-center justify-between">
              <Label className="text-xs">نشط</Label>
              <Switch
                checked={form.is_active}
                onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
                className="scale-90"
              />
            </div>

            {/* Accounts Section - Only when editing */}
            {editingVariant && (
              <div className="border-t border-border pt-3 mt-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Key className="h-3.5 w-3.5 text-primary" />
                    الحسابات
                    <span className="text-xs text-muted-foreground">(مطلوبة للظهور للمستخدمين)</span>
                  </Label>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                      {accountsTextarea.split('\n').filter(line => line.trim()).length}
                    </span>
                    <span className="bg-destructive/20 text-destructive px-1.5 py-0.5 rounded-full">
                      {variantAccounts.filter(a => a.is_sold).length} مباع
                    </span>
                  </div>
                </div>

                {loadingAccounts ? (
                  <div className="flex justify-center py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Textarea
                      value={accountsTextarea}
                      onChange={(e) => setAccountsTextarea(e.target.value)}
                      placeholder="user@email.com:password123"
                      className="glass font-mono text-xs min-h-[60px]"
                      dir="ltr"
                    />
                    <p className="text-[10px] text-amber-600 text-center font-medium">
                      ⚠️ بدون حسابات، لن يظهر هذا الخيار كمتاح للشراء للمستخدمين
                    </p>

                    {variantAccounts.filter(a => a.is_sold).length > 0 && (
                      <details className="text-xs">
                        <summary className="text-muted-foreground cursor-pointer">المباعة ({variantAccounts.filter(a => a.is_sold).length})</summary>
                        <div className="max-h-16 overflow-y-auto mt-1 p-1.5 rounded border border-border bg-destructive/5 font-mono text-[10px]">
                          {variantAccounts.filter(a => a.is_sold).map((account) => (
                            <div key={account.id} className="text-muted-foreground/60" dir="ltr">
                              {account.account_data}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="p-4 pt-2 border-t border-border shrink-0 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button variant="hero" size="sm" onClick={saveVariant} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              حفظ
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductVariantsManager;
