import { useState, useEffect } from "react";
import { db } from "@/lib/supabaseClient";
import { Loader2, Shield } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const PrivacyPolicy = () => {
  const { t } = useTranslation();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPolicy = async () => {
      const { data } = await db
        .from("site_settings")
        .select("value")
        .eq("key", "privacy_policy")
        .single();

      if (data?.value) {
        setContent(data.value);
      }
      setLoading(false);
    };

    fetchPolicy();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header />
      <div className="container max-w-4xl mx-auto px-4 py-12">
        <div className="mb-8">
          <Link to="/">
            <Button variant="ghost" size="sm">
              ← {t('common.back')}
            </Button>
          </Link>
        </div>

        <div className="bg-card rounded-2xl shadow-lg p-8 md:p-12">
          <div className="flex items-center gap-3 mb-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">{t('footer.privacyPolicy')}</h1>
          </div>

          {content ? (
            <div className="prose prose-lg max-w-none text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {content}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">
              {t('common.loading')}
            </p>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default PrivacyPolicy;
