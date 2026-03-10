import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db, getAuthClient, isExternalConfigured } from "@/lib/supabaseClient";
import { formatWarrantyDays, getWarrantyBadgeClass } from "@/lib/warrantyUtils";
import { translateProduct, translateCategory } from "@/lib/translateApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  Package,
  Plus,
  Edit,
  Trash2,
  MessageSquare,
  Settings,
  LogOut,
  ShoppingBag,
  Loader2,
  Save,
  Key,
  FolderOpen,
  LayoutDashboard,
  ShoppingCart,
  Users,
  Star,
  MessageCircle,
  Link,
  BarChart3,
  Menu,
  X,
  UsersRound,
  Tag,
  GripVertical,
  Ticket,
  FileText,
  Languages,
  Bot,
  Activity,
  Radio,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Admin Components
import SettingsTab from "@/components/admin/SettingsTab";
import DashboardTab from "@/components/admin/DashboardTab";
import OrdersTab from "@/components/admin/OrdersTab";
import UsersTab from "@/components/admin/UsersTab";
import ReviewsTab from "@/components/admin/ReviewsTab";
import RequestsTab from "@/components/admin/RequestsTab";
import AffiliatesTab from "@/components/admin/AffiliatesTab";
import AnalyticsTab from "@/components/admin/AnalyticsTab";
import BulkAccountImport from "@/components/admin/BulkAccountImport";
import ImageUpload from "@/components/admin/ImageUpload";
import TeamTab from "@/components/admin/TeamTab";
import TicketsTab from "@/components/admin/TicketsTab";
import ProductVariantsManager from "@/components/admin/ProductVariantsManager";
import { useUserRole, TabType, rolePermissions } from "@/hooks/useUserRole";
import CouponsTab from "@/components/admin/CouponsTab";
import FlashSalesTab from "@/components/admin/FlashSalesTab";
import PoliciesTab from "@/components/admin/PoliciesTab";
import LogsTab from "@/components/admin/LogsTab";
import ActivityLogsTab from "@/components/admin/ActivityLogsTab";
import ActivationCodesTab from "@/components/admin/ActivationCodesTab";
import AutoDashboardTab from "@/components/admin/AutoDashboardTab";

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category_id: string | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  product_type: string | null;
  warranty_days: number | null;
  platform: string | null;
  categories?: { name: string } | null;
}

interface Category {
  id: string;
  name: string;
  icon: string | null;
}

interface ProductAccount {
  id: string;
  product_id: string;
  variant_id: string | null;
  account_data: string;
  is_sold: boolean;
  created_at: string;
}

interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  price: number;
  is_active: boolean;
}

interface ProductType {
  id: string;
  name: string;
  display_order: number;
}

interface ContactMessage {
  id: string;
  name: string;
  email: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

const Admin = () => {
  const { role, loading: roleLoading, hasPermission, canAccessAdmin, getAllowedTabs } = useUserRole();
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Products state
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [productForm, setProductForm] = useState({
    name: "",
    description: "",
    price: "",
    category_id: "",
    image_url: "",
    is_active: true,
    product_type: "",
    warranty_days: "7",
    platform: "",
    requires_activation: false,
    activation_type: "otp",
  });

  // Accounts state
  const [accounts, setAccounts] = useState<ProductAccount[]>([]);
  const [productAccounts, setProductAccounts] = useState<ProductAccount[]>([]); // For product dialog
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [selectedProductForAccounts, setSelectedProductForAccounts] = useState<string>("");
  const [selectedVariantForAccounts, setSelectedVariantForAccounts] = useState<string>("");
  const [productVariants, setProductVariants] = useState<ProductVariant[]>([]);
  const [newAccountData, setNewAccountData] = useState("");
  const [accountsTextarea, setAccountsTextarea] = useState(""); // For textarea editing
  const [savingAccounts, setSavingAccounts] = useState(false);
  
  // Categories state
  const [newCategoryName, setNewCategoryName] = useState("");
  
  // Product Types Dialog state
  const [productTypesDialogOpen, setProductTypesDialogOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [savingType, setSavingType] = useState(false);
  
  // Messages state
  const [messages, setMessages] = useState<ContactMessage[]>([]);

  const navigate = useNavigate();

  useEffect(() => {
    if (!roleLoading && !canAccessAdmin()) {
      toast({
        title: "غير مصرح",
        description: "ليس لديك صلاحية الوصول لهذه الصفحة",
        variant: "destructive",
      });
      navigate("/");
      return;
    }
    
    if (!roleLoading && canAccessAdmin()) {
      // Set default tab based on permissions
      const allowedTabs = getAllowedTabs();
      if (allowedTabs.length > 0 && !allowedTabs.includes(activeTab)) {
        setActiveTab(allowedTabs[0]);
      }
      fetchData();
    }
  }, [roleLoading, role]);

  const fetchData = async () => {
    await Promise.all([
      fetchProducts(),
      fetchCategories(),
      fetchProductTypes(),
      fetchMessages(),
    ]);
  };

  const fetchProducts = async () => {
    const { data } = await db
      .from('products')
      .select('*, categories(name)')
      .order('created_at', { ascending: false });
    if (data) setProducts(data);
  };

  const fetchCategories = async () => {
    const { data } = await db.from('categories').select('*');
    if (data) setCategories(data);
  };

  const fetchProductTypes = async () => {
    const { data } = await db
      .from('product_types')
      .select('*')
      .order('display_order', { ascending: true });
    if (data) setProductTypes(data);
  };

  const addProductType = async () => {
    if (!newTypeName.trim()) {
      toast({
        title: "خطأ",
        description: "اكتب اسم النوع أولاً",
        variant: "destructive",
      });
      return;
    }

    setSavingType(true);
    const maxOrder = Math.max(...productTypes.map(t => t.display_order), 0);
    
    const { data, error } = await db
      .from("product_types")
      .insert({
        name: newTypeName.trim(),
        display_order: maxOrder + 1,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        toast({
          title: "خطأ",
          description: "هذا النوع موجود مسبقاً",
          variant: "destructive",
        });
      } else {
        toast({
          title: "خطأ",
          description: "فشل في إضافة النوع",
          variant: "destructive",
        });
      }
    } else if (data) {
      setProductTypes([...productTypes, data]);
      setNewTypeName("");
      toast({
        title: "✅ تمت الإضافة",
        description: `تم إضافة "${data.name}" بنجاح`,
      });
    }
    setSavingType(false);
  };

  const deleteProductType = async (id: string, name: string) => {
    if (!confirm(`هل تريد حذف "${name}"؟`)) return;

    const { error } = await db
      .from("product_types")
      .delete()
      .eq("id", id);

    if (error) {
      toast({
        title: "خطأ",
        description: "فشل في حذف النوع",
        variant: "destructive",
      });
    } else {
      setProductTypes(productTypes.filter(t => t.id !== id));
      toast({
        title: "✅ تم الحذف",
        description: `تم حذف "${name}"`,
      });
    }
  };

  const updateProductTypeName = async (id: string, newName: string) => {
    const { error } = await db
      .from("product_types")
      .update({ name: newName })
      .eq("id", id);

    if (error) {
      toast({
        title: "خطأ",
        description: "فشل في تحديث الاسم",
        variant: "destructive",
      });
      fetchProductTypes(); // Revert
    }
  };

  const fetchAccounts = async (productId: string, variantId?: string) => {
    let query = db
      .from('product_accounts')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });
    
    if (variantId) {
      query = query.eq('variant_id', variantId);
    } else {
      query = query.is('variant_id', null);
    }
    
    const { data } = await query;
    if (data) setAccounts(data);
  };

  const fetchVariantsForProduct = async (productId: string) => {
    const { data, error } = await db
      .from('product_variants')
      .select('id, product_id, name, name_en, description, description_en, price, stock, image_url, is_active, is_unlimited, warranty_days, display_order, created_at, updated_at')
      .eq('product_id', productId)
      .order('display_order', { ascending: true });
    
    console.log('Fetched variants for product:', productId, data, error);
    
    if (data && data.length > 0) {
      setProductVariants(data);
    } else {
      setProductVariants([]);
    }
  };

  const fetchProductAccounts = async (productId: string) => {
    setLoadingAccounts(true);
    const { data } = await db
      .from('product_accounts')
      .select('*')
      .eq('product_id', productId)
      .order('is_sold', { ascending: true })
      .order('created_at', { ascending: false });
    if (data) {
      setProductAccounts(data);
      // Update textarea with unsold accounts only
      const unsoldAccounts = data.filter(a => !a.is_sold).map(a => a.account_data);
      setAccountsTextarea(unsoldAccounts.join('\n'));
    }
    setLoadingAccounts(false);
  };

  const fetchMessages = async () => {
    const { data } = await db
      .from('contact_messages')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setMessages(data);
  };

  const handleLogout = async () => {
    const authClient = isExternalConfigured ? getAuthClient() : db;
    await authClient.auth.signOut();
    navigate("/");
  };

  const openProductDialog = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setProductForm({
        name: product.name,
        description: product.description || "",
        price: String(product.price),
        category_id: product.category_id || "",
        image_url: product.image_url || "",
        is_active: product.is_active,
        product_type: product.product_type || "account",
        warranty_days: String(product.warranty_days || 7),
        platform: product.platform || "",
        requires_activation: (product as any).requires_activation || false,
        activation_type: (product as any).activation_type || "otp",
      });
      // Fetch accounts for this product
      fetchProductAccounts(product.id);
    } else {
      setEditingProduct(null);
      setProductAccounts([]);
      setProductForm({
        name: "",
        description: "",
        price: "",
        category_id: "",
        image_url: "",
        is_active: true,
        product_type: "account",
        warranty_days: "7",
        platform: "",
        requires_activation: false,
        activation_type: "otp",
      });
    }
    setProductDialogOpen(true);
  };

  const saveProduct = async () => {
    if (!productForm.name) {
      toast({ title: "خطأ", description: "اسم المنتج مطلوب", variant: "destructive" });
      return;
    }

    // Auto-translate to English
    toast({ title: "جاري الترجمة...", description: "يتم ترجمة المحتوى للإنجليزية تلقائياً" });
    const translations = await translateProduct({
      name: productForm.name,
      description: productForm.description,
    });

    const productData = {
      name: productForm.name,
      name_en: translations.name_en || null,
      description: productForm.description || null,
      description_en: translations.description_en || null,
      price: productForm.price ? parseFloat(productForm.price) : 0,
      category_id: productForm.category_id || null,
      image_url: productForm.image_url || null,
      is_active: productForm.is_active,
      product_type: productForm.product_type,
      warranty_days: parseInt(productForm.warranty_days) || 7,
      platform: productForm.platform || null,
      requires_activation: productForm.requires_activation,
      activation_type: productForm.requires_activation ? productForm.activation_type : null,
    };

    if (editingProduct) {
      const { error } = await db
        .from('products')
        .update(productData)
        .eq('id', editingProduct.id);
      
      if (error) {
        toast({ title: "خطأ", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "تم التحديث", description: "تم تحديث المنتج وترجمته بنجاح ✨" });
      }
    } else {
      const { error } = await db.from('products').insert(productData);
      
      if (error) {
        toast({ title: "خطأ", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "تم الإضافة", description: "تم إضافة المنتج وترجمته بنجاح ✨" });
      }
    }

    setProductDialogOpen(false);
    fetchProducts();
  };

  const deleteProduct = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا المنتج؟")) return;
    
    const { error } = await db.from('products').delete().eq('id', id);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "تم الحذف", description: "تم حذف المنتج بنجاح" });
      fetchProducts();
    }
  };

  const addAccount = async () => {
    if (!selectedProductForAccounts || !newAccountData) {
      toast({ title: "خطأ", description: "اختر المنتج وأدخل بيانات الحساب", variant: "destructive" });
      return;
    }

    const { error } = await db.from('product_accounts').insert({
      product_id: selectedProductForAccounts,
      variant_id: selectedVariantForAccounts || null,
      account_data: newAccountData,
    });

    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "تم الإضافة", description: "تم إضافة الحساب بنجاح" });
      setNewAccountData("");
      fetchAccounts(selectedProductForAccounts, selectedVariantForAccounts || undefined);
    }
  };

  const deleteAccount = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الحساب؟")) return;
    
    const { error } = await db.from('product_accounts').delete().eq('id', id);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "تم الحذف", description: "تم حذف الحساب بنجاح" });
      if (selectedProductForAccounts) fetchAccounts(selectedProductForAccounts, selectedVariantForAccounts || undefined);
    }
  };

  const addCategory = async () => {
    if (!newCategoryName) return;
    
    toast({ title: "جاري الإضافة...", description: "يتم إضافة التصنيف" });
    
    // Insert category first, translate later
    const { error } = await db.from('categories').insert({ 
      name: newCategoryName,
      name_en: null,
    });
    
    if (error) {
      console.error('Category insert error:', error);
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
      return;
    }
    
    toast({ title: "تم الإضافة", description: "تم إضافة التصنيف بنجاح ✅" });
    setNewCategoryName("");
    fetchCategories();
    
    // Try to translate in background (non-blocking)
    try {
      const translations = await translateCategory(newCategoryName);
      if (translations.name_en) {
        await db.from('categories').update({ name_en: translations.name_en }).eq('name', newCategoryName);
        fetchCategories();
      }
    } catch (e) {
      console.warn('Translation failed:', e);
    }
  };

  const deleteCategory = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا التصنيف؟ سيتم إزالة التصنيف من المنتجات المرتبطة به.")) return;
    
    // أولاً: فصل المنتجات عن التصنيف
    await db.from('products').update({ category_id: null }).eq('category_id', id);
    
    const { error } = await db.from('categories').delete().eq('id', id);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "تم الحذف", description: "تم حذف التصنيف بنجاح" });
      fetchCategories();
    }
  };

  const markAsRead = async (id: string) => {
    await db.from('contact_messages').update({ is_read: true }).eq('id', id);
    fetchMessages();
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!canAccessAdmin()) {
    return null;
  }

  const allSidebarItems: { id: TabType; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "dashboard", label: "لوحة التحكم", icon: <LayoutDashboard className="h-4 w-4 md:h-5 md:w-5" /> },
    { id: "analytics", label: "الإحصائيات", icon: <BarChart3 className="h-4 w-4 md:h-5 md:w-5" /> },
    { id: "settings", label: "الإعدادات", icon: <Settings className="h-4 w-4 md:h-5 md:w-5" /> },
    { id: "products", label: "المنتجات", icon: <Package className="h-4 w-4 md:h-5 md:w-5" /> },
    { id: "accounts", label: "الحسابات", icon: <Key className="h-4 w-4 md:h-5 md:w-5" /> },
    { id: "categories", label: "التصنيفات", icon: <FolderOpen className="h-4 w-4 md:h-5 md:w-5" /> },
    { id: "orders", label: "الطلبات", icon: <ShoppingCart className="h-4 w-4 md:h-5 md:w-5" /> },
    { id: "users", label: "المستخدمين", icon: <Users className="h-4 w-4 md:h-5 md:w-5" /> },
    { id: "reviews", label: "التقييمات", icon: <Star className="h-4 w-4 md:h-5 md:w-5" /> },
    { id: "requests", label: "طلبات المنتجات", icon: <MessageCircle className="h-4 w-4 md:h-5 md:w-5" /> },
    { id: "affiliates", label: "المسوقين", icon: <Link className="h-4 w-4 md:h-5 md:w-5" /> },
    { id: "tickets", label: "تذاكر الدعم", icon: <Ticket className="h-4 w-4 md:h-5 md:w-5" /> },
    { id: "messages", label: "الرسائل", icon: <MessageSquare className="h-4 w-4 md:h-5 md:w-5" />, badge: messages.filter(m => !m.is_read).length },
    { id: "team", label: "فريق العمل", icon: <UsersRound className="h-4 w-4 md:h-5 md:w-5" /> },
    { id: "coupons", label: "الكوبونات", icon: <Ticket className="h-4 w-4 md:h-5 md:w-5" /> },
    { id: "flash_sales", label: "العروض المحدودة", icon: <Ticket className="h-4 w-4 md:h-5 md:w-5" /> },
    { id: "policies", label: "السياسات", icon: <FileText className="h-4 w-4 md:h-5 md:w-5" /> },
    { id: "logs", label: "السجلات", icon: <BarChart3 className="h-4 w-4 md:h-5 md:w-5" /> },
    { id: "activity_logs", label: "سجل الأنشطة", icon: <Activity className="h-4 w-4 md:h-5 md:w-5" /> },
    { id: "activation_codes", label: "أكواد التفعيل", icon: <Bot className="h-4 w-4 md:h-5 md:w-5" /> },
    { id: "auto_dashboard", label: "النشر التلقائي", icon: <Radio className="h-4 w-4 md:h-5 md:w-5" /> },
  ];

  // Filter sidebar items based on user permissions
  const sidebarItems = allSidebarItems.filter(item => hasPermission(item.id));

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setSidebarOpen(false); // Close sidebar on mobile after selection
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 right-0 left-0 h-16 glass border-b border-border z-50 flex items-center justify-between px-4">
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
          <Menu className="h-6 w-6" />
        </Button>
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-5 w-5 text-primary" />
          <span className="font-bold">لوحة التحكم</span>
        </div>
        <div className="w-10" /> {/* Spacer */}
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-50"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed right-0 top-0 h-full w-56 lg:w-64 border-l border-border glass z-50
        transition-transform duration-300 ease-in-out
        lg:translate-x-0 flex flex-col
        ${sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
      `}>
        {/* Mobile Close Button */}
        <Button 
          variant="ghost" 
          size="icon" 
          className="lg:hidden absolute left-2 top-2 z-10"
          onClick={() => setSidebarOpen(false)}
        >
          <X className="h-5 w-5" />
        </Button>

        {/* Header */}
        <div className="p-3 lg:p-4 pb-0 shrink-0">
          <div className="flex items-center gap-2 lg:gap-3 mb-4 lg:mb-6 px-2 mt-8 lg:mt-0">
            <div className="flex h-8 w-8 lg:h-10 lg:w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-glow-primary">
              <ShoppingBag className="h-4 w-4 lg:h-5 lg:w-5 text-primary-foreground" />
            </div>
            <span className="text-lg lg:text-xl font-bold text-foreground">لوحة التحكم</span>
          </div>
        </div>

        {/* Scrollable Navigation */}
        <div className="flex-1 overflow-y-auto px-3 lg:px-4 pb-20 relative">
          <nav className="space-y-0.5 lg:space-y-1">
            {sidebarItems.map((item) => (
              <Button
                key={item.id}
                variant={activeTab === item.id ? "hero" : "ghost"}
                className="w-full justify-start gap-2 lg:gap-3 h-9 text-sm"
                onClick={() => handleTabChange(item.id)}
              >
                {item.icon}
                <span className="flex-1 text-right">{item.label}</span>
                {item.badge && item.badge > 0 && (
                  <span className="bg-destructive text-destructive-foreground text-xs px-2 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                )}
              </Button>
            ))}
          </nav>
          {/* Scroll indicator gradient */}
          <div className="pointer-events-none sticky bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background/80 to-transparent" />
        </div>

        {/* Fixed Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-3 lg:p-4 pt-2 border-t border-border bg-background/95 backdrop-blur-sm">
          <Button variant="ghost" className="w-full justify-start gap-2 lg:gap-3 text-muted-foreground text-sm h-9" onClick={handleLogout}>
            <LogOut className="h-4 w-4 lg:h-5 lg:w-5" />
            تسجيل الخروج
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:mr-64 p-4 lg:p-8 pt-20 lg:pt-8">
        {/* Dashboard Tab */}
        {activeTab === "dashboard" && hasPermission("dashboard") && <DashboardTab />}

        {/* Analytics Tab */}
        {activeTab === "analytics" && hasPermission("analytics") && <AnalyticsTab />}

        {/* Settings Tab */}
        {activeTab === "settings" && hasPermission("settings") && <SettingsTab />}

        {/* Team Tab */}
        {activeTab === "team" && hasPermission("team") && <TeamTab />}

        {/* Tickets Tab */}
        {activeTab === "tickets" && hasPermission("tickets") && <TicketsTab />}

        {/* Coupons Tab */}
        {activeTab === "coupons" && hasPermission("coupons") && <CouponsTab />}

        {/* Flash Sales Tab */}
        {activeTab === "flash_sales" && hasPermission("flash_sales") && <FlashSalesTab />}

        {/* Policies Tab */}
        {activeTab === "policies" && hasPermission("policies") && <PoliciesTab />}

        {/* Activation Codes Tab */}
        {activeTab === "activation_codes" && hasPermission("activation_codes") && <ActivationCodesTab />}

        {/* Auto Dashboard Tab */}
        {activeTab === "auto_dashboard" && hasPermission("auto_dashboard") && <AutoDashboardTab />}

        {/* Activity Logs Tab */}
        {activeTab === "activity_logs" && hasPermission("activity_logs") && <ActivityLogsTab />}

        {/* Products Tab */}
        {activeTab === "products" && hasPermission("products") && (
          <div>
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-2xl font-bold text-foreground">إدارة المنتجات</h1>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setProductTypesDialogOpen(true)} className="gap-2">
                  <Tag className="h-4 w-4" />
                  أنواع المنتجات
                </Button>
                <Button variant="hero" onClick={() => openProductDialog()} className="gap-2">
                  <Plus className="h-5 w-5" />
                  إضافة منتج
                </Button>
              </div>
            </div>

            <div className="grid gap-4">
              {products.map((product) => (
                <div key={product.id} className="glass rounded-xl p-4 flex items-center gap-4">
                  <div className="h-16 w-16 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <Package className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{product.name}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-1">{product.description}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-primary font-bold">${product.price}</span>
                      {product.categories && (
                        <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                          {product.categories.name}
                        </span>
                      )}
                      {product.product_type && (
                        <span className="text-xs bg-secondary/20 text-secondary px-2 py-0.5 rounded-full">
                          {product.product_type === 'account' ? 'حساب' : 
                           product.product_type === 'service' ? 'خدمة' : 
                           product.product_type === 'bundle' ? 'حزمة' :
                           product.product_type === 'code' ? 'كود' :
                           product.product_type === 'subscription' ? 'اشتراك' :
                           product.product_type}
                        </span>
                      )}
                      {product.warranty_days !== null && product.warranty_days > 0 && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getWarrantyBadgeClass(product.warranty_days)}`}>
                          ضمان: {formatWarrantyDays(product.warranty_days)}
                        </span>
                      )}
                      {!product.is_active && (
                        <span className="text-xs bg-destructive/20 text-destructive px-2 py-0.5 rounded-full">
                          غير نشط
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => openProductDialog(product)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteProduct(product.id)} className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              {products.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  لا توجد منتجات. ابدأ بإضافة منتج جديد.
                </div>
              )}
            </div>

            {/* Product Dialog */}
            <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
              <DialogContent className="glass max-w-2xl max-h-[85vh] flex flex-col p-0">
                <DialogHeader className="p-4 pb-2 border-b border-border shrink-0">
                  <DialogTitle className="text-base">{editingProduct ? "تعديل المنتج" : "إضافة منتج جديد"}</DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">اسم المنتج</Label>
                    <Input
                      value={productForm.name}
                      onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                      placeholder="مثال: اشتراك Netflix"
                      className="glass h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">الوصف</Label>
                    <Textarea
                      value={productForm.description}
                      onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                      placeholder="وصف المنتج..."
                      className="glass text-sm min-h-[60px]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">التصنيف</Label>
                      <Select
                        value={productForm.category_id}
                        onValueChange={(value) => setProductForm({ ...productForm, category_id: value })}
                      >
                        <SelectTrigger className="glass h-8 text-sm">
                          <SelectValue placeholder="اختر تصنيف" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">نوع المنتج</Label>
                      <Select
                        value={productForm.product_type}
                        onValueChange={(value) => setProductForm({ ...productForm, product_type: value })}
                      >
                        <SelectTrigger className="glass h-8 text-sm">
                          <SelectValue placeholder="اختر نوع المنتج" />
                        </SelectTrigger>
                        <SelectContent>
                          {productTypes.map((type) => (
                            <SelectItem key={type.id} value={type.name}>
                              {type.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">مدة الضمان (أيام)</Label>
                      <Select
                        value={productForm.warranty_days}
                        onValueChange={(value) => setProductForm({ ...productForm, warranty_days: value })}
                      >
                        <SelectTrigger className="glass h-8 text-sm">
                          <SelectValue placeholder="اختر مدة الضمان" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">بدون ضمان</SelectItem>
                          <SelectItem value="1">يوم واحد</SelectItem>
                          <SelectItem value="3">3 أيام</SelectItem>
                          <SelectItem value="7">أسبوع</SelectItem>
                          <SelectItem value="14">أسبوعين</SelectItem>
                          <SelectItem value="30">شهر</SelectItem>
                          <SelectItem value="60">شهرين</SelectItem>
                          <SelectItem value="90">3 أشهر</SelectItem>
                          <SelectItem value="180">6 أشهر</SelectItem>
                          <SelectItem value="365">سنة</SelectItem>
                          <SelectItem value="730">سنتين</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">المنصة</Label>
                      <Input
                        value={productForm.platform}
                        onChange={(e) => setProductForm({ ...productForm, platform: e.target.value })}
                        placeholder="مثال: Netflix, TikTok, PUBG"
                        className="glass h-8 text-sm"
                      />
                    </div>
                  </div>
                  
                  {/* Activation Settings */}
                  <div className="border border-primary/20 rounded-lg p-3 bg-primary/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 text-primary" />
                        <Label className="text-xs font-medium">يتطلب تفعيل (OTP)</Label>
                      </div>
                      <input
                        type="checkbox"
                        checked={productForm.requires_activation}
                        onChange={(e) => setProductForm({ ...productForm, requires_activation: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                    </div>
                    {productForm.requires_activation && (
                      <div className="space-y-1">
                        <Label className="text-xs">نوع التفعيل</Label>
                        <Select
                          value={productForm.activation_type}
                          onValueChange={(value) => setProductForm({ ...productForm, activation_type: value })}
                        >
                          <SelectTrigger className="glass h-8 text-sm">
                            <SelectValue placeholder="اختر نوع التفعيل" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="otp">رمز OTP (بريد إلكتروني)</SelectItem>
                            <SelectItem value="qr">رمز QR</SelectItem>
                            <SelectItem value="manual">تفعيل يدوي</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          سيحصل العميل على كود تفعيل فريد بعد الشراء للتواصل مع البوت
                        </p>
                      </div>
                    )}
                  </div>

                  <ImageUpload
                    value={productForm.image_url}
                    onChange={(url) => setProductForm({ ...productForm, image_url: url })}
                    bucket="product-images"
                    label="صورة المنتج"
                    showMergeBox
                  />

                  {/* Product Accounts Section - Only show when editing */}
                  {editingProduct && editingProduct.product_type === 'account' && (
                    <div className="border-t border-border pt-3 mt-3">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-sm font-medium flex items-center gap-1.5">
                          <Key className="h-3.5 w-3.5 text-primary" />
                          الحسابات
                        </Label>
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                            {accountsTextarea.split('\n').filter(line => line.trim()).length}
                          </span>
                          <span className="bg-destructive/20 text-destructive px-1.5 py-0.5 rounded-full">
                            {productAccounts.filter(a => a.is_sold).length} مباع
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
                            className="glass font-mono text-xs min-h-[70px]"
                            dir="ltr"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              if (!editingProduct) return;
                              setSavingAccounts(true);
                              
                              try {
                                const newAccounts = accountsTextarea
                                  .split('\n')
                                  .map(line => line.trim())
                                  .filter(line => line.length > 0);
                                
                                const existingUnsold = productAccounts
                                  .filter(a => !a.is_sold)
                                  .map(a => a.account_data);
                                
                                const toDelete = productAccounts
                                  .filter(a => !a.is_sold && !newAccounts.includes(a.account_data))
                                  .map(a => a.id);
                                
                                const toAdd = newAccounts.filter(acc => !existingUnsold.includes(acc));
                                
                                if (toDelete.length > 0) {
                                  const { error: deleteError } = await db
                                    .from('product_accounts')
                                    .delete()
                                    .in('id', toDelete);
                                  if (deleteError) throw deleteError;
                                }
                                
                                if (toAdd.length > 0) {
                                  const { error: insertError } = await db
                                    .from('product_accounts')
                                    .insert(toAdd.map(acc => ({
                                      product_id: editingProduct.id,
                                      account_data: acc,
                                    })));
                                  if (insertError) throw insertError;
                                }
                                
                                toast({
                                  title: "تم الحفظ",
                                  description: `حذف ${toDelete.length} وإضافة ${toAdd.length}`,
                                });
                                
                                fetchProductAccounts(editingProduct.id);
                              } catch (error: any) {
                                toast({
                                  title: "خطأ",
                                  description: error.message,
                                  variant: "destructive",
                                });
                              } finally {
                                setSavingAccounts(false);
                              }
                            }}
                            disabled={savingAccounts}
                            className="w-full gap-1.5 h-7 text-xs"
                          >
                            {savingAccounts ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Save className="h-3 w-3" />
                            )}
                            حفظ
                          </Button>
                          
                          {productAccounts.filter(a => a.is_sold).length > 0 && (
                            <details className="text-xs">
                              <summary className="text-muted-foreground cursor-pointer">المباعة ({productAccounts.filter(a => a.is_sold).length})</summary>
                              <div className="max-h-16 overflow-y-auto mt-1 p-1.5 rounded border border-border bg-destructive/5 font-mono text-[10px]">
                                {productAccounts.filter(a => a.is_sold).map((account) => (
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

                  {/* Product Variants Section - Show for all product types when editing */}
                  {editingProduct && (
                    <ProductVariantsManager
                      productId={editingProduct.id}
                      productName={editingProduct.name}
                    />
                  )}
                </div>
                <div className="p-4 pt-2 border-t border-border shrink-0">
                  <p className="text-xs text-muted-foreground mb-2 text-center">
                    💡 لحفظ تغييرات الاسم أو الوصف، اضغط على "حفظ المنتج" أدناه
                  </p>
                  <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setProductDialogOpen(false)}>
                    إلغاء
                  </Button>
                  <Button variant="hero" size="sm" onClick={saveProduct} className="gap-1.5 bg-gradient-primary text-primary-foreground font-semibold">
                    <Save className="h-3.5 w-3.5" />
                    حفظ المنتج
                  </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Product Types Dialog */}
            <Dialog open={productTypesDialogOpen} onOpenChange={setProductTypesDialogOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Tag className="h-5 w-5 text-primary" />
                    إدارة أنواع المنتجات
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {/* Add new type */}
                  <div className="flex gap-2">
                    <Input
                      value={newTypeName}
                      onChange={(e) => setNewTypeName(e.target.value)}
                      placeholder="اكتب نوع جديد..."
                      className="glass"
                      onKeyDown={(e) => e.key === "Enter" && addProductType()}
                    />
                    <Button 
                      onClick={addProductType} 
                      disabled={savingType || !newTypeName.trim()}
                      className="gap-2 shrink-0"
                    >
                      {savingType ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      إضافة
                    </Button>
                  </div>

                  {/* Types list */}
                  {productTypes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Tag className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>لا توجد أنواع بعد</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {productTypes.map((type, index) => (
                        <div
                          key={type.id}
                          className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border border-border/50"
                        >
                          <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                          <Input
                            value={type.name}
                            onChange={(e) => {
                              setProductTypes(productTypes.map(t => 
                                t.id === type.id ? { ...t, name: e.target.value } : t
                              ));
                            }}
                            onBlur={(e) => updateProductTypeName(type.id, e.target.value)}
                            className="bg-transparent border-0 p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteProductType(type.id, type.name)}
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground text-center">
                    اضغط على الاسم للتعديل
                  </p>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* Accounts Tab */}
        {activeTab === "accounts" && hasPermission("accounts") && (
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-8">إدارة الحسابات</h1>
            
            {/* Bulk Import */}
            <BulkAccountImport 
              products={products} 
              onImportComplete={() => {
                if (selectedProductForAccounts) {
                  fetchAccounts(selectedProductForAccounts);
                }
              }} 
            />
            
            <div className="glass rounded-xl p-6 my-6">
              <h2 className="font-semibold text-foreground mb-4">إضافة حساب واحد</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>اختر المنتج</Label>
                  <Select
                    value={selectedProductForAccounts}
                    onValueChange={(value) => {
                      setSelectedProductForAccounts(value);
                      setSelectedVariantForAccounts("");
                      setAccounts([]);
                      fetchVariantsForProduct(value);
                    }}
                  >
                    <SelectTrigger className="glass">
                      <SelectValue placeholder="اختر منتج" />
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

                {/* Variant Selection - appears when product has variants */}
                {selectedProductForAccounts && productVariants.length > 0 && (
                  <div className="space-y-2">
                    <Label>اختر المنتج الفرعي</Label>
                    <Select
                      value={selectedVariantForAccounts}
                      onValueChange={(value) => {
                        setSelectedVariantForAccounts(value);
                        fetchAccounts(selectedProductForAccounts, value);
                      }}
                    >
                      <SelectTrigger className="glass">
                        <SelectValue placeholder="اختر منتج فرعي" />
                      </SelectTrigger>
                      <SelectContent>
                        {productVariants.map((variant) => (
                          <SelectItem key={variant.id} value={variant.id}>
                            {variant.name} - ${variant.price}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* If product has no variants, fetch accounts directly */}
                {selectedProductForAccounts && productVariants.length === 0 && accounts.length === 0 && (
                  <Button 
                    variant="outline" 
                    onClick={() => fetchAccounts(selectedProductForAccounts)}
                    className="w-full"
                  >
                    عرض الحسابات
                  </Button>
                )}

                <div className="space-y-2">
                  <Label>بيانات الحساب</Label>
                  <Textarea
                    value={newAccountData}
                    onChange={(e) => setNewAccountData(e.target.value)}
                    placeholder="مثال: user@email.com:password123"
                    className="glass"
                    dir="ltr"
                  />
                </div>
                <Button variant="hero" onClick={addAccount} className="gap-2">
                  <Plus className="h-4 w-4" />
                  إضافة حساب
                </Button>
              </div>
            </div>

            {selectedProductForAccounts && (
              <div>
                <h2 className="font-semibold text-foreground mb-4">
                  الحسابات المتوفرة ({accounts.filter(a => !a.is_sold).length})
                </h2>
                <div className="space-y-2">
                  {accounts.map((account) => (
                    <div
                      key={account.id}
                      className={`glass rounded-lg p-4 flex items-center justify-between ${account.is_sold ? 'opacity-50' : ''}`}
                    >
                      <div>
                        <code className="text-sm text-foreground" dir="ltr">{account.account_data}</code>
                        {account.is_sold && (
                          <span className="mr-2 text-xs bg-destructive/20 text-destructive px-2 py-0.5 rounded-full">
                            مباع
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteAccount(account.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {accounts.length === 0 && (
                    <p className="text-muted-foreground text-center py-8">لا توجد حسابات لهذا المنتج</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Categories Tab */}
        {activeTab === "categories" && hasPermission("categories") && (
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-8">إدارة التصنيفات</h1>
            
            <div className="glass rounded-xl p-6 mb-6">
              <div className="flex gap-4">
                <Input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="اسم التصنيف الجديد"
                  className="glass flex-1"
                />
                <Button variant="hero" onClick={addCategory} className="gap-2">
                  <Plus className="h-4 w-4" />
                  إضافة
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              {categories.map((category) => (
                <div key={category.id} className="glass rounded-lg p-4 flex items-center justify-between">
                  <span className="font-medium text-foreground">{category.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteCategory(category.id)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Orders Tab */}
        {activeTab === "orders" && hasPermission("orders") && <OrdersTab />}

        {/* Users Tab */}
        {activeTab === "users" && hasPermission("users") && <UsersTab />}

        {/* Reviews Tab */}
        {activeTab === "reviews" && hasPermission("reviews") && <ReviewsTab />}

        {/* Requests Tab */}
        {activeTab === "requests" && hasPermission("requests") && <RequestsTab />}

        {/* Affiliates Tab */}
        {activeTab === "affiliates" && hasPermission("affiliates") && <AffiliatesTab />}

        {/* Messages Tab */}
        {activeTab === "messages" && hasPermission("messages") && (
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-8">الرسائل</h1>
            
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`glass rounded-xl p-6 ${!msg.is_read ? 'border-r-4 border-primary' : ''}`}
                  onClick={() => !msg.is_read && markAsRead(msg.id)}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-foreground">{msg.name}</h3>
                      <p className="text-sm text-muted-foreground">{msg.email}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(msg.created_at).toLocaleDateString('ar-SA')}
                    </span>
                  </div>
                  <p className="text-foreground">{msg.message}</p>
                </div>
              ))}

              {messages.length === 0 && (
                <p className="text-muted-foreground text-center py-12">لا توجد رسائل</p>
              )}
            </div>
          </div>
        )}

        {/* Logs Tab */}
        {activeTab === "logs" && hasPermission("logs") && <LogsTab />}
      </main>
    </div>
  );
};

export default Admin;
