import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

// ============================================================
// STANDALONE Edge Function: send-ban-email
// للرفع على Supabase الخارجي مباشرة
// supabase functions deploy send-ban-email --no-verify-jwt
// ============================================================

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
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  

  try {
    // Initialize Supabase client with service role for accessing all settings
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get settings from database
    const settings = await getSettings(supabase);

    const smtpHost = settings.smtp_host || "smtp.gmail.com";
    const smtpPort = parseInt(settings.smtp_port || "465");
    const smtpUser = settings.smtp_user;
    const smtpPass = settings.smtp_pass;
    const senderEmail = settings.sender_email || smtpUser;
    const storeName = settings.store_name || "Digital Store";
    const storeLogoUrl = settings.store_logo_url || "";
    const supportEmail = settings.support_email || senderEmail;

    // Validate SMTP settings
    if (!smtpUser || !smtpPass) {
      throw new Error("SMTP credentials not configured. Please set smtp_user and smtp_pass in site settings.");
    }

    const payload: BanEmailRequest = await req.json();
    const { to_email, user_name, ban_reason, is_banned } = payload;

    console.log("send-ban-email payload", {
      to_email,
      has_user_name: Boolean(user_name),
      is_banned,
      has_ban_reason: Boolean(ban_reason),
    });

    // Validate required fields
    if (!to_email) {
      throw new Error("Missing required field: to_email");
    }

    const emailSubject = is_banned 
      ? `Account Suspended - ${storeName}`
      : `Account Reactivated - ${storeName}`;

    const emailHtml = is_banned ? `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>تم إيقاف حسابك</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background-color: #f5f5f5; direction: rtl;">
      <div style="max-width: 600px; margin: 20px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 40px 30px; text-align: center;">
          ${storeLogoUrl && !storeLogoUrl.startsWith('data:') ? `<img src="${storeLogoUrl}" alt="${storeName}" style="max-width: 120px; max-height: 80px; margin-bottom: 15px; border-radius: 8px;">` : `<div style="background: white; display: inline-block; padding: 15px 30px; border-radius: 50px; margin-bottom: 20px;">
            <h1 style="margin: 0; font-size: 28px; color: #dc2626; font-weight: bold;">${storeName}</h1>
          </div>`}
          <p style="color: white; margin: 0; font-size: 18px; opacity: 0.95;">⚠️ تم إيقاف حسابك ⚠️</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 35px;">
          
          <!-- Greeting -->
          <div style="text-align: center; margin-bottom: 30px;">
            <p style="color: #333; font-size: 18px; margin: 0;">
              مرحباً <strong style="color: #dc2626;">${user_name || "عزيزي العميل"}</strong>
            </p>
          </div>
          
          <!-- Message Box -->
          <div style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-radius: 12px; padding: 25px; margin-bottom: 25px; border-right: 5px solid #ef4444;">
            <div style="display: flex; align-items: flex-start;">
              <span style="font-size: 24px; margin-left: 12px;">🚫</span>
              <div>
                <p style="margin: 0 0 8px 0; color: #991b1b; font-weight: bold; font-size: 16px;">تم إيقاف حسابك</p>
                <p style="margin: 0; color: #7f1d1d; font-size: 14px; line-height: 1.8;">
                  نأسف لإبلاغك بأنه تم إيقاف حسابك في ${storeName}.
                  ${ban_reason ? `<br/><br/><strong>السبب:</strong> ${ban_reason}` : ''}
                </p>
              </div>
            </div>
          </div>
          
          <!-- Support Section -->
          <div style="text-align: center; padding: 25px; background: #f8f9fa; border-radius: 12px;">
            <p style="color: #666; font-size: 15px; margin: 0 0 15px 0;">
              إذا كنت تعتقد أن هذا خطأ، يرجى التواصل معنا
            </p>
            <a href="mailto:${supportEmail}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; border-radius: 25px; text-decoration: none; font-size: 14px; font-weight: bold;">
              📧 تواصل مع الدعم الفني
            </a>
          </div>
          
        </div>
        
        <!-- Footer -->
        <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; text-align: center;">
          <p style="color: #888; margin: 0 0 10px 0; font-size: 13px;">
            ${storeName}
          </p>
          <p style="color: #666; margin: 0; font-size: 12px;">
            © ${new Date().getFullYear()} ${storeName}. جميع الحقوق محفوظة.
          </p>
        </div>
        
      </div>
    </body>
    </html>
    ` : `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>تم إعادة تفعيل حسابك</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background-color: #f5f5f5; direction: rtl;">
      <div style="max-width: 600px; margin: 20px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center;">
          ${storeLogoUrl && !storeLogoUrl.startsWith('data:') ? `<img src="${storeLogoUrl}" alt="${storeName}" style="max-width: 120px; max-height: 80px; margin-bottom: 15px; border-radius: 8px;">` : `<div style="background: white; display: inline-block; padding: 15px 30px; border-radius: 50px; margin-bottom: 20px;">
            <h1 style="margin: 0; font-size: 28px; color: #059669; font-weight: bold;">${storeName}</h1>
          </div>`}
          <p style="color: white; margin: 0; font-size: 18px; opacity: 0.95;">✅ تم إعادة تفعيل حسابك ✅</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 35px;">
          
          <!-- Greeting -->
          <div style="text-align: center; margin-bottom: 30px;">
            <p style="color: #333; font-size: 18px; margin: 0;">
              مرحباً <strong style="color: #059669;">${user_name || "عزيزي العميل"}</strong>
            </p>
          </div>
          
          <!-- Message Box -->
          <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 12px; padding: 25px; margin-bottom: 25px; border-right: 5px solid #10b981;">
            <div style="display: flex; align-items: flex-start;">
              <span style="font-size: 24px; margin-left: 12px;">🎉</span>
              <div>
                <p style="margin: 0 0 8px 0; color: #065f46; font-weight: bold; font-size: 16px;">أخبار سارة!</p>
                <p style="margin: 0; color: #047857; font-size: 14px; line-height: 1.8;">
                  تم إعادة تفعيل حسابك في ${storeName}. يمكنك الآن تسجيل الدخول والتسوق مرة أخرى.
                </p>
              </div>
            </div>
          </div>
          
          <!-- Support Section -->
          <div style="text-align: center; padding: 25px; background: #f8f9fa; border-radius: 12px;">
            <p style="color: #666; font-size: 15px; margin: 0 0 15px 0;">
              شكراً لتفهمك، نتمنى لك تجربة تسوق ممتعة
            </p>
          </div>
          
        </div>
        
        <!-- Footer -->
        <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; text-align: center;">
          <p style="color: #888; margin: 0 0 10px 0; font-size: 13px;">
            ${storeName}
          </p>
          <p style="color: #666; margin: 0; font-size: 12px;">
            © ${new Date().getFullYear()} ${storeName}. جميع الحقوق محفوظة.
          </p>
        </div>
        
      </div>
    </body>
    </html>
    `;

    const plainTextContent = is_banned 
      ? `${storeName}\n\nمرحباً ${user_name || "عزيزي العميل"},\n\nنأسف لإبلاغك بأنه تم إيقاف حسابك.${ban_reason ? `\n\nالسبب: ${ban_reason}` : ''}\n\nإذا كنت تعتقد أن هذا خطأ، يرجى التواصل معنا على: ${supportEmail}`
      : `${storeName}\n\nمرحباً ${user_name || "عزيزي العميل"},\n\nتم إعادة تفعيل حسابك. يمكنك الآن تسجيل الدخول والتسوق مرة أخرى.\n\nشكراً لتفهمك!`;

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
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-ban-email function:", error);
    return new Response(
      JSON.stringify({
        error: error?.message || String(error),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
