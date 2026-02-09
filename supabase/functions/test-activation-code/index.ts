import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const EXTERNAL_SUPABASE_URL = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const EXTERNAL_SERVICE_ROLE_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SERVICE_ROLE_KEY);

    // جلب أول منتج (أي منتج)
    const { data: products, error: productError } = await supabase
      .from("products")
      .select("id, name, requires_activation")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (productError || !products) {
      return new Response(
        JSON.stringify({ error: "No activation-required product found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // جلب أول مستخدم (admin)
    const { data: adminData, error: adminError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")
      .limit(1)
      .single();

    if (adminError || !adminData) {
      return new Response(
        JSON.stringify({ error: "No admin user found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // توليد كود عشوائي
    const testCode = Math.random().toString(36).substring(2, 10).toUpperCase();

    // إنشاء كود تفعيل
    const { data: activationCode, error: insertError } = await supabase
      .from("activation_codes")
      .insert({
        code: testCode,
        product_id: products.id,
        user_id: adminData.user_id,
        account_email: "test@osn.example.com",
        account_password: "TestPassword123!",
        status: "pending",
        is_used: false,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (insertError || !activationCode) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: insertError?.message || "Failed to create activation code" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        activationCode: {
          id: activationCode.id,
          code: activationCode.code,
          productId: activationCode.product_id,
          productName: products.name,
          email: activationCode.account_email,
          password: activationCode.account_password,
          expiresAt: activationCode.expires_at,
          message: "✅ كود التفعيل جاهز! أرسله عبر الواتس أو البريد للعميل",
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
