import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/supabaseClient";
import useStoreBranding from "@/hooks/useStoreBranding";

const Terms = () => {
  const [content, setContent] = useState("");
  const { storeName } = useStoreBranding();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await db
        .from("site_settings")
        .select("key, value")
        .in("key", ["terms_of_service"]);

      if (data) {
        data.forEach((setting) => {
          if (setting.key === "terms_of_service" && setting.value) {
            setContent(setting.value);
          }
        });
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="container max-w-4xl mx-auto px-4 py-12">
        <div className="mb-8">
          <Button variant="ghost" asChild>
            <Link to="/" className="flex items-center gap-2">
              <ArrowRight className="h-4 w-4" />
              العودة للرئيسية
            </Link>
          </Button>
        </div>

        <div className="glass rounded-2xl p-8">
          <h1 className="text-3xl font-bold mb-8 text-foreground">شروط الاستخدام</h1>
          
          {loading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-muted rounded w-3/4"></div>
              <div className="h-4 bg-muted rounded w-1/2"></div>
              <div className="h-4 bg-muted rounded w-5/6"></div>
            </div>
          ) : content ? (
            <div 
              className="prose prose-invert max-w-none text-muted-foreground leading-relaxed whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: content.replace(/\n/g, '<br/>') }}
            />
          ) : (
            <p className="text-muted-foreground">
              لم يتم إضافة شروط الاستخدام بعد. يرجى التواصل مع إدارة {storeName} للمزيد من المعلومات.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Terms;
