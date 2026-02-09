import { useState, useEffect } from "react";
import { db } from "@/lib/supabaseClient";
import { Loader2, Users, TrendingUp, Link } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Affiliate {
  id: string;
  user_id: string;
  referral_code: string;
  total_referrals: number;
  total_earnings: number;
  created_at: string;
  profiles?: {
    email: string | null;
    full_name: string | null;
  };
}

const AffiliatesTab = () => {
  const [loading, setLoading] = useState(true);
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [stats, setStats] = useState({
    totalAffiliates: 0,
    totalReferrals: 0,
    totalEarnings: 0,
  });

  useEffect(() => {
    fetchAffiliates();
  }, []);

  const fetchAffiliates = async () => {
    const { data, error } = await db
      .from("affiliates")
      .select("*")
      .order("total_earnings", { ascending: false });

    if (data) {
      // جلب معلومات المستخدمين
      const affiliatesWithProfiles = await Promise.all(
        data.map(async (affiliate) => {
          const { data: profile } = await db
            .from("profiles")
            .select("email, full_name")
            .eq("user_id", affiliate.user_id)
            .maybeSingle();

          return {
            ...affiliate,
            profiles: profile,
          };
        })
      );

      setAffiliates(affiliatesWithProfiles);

      // حساب الإحصائيات
      const totalReferrals = data.reduce((sum, a) => sum + a.total_referrals, 0);
      const totalEarnings = data.reduce((sum, a) => sum + Number(a.total_earnings), 0);

      setStats({
        totalAffiliates: data.length,
        totalReferrals,
        totalEarnings,
      });
    }

    setLoading(false);
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
      <h1 className="text-2xl font-bold text-foreground mb-8">إدارة المسوقين</h1>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <Card className="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              إجمالي المسوقين
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              {stats.totalAffiliates}
            </p>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Link className="h-4 w-4" />
              إجمالي الإحالات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              {stats.totalReferrals}
            </p>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              إجمالي العمولات المدفوعة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">
              ${stats.totalEarnings}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Affiliates List */}
      {affiliates.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          لا يوجد مسوقين بعد
        </div>
      ) : (
        <div className="space-y-3">
          {affiliates.map((affiliate) => (
            <div key={affiliate.id} className="glass rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">
                    {affiliate.profiles?.full_name || "بدون اسم"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {affiliate.profiles?.email}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                      {affiliate.referral_code}
                    </code>
                  </div>
                </div>

                <div className="text-left">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">الإحالات</p>
                      <p className="font-bold text-foreground">
                        {affiliate.total_referrals}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">الأرباح</p>
                      <p className="font-bold text-primary">
                        ${affiliate.total_earnings}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AffiliatesTab;
