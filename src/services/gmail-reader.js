import Imap from 'imap';
import { simpleParser } from 'mailparser';

/**
 * Gmail IMAP Reader for OTP Codes
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

  async getLatestOTP(maxAgeMinutes = 5, senderFilter = '') {
    return new Promise((resolve) => {
      const imap = new Imap(this.config);

      imap.once('ready', () => {
        imap.openBox('INBOX', true, (err, box) => {
          if (err) {
            imap.end();
            return resolve({ success: false, error: `فشل فتح INBOX: ${err.message}` });
          }

          console.log(`📬 INBOX opened: ${box.messages.total} total messages`);

          // بحث بدون أي فلتر أولاً - فقط UNSEEN أو آخر الرسائل
          const sinceDate = new Date();
          sinceDate.setMinutes(sinceDate.getMinutes() - maxAgeMinutes);
          
          console.log(`🔍 Searching since: ${sinceDate.toISOString()}, filter: "${senderFilter}"`);

          // الخطوة 1: بحث بدون فلتر لمعرفة إذا كان IMAP يعمل
          imap.search([['SINCE', sinceDate]], (err, allResults) => {
            if (err) {
              console.error('❌ IMAP search error:', err.message);
              imap.end();
              return resolve({ success: false, error: `فشل البحث: ${err.message}` });
            }

            console.log(`📊 Messages found (no filter): ${allResults?.length || 0}`);

            if (!allResults || allResults.length === 0) {
              // لا توجد رسائل - نجرب بحث أوسع (آخر يوم)
              const yesterday = new Date();
              yesterday.setDate(yesterday.getDate() - 1);
              
              imap.search([['SINCE', yesterday]], (err2, broaderResults) => {
                console.log(`📊 Messages in last 24h: ${broaderResults?.length || 0}`);
                
                if (broaderResults && broaderResults.length > 0) {
                  // نطبع آخر رسالة للتشخيص
                  const lastUid = broaderResults[broaderResults.length - 1];
                  const diagFetch = imap.fetch([lastUid], { bodies: 'HEADER.FIELDS (FROM SUBJECT DATE)' });
                  diagFetch.on('message', (msg) => {
                    msg.on('body', (stream) => {
                      let data = '';
                      stream.on('data', (chunk) => { data += chunk.toString(); });
                      stream.on('end', () => {
                        console.log(`📧 Latest msg header: ${data.trim().substring(0, 300)}`);
                      });
                    });
                  });
                  diagFetch.once('end', () => {
                    imap.end();
                    resolve({ success: false, error: 'لم يتم العثور على رسائل جديدة في آخر ' + maxAgeMinutes + ' دقائق' });
                  });
                  diagFetch.once('error', () => {
                    imap.end();
                    resolve({ success: false, error: 'لم يتم العثور على رسائل جديدة' });
                  });
                } else {
                  // حتى في آخر 24 ساعة لا توجد رسائل - مشكلة في الاتصال
                  console.log('⚠️ No messages even in last 24h - check Gmail credentials');
                  imap.end();
                  resolve({ success: false, error: 'لا توجد رسائل - تحقق من بيانات Gmail (البريد وكلمة مرور التطبيق)' });
                }
              });
              return;
            }

            // الخطوة 2: نجرب بفلتر المرسل إذا وُجد
            let finalResults = allResults;
            
            if (senderFilter) {
              imap.search([['SINCE', sinceDate], ['FROM', senderFilter]], (err3, filteredResults) => {
                if (err3) {
                  console.log(`⚠️ Filter search failed, using unfiltered results`);
                  filteredResults = allResults;
                }
                
                console.log(`📊 Messages with filter "${senderFilter}": ${filteredResults?.length || 0}`);
                
                if (!filteredResults || filteredResults.length === 0) {
                  // الفلتر لم يجد شيء - نطبع المرسلين الفعليين
                  console.log(`⚠️ No messages from "${senderFilter}" - showing actual senders...`);
                  const lastFew = allResults.slice(-3);
                  const diagFetch = imap.fetch(lastFew, { bodies: 'HEADER.FIELDS (FROM SUBJECT)' });
                  diagFetch.on('message', (msg, seqno) => {
                    msg.on('body', (stream) => {
                      let data = '';
                      stream.on('data', (chunk) => { data += chunk.toString(); });
                      stream.on('end', () => {
                        console.log(`📧 Msg sender: ${data.trim().substring(0, 200)}`);
                      });
                    });
                  });
                  diagFetch.once('end', () => {
                    // نستخدم النتائج بدون فلتر
                    console.log(`🔄 Retrying without sender filter...`);
                    this._fetchOTPFromResults(imap, allResults, resolve);
                  });
                  diagFetch.once('error', () => {
                    this._fetchOTPFromResults(imap, allResults, resolve);
                  });
                  return;
                }
                
                this._fetchOTPFromResults(imap, filteredResults, resolve);
              });
            } else {
              this._fetchOTPFromResults(imap, finalResults, resolve);
            }
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

      imap.connect();

      setTimeout(() => {
        try { imap.end(); } catch {}
        resolve({ success: false, error: 'انتهت مهلة الاتصال (30 ثانية)' });
      }, 30000);
    });
  }

  /**
   * جلب OTP من نتائج البحث
   */
  _fetchOTPFromResults(imap, results, resolve) {
    if (!results || results.length === 0) {
      imap.end();
      return resolve({ success: false, error: 'لم يتم العثور على رسائل جديدة' });
    }

    const latestUid = results[results.length - 1];
    console.log(`📨 Fetching message UID: ${latestUid}`);
    const fetch = imap.fetch([latestUid], { bodies: '' });

    fetch.on('message', (msg) => {
      msg.on('body', (stream) => {
        simpleParser(stream, (err, parsed) => {
          if (err) {
            imap.end();
            return resolve({ success: false, error: `فشل تحليل الرسالة: ${err.message}` });
          }

          console.log(`📧 Message from: ${parsed.from?.text}, subject: ${parsed.subject}`);
          
          const body = parsed.text || parsed.html || '';
          console.log(`📄 Body preview: ${body.substring(0, 150)}`);
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

    fetch.once('end', () => {});
  }

  /**
   * استخراج رمز OTP من نص الرسالة
   */
  extractOTP(text) {
    if (!text) return null;

    const patterns = [
      /\b(\d{6})\b/,
      /\b(\d{4})\b/,
      /\b(\d{8})\b/,
      /code[:\s]*(\d{4,8})/i,
      /otp[:\s]*(\d{4,8})/i,
      /verification[:\s]*(\d{4,8})/i,
      /رمز[:\s]*(\d{4,8})/,
      /التحقق[:\s]*(\d{4,8})/,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }

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
