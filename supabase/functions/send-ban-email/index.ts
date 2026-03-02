import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};


interface BanEmailRequest {
  to_email: string;
  user_name: string;
  ban_reason?: string;
  is_banned: boolean;
}

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
    const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("VITE_EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const settings = await getSettings(supabase);
    const smtpHost = settings.smtp_host || "smtp.gmail.com";
    const smtpPort = parseInt(settings.smtp_port || "465");
    const smtpUser = settings.smtp_user;
    const smtpPass = settings.smtp_pass;
    const senderEmail = settings.sender_email || smtpUser;
    const storeName = settings.store_name || "Digital Store";
    const storeLogoUrl = settings.store_logo_url || "";
    const supportEmail = settings.support_email || senderEmail;

    if (!smtpUser || !smtpPass) throw new Error("SMTP credentials not configured");

    const { to_email, user_name, ban_reason, is_banned }: BanEmailRequest = await req.json();
    if (!to_email) throw new Error("Missing required field: to_email");

    const currentYear = new Date().getFullYear();
    const displayName = user_name || "عزيزي العميل";

    const logoHtml = storeLogoUrl ? `
    <tr>
      <td align="center" style="padding-bottom:16px;">
        <img src="${storeLogoUrl}" alt="${storeName}" width="72" height="72" style="display:block; border:0; border-radius:16px; box-shadow:0 4px 12px rgba(0,0,0,0.15);" />
      </td>
    </tr>` : '';

    const emailSubject = is_banned
      ? `⚠️ إشعار إيقاف الحساب — ${storeName}`
      : `✅ تم إعادة تفعيل حسابك — ${storeName}`;

    const accentColor = is_banned ? '#ef4444' : '#10b981';
    const accentDark = is_banned ? '#dc2626' : '#059669';

    const emailHtml = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${is_banned ? 'إيقاف الحساب' : 'إعادة تفعيل الحساب'}</title>
<style type="text/css">
body,table,td,p,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
body{margin:0;padding:0;background-color:#f4f4f8;}
</style>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Arial,sans-serif;background-color:#f4f4f8;">
<center style="width:100%;background-color:#f4f4f8;padding:24px 0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden;">

<!-- HEADER -->
<tr>
  <td style="background:linear-gradient(135deg,${accentColor} 0%,${accentDark} 100%); padding:36px 24px 28px; text-align:center;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      ${logoHtml}
      <tr>
        <td align="center" style="padding-bottom:8px;">
          <span style="font-size:26px; color:#ffffff; font-weight:700; font-family:'Segoe UI',Tahoma,sans-serif; letter-spacing:0.5px;">${storeName}</span>
        </td>
      </tr>
      <tr>
        <td align="center">
          <span style="color:rgba(255,255,255,0.92); font-size:16px; font-family:'Segoe UI',Tahoma,sans-serif;">
            ${is_banned ? '⚠️ إشعار إيقاف الحساب' : '🎉 تم إعادة تفعيل حسابك!'}
          </span>
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
        <td style="color:#1a1a2e; font-size:17px; padding-bottom:20px; font-family:'Segoe UI',Tahoma,sans-serif; text-align:right;">
          مرحباً <span style="color:${accentColor}; font-weight:700;">${displayName}</span> 👋
        </td>
      </tr>
    </table>

    ${is_banned ? `
    <!-- Ban Message -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#fef2f2,#fee2e2); border-radius:12px; border:1px solid #fecaca; margin-bottom:24px;">
      <tr>
        <td style="padding:22px; border-right:4px solid #ef4444; border-radius:12px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-size:20px; padding-bottom:10px;">🚫</td>
            </tr>
            <tr>
              <td style="color:#991b1b; font-weight:700; font-size:16px; padding-bottom:8px; font-family:'Segoe UI',Tahoma,sans-serif;">
                تم إيقاف حسابك
              </td>
            </tr>
            <tr>
              <td style="color:#7f1d1d; font-size:14px; line-height:1.8; font-family:'Segoe UI',Tahoma,sans-serif;">
                نأسف لإبلاغك بأنه تم إيقاف حسابك في ${storeName}.
                ${ban_reason ? `<br/><br/><strong style="color:#991b1b;">📋 السبب:</strong> ${ban_reason}` : ''}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Support CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8f8fc; border-radius:12px; border:1px solid #e5e7eb;">
      <tr>
        <td align="center" style="padding:24px;">
          <p style="color:#6b7280; font-size:14px; margin:0 0 16px 0; font-family:'Segoe UI',Tahoma,sans-serif; line-height:1.6;">
            إذا كنت تعتقد أن هذا خطأ، يمكنك التواصل مع فريق الدعم
          </p>
          <a href="mailto:${supportEmail}" style="display:inline-block; background:linear-gradient(135deg,#7c3aed,#6d28d9); color:#ffffff; padding:13px 32px; border-radius:10px; text-decoration:none; font-size:14px; font-weight:bold; font-family:'Segoe UI',Tahoma,sans-serif; box-shadow:0 4px 12px rgba(124,58,237,0.3);">
            📧 تواصل مع الدعم
          </a>
        </td>
      </tr>
    </table>
    ` : `
    <!-- Unban Message -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#ecfdf5,#d1fae5); border-radius:12px; border:1px solid #a7f3d0; margin-bottom:24px;">
      <tr>
        <td style="padding:22px; border-right:4px solid #10b981; border-radius:12px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-size:20px; padding-bottom:10px;">🎉</td>
            </tr>
            <tr>
              <td style="color:#065f46; font-weight:700; font-size:16px; padding-bottom:8px; font-family:'Segoe UI',Tahoma,sans-serif;">
                أخبار سارة!
              </td>
            </tr>
            <tr>
              <td style="color:#047857; font-size:14px; line-height:1.8; font-family:'Segoe UI',Tahoma,sans-serif;">
                تم إعادة تفعيل حسابك في ${storeName} بنجاح! يمكنك الآن تسجيل الدخول والتسوق مرة أخرى. نتمنى لك تجربة ممتعة! 🛍️
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8f8fc; border-radius:12px; border:1px solid #e5e7eb;">
      <tr>
        <td align="center" style="padding:20px;">
          <p style="color:#6b7280; font-size:14px; margin:0; font-family:'Segoe UI',Tahoma,sans-serif;">
            شكراً لتفهمك، نتمنى لك تجربة تسوق ممتعة 💚
          </p>
        </td>
      </tr>
    </table>
    `}

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

    const plainTextContent = is_banned
      ? `${storeName}\n\nمرحباً ${displayName}،\n\nنأسف لإبلاغك بأنه تم إيقاف حسابك.${ban_reason ? `\n\nالسبب: ${ban_reason}` : ''}\n\nإذا كنت تعتقد أن هذا خطأ، تواصل معنا على: ${supportEmail}\n\n© ${currentYear} ${storeName}`
      : `${storeName}\n\nمرحباً ${displayName}،\n\nتم إعادة تفعيل حسابك بنجاح! يمكنك الآن تسجيل الدخول والتسوق.\n\nشكراً لتفهمك!\n\n© ${currentYear} ${storeName}`;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: `${storeName} <${senderEmail}>`,
      to: to_email,
      subject: emailSubject,
      text: plainTextContent,
      html: emailHtml,
    });

    console.log("Ban notification email sent successfully to:", to_email);

    return new Response(
      JSON.stringify({ success: true, message: "Email sent successfully" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-ban-email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
