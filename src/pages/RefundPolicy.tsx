import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/supabaseClient";
import { useTranslation } from "react-i18next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const RefundPolicy = () => {
  const { t } = useTranslation();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await db
        .from("site_settings")
        .select("key, value")
        .in("key", ["refund_policy"]);

      if (data) {
        data.forEach((setting) => {
          if (setting.key === "refund_policy" && setting.value) {
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
      <Header />
      <div className="container max-w-4xl mx-auto px-4 py-12">
        <div className="mb-8">
          <Button variant="ghost" asChild>
            <Link to="/" className="flex items-center gap-2">
              <ArrowRight className="h-4 w-4" />
              {t('common.back')}
            </Link>
          </Button>
        </div>

        <div className="glass rounded-2xl p-8">
          <h1 className="text-3xl font-bold mb-8 text-foreground">{t('footer.refundPolicy')}</h1>
          
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
              {t('common.loading')}
            </p>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default RefundPolicy;
