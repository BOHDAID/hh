import { useState, useEffect } from "react";
import { db } from "@/lib/supabaseClient";
import { useTranslation } from "react-i18next";
import { 
  Shield, Monitor, Smartphone, Globe, Clock, 
  AlertTriangle, CheckCircle, Loader2, ChevronDown, ChevronUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateShortArabic } from "@/lib/formatDate";

interface LoginSession {
  id: string;
  device_type: string;
  browser: string;
  os: string;
  ip_address: string | null;
  country: string | null;
  city: string | null;
  is_current: boolean;
  is_suspicious: boolean;
  created_at: string;
}

const SecurityLog = ({ userId }: { userId: string }) => {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === "ar";
  const [sessions, setSessions] = useState<LoginSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await db
        .from("login_sessions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      setSessions((data as LoginSession[]) || []);
      setLoading(false);
    };
    fetch();
  }, [userId]);

  const markSuspicious = async (sessionId: string) => {
    await db
      .from("login_sessions")
      .update({ is_suspicious: true })
      .eq("id", sessionId);
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, is_suspicious: true } : s))
    );
  };

  const visibleSessions = expanded ? sessions : sessions.slice(0, 5);

  if (loading) {
    return (
      <div className="glass rounded-2xl p-6 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-lg bg-primary/20">
          <Shield className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-bold text-foreground">
            {isRTL ? "سجل الأمان" : "Security Log"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {isRTL ? "آخر عمليات تسجيل الدخول" : "Recent login activity"}
          </p>
        </div>
      </div>

      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          {isRTL ? "لا توجد جلسات مسجلة بعد" : "No sessions recorded yet"}
        </p>
      ) : (
        <div className="space-y-3">
          {visibleSessions.map((session) => (
            <div
              key={session.id}
              className={`relative rounded-xl border p-4 transition-all ${
                session.is_current
                  ? "border-primary/40 bg-primary/5"
                  : session.is_suspicious
                  ? "border-destructive/40 bg-destructive/5"
                  : "border-border bg-card/50"
              }`}
            >
              {/* Current badge */}
              {session.is_current && (
                <span className="absolute top-2 end-2 text-[10px] font-semibold bg-primary/20 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  {isRTL ? "الجلسة الحالية" : "Current"}
                </span>
              )}

              {/* Suspicious badge */}
              {session.is_suspicious && (
                <span className="absolute top-2 end-2 text-[10px] font-semibold bg-destructive/20 text-destructive px-2 py-0.5 rounded-full flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {isRTL ? "مشبوه" : "Suspicious"}
                </span>
              )}

              <div className="flex items-start gap-3">
                {/* Device icon */}
                <div className="p-2 rounded-lg bg-muted/50 mt-0.5">
                  {session.device_type === "mobile" ? (
                    <Smartphone className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Browser + OS */}
                  <p className="text-sm font-medium text-foreground">
                    {session.browser} · {session.os}
                  </p>

                  {/* Location */}
                  <div className="flex items-center gap-1 mt-1">
                    <Globe className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {[session.city, session.country].filter(Boolean).join(", ") ||
                        (isRTL ? "غير معروف" : "Unknown")}
                    </span>
                  </div>

                  {/* Time */}
                  <div className="flex items-center gap-1 mt-1">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground" dir="ltr">
                      {isRTL
                        ? formatDateShortArabic(session.created_at)
                        : new Date(session.created_at).toLocaleString("en-US", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                    </span>
                  </div>

                  {/* IP */}
                  {session.ip_address && (
                    <p className="text-[10px] text-muted-foreground/60 mt-1 font-mono" dir="ltr">
                      IP: {session.ip_address}
                    </p>
                  )}
                </div>
              </div>

              {/* Not me button */}
              {!session.is_current && !session.is_suspicious && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 w-full"
                  onClick={() => markSuspicious(session.id)}
                >
                  <AlertTriangle className="h-3 w-3 me-1" />
                  {isRTL ? "مو أنا!" : "Not me!"}
                </Button>
              )}
            </div>
          ))}

          {/* Show more/less */}
          {sessions.length > 5 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3 w-3 me-1" />
                  {isRTL ? "عرض أقل" : "Show less"}
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3 me-1" />
                  {isRTL
                    ? `عرض الكل (${sessions.length})`
                    : `Show all (${sessions.length})`}
                </>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default SecurityLog;
