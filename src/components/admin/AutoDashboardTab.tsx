import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Bot, Edit, Save, Trash2, Plus, Users, Crown, Clock, AlertCircle, Loader2,
  CheckCircle2, XCircle, Eye, CreditCard, Radio
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface Plan {
  id: string;
  name: string;
  duration_days: number;
  price: number;
  max_sessions: number;
  features: string[];
  is_active: boolean;
  display_order: number;
}

interface Subscription {
  id: string;
  user_id: string;
  plan_id: string | null;
  status: string;
  starts_at: string;
  ends_at: string;
  max_sessions: number;
  is_trial: boolean;
  created_at: string;
  plan?: Plan | null;
}

interface SubscriberInfo {
  subscription: Subscription;
  email: string | null;
  sessions_count: number;
  sessions: { id: string; telegram_user: any }[];
}

const AutoDashboardTab = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscribers, setSubscribers] = useState<SubscriberInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [planForm, setPlanForm] = useState({
    name: "", duration_days: "30", price: "10", max_sessions: "1", features: "", is_active: true,
  });
  const [savingPlan, setSavingPlan] = useState(false);
  const [activeTab, setActiveTab] = useState("subscribers");

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchPlans(), fetchSubscribers()]);
    setLoading(false);
  };

  const fetchPlans = async () => {
    const { data } = await supabase
      .from("telegram_plans")
      .select("*")
      .order("display_order");
    if (data) setPlans(data.map(p => ({ ...p, features: Array.isArray(p.features) ? (p.features as string[]) : [] })));
  };

  const fetchSubscribers = async () => {
    // Get all subscriptions
    const { data: subs } = await supabase
      .from("telegram_subscriptions")
      .select("*")
      .order("created_at", { ascending: false });

    if (!subs || subs.length === 0) { setSubscribers([]); return; }

    // Get plans for mapping
    const { data: plansData } = await supabase.from("telegram_plans").select("*");
    const plansMap = new Map((plansData || []).map(p => [p.id, p]));

    // Get user profiles from external DB
    const userIds = [...new Set(subs.map(s => s.user_id))];
    const { data: profiles } = await db
      .from("profiles")
      .select("user_id, email")
      .in("user_id", userIds);
    const profileMap = new Map((profiles || []).map(p => [p.user_id, p.email]));

    // Get telegram sessions count per user from Lovable Cloud
    const { data: sessions } = await supabase
      .from("telegram_sessions")
      .select("id, user_id, telegram_user")
      .in("user_id", userIds);
    
    const sessionsMap = new Map<string, { id: string; telegram_user: any }[]>();
    (sessions || []).forEach(s => {
      if (!sessionsMap.has(s.user_id)) sessionsMap.set(s.user_id, []);
      sessionsMap.get(s.user_id)!.push(s);
    });

    const result: SubscriberInfo[] = subs.map(sub => {
      const rawPlan = plansMap.get(sub.plan_id || "");
      const plan = rawPlan ? { ...rawPlan, features: Array.isArray(rawPlan.features) ? (rawPlan.features as string[]) : [] } : null;
      return {
      subscription: { ...sub, plan_id: sub.plan_id || null, plan },
      email: profileMap.get(sub.user_id) || null,
      sessions_count: sessionsMap.get(sub.user_id)?.length || 0,
      sessions: sessionsMap.get(sub.user_id) || [],
    };
    });

    setSubscribers(result);
  };

  // Plan CRUD
  const openPlanDialog = (plan?: Plan) => {
    if (plan) {
      setEditPlan(plan);
      setPlanForm({
        name: plan.name,
        duration_days: String(plan.duration_days),
        price: String(plan.price),
        max_sessions: String(plan.max_sessions),
        features: plan.features.join("\n"),
        is_active: plan.is_active,
      });
    } else {
      setEditPlan(null);
      setPlanForm({ name: "", duration_days: "30", price: "10", max_sessions: "1", features: "", is_active: true });
    }
    setPlanDialogOpen(true);
  };

  const savePlan = async () => {
    if (!planForm.name.trim()) { toast.error("اسم الباقة مطلوب"); return; }
    setSavingPlan(true);
    const features = planForm.features.split("\n").map(f => f.trim()).filter(Boolean);
    const data = {
      name: planForm.name,
      duration_days: parseInt(planForm.duration_days) || 30,
      price: parseFloat(planForm.price) || 0,
      max_sessions: parseInt(planForm.max_sessions) || 1,
      features,
      is_active: planForm.is_active,
    };

    if (editPlan) {
      const { error } = await supabase.from("telegram_plans").update(data).eq("id", editPlan.id);
      if (error) toast.error(error.message); else toast.success("تم تحديث الباقة");
    } else {
      const maxOrder = Math.max(...plans.map(p => p.display_order), 0);
      const { error } = await supabase.from("telegram_plans").insert({ ...data, display_order: maxOrder + 1 });
      if (error) toast.error(error.message); else toast.success("تم إضافة الباقة");
    }
    setSavingPlan(false);
    setPlanDialogOpen(false);
    fetchPlans();
  };

  const deletePlan = async (id: string) => {
    if (!confirm("هل تريد حذف هذه الباقة؟")) return;
    const { error } = await supabase.from("telegram_plans").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("تم الحذف"); fetchPlans(); }
  };

  const getStatusBadge = (sub: Subscription) => {
    const now = new Date();
    const end = new Date(sub.ends_at);
    const isExpired = end < now;

    if (isExpired) return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> منتهي</Badge>;
    if (sub.is_trial) return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> تجريبي</Badge>;
    if (sub.status === "active") return <Badge className="gap-1 bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle2 className="h-3 w-3" /> مشترك</Badge>;
    return <Badge variant="outline">{sub.status}</Badge>;
  };

  const getDurationLabel = (sub: Subscription) => {
    const start = new Date(sub.starts_at);
    const end = new Date(sub.ends_at);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (days <= 1) return "يوم واحد";
    if (days <= 30) return `${days} يوم`;
    if (days <= 90) return "3 أشهر";
    if (days <= 180) return "6 أشهر";
    return "سنة";
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
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Radio className="h-6 w-6 text-primary" /> التحكم في Telegram
          </h2>
          <p className="text-muted-foreground mt-1">إدارة الباقات والمشتركين والجلسات</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 h-10">
          <TabsTrigger value="subscribers" className="gap-1.5">
            <Users className="h-4 w-4" /> المشتركين ({subscribers.length})
          </TabsTrigger>
          <TabsTrigger value="plans" className="gap-1.5">
            <Crown className="h-4 w-4" /> الباقات ({plans.length})
          </TabsTrigger>
        </TabsList>

        {/* Subscribers Tab */}
        <TabsContent value="subscribers" className="mt-4">
          {subscribers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>لا يوجد مشتركين حالياً</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">البريد</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">الباقة</TableHead>
                    <TableHead className="text-right">المدة</TableHead>
                    <TableHead className="text-right">الجلسات</TableHead>
                    <TableHead className="text-right">تاريخ الانتهاء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscribers.map(({ subscription: sub, email, sessions_count }) => (
                    <TableRow key={sub.id}>
                      <TableCell className="font-mono text-sm">{email || "—"}</TableCell>
                      <TableCell>{getStatusBadge(sub)}</TableCell>
                      <TableCell>{sub.plan?.name || (sub.is_trial ? "تجريبي" : "—")}</TableCell>
                      <TableCell>{getDurationLabel(sub)}</TableCell>
                      <TableCell>
                        <span className={sessions_count >= sub.max_sessions ? "text-destructive font-bold" : ""}>
                          {sessions_count} / {sub.max_sessions}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(sub.ends_at).toLocaleDateString("ar-SA")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Plans Tab */}
        <TabsContent value="plans" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => openPlanDialog()} className="gap-2">
              <Plus className="h-4 w-4" /> إضافة باقة
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {plans.map(plan => (
              <div key={plan.id} className={`rounded-xl border p-5 space-y-3 ${plan.is_active ? "border-primary/30 bg-primary/5" : "border-border opacity-60"}`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg">{plan.name}</h3>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openPlanDialog(plan)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deletePlan(plan.id)} className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-primary">${plan.price}</span>
                  <span className="text-muted-foreground text-sm">/ {plan.duration_days} يوم</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Bot className="h-4 w-4" /> {plan.max_sessions} جلسة
                </div>
                <ul className="space-y-1">
                  {plan.features.map((f, i) => (
                    <li key={i} className="text-sm flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                {!plan.is_active && (
                  <Badge variant="secondary">معطلة</Badge>
                )}
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Plan Dialog */}
      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editPlan ? "تعديل الباقة" : "إضافة باقة جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>اسم الباقة</Label>
              <Input value={planForm.name} onChange={e => setPlanForm({ ...planForm, name: e.target.value })} placeholder="مثال: شهر واحد" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>المدة (أيام)</Label>
                <Input type="number" value={planForm.duration_days} onChange={e => setPlanForm({ ...planForm, duration_days: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>السعر ($)</Label>
                <Input type="number" value={planForm.price} onChange={e => setPlanForm({ ...planForm, price: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>عدد الجلسات</Label>
                <Input type="number" value={planForm.max_sessions} onChange={e => setPlanForm({ ...planForm, max_sessions: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>المميزات (سطر لكل ميزة)</Label>
              <textarea
                className="w-full min-h-[100px] rounded-lg border border-border bg-background p-3 text-sm"
                value={planForm.features}
                onChange={e => setPlanForm({ ...planForm, features: e.target.value })}
                placeholder={"نشر تلقائي\nرسائل خاص\nمراقب المنشنات"}
                dir="rtl"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={planForm.is_active} onCheckedChange={v => setPlanForm({ ...planForm, is_active: v })} />
              <Label>مفعلة</Label>
            </div>
            <Button onClick={savePlan} disabled={savingPlan} className="w-full gap-2">
              {savingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              حفظ
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AutoDashboardTab;
