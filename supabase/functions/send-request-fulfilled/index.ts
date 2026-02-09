import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { encode } from "https://deno.land/std@0.190.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function encodeBase64(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  return encode(bytes as unknown as ArrayBuffer);
}

interface RequestFulfilledEmailRequest {
  user_id: string;
  product_name: string;
  admin_notes?: string;
  store_url?: string;
}

interface SiteSettings {
  [key: string]: string;
}

async function getSettings(supabase: any): Promise<SiteSettings> {
  const { data, error } = await supabase
    .from("site_settings")
    .select("key, value");

  if (error) {
    console.error("Error fetching settings:", error);
    throw new Error("Failed to fetch site settings");
  }

  const settings: SiteSettings = {};
  data?.forEach((item: { key: string; value: string | null }) => {
    settings[item.key] = item.value || "";
  });

  return settings;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("📧 send-request-fulfilled function started");

    const settingsUrl =
      Deno.env.get("EXTERNAL_SUPABASE_URL") ||
      Deno.env.get("VITE_EXTERNAL_SUPABASE_URL") ||
      Deno.env.get("SUPABASE_URL") ||
      "";
    const settingsServiceKey =
      Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      "";

    if (!settingsUrl || !settingsServiceKey) {
      throw new Error("Database not configured");
    }

    const supabase = createClient(settingsUrl, settingsServiceKey);

    // Get user email from profiles
    const body = await req.json();
    const { user_id, product_name, admin_notes, store_url }: RequestFulfilledEmailRequest = body;

    if (!user_id || !product_name) {
      throw new Error("Missing required fields: user_id and product_name");
    }

    // Default store URL or use provided one
    const siteUrl = store_url || "https://yourstore.com";
    const supportUrl = `${siteUrl}/support`;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("user_id", user_id)
      .single();

    if (profileError || !profile?.email) {
      console.error("Error fetching profile:", profileError);
      throw new Error("User email not found");
    }

    const to_email = profile.email;
    const customer_name = profile.full_name || "عزيزي العميل";

    console.log("📧 Fetching site settings...");
    const settings = await getSettings(supabase);

    const smtpHost = settings.smtp_host || "smtp.gmail.com";
    const smtpPort = parseInt(settings.smtp_port || "465");
    const smtpUser = settings.smtp_user;
    const smtpPass = settings.smtp_pass;
    const senderEmail = settings.sender_email || smtpUser;
    const storeName = settings.store_name || "Digital Store";
    const storeLogoUrl = settings.store_logo_url || "";

    if (!smtpUser || !smtpPass) {
      throw new Error("SMTP credentials not configured in site_settings");
    }

    console.log("📧 Preparing email for:", to_email);

    const currentDate = new Date().toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Email HTML Template
    const emailHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>تم توفير المنتج المطلوب</title>
<style type="text/css">
body,table,td,p,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
body{margin:0;padding:0;background-color:#f0f0f0;}
</style>
</head>
<body style="margin:0; padding:0; background-color:#f0f0f0; font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
<center style="width:100%; background-color:#f0f0f0; padding:20px 0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.1); overflow:hidden;">

<!-- HEADER -->
<tr>
<td style="background-color:#22c55e; padding:30px 20px; text-align:center;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
${storeLogoUrl ? `<tr>
<td align="center" style="padding-bottom:15px;">
<img src="${storeLogoUrl}" alt="${storeName}" width="80" height="80" style="display:block; border:0; border-radius:12px; background-color:#ffffff;" />
</td>
</tr>` : ''}
<tr>
<td align="center">
<span style="font-size:24px; color:#ffffff; font-weight:bold; font-family:'Segoe UI',Tahoma,sans-serif;">${storeName}</span>
</td>
</tr>
<tr>
<td align="center" style="padding-top:12px;">
<span style="color:#ffffff; font-size:18px; font-family:'Segoe UI',Tahoma,sans-serif;">🎉 تم توفير المنتج المطلوب! 🎉</span>
</td>
</tr>
</table>
</td>
</tr>

<!-- CONTENT -->
<tr>
<td style="background-color:#ffffff; padding:30px 25px;">

<!-- Greeting -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="color:#333333; font-size:18px; padding-bottom:15px; font-family:'Segoe UI',Tahoma,sans-serif; text-align:right;">
مرحباً <span style="color:#22c55e; font-weight:bold;">${customer_name}</span> 👋
</td>
</tr>
<tr>
<td style="color:#666666; font-size:15px; padding-bottom:25px; line-height:1.7; font-family:'Segoe UI',Tahoma,sans-serif; text-align:right;">
يسعدنا إبلاغك بأن المنتج الذي طلبته أصبح متوفراً الآن في متجرنا!
</td>
</tr>
</table>

<!-- Product Box -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0fdf4; border-radius:12px; border:2px solid #22c55e; margin-bottom:25px;">
<tr>
<td style="padding:20px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="color:#166534; font-size:14px; font-family:'Segoe UI',Tahoma,sans-serif; padding-bottom:8px;">
المنتج المطلوب:
</td>
</tr>
<tr>
<td style="color:#15803d; font-size:22px; font-weight:bold; font-family:'Segoe UI',Tahoma,sans-serif;">
🛍️ ${product_name}
</td>
</tr>
${admin_notes ? `
<tr>
<td style="color:#166534; font-size:13px; font-family:'Segoe UI',Tahoma,sans-serif; padding-top:15px; border-top:1px solid #bbf7d0; margin-top:15px;">
<strong>ملاحظة:</strong> ${admin_notes}
</td>
</tr>
` : ''}
</table>
</td>
</tr>
</table>

<!-- CTA Buttons -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center" style="padding:20px 0;">
<table cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="background-color:#22c55e; border-radius:8px; margin-left:10px;">
<a href="${siteUrl}" style="display:inline-block; padding:14px 30px; color:#ffffff; font-size:15px; font-weight:bold; text-decoration:none; font-family:'Segoe UI',Tahoma,sans-serif;">
🛒 تصفح المتجر
</a>
</td>
<td style="width:15px;"></td>
<td style="background-color:#6366f1; border-radius:8px;">
<a href="${supportUrl}" style="display:inline-block; padding:14px 30px; color:#ffffff; font-size:15px; font-weight:bold; text-decoration:none; font-family:'Segoe UI',Tahoma,sans-serif;">
🎫 فتح تذكرة دعم
</a>
</td>
</tr>
</table>
</td>
</tr>
</table>

<!-- Info -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafb; border-radius:8px; margin-top:15px;">
<tr>
<td style="color:#6b7280; font-size:13px; padding:15px; line-height:1.6; font-family:'Segoe UI',Tahoma,sans-serif; text-align:center;">
📅 تاريخ الإشعار: ${currentDate}
</td>
</tr>
</table>

</td>
</tr>

<!-- FOOTER -->
<tr>
<td style="background-color:#f5f5f5; padding:20px; text-align:center; border-top:1px solid #e0e0e0;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center" style="color:#666666; font-size:12px; font-family:'Segoe UI',Tahoma,sans-serif;">
© ${new Date().getFullYear()} ${storeName}
</td>
</tr>
<tr>
<td align="center" style="color:#888888; font-size:11px; padding-top:6px; font-family:'Segoe UI',Tahoma,sans-serif;">
شكراً لثقتك بنا 💚
</td>
</tr>
</table>
</td>
</tr>

</table>
</center>
</body>
</html>`;

    // Plain text version
    const plainTextContent = `
${storeName}
تم توفير المنتج المطلوب!

مرحباً ${customer_name}،

يسعدنا إبلاغك بأن المنتج الذي طلبته أصبح متوفراً الآن في متجرنا!

المنتج: ${product_name}
${admin_notes ? `ملاحظة: ${admin_notes}` : ''}

تاريخ الإشعار: ${currentDate}

تصفح المتجر: ${siteUrl}
فتح تذكرة دعم: ${supportUrl}

شكراً لثقتك بنا!

© ${new Date().getFullYear()} ${storeName}
    `.trim();

    console.log("📧 Initializing SMTP client...");
    
    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: smtpPort,
        tls: true,
        auth: {
          username: smtpUser,
          password: smtpPass,
        },
      },
    });

    console.log("📧 Sending email via SMTP...");

    await client.send({
      from: `${storeName} <${senderEmail}>`,
      to: to_email,
      subject: `🎉 تم توفير المنتج: ${product_name}`,
      mimeContent: [
        {
          mimeType: 'text/plain; charset="utf-8"',
          content: encodeBase64(plainTextContent),
          transferEncoding: "base64",
        },
        {
          mimeType: 'text/html; charset="utf-8"',
          content: encodeBase64(emailHtml),
          transferEncoding: "base64",
        },
      ],
    });

    await client.close();

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
