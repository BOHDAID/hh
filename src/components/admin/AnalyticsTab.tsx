import { useState, useEffect } from "react";
import { db } from "@/lib/supabaseClient";
import { 
  BarChart3, 
  Globe, 
  TrendingUp, 
  Users, 
  Monitor, 
  Smartphone,
  Calendar,
  RefreshCw,
  ShoppingCart,
  DollarSign,
  UserPlus,
  Package,
  Link2,
  ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface VisitStats {
  total: number;
  today: number;
  thisWeek: number;
  thisMonth: number;
  uniqueVisitors: number;
}

interface UserStats {
  totalUsers: number;
  newUsersToday: number;
  newUsersWeek: number;
  conversionRate: number;
}

interface SalesStats {
  totalSales: number;
  ordersCount: number;
  completedOrders: number;
  averageOrderValue: number;
}

interface CountryData {
  country_code: string;
  country_name: string;
  count: number;
}

interface PageData {
  page_path: string;
  count: number;
}

interface DeviceData {
  device_type: string;
  count: number;
}

interface ReferrerData {
  referrer: string;
  count: number;
}

// Country code to name mapping for fallback
const countryNames: Record<string, string> = {
  NL: "هولندا", US: "الولايات المتحدة", GB: "المملكة المتحدة", DE: "ألمانيا",
  FR: "فرنسا", SA: "السعودية", AE: "الإمارات", EG: "مصر", MA: "المغرب",
  DZ: "الجزائر", TN: "تونس", IQ: "العراق", JO: "الأردن", LB: "لبنان",
  SY: "سوريا", KW: "الكويت", QA: "قطر", BH: "البحرين", OM: "عُمان",
  YE: "اليمن", LY: "ليبيا", SD: "السودان", PS: "فلسطين", TR: "تركيا",
  CA: "كندا", AU: "أستراليا", IT: "إيطاليا", ES: "إسبانيا", BR: "البرازيل",
  IN: "الهند", CN: "الصين", JP: "اليابان", KR: "كوريا الجنوبية", RU: "روسيا",
};

// Country flag emoji helper
const getCountryFlag = (countryCode: string): string => {
  if (!countryCode || countryCode.length !== 2) return "🌍";
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

// Get country name with fallback
const getCountryName = (code: string, name: string | null): string => {
  if (name) return name;
  return countryNames[code?.toUpperCase()] || code || "غير معروف";
};

const AnalyticsTab = () => {
  const [stats, setStats] = useState<VisitStats>({
    total: 0,
    today: 0,
    thisWeek: 0,
    thisMonth: 0,
    uniqueVisitors: 0,
  });
  const [userStats, setUserStats] = useState<UserStats>({
    totalUsers: 0,
    newUsersToday: 0,
    newUsersWeek: 0,
    conversionRate: 0,
  });
  const [salesStats, setSalesStats] = useState<SalesStats>({
    totalSales: 0,
    ordersCount: 0,
    completedOrders: 0,
    averageOrderValue: 0,
  });
  const [countries, setCountries] = useState<CountryData[]>([]);
  const [pages, setPages] = useState<PageData[]>([]);
  const [devices, setDevices] = useState<DeviceData[]>([]);
  const [referrers, setReferrers] = useState<ReferrerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState("month");

  // Helper function to fetch all rows with pagination (bypasses 1000 row limit)
  const fetchAllRows = async <T,>(
    table: string,
    select: string,
    filters?: { column: string; operator: string; value: string | null }[]
  ): Promise<T[]> => {
    const allData: T[] = [];
    let offset = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      let query = db.from(table).select(select).range(offset, offset + batchSize - 1);
      
      // Apply filters
      if (filters) {
        for (const filter of filters) {
          if (filter.operator === "gte") {
            query = query.gte(filter.column, filter.value);
          } else if (filter.operator === "not.is") {
            query = query.not(filter.column, "is", filter.value);
          }
        }
      }

      const { data, error } = await query;

      if (error) {
        console.error(`Error fetching ${table}:`, error);
        break;
      }

      if (data && data.length > 0) {
        allData.push(...(data as T[]));
        offset += batchSize;
        hasMore = data.length === batchSize;
      } else {
        hasMore = false;
      }
    }

    return allData;
  };

  const fetchAnalytics = async () => {
    setLoading(true);
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    try {
      // ========== VISITS from External DB ==========
      // Total visits - using count: "exact" for accurate count
      const { count: totalCount } = await db
        .from("page_visits")
        .select("*", { count: "exact", head: true });

      // Today's visits
      const { count: todayCount } = await db
        .from("page_visits")
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayStart);

      // This week's visits
      const { count: weekCount } = await db
        .from("page_visits")
        .select("*", { count: "exact", head: true })
        .gte("created_at", weekStart);

      // This month's visits
      const { count: monthCount } = await db
        .from("page_visits")
        .select("*", { count: "exact", head: true })
        .gte("created_at", monthStart);

      // Unique visitors (by IP hash) - fetch all with pagination
      const uniqueData = await fetchAllRows<{ ip_hash: string }>(
        "page_visits",
        "ip_hash",
        [{ column: "created_at", operator: "gte", value: monthStart }]
      );
      
      const uniqueVisitors = new Set(uniqueData.map((v) => v.ip_hash)).size;

      setStats({
        total: totalCount || 0,
        today: todayCount || 0,
        thisWeek: weekCount || 0,
        thisMonth: monthCount || 0,
        uniqueVisitors,
      });

      // User stats
      const { count: totalUsersCount } = await db
        .from("profiles")
        .select("*", { count: "exact", head: true });

      const { count: newUsersTodayCount } = await db
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayStart);

      const { count: newUsersWeekCount } = await db
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("created_at", weekStart);

      // Calculate conversion rate (users / unique visitors)
      const conversionRate = uniqueVisitors > 0 
        ? ((totalUsersCount || 0) / uniqueVisitors * 100) 
        : 0;

      setUserStats({
        totalUsers: totalUsersCount || 0,
        newUsersToday: newUsersTodayCount || 0,
        newUsersWeek: newUsersWeekCount || 0,
        conversionRate: Math.min(conversionRate, 100),
      });

      // Sales stats
      const { data: ordersData } = await db
        .from("orders")
        .select("total_amount, status");

      if (ordersData) {
        const completedOrders = ordersData.filter(o => o.status === "completed");
        const totalSales = completedOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);
        const avgValue = completedOrders.length > 0 ? totalSales / completedOrders.length : 0;

        setSalesStats({
          totalSales,
          ordersCount: ordersData.length,
          completedOrders: completedOrders.length,
          averageOrderValue: avgValue,
        });
      }

      // Get date filter
      let dateFilter: string | null = monthStart;
      if (dateRange === "today") dateFilter = todayStart;
      else if (dateRange === "week") dateFilter = weekStart;
      else if (dateRange === "month") dateFilter = monthStart;
      else if (dateRange === "year") {
        dateFilter = new Date(now.getFullYear(), 0, 1).toISOString();
      } else if (dateRange === "all") {
        dateFilter = null; // no filter
      }

      // Country stats - fetch ALL data with pagination to avoid 1000 row limit
      const dateFilters = dateFilter 
        ? [{ column: "created_at", operator: "gte", value: dateFilter }] 
        : [];
      
      const countryData = await fetchAllRows<{ country_code: string; country_name: string }>(
        "page_visits",
        "country_code, country_name",
        [
          ...dateFilters,
          { column: "country_code", operator: "not.is", value: null }
        ]
      );

      if (countryData && countryData.length > 0) {
        const countryMap = new Map<string, { name: string; count: number }>();
        countryData.forEach((visit) => {
          const code = visit.country_code || "";
          const existing = countryMap.get(code);
          if (existing) {
            existing.count++;
          } else {
            countryMap.set(code, {
              name: getCountryName(visit.country_code, visit.country_name),
              count: 1,
            });
          }
        });
        
        const sortedCountries = Array.from(countryMap.entries())
          .map(([code, data]) => ({
            country_code: code,
            country_name: data.name,
            count: data.count,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        
        setCountries(sortedCountries);
      }

      // Page stats - fetch ALL with pagination
      const pageData = await fetchAllRows<{ page_path: string }>(
        "page_visits",
        "page_path",
        dateFilters.length > 0 ? dateFilters : undefined
      );

      if (pageData && pageData.length > 0) {
        const pageMap = new Map<string, number>();
        pageData.forEach((visit) => {
          const existing = pageMap.get(visit.page_path) || 0;
          pageMap.set(visit.page_path, existing + 1);
        });
        
        const sortedPages = Array.from(pageMap.entries())
          .map(([path, count]) => ({ page_path: path, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        
        setPages(sortedPages);
      }

      // Device stats - fetch ALL with pagination
      const deviceData = await fetchAllRows<{ device_type: string }>(
        "page_visits",
        "device_type",
        dateFilters.length > 0 ? dateFilters : undefined
      );

      if (deviceData && deviceData.length > 0) {
        const deviceMap = new Map<string, number>();
        deviceData.forEach((visit) => {
          const type = visit.device_type || "desktop";
          const existing = deviceMap.get(type) || 0;
          deviceMap.set(type, existing + 1);
        });
        
        const sortedDevices = Array.from(deviceMap.entries())
          .map(([type, count]) => ({ device_type: type, count }))
          .sort((a, b) => b.count - a.count);
        
        setDevices(sortedDevices);
      }

      // Referrer stats - fetch ALL with pagination
      const referrerData = await fetchAllRows<{ referrer: string }>(
        "page_visits",
        "referrer",
        [
          ...dateFilters,
          { column: "referrer", operator: "not.is", value: null }
        ]
      );

      if (referrerData && referrerData.length > 0) {
        const referrerMap = new Map<string, number>();
        referrerData.forEach((visit) => {
          if (visit.referrer && visit.referrer.trim() !== "") {
            // Extract domain from referrer URL
            let domain = visit.referrer;
            try {
              const url = new URL(visit.referrer);
              domain = url.hostname.replace("www.", "");
            } catch {
              // Keep as-is if not a valid URL
            }
            const existing = referrerMap.get(domain) || 0;
            referrerMap.set(domain, existing + 1);
          }
        });
        
        const sortedReferrers = Array.from(referrerMap.entries())
          .map(([referrer, count]) => ({ referrer, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        
        setReferrers(sortedReferrers);
      } else {
        setReferrers([]);
      }
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchAnalytics();
  }, [dateRange]);

  const totalDevices = devices.reduce((sum, d) => sum + d.count, 0);
  const totalCountryVisits = countries.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">📊 لوحة الإحصائيات</h1>
          <p className="text-muted-foreground">نظرة شاملة على أداء متجرك</p>
        </div>
        <div className="flex items-center gap-3">
           <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">اليوم</SelectItem>
              <SelectItem value="week">الأسبوع</SelectItem>
              <SelectItem value="month">الشهر</SelectItem>
              <SelectItem value="year">السنة</SelectItem>
              <SelectItem value="all">الكل</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchAnalytics} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">${salesStats.totalSales.toFixed(2)}</p>
              <p className="text-sm text-muted-foreground">إجمالي المبيعات</p>
            </div>
          </div>
        </div>

        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <ShoppingCart className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{salesStats.completedOrders}</p>
              <p className="text-sm text-muted-foreground">طلب مكتمل</p>
            </div>
          </div>
        </div>

        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Users className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{userStats.totalUsers}</p>
              <p className="text-sm text-muted-foreground">مستخدم مسجل</p>
            </div>
          </div>
        </div>

        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Package className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">${salesStats.averageOrderValue.toFixed(2)}</p>
              <p className="text-sm text-muted-foreground">متوسط الطلب</p>
            </div>
          </div>
        </div>
      </div>

      {/* Visit Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.total.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">إجمالي الزيارات</p>
            </div>
          </div>
        </div>

        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <TrendingUp className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.today.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">زوار اليوم</p>
            </div>
          </div>
        </div>

        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Calendar className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.thisWeek.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">هذا الأسبوع</p>
            </div>
          </div>
        </div>

        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/20">
              <Users className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.uniqueVisitors.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">زوار فريدين</p>
            </div>
          </div>
        </div>

        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <UserPlus className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{userStats.conversionRate.toFixed(1)}%</p>
              <p className="text-sm text-muted-foreground">نسبة التحويل</p>
            </div>
          </div>
        </div>
      </div>

      {/* New Users Stats */}
      <div className="glass rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">المستخدمين الجدد</h2>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-4 bg-muted/50 rounded-xl">
            <p className="text-3xl font-bold text-foreground">{userStats.newUsersToday}</p>
            <p className="text-sm text-muted-foreground">اليوم</p>
          </div>
          <div className="text-center p-4 bg-muted/50 rounded-xl">
            <p className="text-3xl font-bold text-foreground">{userStats.newUsersWeek}</p>
            <p className="text-sm text-muted-foreground">هذا الأسبوع</p>
          </div>
          <div className="text-center p-4 bg-muted/50 rounded-xl">
            <p className="text-3xl font-bold text-foreground">{userStats.totalUsers}</p>
            <p className="text-sm text-muted-foreground">الإجمالي</p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Countries */}
        <div className="glass rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">أكثر الدول زيارة</h2>
          </div>
          
          {countries.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">لا توجد بيانات بعد</p>
          ) : (
            <div className="space-y-3">
              {countries.map((country, index) => {
                const percentage = totalCountryVisits > 0 
                  ? Math.round((country.count / totalCountryVisits) * 100) 
                  : 0;
                
                return (
                  <div key={country.country_code} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getCountryFlag(country.country_code)}</span>
                        <span className="text-foreground">{country.country_name}</span>
                      </div>
                      <span className="text-muted-foreground">
                        {country.count} ({percentage}%)
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-primary rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Devices */}
        <div className="glass rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Monitor className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">نوع الأجهزة</h2>
          </div>
          
          {devices.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">لا توجد بيانات بعد</p>
          ) : (
            <div className="space-y-4">
              {devices.map((device) => {
                const percentage = totalDevices > 0 
                  ? Math.round((device.count / totalDevices) * 100) 
                  : 0;
                const Icon = device.device_type === "mobile" ? Smartphone : Monitor;
                const label = device.device_type === "mobile" ? "موبايل" : "كمبيوتر";
                
                return (
                  <div key={device.device_type} className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-muted">
                      <Icon className="h-6 w-6 text-foreground" />
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <span className="font-medium text-foreground">{label}</span>
                        <span className="text-muted-foreground">{percentage}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-primary rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Referrer Sources */}
      <div className="glass rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Link2 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">مصادر الزيارات</h2>
        </div>
        
        {referrers.length === 0 ? (
          <div className="text-center py-8">
            <ExternalLink className="h-12 w-12 text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-muted-foreground">لا توجد بيانات مصادر بعد</p>
            <p className="text-xs text-muted-foreground mt-1">سيظهر هنا من أين يأتي زوارك (جوجل، فيسبوك، إلخ)</p>
          </div>
        ) : (
          <div className="space-y-3">
            {referrers.map((ref, index) => {
              const totalReferrers = referrers.reduce((sum, r) => sum + r.count, 0);
              const percentage = totalReferrers > 0 
                ? Math.round((ref.count / totalReferrers) * 100) 
                : 0;
              
              return (
                <div key={ref.referrer} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">#{index + 1}</span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      <span className="text-foreground truncate max-w-[200px]">{ref.referrer}</span>
                    </div>
                    <span className="text-muted-foreground">
                      {ref.count} ({percentage}%)
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-primary rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Popular Pages */}
      <div className="glass rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">أكثر الصفحات زيارة</h2>
        </div>
        
        {pages.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">لا توجد بيانات بعد</p>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pages.map((page, index) => (
              <div
                key={page.page_path}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">#{index + 1}</span>
                  <span className="text-foreground font-mono text-sm truncate max-w-[150px]">
                    {page.page_path === "/" ? "الرئيسية" : page.page_path}
                  </span>
                </div>
                <span className="text-primary font-semibold">{page.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalyticsTab;
