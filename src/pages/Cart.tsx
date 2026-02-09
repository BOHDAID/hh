import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { db, getAuthClient, isExternalConfigured } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import UserLayout from "@/components/user/UserLayout";
import { 
  Loader2, 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  ArrowLeft,
  ArrowRight,
  Package
} from "lucide-react";
import { useTranslation } from "react-i18next";

interface CartItem {
  id: string;
  product_id: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    price: number;
    image_url: string | null;
  };
}

const Cart = () => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const navigate = useNavigate();
  const { toast } = useToast();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const authClient = isExternalConfigured ? getAuthClient() : db;
    const fetchCart = async () => {
      const { data: { session } } = await authClient.auth.getSession();
      
      if (!session) {
        setLoading(false);
        return;
      }
      
      setUser(session.user);

      const { data, error } = await db
        .from("cart_items")
        .select(`
          id,
          product_id,
          quantity,
          product:products(id, name, price, image_url)
        `)
        .eq("user_id", session.user.id);

      if (!error && data) {
        // Filter out items where product might be null and map to correct shape
        const validItems = data
          .filter(item => item.product !== null)
          .map(item => ({
            ...item,
            product: Array.isArray(item.product) ? item.product[0] : item.product
          }))
          .filter(item => item.product) as CartItem[];
        setCartItems(validItems);
      }
      
      setLoading(false);
    };

    fetchCart();
  }, []);

  const updateQuantity = async (itemId: string, newQuantity: number) => {
    if (newQuantity < 1) return;
    
    setUpdating(itemId);
    
    const { error } = await db
      .from("cart_items")
      .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
      .eq("id", itemId);

    if (error) {
      toast({
        title: t('common.error'),
        description: isRTL ? "فشل في تحديث الكمية" : "Failed to update quantity",
        variant: "destructive",
      });
    } else {
      setCartItems(prev => 
        prev.map(item => 
          item.id === itemId ? { ...item, quantity: newQuantity } : item
        )
      );
    }
    
    setUpdating(null);
  };

  const removeItem = async (itemId: string) => {
    setUpdating(itemId);
    
    const { error } = await db
      .from("cart_items")
      .delete()
      .eq("id", itemId);

    if (error) {
      toast({
        title: t('common.error'),
        description: isRTL ? "فشل في حذف المنتج" : "Failed to remove product",
        variant: "destructive",
      });
    } else {
      setCartItems(prev => prev.filter(item => item.id !== itemId));
      toast({
        title: isRTL ? "تم الحذف" : "Removed",
        description: isRTL ? "تم حذف المنتج من السلة" : "Product removed from cart",
      });
    }
    
    setUpdating(null);
  };

  const totalAmount = cartItems.reduce(
    (sum, item) => sum + (item.product.price * item.quantity), 
    0
  );

  const handleCheckout = () => {
    if (!user) {
      toast({
        title: isRTL ? "يرجى تسجيل الدخول" : "Please login",
        description: isRTL ? "يجب تسجيل الدخول لإتمام عملية الشراء" : "You must login to complete the purchase",
        variant: "destructive",
      });
      navigate("/login?redirect=/cart");
      return;
    }

    // Navigate to cart checkout
    navigate("/checkout/cart");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <UserLayout>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <ShoppingCart className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">{t('cart.title')}</h1>
        </div>

        {!user ? (
          <div className="glass rounded-2xl p-12 text-center">
            <ShoppingCart className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              {isRTL ? "يرجى تسجيل الدخول" : "Please login"}
            </h2>
            <p className="text-muted-foreground mb-6">
              {isRTL ? "سجل دخولك لعرض سلة التسوق الخاصة بك" : "Login to view your shopping cart"}
            </p>
            <Link to="/login?redirect=/cart">
              <Button variant="hero" size="lg">
                {t('common.login')}
              </Button>
            </Link>
          </div>
        ) : cartItems.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center">
            <ShoppingCart className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              {t('cart.empty')}
            </h2>
            <p className="text-muted-foreground mb-6">
              {t('cart.emptyDesc')}
            </p>
            <Link to="/#products">
              <Button variant="hero" size="lg">
                {isRTL ? "تصفح المنتجات" : "Browse Products"}
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Cart Items */}
            <div className="glass rounded-2xl divide-y divide-border">
              {cartItems.map((item) => (
                <div key={item.id} className="p-4 flex gap-4">
                  {/* Product Image */}
                  <div className="w-20 h-20 rounded-xl bg-muted overflow-hidden flex-shrink-0">
                    {item.product.image_url ? (
                      <img
                        src={item.product.image_url}
                        alt={item.product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  {/* Product Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">
                      {item.product.name}
                    </h3>
                    <p className="text-primary font-bold mt-1">
                      ${item.product.price}
                    </p>
                  </div>

                  {/* Quantity Controls */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      disabled={updating === item.id || item.quantity <= 1}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-8 text-center font-semibold">
                      {item.quantity}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      disabled={updating === item.id}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Subtotal & Delete */}
                  <div className="flex flex-col items-end gap-2">
                    <p className="font-bold text-foreground">
                      ${(item.product.price * item.quantity).toFixed(2)}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => removeItem(item.id)}
                      disabled={updating === item.id}
                    >
                      {updating === item.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Order Summary */}
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-muted-foreground">{t('cart.subtotal')}</span>
                <span className="font-semibold text-foreground">
                  ${totalAmount.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between text-lg border-t border-border pt-4">
                <span className="font-bold text-foreground">{t('cart.total')}</span>
                <span className="font-bold text-primary text-2xl">
                  ${totalAmount.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Checkout Button */}
            <Button
              variant="hero"
              size="lg"
              className="w-full h-14 text-lg"
              onClick={handleCheckout}
            >
              {t('cart.checkout')}
              {isRTL ? <ArrowLeft className="h-5 w-5 mr-2" /> : <ArrowRight className="h-5 w-5 ml-2" />}
            </Button>
          </div>
        )}
      </div>
    </UserLayout>
  );
};

export default Cart;