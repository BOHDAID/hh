import Imap from 'imap';
import { simpleParser } from 'mailparser';

/**
 * Gmail IMAP Reader for OTP Codes
 * يقرأ رموز OTP من Gmail عبر IMAP
 */
class GmailReader {
  constructor(email, appPassword) {
    this.email = email;
    this.config = {
      user: email,
      password: appPassword,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
    };
  }

  /**
   * جلب آخر رمز OTP من Gmail
   * @param {number} maxAgeMinutes - الحد الأقصى لعمر الرسالة بالدقائق
   * @param {string} senderFilter - فلترة بعنوان المرسل (اختياري)
   * @returns {Promise<{success: boolean, otp?: string, error?: string}>}
   */
  async getLatestOTP(maxAgeMinutes = 5, senderFilter = '') {
    return new Promise((resolve) => {
      const imap = new Imap(this.config);

      imap.once('ready', () => {
        imap.openBox('INBOX', true, (err, box) => {
          if (err) {
            imap.end();
            return resolve({ success: false, error: `فشل فتح INBOX: ${err.message}` });
          }

          // البحث عن رسائل في آخر X دقائق
          const sinceDate = new Date();
          sinceDate.setMinutes(sinceDate.getMinutes() - maxAgeMinutes);
          
          const searchCriteria = [
            ['SINCE', sinceDate.toISOString().split('T')[0]],
          ];

          // إضافة فلتر المرسل إذا وُجد
          if (senderFilter) {
            searchCriteria.push(['FROM', senderFilter]);
          }

          imap.search(searchCriteria, (err, results) => {
            if (err) {
              imap.end();
              return resolve({ success: false, error: `فشل البحث: ${err.message}` });
            }

            if (!results || results.length === 0) {
              imap.end();
              return resolve({ success: false, error: 'لم يتم العثور على رسائل جديدة' });
            }

            // جلب آخر رسالة فقط
            const latestUid = results[results.length - 1];
            const fetch = imap.fetch([latestUid], { bodies: '' });

            fetch.on('message', (msg) => {
              msg.on('body', (stream) => {
                simpleParser(stream, (err, parsed) => {
                  if (err) {
                    imap.end();
                    return resolve({ success: false, error: `فشل تحليل الرسالة: ${err.message}` });
                  }

                  // استخراج OTP من نص الرسالة
                  const body = parsed.text || parsed.html || '';
                  const otp = this.extractOTP(body);

                  imap.end();

                  if (otp) {
                    console.log(`✅ OTP found: ${otp}`);
                    resolve({ success: true, otp });
                  } else {
                    resolve({ success: false, error: 'لم يتم العثور على رمز OTP في الرسالة' });
                  }
                });
              });
            });

            fetch.once('error', (err) => {
              imap.end();
              resolve({ success: false, error: `خطأ في جلب الرسالة: ${err.message}` });
            });

            fetch.once('end', () => {
              // يتم الإغلاق في callback الرسالة
            });
          });
        });
      });

      imap.once('error', (err) => {
        console.error('❌ IMAP Error:', err.message);
        resolve({ success: false, error: `خطأ IMAP: ${err.message}` });
      });

      imap.once('end', () => {
        console.log('📧 IMAP connection closed');
      });

      // بدء الاتصال
      imap.connect();

      // Timeout بعد 30 ثانية
      setTimeout(() => {
        try {
          imap.end();
        } catch {}
        resolve({ success: false, error: 'انتهت مهلة الاتصال (30 ثانية)' });
      }, 30000);
    });
  }

  /**
   * استخراج رمز OTP من نص الرسالة
   * يبحث عن أرقام من 4-8 خانات
   */
  extractOTP(text) {
    if (!text) return null;

    // أنماط شائعة لـ OTP
    const patterns = [
      /\b(\d{6})\b/,           // 6 أرقام (الأكثر شيوعاً)
      /\b(\d{4})\b/,           // 4 أرقام
      /\b(\d{8})\b/,           // 8 أرقام
      /code[:\s]*(\d{4,8})/i,  // code: 123456
      /otp[:\s]*(\d{4,8})/i,   // otp: 123456
      /verification[:\s]*(\d{4,8})/i,
      /رمز[:\s]*(\d{4,8})/,    // رمز: 123456
      /التحقق[:\s]*(\d{4,8})/, // رمز التحقق
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * اختبار الاتصال بـ Gmail
   */
  async testConnection() {
    return new Promise((resolve) => {
      const imap = new Imap(this.config);

      imap.once('ready', () => {
        console.log('✅ IMAP connection successful');
        imap.end();
        resolve({ success: true, message: 'الاتصال ناجح' });
      });

      imap.once('error', (err) => {
        console.error('❌ IMAP connection failed:', err.message);
        resolve({ success: false, error: err.message });
      });

      imap.connect();

      setTimeout(() => {
        try { imap.end(); } catch {}
        resolve({ success: false, error: 'انتهت مهلة الاتصال' });
      }, 10000);
    });
  }
}

export default GmailReader;
