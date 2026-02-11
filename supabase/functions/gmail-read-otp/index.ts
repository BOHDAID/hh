import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * قراءة OTP من Gmail مباشرة عبر IMAP باستخدام Deno TCP
 * نسخة محسّنة للموثوقية العالية
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
    await this.readUntilComplete();
  }

  /**
   * قراءة البيانات حتى تكتمل - تتعامل مع chunks متعددة
   */
  private async readUntilComplete(timeoutMs = 10000): Promise<string> {
    let result = this.buffer;
    this.buffer = "";
    
    const start = Date.now();
    
    while (true) {
      if (Date.now() - start > timeoutMs) {
        console.log(`⚠️ Read timeout after ${timeoutMs}ms, returning what we have (${result.length} bytes)`);
        break;
      }
      
      try {
        // استخدام Promise.race مع timeout لكل قراءة
        const readPromise = this.reader!.read();
        const timeoutPromise = new Promise<{value: undefined, done: true}>((resolve) => 
          setTimeout(() => resolve({value: undefined, done: true}), 3000)
        );
        
        const { value, done } = await Promise.race([readPromise, timeoutPromise]);
        if (done || !value) break;
        
        result += this.decoder.decode(value);
        
        // إذا انتهى بـ \r\n فهذا يعني اكتمال السطر
        if (result.endsWith("\r\n")) {
          break;
        }
      } catch {
        break;
      }
    }
    
    return result;
  }

  /**
   * قراءة حتى نجد tag الاستجابة - أكثر موثوقية
   */
  private async readUntilTag(tag: string): Promise<string> {
    let result = "";
    const timeout = 30000; // 30 ثانية للرسائل الكبيرة
    const start = Date.now();
    
    while (true) {
      if (Date.now() - start > timeout) {
        console.log(`⚠️ Tag read timeout for ${tag}, got ${result.length} bytes`);
        break;
      }
      
      try {
        const readPromise = this.reader!.read();
        const timeoutPromise = new Promise<{value: undefined, done: true}>((resolve) => 
          setTimeout(() => resolve({value: undefined, done: true}), 5000)
        );
        
        const { value, done } = await Promise.race([readPromise, timeoutPromise]);
        if (done || !value) {
          // إعطاء فرصة أخرى قبل الخروج
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
        
        result += this.decoder.decode(value);
        
        // التحقق من اكتمال الاستجابة
        if (result.includes(`${tag} OK`) || result.includes(`${tag} NO`) || result.includes(`${tag} BAD`)) {
          break;
        }
      } catch {
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
    const ok = response.includes("OK");
    if (!ok) {
      console.error("❌ Login failed response:", response.substring(0, 200));
    }
    return ok;
  }

  async selectInbox(): Promise<void> {
    const response = await this.sendCommand("SELECT INBOX");
    console.log("📬 INBOX info:", response.substring(0, 300));
  }

  async searchRecent(minutes: number = 5): Promise<number[]> {
    const sinceDate = new Date();
    sinceDate.setMinutes(sinceDate.getMinutes() - minutes);
    
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const dateStr = `${sinceDate.getDate()}-${months[sinceDate.getMonth()]}-${sinceDate.getFullYear()}`;
    
    // بحث أوسع - كل الرسائل من اليوم
    const response = await this.sendCommand(`SEARCH SINCE ${dateStr}`);
    console.log("🔍 Search response:", response.substring(0, 500));
    
    const match = response.match(/\* SEARCH([\d\s]*)/);
    if (!match || !match[1].trim()) return [];
    
    return match[1].trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
  }

  /**
   * جلب الرسالة كاملة - HEADER + BODY
   */
  async fetchMessage(msgId: number): Promise<string> {
    // جلب الرسالة كاملة بما في ذلك العناوين والجسم
    const response = await this.sendCommand(`FETCH ${msgId} (BODY[HEADER.FIELDS (FROM SUBJECT DATE)] BODY[TEXT])`);
    return response;
  }

  /**
   * جلب الرسالة بتنسيق RFC822 كامل كبديل
   */
  async fetchFullMessage(msgId: number): Promise<string> {
    const response = await this.sendCommand(`FETCH ${msgId} RFC822`);
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

/**
 * استخراج OTP محسّن - يتعامل مع تنسيقات متعددة
 */
function extractOTP(text: string): string | null {
  if (!text) return null;

  let cleaned = text;
  
  // فك تشفير base64 إذا كان المحتوى مشفر
  try {
    // البحث عن أجزاء base64 في النص
    const base64Chunks = text.match(/[A-Za-z0-9+/=]{20,}/g);
    if (base64Chunks) {
      for (const chunk of base64Chunks) {
        try {
          const decoded = atob(chunk);
          // إذا احتوى الفك على أرقام، أضفه للبحث
          if (/\d{4,8}/.test(decoded)) {
            cleaned += " " + decoded;
          }
        } catch {}
      }
    }
  } catch {}

  // فك quoted-printable
  cleaned = cleaned.replace(/=([0-9A-F]{2})/gi, (_, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
  cleaned = cleaned.replace(/=\r?\n/g, ''); // soft line breaks

  // إزالة HTML
  cleaned = cleaned.replace(/<[^>]*>/g, ' ');
  // إزالة whitespace زائد
  cleaned = cleaned.replace(/\s+/g, ' ');
  
  console.log(`🔍 Cleaned text for OTP extraction (first 300 chars): ${cleaned.substring(0, 300)}`);

  // أنماط البحث - من الأكثر تحديداً للأقل
  const patterns = [
    // OSN specific patterns
    /(?:verification|code|رمز|التحقق|otp|pin)[:\s]*[#]?(\d{4,8})/i,
    /(\d{4,8})[:\s]*(?:is your|هو رمز|verification|code|رمز)/i,
    // Generic "Your code is XXXX"
    /(?:your|the)\s+(?:code|otp|pin|verification)\s+(?:is|:)\s*(\d{4,8})/i,
    // Code alone on a line or surrounded by spaces
    /(?:^|\s)(\d{6})(?:\s|$|\.|,)/m,
    // Any 6-digit number (most common OTP length)
    /(\d{6})/,
    // 4-digit fallback
    /(\d{4})/,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      console.log(`✅ OTP matched with pattern: ${pattern.source} => ${match[1]}`);
      return match[1];
    }
  }

  return null;
}

/**
 * التحقق من عمر الرسالة بدقة الدقائق
 */
function isMessageRecent(messageText: string, maxAgeMinutes: number): boolean {
  // البحث عن تاريخ الرسالة في الهيدر
  const dateMatch = messageText.match(/Date:\s*(.+?)(?:\r?\n)/i);
  if (!dateMatch) return true; // إذا ما لقينا تاريخ، نعتبرها حديثة
  
  try {
    const msgDate = new Date(dateMatch[1].trim());
    const now = new Date();
    const diffMinutes = (now.getTime() - msgDate.getTime()) / (1000 * 60);
    
    console.log(`📅 Message date: ${msgDate.toISOString()}, age: ${diffMinutes.toFixed(1)} minutes`);
    
    return diffMinutes <= maxAgeMinutes;
  } catch {
    return true; // إذا فشل التحليل، نعتبرها حديثة
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { gmailAddress, gmailAppPassword, maxAgeMinutes = 5, senderFilter } = await req.json();

    if (!gmailAddress || !gmailAppPassword) {
      return new Response(
        JSON.stringify({ success: false, error: "Gmail credentials required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📧 Reading OTP from Gmail: ${gmailAddress}, maxAge: ${maxAgeMinutes} min, senderFilter: ${senderFilter || 'none'}`);

    const imap = new IMAPClient();
    
    try {
      await imap.connect("imap.gmail.com", 993);
      console.log("✅ Connected to Gmail IMAP");

      const loggedIn = await imap.login(gmailAddress, gmailAppPassword);
      if (!loggedIn) {
        await imap.close();
        return new Response(
          JSON.stringify({ success: false, error: "فشل تسجيل الدخول - تأكد من كلمة مرور التطبيق (App Password)" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.log("✅ Logged in successfully");

      await imap.selectInbox();
      console.log("✅ INBOX selected");

      const messageIds = await imap.searchRecent(maxAgeMinutes);
      console.log(`📬 Found ${messageIds.length} recent messages`);

      if (messageIds.length === 0) {
        await imap.close();
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `لا توجد رسائل جديدة. تأكد أن التطبيق أرسل رمز التحقق للبريد ${gmailAddress}`,
            details: { messagesChecked: 0, maxAgeMinutes }
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // البحث من الأحدث للأقدم
      let otp: string | null = null;
      let messagesChecked = 0;
      
      for (let i = messageIds.length - 1; i >= 0; i--) {
        try {
          messagesChecked++;
          const messageBody = await imap.fetchMessage(messageIds[i]);
          
          // التحقق من عمر الرسالة بدقة
          if (!isMessageRecent(messageBody, maxAgeMinutes)) {
            console.log(`⏭️ Message ${messageIds[i]} is older than ${maxAgeMinutes} minutes, skipping`);
            continue;
          }

          // فلترة حسب المرسل إذا تم تحديده
          if (senderFilter) {
            const fromMatch = messageBody.match(/From:\s*(.+?)(?:\r?\n)/i);
            const fromHeader = fromMatch ? fromMatch[1].toLowerCase() : '';
            const filters = Array.isArray(senderFilter) ? senderFilter : [senderFilter];
            const matchesSender = filters.some(f => fromHeader.includes(f.toLowerCase()));
            if (!matchesSender) {
              console.log(`⏭️ Message ${messageIds[i]} from "${fromHeader.substring(0, 50)}" doesn't match sender filter [${filters.join(', ')}], skipping`);
              continue;
            }
            console.log(`✅ Message ${messageIds[i]} matches sender filter`);
          }
          
          console.log(`📄 Message ${messageIds[i]} (${messageBody.length} bytes), preview: ${messageBody.substring(0, 200)}`);
          
          otp = extractOTP(messageBody);
          if (otp) {
            console.log(`✅ OTP found in message ${messageIds[i]}: ${otp}`);
            break;
          }
          
          // إذا لم نجد OTP بالطريقة العادية، جرب RFC822 الكامل
          if (!otp && messageBody.length < 500) {
            console.log(`🔄 Short message, trying full RFC822 fetch...`);
            const fullMessage = await imap.fetchFullMessage(messageIds[i]);
            otp = extractOTP(fullMessage);
            if (otp) {
              console.log(`✅ OTP found in full message ${messageIds[i]}: ${otp}`);
              break;
            }
          }
        } catch (fetchErr) {
          console.log(`⚠️ Failed to fetch message ${messageIds[i]}: ${fetchErr.message}`);
        }
      }
      
      await imap.close();

      if (otp) {
        return new Response(
          JSON.stringify({ success: true, otp, messagesChecked }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `تم فحص ${messagesChecked} رسالة ولم يُعثر على رمز OTP. تأكد أن التطبيق أرسل الرمز فعلاً.`,
            details: { messagesChecked, totalMessages: messageIds.length, maxAgeMinutes }
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

    } catch (imapError) {
      console.error("❌ IMAP Error:", imapError);
      try { await imap.close(); } catch {}
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
