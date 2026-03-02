import { useState, useRef, useEffect } from "react";
import { User, Edit3, Camera, Loader2, Save, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { invokeCloudFunctionPublic } from "@/lib/cloudFunctions";

interface TelegramProfile {
  id: string;
  firstName: string;
  lastName: string;
  username: string | null;
  phone: string | null;
  photo: string | null;
  about: string;
}

interface TelegramProfileCardProps {
  sessionString: string;
  initialUser: { id: string; firstName: string; lastName: string; username: string; phone: string } | null;
  onLogout: () => void;
}

const TelegramProfileCard = ({ sessionString, initialUser, onLogout }: TelegramProfileCardProps) => {
  const [profile, setProfile] = useState<TelegramProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Edit fields
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editAbout, setEditAbout] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const callAction = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await invokeCloudFunctionPublic<any>("osn-session", { action, ...extra });
    if (error) throw new Error(error.message);
    if (data && !data.success) throw new Error(data.error || "فشل غير متوقع");
    return data;
  };

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const result = await callAction("tg-get-profile", { sessionString });
      setProfile(result.profile);
    } catch (err: any) {
      console.error("Profile fetch failed:", err.message);
      toast.error("تعذر تحميل البروفايل: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch profile on mount
  useEffect(() => {
    if (sessionString) {
      fetchProfile();
    }
  }, [sessionString]);

  const startEdit = () => {
    if (profile) {
      setEditFirstName(profile.firstName);
      setEditLastName(profile.lastName);
      setEditAbout(profile.about);
    }
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await callAction("tg-update-profile", {
        sessionString,
        firstName: editFirstName,
        lastName: editLastName,
        about: editAbout,
      });
      // تحديث البروفايل المحلي
      setProfile(prev => prev ? { ...prev, firstName: editFirstName, lastName: editLastName, about: editAbout } : null);
      setEditing(false);
      toast.success("تم تحديث البروفايل!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("الحجم الأقصى للصورة 5MB");
      return;
    }

    setUploadingPhoto(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        try {
          await callAction("tg-update-profile-photo", { sessionString, photoBase64: base64 });
          setProfile(prev => prev ? { ...prev, photo: base64 } : null);
          toast.success("تم تحديث الصورة!");
        } catch (err: any) {
          toast.error(err.message);
        } finally {
          setUploadingPhoto(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setUploadingPhoto(false);
    }
  };

  const deletePhoto = async () => {
    setUploadingPhoto(true);
    try {
      await callAction("tg-delete-profile-photo", { sessionString });
      setProfile(prev => prev ? { ...prev, photo: null } : null);
      toast.success("تم حذف الصورة");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  // العرض الأولي - قبل جلب البروفايل الكامل
  const displayData = profile || (initialUser ? {
    id: initialUser.id,
    firstName: initialUser.firstName,
    lastName: initialUser.lastName,
    username: initialUser.username,
    phone: initialUser.phone,
    photo: null as string | null,
    about: "",
  } : null);

  if (!displayData) return null;

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      {/* Header gradient */}
      <div className="h-20 bg-gradient-to-l from-primary/20 via-primary/10 to-transparent" />

      <div className="px-6 pb-6 -mt-10">
        <div className="flex items-end gap-4 mb-4">
          {/* Avatar */}
          <div className="relative group">
            <div className="h-20 w-20 rounded-2xl bg-muted border-4 border-card flex items-center justify-center overflow-hidden shadow-lg">
              {displayData.photo ? (
                <img src={displayData.photo} alt="" className="h-full w-full object-cover" />
              ) : (
                <User className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            {profile && (
              <div className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                >
                  {uploadingPhoto ? <Loader2 className="h-3.5 w-3.5 text-white animate-spin" /> : <Camera className="h-3.5 w-3.5 text-white" />}
                </button>
                {displayData.photo && (
                  <button
                    onClick={deletePhoto}
                    disabled={uploadingPhoto}
                    className="p-1.5 rounded-lg bg-white/20 hover:bg-destructive/80 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-white" />
                  </button>
                )}
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
          </div>

          {/* Name & info */}
          <div className="flex-1 min-w-0 pb-1">
            <h3 className="font-bold text-lg text-foreground truncate">
              {displayData.firstName} {displayData.lastName}
            </h3>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              {displayData.username && <span dir="ltr">@{displayData.username}</span>}
              {displayData.phone && <span dir="ltr">+{displayData.phone}</span>}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pb-1">
            {!profile && !loading ? (
              <Button variant="outline" size="sm" onClick={fetchProfile} disabled={loading} className="gap-1.5 text-xs">
                <Edit3 className="h-3.5 w-3.5" />
                تحميل البروفايل
              </Button>
            ) : loading ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> جاري التحميل...
              </div>
            ) : !editing ? (
              <Button variant="outline" size="sm" onClick={startEdit} className="gap-1.5 text-xs">
                <Edit3 className="h-3.5 w-3.5" /> تعديل
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={onLogout} className="text-xs text-destructive hover:text-destructive">
              قطع الاتصال
            </Button>
          </div>
        </div>

        {/* Bio (view) */}
        {profile && !editing && profile.about && (
          <p className="text-sm text-muted-foreground bg-muted/50 rounded-xl p-3 border border-border">
            {profile.about}
          </p>
        )}

        {/* Edit form */}
        {editing && (
          <div className="space-y-3 bg-muted/30 rounded-xl p-4 border border-border">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">الاسم الأول</Label>
                <Input value={editFirstName} onChange={e => setEditFirstName(e.target.value)} dir="auto" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">اسم العائلة</Label>
                <Input value={editLastName} onChange={e => setEditLastName(e.target.value)} dir="auto" className="h-9 text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">النبذة (Bio)</Label>
              <Textarea
                value={editAbout}
                onChange={e => setEditAbout(e.target.value)}
                placeholder="اكتب نبذة عنك..."
                className="min-h-[60px] text-sm resize-none"
                maxLength={70}
                dir="auto"
              />
              <p className="text-[10px] text-muted-foreground text-left" dir="ltr">{editAbout.length}/70</p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={cancelEdit} className="gap-1 text-xs">
                <X className="h-3.5 w-3.5" /> إلغاء
              </Button>
              <Button size="sm" onClick={saveProfile} disabled={saving} className="gap-1 text-xs">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                حفظ
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TelegramProfileCard;
