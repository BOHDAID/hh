import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatWarrantyDays } from "@/lib/warrantyUtils";
import { Flame } from "lucide-react";

const getProductTypeLabel = (type: string): string => {
  const types: Record<string, string> = {
    account: "حساب",
    service: "خدمة",
    bundle: "حزمة",
    code: "كود",
    subscription: "اشتراك",
  };
  return types[type] || type;
};

interface Product {
  name: string;
  price: number;
  image_url: string | null;
  product_type: string;
  warranty_days: number;
}

interface OrderSummaryCardProps {
  product: Product;
  unitPrice?: number;
  variantName?: string | null;
  quantity: number;
  onQuantityChange: (newQuantity: number) => void;
  stockCount: number;
  flashSalePrice?: number | null;
  originalPrice?: number | null;
}

const OrderSummaryCard = ({
  product,
  unitPrice: unitPriceProp,
  variantName,
  quantity,
  onQuantityChange,
  stockCount,
  flashSalePrice,
  originalPrice,
}: OrderSummaryCardProps) => {
  const unitPrice = unitPriceProp ?? product.price;
  const totalAmount = unitPrice * quantity;
  const isFlashSale = flashSalePrice !== null && flashSalePrice !== undefined;
  const discount = isFlashSale && originalPrice ? Math.round((1 - flashSalePrice / originalPrice) * 100) : 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-muted/50 py-3 sm:pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base sm:text-lg">ملخص الطلب</CardTitle>
          {isFlashSale && (
            <Badge className="bg-gradient-to-r from-orange-500 to-rose-500 text-white gap-1">
              <Flame className="h-3 w-3" />
              عرض خاطف -{discount}%
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
        <div className="flex gap-3 sm:gap-4">
          {product.image_url && (
            <img
              src={product.image_url}
              alt={product.name}
              className="w-14 h-14 sm:w-20 sm:h-20 object-cover rounded-lg sm:rounded-xl border"
            />
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm sm:text-lg text-foreground truncate">{product.name}</h3>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {getProductTypeLabel(product.product_type)}
              {variantName ? <> • {variantName}</> : null}
            </p>
          </div>
        </div>

        <div className="mt-4 sm:mt-6 space-y-2 sm:space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm sm:text-base">الكمية</span>
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg border flex items-center justify-center hover:bg-muted disabled:opacity-50 text-sm"
              >
                -
              </button>
              <span className="w-6 sm:w-8 text-center font-medium text-sm sm:text-base">{quantity}</span>
              <button
                onClick={() => onQuantityChange(quantity + 1)}
                disabled={product.product_type === "account" && quantity >= stockCount}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg border flex items-center justify-center hover:bg-muted disabled:opacity-50 text-sm"
              >
                +
              </button>
            </div>
          </div>

          {product.product_type === "account" && (
            <p className="text-xs text-muted-foreground text-left">
              متوفر: {stockCount} حساب
            </p>
          )}

          <div className="flex justify-between text-xs sm:text-sm">
            <span className="text-muted-foreground">سعر الوحدة</span>
            <div className="flex items-center gap-2">
              {isFlashSale && originalPrice && (
                <span className="text-muted-foreground line-through text-xs">
                  {originalPrice.toFixed(2)} $
                </span>
              )}
              <span className={isFlashSale ? "text-primary font-bold" : ""}>
                {unitPrice.toFixed(2)} $
              </span>
            </div>
          </div>

          <div className="border-t pt-2 sm:pt-3 flex justify-between">
            <span className="font-bold text-sm sm:text-lg">الإجمالي</span>
            <span className="font-bold text-lg sm:text-2xl text-primary">
              {totalAmount.toFixed(2)} $
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default OrderSummaryCard;
