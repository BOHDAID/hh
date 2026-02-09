import puppeteer from 'puppeteer';
import GmailReader from './gmail-reader.js';

/**
 * OSN Session Manager
 * يدير جلسة متصفح مستمرة لـ OSN
 */
class OSNSessionManager {
  constructor() {
    this.browser = null;
    this.page = null;
    this.isLoggedIn = false;
    this.currentEmail = null;
    this.gmailReader = null;
    this.lastActivity = null;
    this.loginAttempts = 0;
    this.maxLoginAttempts = 3;
  }

  /**
   * تهيئة الجلسة مع بيانات الحساب
   */
  async initialize(email, gmailAppPassword) {
    console.log('🚀 Initializing OSN Session Manager...');
    
    // Reset login attempts counter for new initialization
    this.loginAttempts = 0;
    
    this.currentEmail = email;
    this.gmailReader = new GmailReader(email, gmailAppPassword);
    
    // اختبار اتصال Gmail أولاً
    const gmailTest = await this.gmailReader.testConnection();
    if (!gmailTest.success) {
      console.error('❌ Gmail connection failed:', gmailTest.error);
      return { success: false, error: `فشل اتصال Gmail: ${gmailTest.error}` };
    }
    
    console.log('✅ Gmail connection OK');
    
    // محاولة تسجيل الدخول
    const loginResult = await this.login(email);
    return loginResult;
  }

  /**
   * فتح المتصفح
   */
  async openBrowser() {
    if (this.browser) {
      try {
        // التحقق من أن المتصفح لا يزال يعمل
        const pages = await this.browser.pages();
        if (pages.length > 0) {
          return this.browser;
        }
      } catch {
        // المتصفح مغلق، نفتح جديد
      }
    }

    console.log('🌐 Opening Puppeteer browser...');
    
    try {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });
      console.log('✅ Browser launched successfully');
    } catch (launchError) {
      console.error('❌ Browser launch failed:', launchError.message);
      throw launchError;
    }

    return this.browser;
  }

  /**
   * إغلاق المتصفح
   */
  async closeBrowser() {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {}
      this.browser = null;
      this.page = null;
      this.isLoggedIn = false;
    }
  }

  /**
   * تسجيل الدخول لـ OSN باستخدام Email + OTP
   */
  async login(email) {
    this.loginAttempts++;
    
    if (this.loginAttempts > this.maxLoginAttempts) {
      return { success: false, error: 'تم تجاوز الحد الأقصى لمحاولات تسجيل الدخول' };
    }

    try {
      await this.openBrowser();
      this.page = await this.browser.newPage();
      
      // إعدادات المتصفح
      await this.page.setViewport({ width: 1920, height: 1080 });
      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // تفعيل console logs من الصفحة
      this.page.on('console', msg => console.log('🌐 Page:', msg.text()));

      // ========== الخطوة 1: فتح صفحة تسجيل الدخول ==========
      console.log('📱 Opening OSN email login page...');
      await this.page.goto('https://osnplus.com/login/more-options?input_type=email', {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });

      // انتظار تحميل JavaScript
      console.log('⏳ Waiting for page to fully load...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      console.log('📄 Page title:', await this.page.title());
      console.log('🔗 Current URL:', this.page.url());

      // ========== الخطوة 2: إيجاد وإدخال Email ==========
      console.log('📧 Looking for email input...');
      
      let emailInput = null;
      const emailSelectors = [
        'input[type="email"]',
        'input[name="email"]',
        'input[placeholder*="email" i]',
        'input[placeholder*="Email" i]',
        'input[id*="email" i]',
        'input[autocomplete="email"]',
        'input[type="text"]:not([type="hidden"])',
      ];

      // محاولة كل selector
      for (const selector of emailSelectors) {
        emailInput = await this.page.$(selector);
        if (emailInput) {
          console.log(`✅ Found email input: ${selector}`);
          break;
        }
      }

      if (!emailInput) {
        const screenshot = await this.page.screenshot({ encoding: 'base64' });
        return { 
          success: false, 
          error: 'لم يتم العثور على حقل البريد الإلكتروني',
          screenshot: `data:image/png;base64,${screenshot}`
        };
      }

      // مسح الحقل وإدخال الإيميل
      await emailInput.click({ clickCount: 3 });
      await emailInput.type(email, { delay: 30 });
      console.log('✅ Email entered:', email);
      
      await new Promise(resolve => setTimeout(resolve, 500));

      // ========== الخطوة 3: إيجاد والضغط على زر Continue ==========
      console.log('➡️ Looking for submit button...');
      
      let submitButton = null;
      
      // محاولة selectors مختلفة
      const buttonSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button[data-testid*="submit" i]',
        'button[data-testid*="continue" i]',
        'button[class*="submit" i]',
        'button[class*="continue" i]',
        'button[class*="primary" i]',
      ];
      
      for (const selector of buttonSelectors) {
        submitButton = await this.page.$(selector);
        if (submitButton) {
          console.log(`✅ Found button: ${selector}`);
          break;
        }
      }
      
      // البحث بالنص إذا لم نجد بالـ selector
      if (!submitButton) {
        console.log('🔍 Searching buttons by text...');
        const buttons = await this.page.$$('button, input[type="submit"], a[role="button"]');
        const targetTexts = ['continue', 'next', 'sign in', 'login', 'submit', 'send', 'متابعة', 'تسجيل', 'دخول', 'إرسال'];
        
        for (const btn of buttons) {
          const text = await this.page.evaluate(el => (el.textContent || el.value || '').toLowerCase().trim(), btn);
          const isVisible = await this.page.evaluate(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
          }, btn);
          
          if (isVisible && targetTexts.some(t => text.includes(t))) {
            console.log(`✅ Found button by text: "${text}"`);
            submitButton = btn;
            break;
          }
        }
      }

      // الضغط على الزر أو Enter
      if (submitButton) {
        await submitButton.click();
        console.log('✅ Submit button clicked');
      } else {
        console.log('⚠️ No button found, pressing Enter...');
        await this.page.keyboard.press('Enter');
      }

      // انتظار الانتقال للصفحة التالية
      await new Promise(resolve => setTimeout(resolve, 3000));
      console.log('🔗 URL after submit:', this.page.url());

      // ========== الخطوة 4: انتظار وقراءة OTP ==========
      console.log('⏳ Waiting for OTP email...');
      
      let otpResult = null;
      const maxOtpAttempts = 5;
      const otpWaitInterval = 5000; // 5 ثواني بين كل محاولة
      
      for (let attempt = 1; attempt <= maxOtpAttempts; attempt++) {
        console.log(`📬 OTP attempt ${attempt}/${maxOtpAttempts}...`);
        await new Promise(resolve => setTimeout(resolve, otpWaitInterval));
        
        otpResult = await this.gmailReader.getLatestOTP(3, 'osn');
        
        if (otpResult.success) {
          console.log(`✅ OTP found: ${otpResult.otp}`);
          break;
        }
        
        console.log(`⏳ OTP not found yet, waiting...`);
      }
      
      if (!otpResult || !otpResult.success) {
        const screenshot = await this.page.screenshot({ encoding: 'base64' });
        return { 
          success: false, 
          error: 'لم يتم استلام رمز OTP بعد عدة محاولات',
          screenshot: `data:image/png;base64,${screenshot}`
        };
      }

      const otp = otpResult.otp;

      // ========== الخطوة 5: إدخال OTP ==========
      console.log('🔑 Entering OTP code...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // البحث عن حقول OTP
      const otpInputs = await this.page.$$('input[type="text"], input[type="tel"], input[type="number"], input[inputmode="numeric"]');
      console.log(`📝 Found ${otpInputs.length} potential OTP inputs`);
      
      if (otpInputs.length >= 4 && otpInputs.length <= 8) {
        // حقول منفصلة لكل رقم
        console.log('📝 Entering OTP in separate fields...');
        for (let i = 0; i < Math.min(otp.length, otpInputs.length); i++) {
          await otpInputs[i].type(otp[i], { delay: 50 });
        }
      } else if (otpInputs.length >= 1) {
        // حقل واحد
        console.log('📝 Entering OTP in single field...');
        await otpInputs[0].click();
        await otpInputs[0].type(otp, { delay: 30 });
      } else {
        // كتابة مباشرة
        console.log('📝 Typing OTP directly...');
        await this.page.keyboard.type(otp, { delay: 50 });
      }
      
      console.log('✅ OTP entered');
      await new Promise(resolve => setTimeout(resolve, 1000));

      // ========== الخطوة 6: تأكيد OTP ==========
      console.log('✅ Confirming OTP...');
      
      // البحث عن زر التأكيد
      let verifyButton = null;
      const verifySelectors = ['button[type="submit"]', 'input[type="submit"]'];
      
      for (const selector of verifySelectors) {
        verifyButton = await this.page.$(selector);
        if (verifyButton) break;
      }
      
      if (!verifyButton) {
        const buttons = await this.page.$$('button');
        const verifyTexts = ['verify', 'confirm', 'submit', 'تأكيد', 'تحقق'];
        
        for (const btn of buttons) {
          const text = await this.page.evaluate(el => (el.textContent || '').toLowerCase(), btn);
          if (verifyTexts.some(t => text.includes(t))) {
            verifyButton = btn;
            break;
          }
        }
      }
      
      if (verifyButton) {
        await verifyButton.click();
        console.log('✅ Verify button clicked');
      } else {
        await this.page.keyboard.press('Enter');
        console.log('✅ Enter pressed for verification');
      }

      // ========== الخطوة 7: التحقق من نجاح الدخول ==========
      console.log('⏳ Waiting for login confirmation...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      const currentUrl = this.page.url();
      console.log('🔗 Final URL:', currentUrl);
      
      // التحقق من نجاح الدخول
      const loginSuccess = !currentUrl.includes('login') && !currentUrl.includes('verify');
      
      if (loginSuccess) {
        console.log('🎉 OSN Login successful!');
        this.isLoggedIn = true;
        this.lastActivity = new Date();
        this.loginAttempts = 0;
        
        const screenshot = await this.page.screenshot({ encoding: 'base64' });
        return { 
          success: true, 
          message: 'تم تسجيل الدخول بنجاح',
          screenshot: `data:image/png;base64,${screenshot}`
        };
      } else {
        console.error('❌ Login failed - still on login/verify page');
        const screenshot = await this.page.screenshot({ encoding: 'base64' });
        return { 
          success: false, 
          error: 'فشل تسجيل الدخول - لا يزال في صفحة التحقق',
          screenshot: `data:image/png;base64,${screenshot}`
        };
      }

    } catch (error) {
      console.error('❌ Login error:', error.message);
      try {
        const screenshot = await this.page?.screenshot({ encoding: 'base64' });
        return { 
          success: false, 
          error: error.message,
          screenshot: screenshot ? `data:image/png;base64,${screenshot}` : null
        };
      } catch {
        return { success: false, error: error.message };
      }
    }
  }

  /**
   * جلب QR Code من صفحة إضافة جهاز
   */
  async getQRCode() {
    if (!this.isLoggedIn || !this.page) {
      return { success: false, error: 'الجلسة غير متصلة - يرجى تسجيل الدخول أولاً' };
    }

    try {
      console.log('📱 Navigating to devices page...');
      
      // الذهاب لصفحة الأجهزة
      await this.page.goto('https://osnplus.com/settings/devices', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      await new Promise(resolve => setTimeout(resolve, 3000));
      console.log('🔗 Devices page URL:', this.page.url());

      // البحث عن زر إضافة جهاز
      console.log('🔍 Looking for Add Device button...');
      let addButton = null;
      
      const addSelectors = [
        'button[data-testid*="add" i]',
        'button[class*="add" i]',
        'a[href*="add-device"]',
      ];
      
      for (const selector of addSelectors) {
        addButton = await this.page.$(selector);
        if (addButton) {
          console.log(`✅ Found add button: ${selector}`);
          break;
        }
      }
      
      // البحث بالنص
      if (!addButton) {
        const buttons = await this.page.$$('button, a');
        const addTexts = ['add', 'إضافة', 'add device', 'إضافة جهاز', 'new device'];
        
        for (const btn of buttons) {
          const text = await this.page.evaluate(el => (el.textContent || '').toLowerCase().trim(), btn);
          if (addTexts.some(t => text.includes(t))) {
            console.log(`✅ Found add button by text: "${text}"`);
            addButton = btn;
            break;
          }
        }
      }
      
      if (addButton) {
        await addButton.click();
        console.log('✅ Add button clicked');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // البحث عن QR Code
      console.log('🔍 Looking for QR code...');
      const qrSelectors = [
        'img[alt*="QR" i]',
        'img[src*="qr" i]',
        'canvas',
        '[data-testid*="qr" i]',
        '.qr-code',
        '#qr-code',
        'svg[class*="qr" i]',
      ];
      
      let qrElement = null;
      for (const selector of qrSelectors) {
        qrElement = await this.page.$(selector);
        if (qrElement) {
          console.log(`✅ Found QR element: ${selector}`);
          break;
        }
      }

      if (qrElement) {
        const qrScreenshot = await qrElement.screenshot({ encoding: 'base64' });
        this.lastActivity = new Date();
        
        return {
          success: true,
          qrImage: `data:image/png;base64,${qrScreenshot}`,
        };
      }

      // إذا لم نجد QR، نأخذ screenshot للصفحة
      console.log('⚠️ QR element not found, taking full page screenshot...');
      const pageScreenshot = await this.page.screenshot({ encoding: 'base64' });
      
      return {
        success: true,
        qrImage: `data:image/png;base64,${pageScreenshot}`,
        note: 'لم يتم العثور على عنصر QR - هذه صورة الصفحة الكاملة',
      };

    } catch (error) {
      console.error('❌ Error getting QR:', error.message);
      try {
        const screenshot = await this.page?.screenshot({ encoding: 'base64' });
        return { 
          success: false, 
          error: error.message,
          screenshot: screenshot ? `data:image/png;base64,${screenshot}` : null
        };
      } catch {
        return { success: false, error: error.message };
      }
    }
  }

  /**
   * جلب آخر OTP من Gmail للعميل
   */
  async getClientOTP() {
    if (!this.gmailReader) {
      return { success: false, error: 'Gmail غير مهيأ' };
    }

    try {
      console.log('📬 Fetching latest OTP for client...');
      const result = await this.gmailReader.getLatestOTP(5, 'osn');
      
      if (result.success) {
        this.lastActivity = new Date();
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error getting client OTP:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * حالة الجلسة
   */
  getStatus() {
    return {
      isLoggedIn: this.isLoggedIn,
      email: this.currentEmail,
      lastActivity: this.lastActivity?.toISOString() || null,
      browserConnected: !!this.browser,
    };
  }

  /**
   * التحقق من صلاحية الجلسة وإعادة الدخول إذا لزم
   */
  async ensureLoggedIn() {
    if (this.isLoggedIn && this.page) {
      try {
        // التحقق من أن الصفحة لا تزال على OSN
        const url = this.page.url();
        if (url.includes('osn.com') && !url.includes('login')) {
          return { success: true };
        }
      } catch {
        // الصفحة مغلقة
      }
    }

    // إعادة تسجيل الدخول
    console.log('🔄 Session expired, re-logging in...');
    return await this.login(this.currentEmail);
  }
}

// Singleton instance
const sessionManager = new OSNSessionManager();

export default sessionManager;
