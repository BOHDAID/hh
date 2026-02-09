import { useState, useEffect } from "react";
import { db, getAuthClient } from "@/lib/supabaseClient";
import { invokeCloudFunction } from "@/lib/cloudFunctions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Loader2, Users, Wallet, Plus, Minus, Ban, UserPlus, RefreshCw, ShieldCheck, ShieldX } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface UserWithWallet {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  is_banned: boolean | null;
  banned_at: string | null;
  banned_reason: string | null;
  wallet: {
    id: string;
    balance: number;
    total_earned: number;
  } | null;
}

const UsersTab = () => {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserWithWallet[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserWithWallet | null>(null);
  const [balanceAmount, setBalanceAmount] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    
    // ملاحظة: الـ join بالشكل profiles(*,wallets(balance)) يحتاج Foreign Key بين الجدولين.
    // بما أن العلاقة غير معرفة في قاعدة البيانات (حسب الخطأ الظاهر)، نجلب wallets باستعلام منفصل ونقوم بالدمج.
    const { data: profiles, error } = await db
      .from("profiles")
      .select("id,user_id,email,full_name,created_at,is_banned,banned_at,banned_reason")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching profiles:", error);
      toast({
        title: "خطأ في جلب المستخدمين",
        description: error.message,
        variant: "destructive",
      });
    }

    if (profiles && profiles.length > 0) {
      const userIds = profiles.map((p: any) => p.user_id).filter(Boolean);

      // جلب المحافظ مباشرة من نفس قاعدة البيانات (External) لتجنب اختلاف المصدر
      const { data: wallets, error: walletsError } = await db
        .from("wallets")
        .select("id,user_id,balance,total_earned")
        .in("user_id", userIds);

      if (walletsError) {
        console.error("Error fetching wallets:", walletsError);
        toast({
          title: "خطأ في جلب المحافظ",
          description: walletsError.message,
          variant: "destructive",
        });
      }

      const walletByUserId = new Map<
        string,
        { id: string; user_id: string; balance: number; total_earned: number }
      >();
      (wallets || []).forEach((w: any) => walletByUserId.set(w.user_id, w));

      const merged: UserWithWallet[] = profiles.map((p: any) => ({
        ...p,
        wallet: walletByUserId.get(p.user_id) || null,
      }));

      setUsers(merged);
    } else {
      setUsers([]);
    }
    
    setLoading(false);
  };

  // إنشاء ملف شخصي للمستخدم الحالي (Admin)
  const createCurrentUserProfile = async () => {
    setCreatingProfile(true);
    
    try {
      // جلب المستخدم الحالي من Auth
      const authClient = getAuthClient();
      const {
        data: { user },
      } = await authClient.auth.getUser();
      
      if (!user) {
        toast({
          title: "خطأ",
          description: "يجب تسجيل الدخول أولاً",
          variant: "destructive",
        });
        setCreatingProfile(false);
        return;
      }

      // التحقق من وجود الملف الشخصي
      const { data: existingProfile } = await db
        .from("profiles")
        .select("id,email,full_name")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingProfile) {
        // إن كان موجود لكن ناقص بيانات (مثل email) نقوم بتحديثه
        const needsEmail = !existingProfile.email && Boolean(user.email);
        const needsName = !existingProfile.full_name;

        if (needsEmail || needsName) {
          const { error: updateError } = await db
            .from("profiles")
            .update({
              email: needsEmail ? user.email : existingProfile.email,
              full_name: needsName
                ? (user.user_metadata?.full_name || user.email || "Admin")
                : existingProfile.full_name,
            })
            .eq("id", existingProfile.id);

          if (updateError) throw updateError;
        }

        toast({
          title: "موجود مسبقاً",
          description: needsEmail || needsName ? "تم تحديث بيانات ملفك الشخصي" : "الملف الشخصي موجود بالفعل",
        });
        fetchUsers();
        setCreatingProfile(false);
        return;
      }

      // إنشاء الملف الشخصي
      const { error: profileError } = await db.from("profiles").insert({
        user_id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || "Admin",
      });

      if (profileError) {
        throw profileError;
      }

      // إنشاء المحفظة
      const { error: walletError } = await db.from("wallets").insert({
        user_id: user.id,
        balance: 0,
        total_earned: 0,
      });

      if (walletError) {
        console.error("Wallet creation error:", walletError);
      }

      toast({
        title: "تم بنجاح",
        description: "تم إنشاء ملفك الشخصي",
      });

      fetchUsers();
    } catch (err: any) {
      toast({
        title: "خطأ",
        description: err.message,
        variant: "destructive",
      });
    }
    
    setCreatingProfile(false);
  };

  const openBalanceDialog = (user: UserWithWallet) => {
    setSelectedUser(user);
    setBalanceAmount("");
    setDialogOpen(true);
  };

  const updateBalance = async (type: "add" | "subtract") => {
    if (!selectedUser || !balanceAmount) {
      toast({
        title: "خطأ",
        description: "أدخل المبلغ",
        variant: "destructive",
      });
      return;
    }

    const amount = parseFloat(balanceAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "خطأ",
        description: "أدخل مبلغ صحيح",
        variant: "destructive",
      });
      return;
    }

    setUpdating(true);

    try {
      const authClient = getAuthClient();
      const {
        data: { session },
      } = await authClient.auth.getSession();

      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error("انتهت الجلسة. سجّل الدخول مرة أخرى.");
      }

      const { data, error } = await invokeCloudFunction<{ wallet: { id: string; balance: number; total_earned: number } }>(
        "admin-adjust-wallet",
        {
          target_user_id: selectedUser.user_id,
          type,
          amount,
        },
        accessToken
      );

      if (error) throw error;
      if (!data?.wallet) throw new Error("فشل تعديل الرصيد");

      // تحديث البيانات محلياً فوراً (Optimistic Update)
      setUsers((prev) =>
        prev.map((u) =>
          u.user_id === selectedUser.user_id
            ? { ...u, wallet: data.wallet }
            : u
        )
      );

      toast({
        title: "تم التحديث",
        description: `تم ${type === "add" ? "إضافة" : "خصم"} $${amount} - الرصيد الجديد: $${data.wallet.balance.toFixed(2)}`,
      });

      setDialogOpen(false);
    } catch (err: any) {
      toast({
        title: "خطأ",
        description: err.message,
        variant: "destructive",
      });
    }

    setUpdating(false);
  };

  const banUser = async (user: UserWithWallet) => {
    const newBanStatus = !user.is_banned;
    
    try {
      const { error } = await db
        .from("profiles")
        .update({
          is_banned: newBanStatus,
          banned_at: newBanStatus ? new Date().toISOString() : null,
          banned_reason: newBanStatus ? "تم الحظر بواسطة الأدمن" : null,
        })
        .eq("id", user.id);

      if (error) throw error;

      // إرسال بريد إلكتروني للمستخدم
      if (user.email) {
        try {
          const response = await fetch(
            `${import.meta.env.VITE_EXTERNAL_SUPABASE_URL || 'https://vepwoilxujuyeuutybjp.supabase.co'}/functions/v1/send-ban-email`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlcHdvaWx4dWp1eWV1dXR5YmpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MTk3MTYsImV4cCI6MjA4NTI5NTcxNn0.bzqiWihFNR73aPRTOSQoiTRmJVvpSrSGgVCaPCM1hZk',
                'Authorization': `Bearer ${import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlcHdvaWx4dWp1eWV1dXR5YmpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MTk3MTYsImV4cCI6MjA4NTI5NTcxNn0.bzqiWihFNR73aPRTOSQoiTRmJVvpSrSGgVCaPCM1hZk'}`,
              },
              body: JSON.stringify({
                to_email: user.email,
                user_name: user.full_name || user.email,
                ban_reason: newBanStatus ? "تم الحظر بواسطة الأدمن" : null,
                is_banned: newBanStatus,
              }),
            }
          );

          // Always consume the response body to avoid resource leaks
          const raw = await response.text();
          const parsed = (() => {
            try {
              return raw ? JSON.parse(raw) : null;
            } catch {
              return null;
            }
          })();

          if (response.ok) {
            toast({
              title: "تم إرسال الإشعار",
              description: `تم إرسال بريد إلكتروني إلى ${user.email}`,
            });
          } else {
            const msg =
              (parsed && (parsed.error || parsed.message)) ||
              raw ||
              `HTTP ${response.status}`;
            toast({
              title: "فشل إرسال الإيميل",
              description: msg,
              variant: "destructive",
            });
          }
        } catch (emailErr) {
          console.error("Failed to send ban email:", emailErr);
          toast({
            title: "فشل إرسال الإيميل",
            description: "تعذر الاتصال بخدمة الإرسال. تحقق من Network ثم أعد المحاولة.",
            variant: "destructive",
          });
        }
      }

      toast({
        title: newBanStatus ? "تم الحظر" : "تم إلغاء الحظر",
        description: newBanStatus 
          ? `تم حظر المستخدم ${user.email}` 
          : `تم إلغاء حظر المستخدم ${user.email}`,
      });

      fetchUsers();
    } catch (err: any) {
      toast({
        title: "خطأ",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">إدارة المستخدمين</h1>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchUsers}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            تحديث
          </Button>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-5 w-5" />
            <span>{users.length} مستخدم</span>
          </div>
        </div>
      </div>

      {users.length === 0 ? (
        <div className="text-center py-12 space-y-4">
          <p className="text-muted-foreground">لا يوجد مستخدمين في جدول profiles</p>
          <Button
            variant="hero"
            onClick={createCurrentUserProfile}
            disabled={creatingProfile}
            className="gap-2"
          >
            {creatingProfile ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            إنشاء ملفي الشخصي (Admin)
          </Button>
          <p className="text-xs text-muted-foreground">
            سيقوم هذا بإضافة بياناتك كأول مستخدم في جدول profiles
          </p>
        </div>
      ) : (
        <div className="glass rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">User ID</TableHead>
                <TableHead className="text-right">Email</TableHead>
                <TableHead className="text-right">Full Name</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-mono text-xs">
                    {user.user_id.substring(0, 8)}...
                  </TableCell>
                  <TableCell>{user.email || "—"}</TableCell>
                  <TableCell>{user.full_name || "بدون اسم"}</TableCell>
                  <TableCell>
                    {user.is_banned ? (
                      <div className="flex items-center gap-1 text-destructive">
                        <ShieldX className="h-4 w-4" />
                        <span className="text-xs font-medium">محظور</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-green-500">
                        <ShieldCheck className="h-4 w-4" />
                        <span className="text-xs font-medium">نشط</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-primary" />
                      <span className="font-bold text-primary">
                        ${user.wallet?.balance?.toFixed(2) || "0.00"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openBalanceDialog(user)}
                        className="gap-1"
                      >
                        <Plus className="h-3 w-3" />
                        إضافة رصيد
                      </Button>
                      <Button
                        variant={user.is_banned ? "outline" : "destructive"}
                        size="sm"
                        onClick={() => banUser(user)}
                        className="gap-1"
                      >
                        {user.is_banned ? (
                          <>
                            <ShieldCheck className="h-3 w-3" />
                            إلغاء الحظر
                          </>
                        ) : (
                          <>
                            <Ban className="h-3 w-3" />
                            حظر
                          </>
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Edit Balance Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="glass max-w-sm">
          <DialogHeader>
            <DialogTitle>تعديل رصيد المستخدم</DialogTitle>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">المستخدم</p>
                <p className="font-semibold text-foreground">
                  {selectedUser.full_name || selectedUser.email}
                </p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">الرصيد الحالي</p>
                <p className="text-2xl font-bold text-primary">
                  ${selectedUser.wallet?.balance?.toFixed(2) || "0.00"}
                </p>
              </div>

              <div className="space-y-2">
                <Label>المبلغ ($)</Label>
                <Input
                  type="number"
                  value={balanceAmount}
                  onChange={(e) => setBalanceAmount(e.target.value)}
                  placeholder="0.00"
                  className="glass"
                  min="0"
                  step="0.01"
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  variant="hero"
                  onClick={() => updateBalance("add")}
                  disabled={updating}
                  className="flex-1 gap-2"
                >
                  {updating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  إضافة
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => updateBalance("subtract")}
                  disabled={updating}
                  className="flex-1 gap-2"
                >
                  {updating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Minus className="h-4 w-4" />
                  )}
                  خصم
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UsersTab;
