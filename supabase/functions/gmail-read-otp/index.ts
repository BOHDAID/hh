import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * قراءة OTP من Gmail مباشرة عبر IMAP باستخدام Deno TCP
 * بدون الحاجة لسيرفر Render
 */

class IMAPClient {
  private conn: Deno.TlsConn | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();
  private tagCounter = 0;
  private buffer = "";

  async connect(host: string, port: number): Promise<void> {
    this.conn = await Deno.connectTls({ hostname: host, port });
    this.reader = this.conn.readable.getReader();
    // Read greeting
    await this.readResponse();
  }

  private async readResponse(): Promise<string> {
    let result = this.buffer;
    this.buffer = "";
    
    const timeout = 10000; // 10 seconds
    const start = Date.now();
    
    while (true) {
      if (Date.now() - start > timeout) {
        throw new Error("IMAP read timeout");
      }
      
      const { value, done } = await this.reader!.read();
      if (done) break;
      
      result += this.decoder.decode(value);
      
      // Check if we have a complete response
      if (result.includes("\r\n")) {
        break;
      }
    }
    
    return result;
  }

  private async readUntilTag(tag: string): Promise<string> {
    let result = "";
    const timeout = 15000;
    const start = Date.now();
    
    while (true) {
      if (Date.now() - start > timeout) {
        throw new Error("IMAP tag read timeout");
      }
      
      const { value, done } = await this.reader!.read();
      if (done) break;
      
      result += this.decoder.decode(value);
      
      // Check if response contains our tag completion
      if (result.includes(`${tag} OK`) || result.includes(`${tag} NO`) || result.includes(`${tag} BAD`)) {
        break;
      }
    }
    
    return result;
  }

  private async sendCommand(command: string): Promise<string> {
    this.tagCounter++;
    const tag = `A${this.tagCounter.toString().padStart(4, "0")}`;
    const fullCommand = `${tag} ${command}\r\n`;
    
    await this.conn!.write(this.encoder.encode(fullCommand));
    
    const response = await this.readUntilTag(tag);
    return response;
  }

  async login(email: string, password: string): Promise<boolean> {
    const response = await this.sendCommand(`LOGIN "${email}" "${password}"`);
    return response.includes("OK");
  }

  async selectInbox(): Promise<void> {
    await this.sendCommand("SELECT INBOX");
  }

  async searchRecent(minutes: number = 5): Promise<number[]> {
    // Search for recent unseen messages
    const sinceDate = new Date();
    sinceDate.setMinutes(sinceDate.getMinutes() - minutes);
    
    // Format date for IMAP: DD-Mon-YYYY
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const dateStr = `${sinceDate.getDate()}-${months[sinceDate.getMonth()]}-${sinceDate.getFullYear()}`;
    
    const response = await this.sendCommand(`SEARCH SINCE ${dateStr}`);
    
    // Parse message IDs from response
    const match = response.match(/\* SEARCH([\d\s]*)/);
    if (!match || !match[1].trim()) return [];
    
    return match[1].trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
  }

  async fetchMessage(msgId: number): Promise<string> {
    const response = await this.sendCommand(`FETCH ${msgId} BODY[TEXT]`);
    return response;
  }

  async close(): Promise<void> {
    try {
      await this.sendCommand("LOGOUT");
    } catch {}
    try {
      this.conn?.close();
    } catch {}
  }
}

function extractOTP(text: string): string | null {
  if (!text) return null;

  // Clean up base64 / quoted-printable artifacts
  let cleaned = text;
  
  // Try to decode base64 content
  try {
    if (/^[A-Za-z0-9+/=\s]+$/.test(text.trim())) {
      const decoded = atob(text.replace(/\s/g, ''));
      cleaned = decoded;
    }
  } catch {}

  // Remove HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, ' ');
  // Remove extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ');

  const patterns = [
    /(?:code|رمز|OTP|verification|التحقق)[:\s]*(\d{4,8})/i,
    /(\d{6})/,  // Most common: 6 digits
    /(\d{4})/,  // 4 digits
    /(\d{8})/,  // 8 digits
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { gmailAddress, gmailAppPassword, maxAgeMinutes = 5 } = await req.json();

    if (!gmailAddress || !gmailAppPassword) {
      return new Response(
        JSON.stringify({ success: false, error: "Gmail credentials required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📧 Reading OTP from Gmail: ${gmailAddress}`);

    const imap = new IMAPClient();
    
    try {
      await imap.connect("imap.gmail.com", 993);
      console.log("✅ Connected to Gmail IMAP");

      const loggedIn = await imap.login(gmailAddress, gmailAppPassword);
      if (!loggedIn) {
        throw new Error("فشل تسجيل الدخول - تأكد من كلمة مرور التطبيق");
      }
      console.log("✅ Logged in");

      await imap.selectInbox();
      console.log("✅ INBOX selected");

      const messageIds = await imap.searchRecent(maxAgeMinutes);
      console.log(`📬 Found ${messageIds.length} recent messages`);

      if (messageIds.length === 0) {
        await imap.close();
        return new Response(
          JSON.stringify({ success: false, error: "لا توجد رسائل جديدة في آخر " + maxAgeMinutes + " دقائق" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Search ALL recent messages from newest to oldest
      let otp: string | null = null;
      for (let i = messageIds.length - 1; i >= Math.max(0, messageIds.length - 10); i--) {
        try {
          const messageBody = await imap.fetchMessage(messageIds[i]);
          console.log(`📄 Message ${messageIds[i]} preview: ${messageBody.substring(0, 150)}`);
          
          otp = extractOTP(messageBody);
          if (otp) {
            console.log(`✅ OTP found in message ${messageIds[i]}: ${otp}`);
            break;
          }
        } catch (fetchErr) {
          console.log(`⚠️ Failed to fetch message ${messageIds[i]}, skipping`);
        }
      }
      
      await imap.close();

      if (otp) {
        return new Response(
          JSON.stringify({ success: true, otp }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        return new Response(
          JSON.stringify({ success: false, error: "لم يُعثر على رمز OTP في آخر " + messageIds.length + " رسالة" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

    } catch (imapError) {
      console.error("❌ IMAP Error:", imapError);
      await imap.close();
      throw imapError;
    }

  } catch (error) {
    console.error("❌ Gmail OTP Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
