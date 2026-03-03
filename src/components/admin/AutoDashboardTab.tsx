import { useState, useEffect } from "react";
import { db } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Bot, Edit, Save, Trash2, Plus, Users, Crown, Clock, Loader2,
  CheckCircle2, XCircle, Copy, Radio, Eye, EyeOff, Mail, CreditCard
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
  price_per_extra_session: number;
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

interface TelegramSession {
  id: string;
  session_string: string;
  telegram_user: any;
}

interface SubscriberInfo {
  subscription: Subscription;
  email: string | null;
  sessions_count: number;
  sessions: TelegramSession[];
}

const AutoDashboardTab = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscribers, setSubscribers] = useState<SubscriberInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [planForm, setPlanForm] = useState({
    name: "", duration_days: "30", price: "10", max_sessions: "1",
    price_per_extra_session: "5", features: "", is_active: true,
  });
  const [savingPlan, setSavingPlan] = useState(false);
  const [activeTab, setActiveTab] = useState("subscribers");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [visibleSessions, setVisibleSessions] = useState<Set<string>>(new Set());

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchPlans(), fetchSubscribers()]);
    setLoading(false);
  };

  const fetchPlans = async () => {
    const { data } = await db.from("telegram_plans").select("*").order("display_order");
    if (data) setPlans(data.map((p) => ({
      ...p,
      price_per_extra_session: p.price_per_extra_session ?? 5,
      features: Array.isArray(p.features) ? (p.features as string[]) : []
    })));
  };

  const fetchSubscribers = async () => {
    const { data: subs } = await db
      .from("telegram_subscriptions").select("*").order("created_at", { ascending: false });
    if (!subs || subs.length === 0) { setSubscribers([]); return; }

    const { data: plansData } = await db.from("telegram_plans").select("*");
    const plansMap = new Map((plansData || []).map((p) => [p.id, p]));

    const userIds = [...new Set(subs.map((s) => s.user_id))] as string[];
    const { data: profiles } = await db.from("profiles").select("user_id, email").in("user_id", userIds);
    const profileMap = new Map((profiles || []).map(p => [p.user_id, p.email]));

    const { data: sessions } = await db
      .from("telegram_sessions").select("id, user_id, telegram_user, session_string").in("user_id", userIds);

    const sessionsMap = new Map<string, TelegramSession[]>();
    (sessions || []).forEach((s) => {
      if (!sessionsMap.has(s.user_id)) sessionsMap.set(s.user_id, []);
      sessionsMap.get(s.user_id)!.push(s as TelegramSession);
    });

    setSubscribers(subs.map((sub) => {
      const rawPlan: any = plansMap.get(sub.plan_id || "");
      const plan = rawPlan ? {
        ...rawPlan,
        price_per_extra_session: rawPlan.price_per_extra_session ?? 5,
        features: Array.isArray(rawPlan.features) ? rawPlan.features.map((f: unknown) => String(f)) : []
      } : null;
      return {
        subscription: { ...sub, plan_id: sub.plan_id || null, plan },
        email: profileMap.get(sub.user_id) || null,
        sessions_count: sessionsMap.get(sub.user_id)?.length || 0,
        sessions: sessionsMap.get(sub.user_id) || [],
      };
    }));
  };

  const openPlanDialog = (plan?: Plan) => {
    if (plan) {
      setEditPlan(plan);
      setPlanForm({
        name: plan.name, duration_days: String(plan.duration_days),
        price: String(plan.price), max_sessions: String(plan.max_sessions),
        price_per_extra_session: String(plan.price_per_extra_session),
        features: plan.features.join("\n"), is_active: plan.is_active,
      });
    } else {
      setEditPlan(null);
      setPlanForm({ name: "", duration_days: "30", price: "10", max_sessions: "1", price_per_extra_session: "5", features: "", is_active: true });
    }
    setPlanDialogOpen(true);
  };

  const savePlan = async () => {
    if (!planForm.name.trim()) { toast.error("اسم الباقة مطلوب"); return; }
    setSavingPlan(true);
    const features = planForm.features.split("\n").map(f => f.trim()).filter(Boolean);
    const data: any = {
      name: planForm.name, duration_days: parseInt(planForm.duration_days) || 30,
      price: parseFloat(planForm.price) || 0, max_sessions: parseInt(planForm.max_sessions) || 1,
      price_per_extra_session: parseFloat(planForm.price_per_extra_session) || 5,
      features, is_active: planForm.is_active,
    };

    if (editPlan) {
      const { error } = await db.from("telegram_plans").update(data).eq("id", editPlan.id);
      if (error) toast.error(error.message); else toast.success("تم تحديث الباقة");
    } else {
      const maxOrder = Math.max(...plans.map(p => p.display_order), 0);
      const { error } = await db.from("telegram_plans").insert({ ...data, display_order: maxOrder + 1 });
      if (error) toast.error(error.message); else toast.success("تم إضافة الباقة");
    }
    setSavingPlan(false);
    setPlanDialogOpen(false);
    fetchPlans();
  };

  const deletePlan = async (id: string) => {
    if (!confirm("هل تريد حذف هذه الباقة؟")) return;
    const { error } = await db.from("telegram_plans").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("تم الحذف"); fetchPlans(); }
  };

  const copyText = (text: string) => { navigator.clipboard.writeText(text); toast.success("تم النسخ!"); };

  const toggleSessionVisibility = (sessionId: string) => {
    setVisibleSessions(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId); else next.add(sessionId);
      return next;
    });
  };

  const getStatusBadge = (sub: Subscription) => {
    const isExpired = new Date(sub.ends_at) < new Date();
    if (isExpired) return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> منتهي</Badge>;
    if (sub.is_trial) return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> تجريبي</Badge>;
    if (sub.status === "active") return <Badge className="gap-1 bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30"><CheckCircle2 className="h-3 w-3" /> مشترك</Badge>;
    return <Badge variant="outline">{sub.status}</Badge>;
  };

  const getDurationLabel = (sub: Subscription) => {
    const days = Math.ceil((new Date(sub.ends_at).getTime() - new Date(sub.starts_at).getTime()) / (1000 * 60 * 60 * 24));
    if (days <= 1) return "يوم واحد";
    if (days <= 30) return `${days} يوم`;
    if (days <= 90) return "3 أشهر";
    if (days <= 180) return "6 أشهر";
    return "سنة";
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Radio className="h-6 w-6 text-primary" /> التحكم في Telegram
        </h2>
        <p className="text-muted-foreground mt-1">إدارة الباقات والمشتركين والجلسات</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 h-10">
          <TabsTrigger value="subscribers" className="gap-1.5"><Users className="h-4 w-4" /> المشتركين ({subscribers.length})</TabsTrigger>
          <TabsTrigger value="plans" className="gap-1.5"><Crown className="h-4 w-4" /> الباقات ({plans.length})</TabsTrigger>
        </TabsList>

        {/* Subscribers Tab */}
        <TabsContent value="subscribers" className="mt-4">
          {subscribers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>لا يوجد مشتركين حالياً</p>
            </div>
          ) : (
            <div className="space-y-3">
              {subscribers.map(({ subscription: sub, email, sessions_count, sessions }) => {
                const isExpanded = expandedUser === sub.id;
                return (
                  <div key={sub.id} className="rounded-xl border border-border bg-card overflow-hidden">
                    {/* Summary row */}
                    <div
                      className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setExpandedUser(isExpanded ? null : sub.id)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2">
                            <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="font-mono text-sm truncate">{email || "—"}</span>
                            {email && (
                              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={e => { e.stopPropagation(); copyText(email); }}>
                                <Copy className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>{getDurationLabel(sub)}</span>
                            <span>•</span>
                            <span>ينتهي: {new Date(sub.ends_at).toLocaleDateString("ar-SA")}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {getStatusBadge(sub)}
                        <Badge variant="outline" className="gap-1">
                          <Bot className="h-3 w-3" /> {sessions_count} / {sub.max_sessions}
                        </Badge>
                      </div>
                    </div>

                    {/* Expanded session details */}
                    {isExpanded && (
                      <div className="border-t border-border bg-muted/30 p-4 space-y-3">
                        <div className="text-sm font-semibold text-muted-foreground mb-2">
                          الجلسات ({sessions.length})
                        </div>
                        {sessions.length === 0 ? (
                          <p className="text-sm text-muted-foreground">لا توجد جلسات مسجلة</p>
                        ) : (
                          sessions.map(sess => {
                            const tgUser = typeof sess.telegram_user === "string"
                              ? (() => { try { return JSON.parse(sess.telegram_user); } catch { return null; } })()
                              : sess.telegram_user;
                            const isVisible = visibleSessions.has(sess.id);
                            return (
                              <div key={sess.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                                {tgUser && (
                                  <div className="flex items-center gap-2 text-sm">
                                    <span className="font-medium">{tgUser.firstName} {tgUser.lastName || ""}</span>
                                    {tgUser.username && <span className="text-muted-foreground">@{tgUser.username}</span>}
                                    {tgUser.phone && <span className="text-muted-foreground font-mono">{tgUser.phone}</span>}
                                  </div>
                                )}
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-muted rounded-md p-2 font-mono text-xs break-all" dir="ltr">
                                    {isVisible ? sess.session_string : "••••••••••••••••••••••••••••"}
                                  </div>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => toggleSessionVisibility(sess.id)}>
                                    {isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copyText(sess.session_string)}>
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Plans Tab */}
        <TabsContent value="plans" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => openPlanDialog()} className="gap-2"><Plus className="h-4 w-4" /> إضافة باقة</Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {plans.map(plan => (
              <div key={plan.id} className={`rounded-xl border p-5 space-y-3 ${plan.is_active ? "border-primary/30 bg-primary/5" : "border-border opacity-60"}`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg">{plan.name}</h3>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openPlanDialog(plan)}><Edit className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deletePlan(plan.id)} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-primary">${plan.price}</span>
                  <span className="text-muted-foreground text-sm">/ {plan.duration_days} يوم</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1"><Bot className="h-4 w-4" /> {plan.max_sessions} جلسة أساسية</span>
                  <span className="flex items-center gap-1"><CreditCard className="h-4 w-4" /> +${plan.price_per_extra_session} / جلسة إضافية</span>
                </div>
                <ul className="space-y-1">
                  {plan.features.map((f, i) => (
                    <li key={i} className="text-sm flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                {!plan.is_active && <Badge variant="secondary">معطلة</Badge>}
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Plan Dialog */}
      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editPlan ? "تعديل الباقة" : "إضافة باقة جديدة"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>اسم الباقة</Label>
              <Input value={planForm.name} onChange={e => setPlanForm({ ...planForm, name: e.target.value })} placeholder="مثال: شهر واحد" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>المدة (أيام)</Label>
                <Input type="number" value={planForm.duration_days} onChange={e => setPlanForm({ ...planForm, duration_days: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>السعر ($)</Label>
                <Input type="number" value={planForm.price} onChange={e => setPlanForm({ ...planForm, price: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>الجلسات الأساسية</Label>
                <Input type="number" value={planForm.max_sessions} onChange={e => setPlanForm({ ...planForm, max_sessions: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>سعر الجلسة الإضافية ($)</Label>
                <Input type="number" value={planForm.price_per_extra_session} onChange={e => setPlanForm({ ...planForm, price_per_extra_session: e.target.value })} />
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
