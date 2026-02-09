import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { db } from "@/lib/supabaseClient";
import { FileText, RotateCcw, Save, Loader2, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

const PoliciesTab = () => {
  const [termsOfService, setTermsOfService] = useState("");
  const [refundPolicy, setRefundPolicy] = useState("");
  const [privacyPolicy, setPrivacyPolicy] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPolicies();
  }, []);

  const fetchPolicies = async () => {
    setLoading(true);
    const { data } = await db
      .from("site_settings")
      .select("key, value")
      .in("key", ["terms_of_service", "refund_policy", "privacy_policy"]);

    if (data) {
      data.forEach((setting) => {
        if (setting.key === "terms_of_service") {
          setTermsOfService(setting.value || "");
        }
        if (setting.key === "refund_policy") {
          setRefundPolicy(setting.value || "");
        }
        if (setting.key === "privacy_policy") {
          setPrivacyPolicy(setting.value || "");
        }
      });
    }
    setLoading(false);
  };

  const saveSetting = async (key: string, value: string) => {
    setSaving(true);
    
    // Check if setting exists
    const { data: existing } = await db
      .from("site_settings")
      .select("id")
      .eq("key", key)
      .single();

    let error;
    if (existing) {
      const result = await db
        .from("site_settings")
        .update({ value, updated_at: new Date().toISOString() })
        .eq("key", key);
      error = result.error;
    } else {
      const result = await db
        .from("site_settings")
        .insert({ key, value, category: "policies" });
      error = result.error;
    }

    if (error) {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء الحفظ",
        variant: "destructive",
      });
    } else {
      toast({
        title: "تم الحفظ",
        description: "تم حفظ التغييرات بنجاح",
      });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-2xl font-bold">السياسات والشروط</h2>
          <p className="text-muted-foreground">إدارة شروط الاستخدام وسياسة الإرجاع</p>
        </div>
      </div>

      <Tabs defaultValue="terms" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="terms">شروط الاستخدام</TabsTrigger>
          <TabsTrigger value="refund">سياسة الإرجاع</TabsTrigger>
          <TabsTrigger value="privacy">سياسة الخصوصية</TabsTrigger>
        </TabsList>

        <TabsContent value="terms" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>شروط الاستخدام</CardTitle>
                  <CardDescription>
                    الشروط التي يجب على المستخدمين الموافقة عليها عند التسجيل
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/terms" target="_blank">
                    <ExternalLink className="h-4 w-4 ml-2" />
                    معاينة
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="terms">محتوى شروط الاستخدام</Label>
                <Textarea
                  id="terms"
                  value={termsOfService}
                  onChange={(e) => setTermsOfService(e.target.value)}
                  placeholder="اكتب شروط الاستخدام هنا..."
                  className="min-h-[300px] font-mono text-sm"
                  dir="rtl"
                />
                <p className="text-xs text-muted-foreground">
                  يمكنك استخدام الأسطر الجديدة للفصل بين الفقرات
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => saveSetting("terms_of_service", termsOfService)}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  ) : (
                    <Save className="h-4 w-4 ml-2" />
                  )}
                  حفظ التغييرات
                </Button>
                <Button
                  variant="outline"
                  onClick={fetchPolicies}
                  disabled={loading}
                >
                  <RotateCcw className="h-4 w-4 ml-2" />
                  إعادة تحميل
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="refund" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>سياسة الإرجاع والاسترداد</CardTitle>
                  <CardDescription>
                    سياسة الإرجاع واسترداد الأموال للمتجر
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/refund-policy" target="_blank">
                    <ExternalLink className="h-4 w-4 ml-2" />
                    معاينة
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="refund">محتوى سياسة الإرجاع</Label>
                <Textarea
                  id="refund"
                  value={refundPolicy}
                  onChange={(e) => setRefundPolicy(e.target.value)}
                  placeholder="اكتب سياسة الإرجاع هنا..."
                  className="min-h-[300px] font-mono text-sm"
                  dir="rtl"
                />
                <p className="text-xs text-muted-foreground">
                  يمكنك استخدام الأسطر الجديدة للفصل بين الفقرات
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => saveSetting("refund_policy", refundPolicy)}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  ) : (
                    <Save className="h-4 w-4 ml-2" />
                  )}
                  حفظ التغييرات
                </Button>
                <Button
                  variant="outline"
                  onClick={fetchPolicies}
                  disabled={loading}
                >
                  <RotateCcw className="h-4 w-4 ml-2" />
                  إعادة تحميل
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="privacy" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>سياسة الخصوصية</CardTitle>
                  <CardDescription>
                    سياسة الخصوصية وحماية البيانات الشخصية
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/privacy-policy" target="_blank">
                    <ExternalLink className="h-4 w-4 ml-2" />
                    معاينة
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="privacy">محتوى سياسة الخصوصية</Label>
                <Textarea
                  id="privacy"
                  value={privacyPolicy}
                  onChange={(e) => setPrivacyPolicy(e.target.value)}
                  placeholder="اكتب سياسة الخصوصية هنا..."
                  className="min-h-[300px] font-mono text-sm"
                  dir="rtl"
                />
                <p className="text-xs text-muted-foreground">
                  يمكنك استخدام الأسطر الجديدة للفصل بين الفقرات
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => saveSetting("privacy_policy", privacyPolicy)}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  ) : (
                    <Save className="h-4 w-4 ml-2" />
                  )}
                  حفظ التغييرات
                </Button>
                <Button
                  variant="outline"
                  onClick={fetchPolicies}
                  disabled={loading}
                >
                  <RotateCcw className="h-4 w-4 ml-2" />
                  إعادة تحميل
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PoliciesTab;
