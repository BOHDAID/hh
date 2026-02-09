import { useState, useEffect } from "react";
import { db } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Users,
  UserPlus,
  Trash2,
  Edit,
  Loader2,
  Shield,
  ShieldCheck,
  Headphones,
  Crown,
} from "lucide-react";

type AppRole = "admin" | "full_access" | "support" | "user";

interface TeamMember {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
  profile?: {
    email: string | null;
    full_name: string | null;
  };
}

const roleConfig: Record<AppRole, { label: string; icon: React.ReactNode; color: string; description: string }> = {
  admin: {
    label: "مالك (Admin)",
    icon: <Crown className="h-4 w-4" />,
    color: "bg-yellow-500/20 text-yellow-600",
    description: "صلاحيات كاملة على كل شيء",
  },
  full_access: {
    label: "وصول كامل",
    icon: <ShieldCheck className="h-4 w-4" />,
    color: "bg-green-500/20 text-green-600",
    description: "كل شيء ماعدا إعدادات الدفع",
  },
  support: {
    label: "دعم فني",
    icon: <Headphones className="h-4 w-4" />,
    color: "bg-blue-500/20 text-blue-600",
    description: "الرسائل وطلبات المنتجات فقط",
  },
  user: {
    label: "مستخدم عادي",
    icon: <Shield className="h-4 w-4" />,
    color: "bg-muted text-muted-foreground",
    description: "لا يستطيع الوصول للوحة التحكم",
  },
};

const TeamTab = () => {
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<AppRole>("support");
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentUser();
    fetchTeamMembers();
  }, []);

  const fetchCurrentUser = async () => {
    const { data: { session } } = await db.auth.getSession();
    if (session) {
      setCurrentUserId(session.user.id);
    }
  };

  const fetchTeamMembers = async () => {
    setLoading(true);
    
    // Get all users with roles that aren't just 'user'
    const { data: roles, error } = await db
      .from("user_roles")
      .select("*")
      .in("role", ["admin", "full_access", "support"]);

    if (error) {
      console.error("Error fetching team:", error);
      setLoading(false);
      return;
    }

    // Fetch profiles for these users
    if (roles && roles.length > 0) {
      const userIds = roles.map((r) => r.user_id);
      const { data: profiles } = await db
        .from("profiles")
        .select("user_id, email, full_name")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);

      const membersWithProfiles: TeamMember[] = roles.map((r) => ({
        ...r,
        profile: profileMap.get(r.user_id) || { email: null, full_name: null },
      }));

      setTeamMembers(membersWithProfiles);
    } else {
      setTeamMembers([]);
    }

    setLoading(false);
  };

  const handleAddMember = async () => {
    if (!newMemberEmail.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال البريد الإلكتروني",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      // Find user by email in profiles
      const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("user_id, email")
        .eq("email", newMemberEmail.trim())
        .maybeSingle();

      if (profileError || !profile) {
        toast({
          title: "خطأ",
          description: "لم يتم العثور على مستخدم بهذا البريد الإلكتروني. تأكد أنه مسجل في الموقع.",
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      // Check if user already has a team role
      const { data: existingRole } = await db
        .from("user_roles")
        .select("*")
        .eq("user_id", profile.user_id)
        .maybeSingle();

      if (existingRole && ["admin", "full_access", "support"].includes(existingRole.role)) {
        toast({
          title: "خطأ",
          description: "هذا المستخدم لديه دور في الفريق بالفعل",
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      // Update or insert role
      if (existingRole) {
        const { error } = await db
          .from("user_roles")
          .update({ role: newMemberRole })
          .eq("id", existingRole.id);

        if (error) throw error;
      } else {
        const { error } = await db
          .from("user_roles")
          .insert({ user_id: profile.user_id, role: newMemberRole });

        if (error) throw error;
      }

      toast({
        title: "تم الإضافة",
        description: `تم إضافة ${newMemberEmail} للفريق بنجاح`,
      });

      setAddDialogOpen(false);
      setNewMemberEmail("");
      setNewMemberRole("support");
      fetchTeamMembers();
    } catch (error) {
      console.error("Error adding member:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء إضافة العضو",
        variant: "destructive",
      });
    }

    setSaving(false);
  };

  const handleUpdateRole = async () => {
    if (!selectedMember) return;

    setSaving(true);

    try {
      const { error } = await db
        .from("user_roles")
        .update({ role: newMemberRole })
        .eq("id", selectedMember.id);

      if (error) throw error;

      toast({
        title: "تم التحديث",
        description: "تم تحديث صلاحيات العضو بنجاح",
      });

      setEditDialogOpen(false);
      setSelectedMember(null);
      fetchTeamMembers();
    } catch (error) {
      console.error("Error updating role:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء تحديث الصلاحيات",
        variant: "destructive",
      });
    }

    setSaving(false);
  };

  const handleRemoveMember = async (member: TeamMember) => {
    if (member.role === "admin") {
      toast({
        title: "خطأ",
        description: "لا يمكن حذف المالك",
        variant: "destructive",
      });
      return;
    }

    if (!confirm(`هل أنت متأكد من إزالة ${member.profile?.email} من الفريق؟`)) {
      return;
    }

    try {
      // Change role to 'user' instead of deleting
      const { error } = await db
        .from("user_roles")
        .update({ role: "user" })
        .eq("id", member.id);

      if (error) throw error;

      toast({
        title: "تم الحذف",
        description: "تم إزالة العضو من الفريق",
      });

      fetchTeamMembers();
    } catch (error) {
      console.error("Error removing member:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء إزالة العضو",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (member: TeamMember) => {
    setSelectedMember(member);
    setNewMemberRole(member.role);
    setEditDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">فريق العمل</h1>
          <p className="text-muted-foreground text-sm mt-1">
            إدارة أعضاء الفريق وصلاحياتهم
          </p>
        </div>
        <Button variant="hero" onClick={() => setAddDialogOpen(true)} className="gap-2">
          <UserPlus className="h-5 w-5" />
          إضافة عضو
        </Button>
      </div>

      {/* Role Legend */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {(["full_access", "support"] as AppRole[]).map((role) => (
          <div key={role} className="glass rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className={`p-2 rounded-lg ${roleConfig[role].color}`}>
                {roleConfig[role].icon}
              </span>
              <span className="font-semibold">{roleConfig[role].label}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {roleConfig[role].description}
            </p>
          </div>
        ))}
      </div>

      {/* Team Members List */}
      <div className="space-y-3">
        {teamMembers.map((member) => (
          <div
            key={member.id}
            className="glass rounded-xl p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${roleConfig[member.role].color}`}>
                {roleConfig[member.role].icon}
              </div>
              <div>
                <p className="font-semibold text-foreground">
                  {member.profile?.full_name || "بدون اسم"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {member.profile?.email || "بدون بريد"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Badge className={roleConfig[member.role].color}>
                {roleConfig[member.role].label}
              </Badge>

              {member.role !== "admin" && member.user_id !== currentUserId && (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditDialog(member)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => handleRemoveMember(member)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {member.role === "admin" && (
                <span className="text-xs text-muted-foreground">المالك</span>
              )}
            </div>
          </div>
        ))}

        {teamMembers.length === 0 && (
          <div className="text-center py-12">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">لا يوجد أعضاء في الفريق</p>
          </div>
        )}
      </div>

      {/* Add Member Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="glass max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة عضو جديد للفريق</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>البريد الإلكتروني</Label>
              <Input
                type="email"
                value={newMemberEmail}
                onChange={(e) => setNewMemberEmail(e.target.value)}
                placeholder="example@email.com"
                className="glass"
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground">
                يجب أن يكون المستخدم مسجل في الموقع مسبقاً
              </p>
            </div>

            <div className="space-y-2">
              <Label>الصلاحية</Label>
              <Select
                value={newMemberRole}
                onValueChange={(value: AppRole) => setNewMemberRole(value)}
              >
                <SelectTrigger className="glass">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_access">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4" />
                      وصول كامل
                    </div>
                  </SelectItem>
                  <SelectItem value="support">
                    <div className="flex items-center gap-2">
                      <Headphones className="h-4 w-4" />
                      دعم فني
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="ghost" onClick={() => setAddDialogOpen(false)}>
                إلغاء
              </Button>
              <Button variant="hero" onClick={handleAddMember} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "إضافة"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="glass max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل صلاحيات العضو</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              تعديل صلاحيات: {selectedMember?.profile?.email}
            </p>

            <div className="space-y-2">
              <Label>الصلاحية الجديدة</Label>
              <Select
                value={newMemberRole}
                onValueChange={(value: AppRole) => setNewMemberRole(value)}
              >
                <SelectTrigger className="glass">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_access">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4" />
                      وصول كامل
                    </div>
                  </SelectItem>
                  <SelectItem value="support">
                    <div className="flex items-center gap-2">
                      <Headphones className="h-4 w-4" />
                      دعم فني
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="ghost" onClick={() => setEditDialogOpen(false)}>
                إلغاء
              </Button>
              <Button variant="hero" onClick={handleUpdateRole} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeamTab;
