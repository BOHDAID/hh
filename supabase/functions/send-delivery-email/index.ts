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
  activation_code?: string;
  activation_expires_at?: string;
  telegram_bot_username?: string;
  all_activation_codes?: Array<{
    code: string;
    product_name: string;
  }>;
}

interface SiteSettings {
  [key: string]: string;
}

async function getSettings(supabase: any): Promise<SiteSettings> {
  const { data, error } = await supabase
    .from("site_settings")
    .select("key, value");
  if (error) throw new Error("Failed to fetch site settings");
  const settings: SiteSettings = {};
  data?.forEach((item: { key: string; value: string | null }) => {
    settings[item.key] = item.value || "";
  });
  return settings;
}

function buildStoreHeader(storeName: string, storeLogoUrl: string, subtitle: string, accentColor: string): string {
  const logoHtml = storeLogoUrl ? `
  <tr>
    <td align="center" style="padding-bottom:16px;">
      <img src="${storeLogoUrl}" alt="${storeName}" width="72" height="72" style="display:block; border:0; border-radius:16px; box-shadow:0 4px 12px rgba(0,0,0,0.15);" />
    </td>
  </tr>` : '';

  return `
  <tr>
    <td style="background:linear-gradient(135deg, ${accentColor} 0%, ${shiftColor(accentColor)} 100%); padding:36px 24px 28px; text-align:center;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        ${logoHtml}
        <tr>
          <td align="center" style="padding-bottom:8px;">
            <span style="font-size:26px; color:#ffffff; font-weight:700; font-family:'Segoe UI',Tahoma,sans-serif; letter-spacing:0.5px;">${storeName}</span>
          </td>
        </tr>
        <tr>
          <td align="center">
            <span style="color:rgba(255,255,255,0.92); font-size:16px; font-family:'Segoe UI',Tahoma,sans-serif;">${subtitle}</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function shiftColor(hex: string): string {
  // Simple color shift for gradient end
  if (hex === '#7C3AED') return '#6D28D9';
  if (hex === '#22c55e') return '#16a34a';
  if (hex === '#ef4444') return '#dc2626';
  if (hex === '#10b981') return '#059669';
  return hex;
}

function buildFooter(storeName: string, year: number): string {
  return `
  <tr>
    <td style="background-color:#fafafa; padding:24px 20px; text-align:center; border-top:1px solid #f0f0f0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="color:#999999; font-size:12px; font-family:'Segoe UI',Tahoma,sans-serif; line-height:1.6;">
            © ${year} ${storeName} — جميع الحقوق محفوظة
          </td>
        </tr>
        <tr>
          <td align="center" style="color:#bbbbbb; font-size:11px; padding-top:4px; font-family:'Segoe UI',Tahoma,sans-serif;">
            هذه رسالة تلقائية، يرجى عدم الرد عليها
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
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
      Deno.env.get("SUPABASE_URL") || "";
    const settingsServiceKey =
      Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!settingsUrl || !settingsServiceKey) throw new Error("Database not configured");

    const supabase = createClient(settingsUrl, settingsServiceKey);
    const settings = await getSettings(supabase);

    const smtpHost = settings.smtp_host || "smtp.gmail.com";
    const smtpPort = parseInt(settings.smtp_port || "465");
    const smtpUser = settings.smtp_user;
    const smtpPass = settings.smtp_pass;
    const senderEmail = settings.sender_email || smtpUser;
    const storeName = settings.store_name || "Digital Store";
    const storeLogoUrl = settings.store_logo_url || "";

    if (!smtpUser || !smtpPass) throw new Error("SMTP credentials not configured");

    const body = await req.json();
    const {
      to_email, customer_name, order_number, order_id, user_id,
      products, total_amount, warranty_expires_at,
      activation_code, activation_expires_at, telegram_bot_username,
      all_activation_codes,
    }: DeliveryEmailRequest = body;

    if (!to_email || !order_number || !products || products.length === 0) {
      throw new Error("Missing required fields");
    }

    const warrantyDate = new Date(warranty_expires_at).toLocaleDateString("ar-SA", {
      year: "numeric", month: "long", day: "numeric",
    });
    const orderDate = new Date().toLocaleDateString("ar-SA", {
      year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
    const currentYear = new Date().getFullYear();

    // Products HTML
    const productsHtml = products.map(product => `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px; border-radius:10px; border:1px solid #eee; overflow:hidden;">
  <tr>
    <td style="background-color:#f8f8fc; padding:12px 16px; border-bottom:1px solid #eee;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="color:#1a1a2e; font-size:15px; font-weight:600; font-family:'Segoe UI',Tahoma,sans-serif; text-align:right;">
            🎁 ${product.name}
          </td>
          <td style="color:#7C3AED; font-size:12px; font-weight:600; font-family:'Segoe UI',Tahoma,sans-serif; text-align:left; white-space:nowrap;">
            × ${product.quantity}
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:14px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#1a1a2e; border-radius:8px;">
        <tr>
          <td style="padding:14px 16px;">
            <pre style="margin:0; white-space:pre-wrap; word-break:break-all; font-family:Consolas,Monaco,'Courier New',monospace; font-size:13px; line-height:1.7; color:#a5f3c4; direction:ltr; text-align:left;">${product.account_data}</pre>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`).join("");

    // Activation codes
    const allCodes: Array<{ code: string; product_name?: string }> = [];
    if (all_activation_codes && all_activation_codes.length > 0) {
      allCodes.push(...all_activation_codes);
    } else if (activation_code) {
      allCodes.push({ code: activation_code });
    }

    let activationCodeHtml = "";
    if (allCodes.length > 0) {
      const expiresAt = activation_expires_at
        ? new Date(activation_expires_at).toLocaleString("ar-SA", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
        : "24 ساعة من الآن";
      const cleanBotUsername = telegram_bot_username?.replace(/^@/, '') || '';
      const botLink = cleanBotUsername ? `https://t.me/${cleanBotUsername}` : "#";

      const codesListHtml = allCodes.map((c, i) => `
<tr>
  <td align="center" style="padding-bottom:12px;">
    ${c.product_name ? `<div style="color:#6b7280; font-size:12px; margin-bottom:6px; font-family:'Segoe UI',Tahoma,sans-serif;">${c.product_name} ${allCodes.length > 1 ? `(${i + 1})` : ''}</div>` : ''}
    <div style="display:inline-block; background-color:#1a1a2e; padding:14px 28px; border-radius:10px; border:2px dashed #8b5cf6;">
      <span style="font-family:Consolas,Monaco,monospace; font-size:${allCodes.length > 3 ? '18' : '26'}px; font-weight:bold; color:#a5f3c4; letter-spacing:5px;">${c.code}</span>
    </div>
  </td>
</tr>`).join("");

      activationCodeHtml = `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#f5f3ff,#ede9fe); border-radius:12px; border:1px solid #c4b5fd; margin:20px 0; overflow:hidden;">
  <tr>
    <td style="background:linear-gradient(135deg,#7c3aed,#6d28d9); padding:14px 18px;">
      <span style="font-size:18px; vertical-align:middle;">🔐</span>
      <strong style="color:#ffffff; font-size:16px; margin-right:8px; font-family:'Segoe UI',Tahoma,sans-serif; vertical-align:middle;">${allCodes.length > 1 ? `أكواد التفعيل (${allCodes.length})` : 'كود التفعيل'}</strong>
    </td>
  </tr>
  <tr>
    <td style="padding:22px; text-align:center;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        ${codesListHtml}
        <tr>
          <td align="center" style="color:#7c3aed; font-size:13px; font-weight:600; padding:12px 0; font-family:'Segoe UI',Tahoma,sans-serif;">
            ⏰ صالح حتى: ${expiresAt}
          </td>
        </tr>
        <tr>
          <td align="center" style="color:#6b7280; font-size:13px; padding:8px 0; line-height:1.7; font-family:'Segoe UI',Tahoma,sans-serif;">
            ⚠️ ${allCodes.length > 1 ? 'هذه الأكواد صالحة' : 'هذا الكود صالح'} لمدة <strong style="color:#7c3aed;">24 ساعة فقط</strong><br/>
            أرسل ${allCodes.length > 1 ? 'كل كود' : 'الكود'} للبوت للحصول على بيانات الدخول
          </td>
        </tr>
        ${telegram_bot_username ? `
        <tr>
          <td align="center" style="padding-top:16px;">
            <a href="${botLink}" style="display:inline-block; background:linear-gradient(135deg,#7c3aed,#6d28d9); color:#ffffff; padding:13px 32px; border-radius:10px; text-decoration:none; font-size:14px; font-weight:bold; font-family:'Segoe UI',Tahoma,sans-serif; box-shadow:0 4px 12px rgba(124,58,237,0.3);">
              📱 افتح البوت الآن
            </a>
          </td>
        </tr>` : ''}
      </table>
    </td>
  </tr>
</table>`;
    }

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
body{margin:0;padding:0;background-color:#f4f4f8;}
@media only screen and (max-width:620px){.main-table{width:100%!important;}}
</style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f8;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
<center style="width:100%;background-color:#f4f4f8;padding:24px 0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="main-table" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden;">

${buildStoreHeader(storeName, storeLogoUrl, '✅ تم تسليم طلبك بنجاح!', '#7C3AED')}

<!-- CONTENT -->
<tr>
<td style="padding:28px 24px;">

<!-- Greeting -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
  <td style="color:#1a1a2e; font-size:17px; padding-bottom:6px; font-family:'Segoe UI',Tahoma,sans-serif; text-align:right;">
    مرحباً <span style="color:#7C3AED; font-weight:700;">${customer_name || "عزيزي العميل"}</span> 👋
  </td>
</tr>
<tr>
  <td style="color:#6b7280; font-size:14px; padding-bottom:24px; line-height:1.6; font-family:'Segoe UI',Tahoma,sans-serif; text-align:right;">
    يسعدنا إبلاغك بأن طلبك قد تم تسليمه بنجاح! إليك تفاصيل الطلب والحسابات.
  </td>
</tr>
</table>

<!-- Receipt -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8f8fc; border-radius:12px; border:1px solid #ede9fe; margin-bottom:24px;">
<tr>
  <td style="background:linear-gradient(135deg,#f5f3ff,#ede9fe); padding:14px 18px; border-bottom:1px solid #ddd6fe; border-radius:12px 12px 0 0;">
    <span style="font-size:16px; vertical-align:middle;">🧾</span>
    <strong style="color:#7C3AED; font-size:15px; margin-right:6px; font-family:'Segoe UI',Tahoma,sans-serif; vertical-align:middle;">تفاصيل الطلب</strong>
  </td>
</tr>
<tr>
  <td style="padding:16px 18px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="color:#6b7280; font-size:13px; padding:7px 0; font-family:'Segoe UI',Tahoma,sans-serif;">رقم الطلب</td>
        <td style="color:#1a1a2e; font-size:13px; padding:7px 0; text-align:left; direction:ltr; font-family:Consolas,monospace; font-weight:600;">${order_number}</td>
      </tr>
      <tr>
        <td style="color:#6b7280; font-size:13px; padding:7px 0; font-family:'Segoe UI',Tahoma,sans-serif;">تاريخ الطلب</td>
        <td style="color:#1a1a2e; font-size:13px; padding:7px 0; font-family:'Segoe UI',Tahoma,sans-serif;">${orderDate}</td>
      </tr>
      <tr>
        <td style="color:#6b7280; font-size:13px; padding:7px 0; font-family:'Segoe UI',Tahoma,sans-serif;">الضمان حتى</td>
        <td style="color:#1a1a2e; font-size:13px; padding:7px 0; font-family:'Segoe UI',Tahoma,sans-serif;">🛡️ ${warrantyDate}</td>
      </tr>
      <tr>
        <td colspan="2" style="padding-top:10px; border-top:1px dashed #ddd6fe;"></td>
      </tr>
      <tr>
        <td style="color:#1a1a2e; font-size:15px; padding:6px 0; font-weight:700; font-family:'Segoe UI',Tahoma,sans-serif;">الإجمالي</td>
        <td style="color:#7C3AED; font-size:20px; padding:6px 0; font-weight:800; text-align:left; direction:ltr; font-family:'Segoe UI',Tahoma,sans-serif;">$${total_amount.toFixed(2)}</td>
      </tr>
    </table>
  </td>
</tr>
</table>

<!-- Account Details -->
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
  <td style="padding-bottom:14px;">
    <span style="font-size:16px; vertical-align:middle;">🔑</span>
    <strong style="color:#1a1a2e; font-size:15px; margin-right:6px; font-family:'Segoe UI',Tahoma,sans-serif; vertical-align:middle;">بيانات الحسابات</strong>
  </td>
</tr>
</table>
${productsHtml}

${activationCodeHtml}

<!-- Warning -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fffbeb; border-radius:10px; border:1px solid #fcd34d; margin-top:20px;">
<tr>
  <td style="color:#92400e; font-size:13px; padding:14px 16px; line-height:1.6; font-family:'Segoe UI',Tahoma,sans-serif; text-align:right;">
    ⚠️ <strong>تنبيه مهم:</strong> احتفظ بهذه البيانات في مكان آمن ولا تشاركها مع أي شخص. في حال واجهتك أي مشكلة، لا تتردد بالتواصل مع فريق الدعم.
  </td>
</tr>
</table>

</td>
</tr>

${buildFooter(storeName, currentYear)}

</table>
</center>
</body>
</html>`;

    const activationTextSection = activation_code
      ? `\n\n🔐 كود التفعيل: ${activation_code}\n⏰ صالح لمدة 24 ساعة فقط!\n${telegram_bot_username ? `📱 البوت: https://t.me/${telegram_bot_username}` : ''}\n`
      : '';

    const plainTextContent = `
${storeName}
✅ تم تسليم طلبك بنجاح!

مرحباً ${customer_name || "عزيزي العميل"}،

يسعدنا إبلاغك بأن طلبك قد تم تسليمه بنجاح!

رقم الطلب: ${order_number}
المبلغ الإجمالي: $${total_amount.toFixed(2)}
الضمان ساري حتى: ${warrantyDate}

بيانات الحسابات:
${products.map(p => `🎁 ${p.name} (×${p.quantity})\n${p.account_data}`).join('\n\n')}
${activationTextSection}
⚠️ تنبيه: احتفظ بهذا الإيميل في مكان آمن ولا تشاركه.

© ${currentYear} ${storeName}
    `.trim();

    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: smtpPort,
        tls: true,
        auth: { username: smtpUser, password: smtpPass },
      },
    });

    const emailSubject = `✅ تم تسليم طلبك — #${order_number}`;

    await client.send({
      from: `${storeName} <${senderEmail}>`,
      to: to_email,
      subject: emailSubject,
      mimeContent: [
        { mimeType: 'text/plain; charset="utf-8"', content: encodeBase64(plainTextContent), transferEncoding: "base64" },
        { mimeType: 'text/html; charset="utf-8"', content: encodeBase64(emailHtml), transferEncoding: "base64" },
      ],
    });

    await client.close();
    console.log("📧 Email sent successfully to:", to_email);

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
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
