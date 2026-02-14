import { useState } from "react";
import { db } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Upload, Loader2, CheckCircle, Infinity, Package, HandHelping } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Product {
  id: string;
  name: string;
}

interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  price: number;
  is_unlimited?: boolean;
}

interface BulkAccountImportProps {
  products: Product[];
  onImportComplete: () => void;
}

const BulkAccountImport = ({ products, onImportComplete }: BulkAccountImportProps) => {
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedVariant, setSelectedVariant] = useState("");
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [bulkData, setBulkData] = useState("");
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  
  // For unlimited single account
  const [unlimitedProduct, setUnlimitedProduct] = useState("");
  const [unlimitedVariant, setUnlimitedVariant] = useState("");
  const [unlimitedVariants, setUnlimitedVariants] = useState<ProductVariant[]>([]);
  const [unlimitedAccountData, setUnlimitedAccountData] = useState("");
  const [savingUnlimited, setSavingUnlimited] = useState(false);

  // For on-demand
  const [onDemandProduct, setOnDemandProduct] = useState("");
  const [onDemandVariant, setOnDemandVariant] = useState("");
  const [onDemandVariants, setOnDemandVariants] = useState<ProductVariant[]>([]);
  const [savingOnDemand, setSavingOnDemand] = useState(false);

  const fetchVariants = async (productId: string) => {
    setLoadingVariants(true);
    setSelectedVariant("");
    
    try {
      const { data, error } = await db
        .from("product_variants")
        .select("id, product_id, name, name_en, description, description_en, price, stock, image_url, is_active, is_unlimited, warranty_days, display_order, created_at, updated_at")
        .eq("product_id", productId)
        .order("display_order", { ascending: true });
      
      if (error) {
        toast({
          title: "خطأ في جلب الخيارات",
          description: error.message,
          variant: "destructive",
        });
        setVariants([]);
      } else {
        setVariants(data || []);
      }
    } catch (err: any) {
      toast({
        title: "خطأ",
        description: err.message,
        variant: "destructive",
      });
      setVariants([]);
    }
    
    setLoadingVariants(false);
  };

  const fetchUnlimitedVariants = async (productId: string) => {
    setUnlimitedVariant("");
    
    try {
      const { data } = await db
        .from("product_variants")
        .select("id, product_id, name, name_en, description, description_en, price, stock, image_url, is_active, is_unlimited, warranty_days, display_order, created_at, updated_at")
        .eq("product_id", productId)
        .order("display_order", { ascending: true });
      
      setUnlimitedVariants(data || []);
    } catch {
      setUnlimitedVariants([]);
    }
  };

  const fetchOnDemandVariants = async (productId: string) => {
    setOnDemandVariant("");
    try {
      const { data } = await db
        .from("product_variants")
        .select("id, product_id, name, name_en, description, description_en, price, stock, image_url, is_active, is_unlimited, warranty_days, display_order, created_at, updated_at")
        .eq("product_id", productId)
        .order("display_order", { ascending: true });
      setOnDemandVariants(data || []);
    } catch {
      setOnDemandVariants([]);
    }
  };

  const handleSaveOnDemand = async () => {
    if (!onDemandVariant) {
      toast({ title: "خطأ", description: "اختر الخيار الفرعي", variant: "destructive" });
      return;
    }
    setSavingOnDemand(true);
    try {
      const { error } = await db
        .from("product_variants")
        .update({ fulfillment_type: "on_demand" } as any)
        .eq("id", onDemandVariant);
      if (error) throw error;
      toast({ title: "تم الحفظ", description: "تم تعيين الخيار كـ 'عند الطلب' - الطلبات ستنتظر تفعيلك اليدوي" });
      onImportComplete();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    }
    setSavingOnDemand(false);
  };

  const handleBulkImport = async () => {
    if (!selectedProduct || !bulkData.trim()) {
      toast({
        title: "خطأ",
        description: "اختر المنتج وأدخل بيانات الحسابات",
        variant: "destructive",
      });
      return;
    }

    setImporting(true);
    setImportedCount(0);

    const lines = bulkData
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      toast({
        title: "خطأ",
        description: "لا توجد بيانات صالحة للاستيراد",
        variant: "destructive",
      });
      setImporting(false);
      return;
    }

    try {
      const accountsToInsert = lines.map((line) => ({
        product_id: selectedProduct,
        variant_id: selectedVariant || null,
        account_data: line,
      }));

      const { data, error } = await db
        .from("product_accounts")
        .insert(accountsToInsert)
        .select();

      if (error) {
        toast({
          title: "خطأ",
          description: error.message,
          variant: "destructive",
        });
      } else {
        setImportedCount(data?.length || 0);
        toast({
          title: "تم الاستيراد بنجاح",
          description: `تم إضافة ${data?.length || 0} حساب`,
        });
        setBulkData("");
        onImportComplete();
      }
    } catch (err: any) {
      toast({
        title: "خطأ",
        description: err.message,
        variant: "destructive",
      });
    }

    setImporting(false);
  };

  const handleSaveUnlimitedAccount = async () => {
    if (!unlimitedVariant || !unlimitedAccountData.trim()) {
      toast({
        title: "خطأ",
        description: "اختر الخيار الفرعي وأدخل بيانات الحساب",
        variant: "destructive",
      });
      return;
    }

    setSavingUnlimited(true);

    try {
      // First, delete any existing accounts for this variant (clean slate for unlimited)
      await db
        .from("product_accounts")
        .delete()
        .eq("variant_id", unlimitedVariant)
        .eq("is_sold", false);

      // Add the single account
      const { error: insertError } = await db
        .from("product_accounts")
        .insert({
          product_id: unlimitedProduct,
          variant_id: unlimitedVariant,
          account_data: unlimitedAccountData.trim(),
        });

      if (insertError) throw insertError;

      // Mark the variant as unlimited
      const { error: updateError } = await db
        .from("product_variants")
        .update({ is_unlimited: true })
        .eq("id", unlimitedVariant);

      if (updateError) throw updateError;

      toast({
        title: "تم الحفظ",
        description: "تم إعداد الحساب الدائم بنجاح - سيُباع لكل العملاء بدون نفاذ",
      });
      
      setUnlimitedAccountData("");
      onImportComplete();
    } catch (err: any) {
      toast({
        title: "خطأ",
        description: err.message,
        variant: "destructive",
      });
    }

    setSavingUnlimited(false);
  };

  const linesCount = bulkData
    .split("\n")
    .filter((line) => line.trim().length > 0).length;

  return (
    <div className="glass rounded-xl p-6 space-y-4">
      <Tabs defaultValue="bulk" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="bulk" className="gap-2">
            <Package className="h-4 w-4" />
            بالجملة
          </TabsTrigger>
          <TabsTrigger value="unlimited" className="gap-2">
            <Infinity className="h-4 w-4" />
            دائم
          </TabsTrigger>
          <TabsTrigger value="on_demand" className="gap-2">
            <HandHelping className="h-4 w-4" />
            عند الطلب
          </TabsTrigger>
        </TabsList>

        {/* Bulk Import Tab */}
        <TabsContent value="bulk" className="space-y-4">
          <div className="space-y-2">
            <Label>اختر المنتج</Label>
            <Select 
              value={selectedProduct} 
              onValueChange={(value) => {
                setSelectedProduct(value);
                fetchVariants(value);
              }}
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

          {selectedProduct && variants.length > 0 && (
            <div className="space-y-2">
              <Label>اختر الخيار الفرعي (اختياري)</Label>
              <Select value={selectedVariant} onValueChange={setSelectedVariant}>
                <SelectTrigger className="glass">
                  <SelectValue placeholder="بدون خيار فرعي" />
                </SelectTrigger>
                <SelectContent>
                  {variants.map((variant) => (
                    <SelectItem key={variant.id} value={variant.id}>
                      {variant.name} - ${variant.price}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {loadingVariants && (
            <div className="text-sm text-muted-foreground">جاري تحميل الخيارات...</div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>بيانات الحسابات (كل سطر = حساب واحد)</Label>
              <span className="text-sm text-muted-foreground">
                {linesCount} حساب
              </span>
            </div>
            <Textarea
              value={bulkData}
              onChange={(e) => setBulkData(e.target.value)}
              placeholder={`مثال:
user1@email.com:password123
user2@email.com:password456
user3@email.com:password789`}
              className="glass min-h-[150px] font-mono text-sm"
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground">
              كل حساب يُباع مرة واحدة فقط ثم ينفذ من المخزون
            </p>
          </div>

          <div className="flex items-center justify-between">
            <Button
              variant="hero"
              onClick={handleBulkImport}
              disabled={importing || !selectedProduct || linesCount === 0}
              className="gap-2"
            >
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              استيراد {linesCount} حساب
            </Button>

            {importedCount > 0 && (
              <div className="flex items-center gap-2 text-green-500">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">تم إضافة {importedCount} حساب</span>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Unlimited Account Tab */}
        <TabsContent value="unlimited" className="space-y-4">
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 mb-4">
            <div className="flex items-center gap-2 text-amber-500 font-medium mb-1">
              <Infinity className="h-5 w-5" />
              حساب دائم (غير محدود)
            </div>
            <p className="text-sm text-muted-foreground">
              حساب واحد يُباع لكل العملاء بشكل متكرر بدون أن ينفذ من المخزون حتى تزيله يدوياً
            </p>
          </div>

          <div className="space-y-2">
            <Label>اختر المنتج</Label>
            <Select 
              value={unlimitedProduct} 
              onValueChange={(value) => {
                setUnlimitedProduct(value);
                fetchUnlimitedVariants(value);
              }}
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

          {unlimitedProduct && unlimitedVariants.length > 0 && (
            <div className="space-y-2">
              <Label>اختر الخيار الفرعي *</Label>
              <Select value={unlimitedVariant} onValueChange={setUnlimitedVariant}>
                <SelectTrigger className="glass">
                  <SelectValue placeholder="اختر خيار فرعي..." />
                </SelectTrigger>
                <SelectContent>
                  {unlimitedVariants.map((variant) => (
                    <SelectItem key={variant.id} value={variant.id}>
                      {variant.name} - ${variant.price}
                      {variant.is_unlimited && " ♾️"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {unlimitedProduct && unlimitedVariants.length === 0 && (
            <div className="text-sm text-amber-500 p-3 rounded-lg bg-amber-500/10">
              ⚠️ هذا المنتج ليس له خيارات فرعية. أضف خيار فرعي أولاً.
            </div>
          )}

          <div className="space-y-2">
            <Label>بيانات الحساب الدائم</Label>
            <Input
              value={unlimitedAccountData}
              onChange={(e) => setUnlimitedAccountData(e.target.value)}
              placeholder="user@email.com:password123"
              className="glass font-mono"
              dir="ltr"
            />
          </div>

          <Button
            variant="hero"
            onClick={handleSaveUnlimitedAccount}
            disabled={savingUnlimited || !unlimitedVariant || !unlimitedAccountData.trim()}
            className="w-full gap-2"
          >
            {savingUnlimited ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Infinity className="h-4 w-4" />
            )}
            حفظ كحساب دائم
          </Button>
        </TabsContent>

        {/* On-Demand Tab */}
        <TabsContent value="on_demand" className="space-y-4">
          <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 mb-4">
            <div className="flex items-center gap-2 text-blue-500 font-medium mb-1">
              <HandHelping className="h-5 w-5" />
              حسابات عند الطلب (تفعيل يدوي)
            </div>
            <p className="text-sm text-muted-foreground">
              الطلب لن يكتمل تلقائياً - سيبقى "قيد التفعيل" حتى تفعّله يدوياً من صفحة الطلبات. الرسالة التي تظهر للعميل يمكنك تغييرها من إعدادات الموقع.
            </p>
          </div>

          <div className="space-y-2">
            <Label>اختر المنتج</Label>
            <Select 
              value={onDemandProduct} 
              onValueChange={(value) => {
                setOnDemandProduct(value);
                fetchOnDemandVariants(value);
              }}
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

          {onDemandProduct && onDemandVariants.length > 0 && (
            <div className="space-y-2">
              <Label>اختر الخيار الفرعي *</Label>
              <Select value={onDemandVariant} onValueChange={setOnDemandVariant}>
                <SelectTrigger className="glass">
                  <SelectValue placeholder="اختر خيار فرعي..." />
                </SelectTrigger>
                <SelectContent>
                  {onDemandVariants.map((variant) => (
                    <SelectItem key={variant.id} value={variant.id}>
                      {variant.name} - ${variant.price}
                      {(variant as any).fulfillment_type === "on_demand" && " 🤝"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {onDemandProduct && onDemandVariants.length === 0 && (
            <div className="text-sm text-blue-500 p-3 rounded-lg bg-blue-500/10">
              ⚠️ هذا المنتج ليس له خيارات فرعية. أضف خيار فرعي أولاً.
            </div>
          )}

          <Button
            variant="hero"
            onClick={handleSaveOnDemand}
            disabled={savingOnDemand || !onDemandVariant}
            className="w-full gap-2"
          >
            {savingOnDemand ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <HandHelping className="h-4 w-4" />
            )}
            تعيين كحساب عند الطلب
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BulkAccountImport;
