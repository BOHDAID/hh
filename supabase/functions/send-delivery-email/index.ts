import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { encode } from "https://deno.land/std@0.190.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Helper to encode content with UTF-8 Base64
function encodeBase64(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  return encode(bytes as unknown as ArrayBuffer);
}

interface DeliveryEmailRequest {
  to_email: string;
  customer_name: string;
  order_number: string;
  order_id?: string;
  user_id?: string;
  products: Array<{
    name: string;
    account_data: string;
    quantity: number;
  }>;
  total_amount: number;
  warranty_expires_at: string;
  // بيانات كود التفعيل (اختياري)
  activation_code?: string;
  activation_expires_at?: string;
  telegram_bot_username?: string;
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

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("📧 send-delivery-email function started");

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
      throw new Error("Email settings database not configured");
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
    const storeLogoUrl = settings.store_logo_url || "";

    if (!smtpUser || !smtpPass) {
      throw new Error("SMTP credentials not configured");
    }

    const body = await req.json();
    const {
      to_email,
      customer_name,
      order_number,
      order_id,
      user_id,
      products,
      total_amount,
      warranty_expires_at,
      activation_code,
      activation_expires_at,
      telegram_bot_username,
    }: DeliveryEmailRequest = body;

    if (!to_email || !order_number || !products || products.length === 0) {
      throw new Error("Missing required fields");
    }

    const emailSubject = `Order Delivered - #${order_number}`;

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

    // Build products HTML - Simple Light Theme
    const productsHtml = products.map(product => `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:15px; border:1px solid #e0e0e0; border-radius:8px; border-collapse:separate; overflow:hidden;">
  <tr>
    <td style="background-color:#f5f5f5; padding:12px 16px; border-bottom:1px solid #e0e0e0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="color:#333333; font-size:15px; font-weight:bold; font-family:'Segoe UI',Tahoma,sans-serif; direction:rtl; text-align:right;">
            ${product.name}
          </td>
          <td style="color:#666666; font-size:12px; font-family:'Segoe UI',Tahoma,sans-serif; text-align:left; white-space:nowrap;">
            (الكمية: ${product.quantity})
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="background-color:#ffffff; padding:16px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#1a1a1a; border-radius:6px; border-collapse:separate;">
        <tr>
          <td style="background-color:#1a1a1a; padding:14px; border-radius:6px;">
            <pre style="margin:0; padding:0; white-space:pre-wrap; word-break:break-all; font-family:Consolas,Monaco,'Courier New',monospace; font-size:13px; line-height:1.6; color:#00ff88; background-color:#1a1a1a; direction:ltr; text-align:left;">${product.account_data}</pre>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
    `).join("");

    // بناء قسم كود التفعيل إذا كان موجوداً
    let activationCodeHtml = "";
    if (activation_code) {
      const expiresAt = activation_expires_at 
        ? new Date(activation_expires_at).toLocaleString("ar-SA", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "24 ساعة من الآن";

      const botLink = telegram_bot_username 
        ? `https://t.me/${telegram_bot_username}` 
        : "#";

      activationCodeHtml = `
<!-- Activation Code Section -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fef2f2; border-radius:10px; border:2px solid #ef4444; margin:20px 0; overflow:hidden;">
<tr>
<td style="background-color:#ef4444; padding:12px 15px;">
<span style="font-size:18px;">🔐</span>
<strong style="color:#ffffff; font-size:16px; margin-right:8px; font-family:'Segoe UI',Tahoma,sans-serif;">كود التفعيل</strong>
</td>
</tr>
<tr>
<td style="padding:20px; text-align:center;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center" style="padding-bottom:15px;">
<div style="display:inline-block; background-color:#1a1a1a; padding:15px 30px; border-radius:8px; border:2px dashed #ef4444;">
<span style="font-family:Consolas,Monaco,monospace; font-size:28px; font-weight:bold; color:#22c55e; letter-spacing:4px;">${activation_code}</span>
</div>
</td>
</tr>
<tr>
<td align="center" style="color:#dc2626; font-size:14px; font-weight:bold; padding:10px 0; font-family:'Segoe UI',Tahoma,sans-serif;">
⏰ صالح حتى: ${expiresAt}
</td>
</tr>
<tr>
<td align="center" style="color:#666666; font-size:13px; padding:10px 0; line-height:1.6; font-family:'Segoe UI',Tahoma,sans-serif;">
⚠️ <strong style="color:#dc2626;">تنبيه هام:</strong> هذا الكود صالح لمدة <strong>24 ساعة فقط!</strong><br/>
أرسل هذا الكود للبوت للحصول على بيانات الدخول
</td>
</tr>
${telegram_bot_username ? `
<tr>
<td align="center" style="padding-top:15px;">
<a href="${botLink}" style="display:inline-block; background-color:#0088cc; color:#ffffff; padding:12px 30px; border-radius:8px; text-decoration:none; font-size:14px; font-weight:bold; font-family:'Segoe UI',Tahoma,sans-serif;">
📱 افتح البوت الآن
</a>
</td>
</tr>
` : ''}
</table>
</td>
</tr>
</table>
`;
    }

    // SIMPLE LIGHT EMAIL TEMPLATE
    const emailHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<title>تم تسليم طلبك</title>
<style type="text/css">
body,table,td,p,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none;}
body{margin:0;padding:0;background-color:#f0f0f0;}
@media only screen and (max-width:620px){
.main-table{width:100% !important;}
}
</style>
</head>
<body style="margin:0; padding:0; background-color:#f0f0f0; font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
<center style="width:100%; background-color:#f0f0f0; padding:20px 0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="main-table" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.1); overflow:hidden;">

<!-- HEADER -->
<tr>
<td style="background-color:#6366f1; padding:30px 20px; text-align:center;">
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
<span style="color:#ffffff; font-size:18px; font-family:'Segoe UI',Tahoma,sans-serif;">✨ تم تسليم طلبك بنجاح ✨</span>
</td>
</tr>
</table>
</td>
</tr>

<!-- CONTENT -->
<tr>
<td style="background-color:#ffffff; padding:25px 20px;">

<!-- Greeting -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center" style="color:#333333; font-size:16px; padding-bottom:8px; font-family:'Segoe UI',Tahoma,sans-serif;">
مرحباً <span style="color:#6366f1; font-weight:bold;">${customer_name || "عزيزي العميل"}</span> 👋
</td>
</tr>
<tr>
<td align="center" style="color:#666666; font-size:14px; padding-bottom:25px; line-height:1.5; font-family:'Segoe UI',Tahoma,sans-serif;">
شكراً لثقتك بنا! إليك تفاصيل حسابك وإيصال الدفع
</td>
</tr>
</table>

<!-- Receipt Box -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9f9f9; border-radius:10px; border:1px solid #e0e0e0; margin-bottom:25px; overflow:hidden;">
<tr>
<td style="background-color:#f0f0f0; padding:15px; border-bottom:1px solid #e0e0e0;">
<span style="font-size:16px;">🧾</span>
<strong style="color:#6366f1; font-size:15px; margin-right:6px; font-family:'Segoe UI',Tahoma,sans-serif;">إيصال الدفع</strong>
</td>
</tr>
<tr>
<td style="padding:15px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="color:#666666; font-size:13px; padding:6px 0; font-family:'Segoe UI',Tahoma,sans-serif;">رقم الطلب:</td>
<td style="color:#333333; font-size:13px; padding:6px 0; text-align:left; direction:ltr; font-family:'Segoe UI',Tahoma,sans-serif; font-weight:500;">${order_number}</td>
</tr>
<tr>
<td style="color:#666666; font-size:13px; padding:6px 0; font-family:'Segoe UI',Tahoma,sans-serif;">التاريخ:</td>
<td style="color:#333333; font-size:13px; padding:6px 0; font-family:'Segoe UI',Tahoma,sans-serif;">${orderDate}</td>
</tr>
<tr>
<td style="color:#666666; font-size:13px; padding:6px 0; font-family:'Segoe UI',Tahoma,sans-serif;">الضمان ساري حتى:</td>
<td style="color:#333333; font-size:13px; padding:6px 0; font-family:'Segoe UI',Tahoma,sans-serif;">${warrantyDate}</td>
</tr>
<tr>
<td style="color:#333333; font-size:14px; padding:12px 0 0 0; border-top:1px solid #e0e0e0; font-weight:bold; font-family:'Segoe UI',Tahoma,sans-serif;">الإجمالي:</td>
<td style="color:#22c55e; font-size:18px; padding:12px 0 0 0; border-top:1px solid #e0e0e0; font-weight:bold; text-align:left; direction:ltr; font-family:'Segoe UI',Tahoma,sans-serif;">$${total_amount.toFixed(2)}</td>
</tr>
</table>
</td>
</tr>
</table>

<!-- Account Details Title -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="padding-bottom:15px;">
<span style="font-size:16px;">🔑</span>
<strong style="color:#6366f1; font-size:15px; margin-right:6px; font-family:'Segoe UI',Tahoma,sans-serif;">تفاصيل الحسابات</strong>
</td>
</tr>
</table>

<!-- Products List -->
${productsHtml}

<!-- Activation Code Section (if applicable) -->
${activationCodeHtml}

<!-- Warning Box -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fef3c7; border-radius:8px; border:1px solid #f59e0b; margin-top:20px;">
<tr>
<td style="color:#92400e; font-size:13px; padding:14px; line-height:1.5; font-family:'Segoe UI',Tahoma,sans-serif; direction:rtl; text-align:right;">
<strong>⚠️ تنبيه:</strong> احتفظ بهذه البيانات في مكان آمن ولا تشاركها مع أحد.
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
شكراً لتسوقك معنا 💜
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
    const activationTextSection = activation_code 
      ? `\n\n🔐 كود التفعيل: ${activation_code}\n⏰ صالح لمدة 24 ساعة فقط!\n${telegram_bot_username ? `📱 البوت: https://t.me/${telegram_bot_username}` : ''}\n`
      : '';

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
${activationTextSection}
تنبيه مهم: احتفظ بهذا الإيميل في مكان آمن.

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
      subject: emailSubject,
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

    console.log("📧 Email sent successfully to:", to_email);

    // Log successful email to database
    try {
      await supabase.from("email_logs").insert({
        order_id: order_id || null,
        user_id: user_id || null,
        email_type: "delivery",
        recipient_email: to_email,
        subject: emailSubject,
        status: "sent",
        sent_at: new Date().toISOString(),
      });
    } catch (logErr) {
      console.error("Failed to log email:", logErr);
    }

    return new Response(
      JSON.stringify({ success: true, message: "Email sent successfully" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error) {
    console.error("📧 Error:", error);
    
    // Try to log failed email
    try {
      const settingsUrl =
        Deno.env.get("EXTERNAL_SUPABASE_URL") ||
        Deno.env.get("VITE_EXTERNAL_SUPABASE_URL") ||
        Deno.env.get("SUPABASE_URL") ||
        "";
      const settingsServiceKey =
        Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") ||
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
        "";
      
      if (settingsUrl && settingsServiceKey) {
        const supabase = createClient(settingsUrl, settingsServiceKey);
        const body = await req.clone().json().catch(() => ({}));
        await supabase.from("email_logs").insert({
          order_id: body.order_id || null,
          user_id: body.user_id || null,
          email_type: "delivery",
          recipient_email: body.to_email || "unknown",
          subject: `Order Delivered - #${body.order_number || "unknown"}`,
          status: "failed",
          error_message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    } catch (logErr) {
      console.error("Failed to log email error:", logErr);
    }
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
