import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};


interface SiteSettings { [key: string]: string; }

async function getSettings(supabase: any): Promise<SiteSettings> {
  const { data, error } = await supabase.from("site_settings").select("key, value");
  if (error) throw new Error("Failed to fetch site settings");
  const settings: SiteSettings = {};
  data?.forEach((item: { key: string; value: string | null }) => { settings[item.key] = item.value || ""; });
  return settings;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    console.log("📧 send-request-fulfilled function started");

    const settingsUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("VITE_EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL") || "";
    const settingsServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!settingsUrl || !settingsServiceKey) throw new Error("Database not configured");

    const supabase = createClient(settingsUrl, settingsServiceKey);

    const body = await req.json();
    const { user_id, product_name, admin_notes, store_url } = body;
    if (!user_id || !product_name) throw new Error("Missing required fields: user_id and product_name");

    const siteUrl = store_url || "https://yourstore.com";
    const supportUrl = `${siteUrl}/support`;

    const { data: profile, error: profileError } = await supabase
      .from("profiles").select("email, full_name").eq("user_id", user_id).single();
    if (profileError || !profile?.email) throw new Error("User email not found");

    const to_email = profile.email;
    const customer_name = profile.full_name || "عزيزي العميل";

    const settings = await getSettings(supabase);
    const smtpHost = settings.smtp_host || "smtp.gmail.com";
    const smtpPort = parseInt(settings.smtp_port || "465");
    const smtpUser = settings.smtp_user;
    const smtpPass = settings.smtp_pass;
    const senderEmail = settings.sender_email || smtpUser;
    const storeName = settings.store_name || "Digital Store";
    const storeLogoUrl = settings.store_logo_url || "";

    if (!smtpUser || !smtpPass) throw new Error("SMTP credentials not configured");

    const currentYear = new Date().getFullYear();
    const currentDate = new Date().toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });

    const logoHtml = storeLogoUrl ? `
    <tr>
      <td align="center" style="padding-bottom:16px;">
        <img src="${storeLogoUrl}" alt="${storeName}" width="72" height="72" style="display:block; border:0; border-radius:16px; box-shadow:0 4px 12px rgba(0,0,0,0.15);" />
      </td>
    </tr>` : '';

    const emailHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>تم توفير المنتج المطلوب</title>
<style type="text/css">
body,table,td,p,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
body{margin:0;padding:0;background-color:#f4f4f8;}
</style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f8;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
<center style="width:100%;background-color:#f4f4f8;padding:24px 0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden;">

<!-- HEADER -->
<tr>
  <td style="background:linear-gradient(135deg,#22c55e 0%,#16a34a 100%); padding:36px 24px 28px; text-align:center;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      ${logoHtml}
      <tr>
        <td align="center" style="padding-bottom:8px;">
          <span style="font-size:26px; color:#ffffff; font-weight:700; font-family:'Segoe UI',Tahoma,sans-serif; letter-spacing:0.5px;">${storeName}</span>
        </td>
      </tr>
      <tr>
        <td align="center">
          <span style="color:rgba(255,255,255,0.92); font-size:16px; font-family:'Segoe UI',Tahoma,sans-serif;">🎉 تم توفير المنتج المطلوب!</span>
        </td>
      </tr>
    </table>
  </td>
</tr>

<!-- CONTENT -->
<tr>
  <td style="padding:28px 24px;">

    <!-- Greeting -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="color:#1a1a2e; font-size:17px; padding-bottom:6px; font-family:'Segoe UI',Tahoma,sans-serif; text-align:right;">
          مرحباً <span style="color:#16a34a; font-weight:700;">${customer_name}</span> 👋
        </td>
      </tr>
      <tr>
        <td style="color:#6b7280; font-size:14px; padding-bottom:24px; line-height:1.6; font-family:'Segoe UI',Tahoma,sans-serif; text-align:right;">
          يسعدنا إبلاغك بأن المنتج الذي طلبته أصبح متوفراً الآن في متجرنا!
        </td>
      </tr>
    </table>

    <!-- Product Box -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#ecfdf5,#d1fae5); border-radius:12px; border:1px solid #a7f3d0; margin-bottom:24px;">
      <tr>
        <td style="padding:22px; border-right:4px solid #22c55e; border-radius:12px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="color:#065f46; font-size:13px; padding-bottom:8px; font-family:'Segoe UI',Tahoma,sans-serif;">المنتج المطلوب:</td>
            </tr>
            <tr>
              <td style="color:#15803d; font-size:20px; font-weight:700; font-family:'Segoe UI',Tahoma,sans-serif;">
                🛍️ ${product_name}
              </td>
            </tr>
            ${admin_notes ? `
            <tr>
              <td style="color:#065f46; font-size:13px; padding-top:14px; border-top:1px solid #bbf7d0; margin-top:12px; font-family:'Segoe UI',Tahoma,sans-serif; line-height:1.6;">
                <strong>📝 ملاحظة:</strong> ${admin_notes}
              </td>
            </tr>` : ''}
          </table>
        </td>
      </tr>
    </table>

    <!-- CTA Buttons -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="padding:8px 0 20px;">
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td>
                <a href="${siteUrl}" style="display:inline-block; background:linear-gradient(135deg,#22c55e,#16a34a); color:#ffffff; padding:13px 28px; border-radius:10px; text-decoration:none; font-size:14px; font-weight:bold; font-family:'Segoe UI',Tahoma,sans-serif; box-shadow:0 4px 12px rgba(34,197,94,0.3);">
                  🛒 تصفح المتجر
                </a>
              </td>
              <td style="width:12px;"></td>
              <td>
                <a href="${supportUrl}" style="display:inline-block; background:linear-gradient(135deg,#7c3aed,#6d28d9); color:#ffffff; padding:13px 28px; border-radius:10px; text-decoration:none; font-size:14px; font-weight:bold; font-family:'Segoe UI',Tahoma,sans-serif; box-shadow:0 4px 12px rgba(124,58,237,0.3);">
                  🎫 فتح تذكرة دعم
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Date Info -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8f8fc; border-radius:10px; border:1px solid #e5e7eb;">
      <tr>
        <td align="center" style="color:#6b7280; font-size:13px; padding:14px; font-family:'Segoe UI',Tahoma,sans-serif;">
          📅 تاريخ الإشعار: ${currentDate}
        </td>
      </tr>
    </table>

  </td>
</tr>

<!-- FOOTER -->
<tr>
  <td style="background-color:#fafafa; padding:24px 20px; text-align:center; border-top:1px solid #f0f0f0;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="color:#999999; font-size:12px; font-family:'Segoe UI',Tahoma,sans-serif;">
          © ${currentYear} ${storeName} — جميع الحقوق محفوظة
        </td>
      </tr>
      <tr>
        <td align="center" style="color:#bbbbbb; font-size:11px; padding-top:4px; font-family:'Segoe UI',Tahoma,sans-serif;">
          هذه رسالة تلقائية، يرجى عدم الرد عليها
        </td>
      </tr>
    </table>
  </td>
</tr>

</table>
</center>
</body>
</html>`;

    const plainTextContent = `
${storeName}
🎉 تم توفير المنتج المطلوب!

مرحباً ${customer_name}،

يسعدنا إبلاغك بأن المنتج الذي طلبته أصبح متوفراً الآن!

المنتج: ${product_name}
${admin_notes ? `ملاحظة: ${admin_notes}` : ''}

📅 تاريخ الإشعار: ${currentDate}

🛒 تصفح المتجر: ${siteUrl}
🎫 فتح تذكرة دعم: ${supportUrl}

© ${currentYear} ${storeName}
    `.trim();

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: `${storeName} <${senderEmail}>`,
      to: to_email,
      subject: `🎉 تم توفير المنتج: ${product_name}`,
      text: plainTextContent,
      html: emailHtml,
    });

    console.log("📧 Request fulfilled email sent successfully to:", to_email);

    return new Response(
      JSON.stringify({ success: true, message: "Email sent successfully" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error("📧 Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
