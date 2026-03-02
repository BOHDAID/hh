import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

/**
 * ============================================================
 * نسخة Self-Hosted مستقلة 100%
 * send-delivery-email: إرسال بريد تسليم الطلب
 * Gmail iOS Dark Mode Compatible - Table-Only Template
 * ============================================================
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};


interface DeliveryEmailRequest {
  to_email: string;
  customer_name: string;
  order_number: string;
  products: Array<{
    name: string;
    account_data: string;
    quantity: number;
  }>;
  total_amount: number;
  warranty_expires_at: string;
}

interface SiteSettings {
  [key: string]: string;
}

// Helper function to get settings from database
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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("📧 send-delivery-email function started");

    // Use standard env vars for self-hosted
    const settingsUrl = Deno.env.get("SUPABASE_URL") || "";
    const settingsServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!settingsUrl || !settingsServiceKey) {
      throw new Error("Database not configured");
    }

    const supabase = createClient(settingsUrl, settingsServiceKey);

    console.log("📧 Fetching site settings...");
    const settings = await getSettings(supabase);

    const smtpHost = settings.smtp_host || "smtp.gmail.com";
    const smtpPort = parseInt(settings.smtp_port || "465");
    const smtpUser = settings.smtp_user;
    const smtpPass = settings.smtp_pass;
    const senderEmail = settings.sender_email || smtpUser;
    const storeName = settings.store_name || "Digital Store";

    if (!smtpUser || !smtpPass) {
      throw new Error("SMTP credentials not configured");
    }

    const body = await req.json();
    const {
      to_email,
      customer_name,
      order_number,
      products,
      total_amount,
      warranty_expires_at,
    }: DeliveryEmailRequest = body;

    if (!to_email || !order_number || !products || products.length === 0) {
      throw new Error("Missing required fields");
    }

    console.log("📧 Preparing email for:", to_email);

    const warrantyDate = new Date(warranty_expires_at).toLocaleDateString("en-GB", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    
    const orderDate = new Date().toLocaleDateString("en-GB", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Build products HTML - PURE TABLE STRUCTURE (no divs)
    const productsHtml = products.map(product => `
<!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#2a2a2a" style="background-color:#2a2a2a !important; border-radius:8px; margin-bottom:16px; border-collapse:separate; mso-table-lspace:0pt; mso-table-rspace:0pt;">
  <tr>
    <td bgcolor="#333333" style="background-color:#333333 !important; padding:12px 16px; border-radius:8px 8px 0 0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td bgcolor="#333333" style="background-color:#333333 !important; color:#ffffff !important; font-size:15px; font-weight:bold; font-family:'Segoe UI',Tahoma,sans-serif; direction:rtl; text-align:right;">
            ${product.name}
          </td>
          <td bgcolor="#333333" style="background-color:#333333 !important; color:#888888 !important; font-size:12px; font-family:'Segoe UI',Tahoma,sans-serif; text-align:left; white-space:nowrap;">
            (الكمية: ${product.quantity})
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td bgcolor="#2a2a2a" style="background-color:#2a2a2a !important; padding:16px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#000000" style="background-color:#000000 !important; border-radius:6px; border:1px dashed #444444 !important; border-collapse:separate;">
        <tr>
          <td bgcolor="#000000" style="background-color:#000000 !important; padding:14px;">
            <pre style="margin:0 !important; padding:0 !important; white-space:pre-wrap !important; word-break:break-all !important; font-family:Consolas,Monaco,'Courier New',monospace !important; font-size:13px !important; line-height:1.6 !important; color:#00ff88 !important; background-color:#000000 !important; direction:ltr !important; text-align:left !important;">${product.account_data}</pre>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
    `).join("");

    // FULL TABLE-BASED EMAIL TEMPLATE - Gmail iOS Dark Mode Compatible
    const emailHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl" bgcolor="#121212" style="background-color:#121212 !important;">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
<title>تم تسليم طلبك</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<style type="text/css">
body,table,td,p,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none;}
:root{color-scheme:light dark;}
body,.email-body{margin:0 !important;padding:0 !important;background-color:#121212 !important;color:#e0e0e0 !important;}
u + .email-body{background-color:#121212 !important;}
u + .email-body .outer-table{background-color:#121212 !important;}
u + .email-body .card-table{background-color:#1e1e1e !important;}
u + .email-body .item-box{background-color:#2a2a2a !important;}
u + .email-body .code-cell{background-color:#000000 !important;}
@media (prefers-color-scheme:dark){
body,.email-body{background-color:#121212 !important;color:#e0e0e0 !important;}
.outer-table,.outer-td{background-color:#121212 !important;}
.card-table,.card-td{background-color:#1e1e1e !important;}
.item-box{background-color:#2a2a2a !important;}
.code-cell{background-color:#000000 !important;}
}
[data-ogsc] body,[data-ogsc] .email-body{background-color:#121212 !important;}
[data-ogsc] .outer-table,[data-ogsc] .outer-td{background-color:#121212 !important;}
[data-ogsc] .card-table,[data-ogsc] .card-td{background-color:#1e1e1e !important;}
[data-ogsc] .item-box{background-color:#2a2a2a !important;}
[data-ogsc] .code-cell{background-color:#000000 !important;}
[data-ogsb] body{background-color:#121212 !important;}
@media only screen and (max-width:620px){
.card-table{width:100% !important;}
}
</style>
</head>
<body class="email-body" bgcolor="#121212" style="margin:0 !important;padding:0 !important;background-color:#121212 !important;background-image:linear-gradient(#121212,#121212) !important;color:#e0e0e0 !important;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;-webkit-font-smoothing:antialiased;">
<u style="display:none !important;"></u>
<!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#121212"><tr><td><![endif]-->
<center style="width:100%;background-color:#121212 !important;">
<table role="presentation" class="outer-table" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#121212" style="width:100%;background-color:#121212 !important;background-image:linear-gradient(#121212,#121212) !important;">
<tr>
<td class="outer-td" align="center" bgcolor="#121212" style="padding:20px 10px;background-color:#121212 !important;background-image:linear-gradient(#121212,#121212) !important;">

<table role="presentation" class="card-table" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#1e1e1e" style="max-width:600px;width:100%;background-color:#1e1e1e !important;border-radius:12px;border:1px solid #333333 !important;border-collapse:separate;overflow:hidden;">

<!-- HEADER -->
<tr>
<td class="card-td" bgcolor="#252525" style="background-color:#252525 !important;padding:30px 20px;text-align:center;border-bottom:1px solid #333333 !important;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center" bgcolor="#252525" style="background-color:#252525 !important;">
<table cellpadding="0" cellspacing="0" border="0" bgcolor="#333333" style="background-color:#333333 !important;border:1px solid #4da6ff !important;border-radius:30px;border-collapse:separate;">
<tr>
<td bgcolor="#333333" style="background-color:#333333 !important;padding:10px 25px;">
<span style="font-size:20px;color:#4da6ff !important;font-weight:bold;font-family:'Segoe UI',Tahoma,sans-serif;">${storeName}</span>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td align="center" bgcolor="#252525" style="background-color:#252525 !important;padding-top:16px;">
<span style="color:#ffffff !important;font-size:18px;font-weight:normal;font-family:'Segoe UI',Tahoma,sans-serif;">✨ تم تسليم طلبك بنجاح ✨</span>
</td>
</tr>
</table>
</td>
</tr>

<!-- CONTENT -->
<tr>
<td class="card-td" bgcolor="#1e1e1e" style="background-color:#1e1e1e !important;padding:25px 20px;">

<!-- Greeting -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center" bgcolor="#1e1e1e" style="background-color:#1e1e1e !important;color:#e0e0e0 !important;font-size:15px;padding-bottom:8px;font-family:'Segoe UI',Tahoma,sans-serif;">
مرحباً <span style="color:#4da6ff !important;font-weight:bold;">${customer_name || "عزيزي العميل"}</span> 👋
</td>
</tr>
<tr>
<td align="center" bgcolor="#1e1e1e" style="background-color:#1e1e1e !important;color:#a0a0a0 !important;font-size:13px;padding-bottom:20px;line-height:1.5;font-family:'Segoe UI',Tahoma,sans-serif;">
شكراً لثقتك بنا! إليك تفاصيل حسابك وإيصال الدفع
</td>
</tr>
</table>

<!-- Receipt Box -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#252525" style="background-color:#252525 !important;border-radius:10px;border:1px solid #333333 !important;margin-bottom:20px;border-collapse:separate;">
<tr>
<td bgcolor="#252525" style="background-color:#252525 !important;padding:15px;border-bottom:1px solid #333333 !important;">
<span style="font-size:16px;">🧾</span>
<strong style="color:#4da6ff !important;font-size:15px;margin-right:6px;font-family:'Segoe UI',Tahoma,sans-serif;">إيصال الدفع</strong>
</td>
</tr>
<tr>
<td bgcolor="#252525" style="background-color:#252525 !important;padding:15px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td bgcolor="#252525" style="background-color:#252525 !important;color:#a0a0a0 !important;font-size:13px;padding:4px 0;font-family:'Segoe UI',Tahoma,sans-serif;">رقم الطلب:</td>
<td bgcolor="#252525" style="background-color:#252525 !important;color:#ffffff !important;font-size:13px;padding:4px 0;text-align:left;direction:ltr;font-family:'Segoe UI',Tahoma,sans-serif;">${order_number}</td>
</tr>
<tr>
<td bgcolor="#252525" style="background-color:#252525 !important;color:#a0a0a0 !important;font-size:13px;padding:4px 0;font-family:'Segoe UI',Tahoma,sans-serif;">التاريخ:</td>
<td bgcolor="#252525" style="background-color:#252525 !important;color:#ffffff !important;font-size:13px;padding:4px 0;font-family:'Segoe UI',Tahoma,sans-serif;">${orderDate}</td>
</tr>
<tr>
<td bgcolor="#252525" style="background-color:#252525 !important;color:#a0a0a0 !important;font-size:13px;padding:4px 0;font-family:'Segoe UI',Tahoma,sans-serif;">الضمان ساري حتى:</td>
<td bgcolor="#252525" style="background-color:#252525 !important;color:#ffffff !important;font-size:13px;padding:4px 0;font-family:'Segoe UI',Tahoma,sans-serif;">${warrantyDate}</td>
</tr>
<tr>
<td bgcolor="#252525" style="background-color:#252525 !important;color:#ffffff !important;font-size:13px;padding:10px 0 0 0;border-top:1px solid #444444 !important;font-weight:bold;font-family:'Segoe UI',Tahoma,sans-serif;">الإجمالي:</td>
<td bgcolor="#252525" style="background-color:#252525 !important;color:#00c853 !important;font-size:16px;padding:10px 0 0 0;border-top:1px solid #444444 !important;font-weight:bold;text-align:left;direction:ltr;font-family:'Segoe UI',Tahoma,sans-serif;">$${total_amount.toFixed(2)}</td>
</tr>
</table>
</td>
</tr>
</table>

<!-- Account Details Title -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td bgcolor="#1e1e1e" style="background-color:#1e1e1e !important;padding-bottom:12px;">
<span style="font-size:16px;">🔑</span>
<strong style="color:#4da6ff !important;font-size:15px;margin-right:6px;font-family:'Segoe UI',Tahoma,sans-serif;">تفاصيل الحسابات</strong>
</td>
</tr>
</table>

<!-- Products List -->
${productsHtml}

<!-- Warning Box -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#3d3000" style="background-color:#3d3000 !important;border-radius:8px;border:1px solid #ffc107 !important;margin-top:20px;border-collapse:separate;">
<tr>
<td bgcolor="#3d3000" style="background-color:#3d3000 !important;color:#ffd54f !important;font-size:13px;padding:14px;line-height:1.5;font-family:'Segoe UI',Tahoma,sans-serif;direction:rtl;text-align:right;">
<strong style="color:#ffd54f !important;">⚠️ تنبيه:</strong> احتفظ بهذه البيانات في مكان آمن ولا تشاركها مع أحد.
</td>
</tr>
</table>

</td>
</tr>

<!-- FOOTER -->
<tr>
<td class="card-td" bgcolor="#1a1a1a" style="background-color:#1a1a1a !important;padding:18px;text-align:center;border-top:1px solid #333333 !important;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center" bgcolor="#1a1a1a" style="background-color:#1a1a1a !important;color:#888888 !important;font-size:12px;font-family:'Segoe UI',Tahoma,sans-serif;">
© ${new Date().getFullYear()} ${storeName}
</td>
</tr>
<tr>
<td align="center" bgcolor="#1a1a1a" style="background-color:#1a1a1a !important;color:#666666 !important;font-size:11px;padding-top:4px;font-family:'Segoe UI',Tahoma,sans-serif;">
شكراً لتسوقك معنا 💜
</td>
</tr>
</table>
</td>
</tr>

</table>

</td>
</tr>
</table>
</center>
<!--[if mso]></td></tr></table><![endif]-->
</body>
</html>`;

    // Plain text version
    const plainTextContent = `
${storeName}
تم تسليم طلبك بنجاح!

مرحباً ${customer_name || "عزيزي العميل"}،

شكراً لثقتك بنا! إليك تفاصيل طلبك:

رقم الطلب: ${order_number}
المبلغ الإجمالي: $${total_amount.toFixed(2)}
الضمان ساري حتى: ${warrantyDate}

تفاصيل الحسابات:
${products.map(p => `${p.name} (الكمية: ${p.quantity})\n${p.account_data}`).join('\n\n')}

تنبيه مهم: احتفظ بهذا الإيميل في مكان آمن.

© ${new Date().getFullYear()} ${storeName}
    `.trim();

    console.log("📧 Initializing SMTP transporter...");
    
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    console.log("📧 Sending email via SMTP...");

    await transporter.sendMail({
      from: `${storeName} <${senderEmail}>`,
      to: to_email,
      subject: `Order Delivered - #${order_number}`,
      text: plainTextContent,
      html: emailHtml,
    });

    console.log("📧 Email sent successfully to:", to_email);

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
});
