import puppeteer from 'puppeteer';
import GmailReader from './gmail-reader.js';

/**
 * OSN QR Code Automation Service
 * يقوم بتسجيل الدخول لحساب OSN باستخدام Email + OTP والتقاط QR Code
 * 
 * ملاحظة: هذا الملف للتوافق مع الكود القديم
 * النظام الجديد يستخدم session-manager.js
 */

class OSNAutomation {
  constructor() {
    this.browser = null;
  }

  async initialize() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--single-process',
          '--no-zygote',
          '--ignore-certificate-errors',
          '--ignore-ssl-errors',
        ],
      });
    }
    return this.browser;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * تسجيل الدخول لـ OSN باستخدام Email + OTP (التدفق الجديد)
   * @param {string} email - البريد الإلكتروني للحساب
   * @param {string} gmailAppPassword - App Password لقراءة OTP من Gmail
   * @returns {Promise<{success: boolean, qrImage?: string, error?: string}>}
   */
  async getOSNQRCodeWithOTP(email, gmailAppPassword) {
    let page = null;
    
    try {
      await this.initialize();
      page = await this.browser.newPage();
      
      await page.setViewport({ width: 1280, height: 720 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

      // إنشاء قارئ Gmail
      const gmailReader = new GmailReader(email, gmailAppPassword);

      // الخطوة 1: فتح صفحة OSN
      console.log('🌐 Opening OSN login page...');
      await page.goto('https://stream.osn.com/login', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // الخطوة 2: إدخال Email فقط (بدون password!)
      console.log('📧 Entering email (no password)...');
      await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });
      await page.type('input[type="email"], input[name="email"]', email, { delay: 50 });

      // الخطوة 3: الضغط على Continue
      console.log('➡️ Clicking continue...');
      const continueBtn = await page.$('button[type="submit"], button:has-text("Continue"), button:has-text("Next")');
      if (continueBtn) {
        await continueBtn.click();
      } else {
        await page.keyboard.press('Enter');
      }

      // الخطوة 4: انتظار وصول OTP
      console.log('⏳ Waiting for OTP (8 seconds)...');
      await new Promise(resolve => setTimeout(resolve, 8000));

      // الخطوة 5: قراءة OTP من Gmail
      console.log('📬 Reading OTP from Gmail via IMAP...');
      const otpResult = await gmailReader.getLatestOTP(5, 'osn');
      
      if (!otpResult.success) {
        throw new Error(`Failed to get OTP: ${otpResult.error}`);
      }

      const otp = otpResult.otp;
      console.log(`✅ OTP received: ${otp}`);

      // الخطوة 6: إدخال OTP
      console.log('🔑 Entering OTP...');
      const otpInputs = await page.$$('input[type="text"], input[type="tel"], input[inputmode="numeric"]');
      
      if (otpInputs.length >= 4) {
        for (let i = 0; i < Math.min(otp.length, otpInputs.length); i++) {
          await otpInputs[i].type(otp[i], { delay: 100 });
        }
      } else {
        await page.keyboard.type(otp, { delay: 100 });
      }

      // الخطوة 7: تأكيد
      await new Promise(resolve => setTimeout(resolve, 2000));
      const verifyBtn = await page.$('button[type="submit"], button:has-text("Verify")');
      if (verifyBtn) {
        await verifyBtn.click();
      } else {
        await page.keyboard.press('Enter');
      }

      // انتظار التحميل
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});

      // الخطوة 8: الذهاب لصفحة إضافة جهاز
      console.log('📱 Going to add device page...');
      await page.goto('https://stream.osn.com/settings/devices', {
        waitUntil: 'networkidle2',
        timeout: 20000,
      }).catch(() => {});

      await new Promise(resolve => setTimeout(resolve, 2000));

      // البحث عن زر إضافة جهاز
      const addDeviceButton = await page.$('button:has-text("Add"), button:has-text("إضافة"), [data-testid="add-device"]');
      if (addDeviceButton) {
        await addDeviceButton.click();
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // الخطوة 9: التقاط QR Code
      console.log('🔍 Looking for QR code...');
      const qrElement = await page.$('img[alt*="QR" i], canvas, [data-testid="qr-code"], .qr-code');

      if (qrElement) {
        console.log('✅ QR Code found!');
        const qrScreenshot = await qrElement.screenshot({ encoding: 'base64' });
        await page.close();
        
        return {
          success: true,
          qrImage: `data:image/png;base64,${qrScreenshot}`,
        };
      }

      // لم نجد QR - نأخذ screenshot للصفحة
      console.log('⚠️ QR element not found, taking full page screenshot...');
      const fullScreenshot = await page.screenshot({ encoding: 'base64', fullPage: false });
      await page.close();
      
      return {
        success: true,
        qrImage: `data:image/png;base64,${fullScreenshot}`,
        note: 'Full page screenshot - QR element not found',
      };

    } catch (error) {
      console.error('❌ OSN Automation Error:', error.message);
      
      if (page) {
        try {
          const errorScreenshot = await page.screenshot({ encoding: 'base64' });
          await page.close();
          return {
            success: false,
            error: error.message,
            screenshot: `data:image/png;base64,${errorScreenshot}`,
          };
        } catch {
          await page.close().catch(() => {});
        }
      }
      
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * الدالة القديمة للتوافق (deprecated)
   * @deprecated استخدم getOSNQRCodeWithOTP بدلاً منها
   */
  async getOSNQRCode(email, password) {
    console.warn('⚠️ getOSNQRCode is deprecated. OSN uses Email + OTP now.');
    // للتوافق مع الكود القديم، نفترض أن password هو App Password
    return this.getOSNQRCodeWithOTP(email, password);
  }
}

// Singleton instance
const osnAutomation = new OSNAutomation();

export default osnAutomation;
