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
    
    // Use system Chrome (required for Docker deployment)
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable';
    console.log('Chrome path:', executablePath);
    
    try {
      this.browser = await puppeteer.launch({
        headless: 'new',
        executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--single-process',
          '--no-zygote',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-default-apps',
          '--disable-sync',
          '--no-first-run',
          '--ignore-certificate-errors',
          '--ignore-ssl-errors',
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
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      console.log('📄 Page title:', await this.page.title());
      console.log('🔗 Current URL:', this.page.url());

      // === DEBUG: تسجيل كل العناصر في الصفحة ===
      await this._logPageElements();

      // ========== الخطوة 2: إيجاد وإدخال Email ==========
      console.log('📧 Looking for email input...');
      
      const emailInput = await this._findEmailInput();
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
      await new Promise(resolve => setTimeout(resolve, 300));
      await emailInput.type(email, { delay: 50 });
      console.log('✅ Email entered:', email);
      
      await new Promise(resolve => setTimeout(resolve, 1000));

      // ========== الخطوة 3: ضغط زر الإرسال ==========
      const submitResult = await this._clickSubmitButton();
      
      if (!submitResult.clicked) {
        const screenshot = await this.page.screenshot({ encoding: 'base64' });
        return {
          success: false,
          error: 'لم يتم العثور على زر الإرسال - تحقق من اللوقات لتفاصيل الأزرار',
          screenshot: `data:image/png;base64,${screenshot}`
        };
      }

      // انتظار الانتقال للصفحة التالية (صفحة OTP)
      console.log('⏳ Waiting for page transition after submit...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const urlAfterSubmit = this.page.url();
      console.log('🔗 URL after submit:', urlAfterSubmit);

      // التحقق أننا انتقلنا لصفحة OTP
      const pageChangedAfterSubmit = await this._checkPageChangedToOTP(urlAfterSubmit);
      if (!pageChangedAfterSubmit) {
        console.log('⚠️ Page might not have changed. Taking screenshot and retrying submit...');
        
        // محاولة ثانية - ربما الزر ما انضغط صح
        await this._clickSubmitButton();
        await new Promise(resolve => setTimeout(resolve, 5000));
        console.log('🔗 URL after retry:', this.page.url());
      }

      // === DEBUG: تسجيل عناصر صفحة OTP ===
      await this._logPageElements();

      // ========== الخطوة 4: انتظار وقراءة OTP ==========
      console.log('⏳ Waiting for OTP email...');
      
      let otpResult = null;
      const maxOtpAttempts = 8;
      const otpWaitInterval = 5000;
      
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
          error: 'لم يتم استلام رمز OTP بعد عدة محاولات. ربما الزر لم يُضغط بشكل صحيح.',
          screenshot: `data:image/png;base64,${screenshot}`
        };
      }

      const otp = otpResult.otp;

      // ========== الخطوة 5: إدخال OTP ==========
      console.log('🔑 Entering OTP code:', otp);
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      await this._enterOTP(otp);
      
      console.log('✅ OTP entered');
      await new Promise(resolve => setTimeout(resolve, 1000));

      // ========== الخطوة 6: تأكيد OTP ==========
      console.log('✅ Confirming OTP...');
      await this._clickSubmitButton(); // نفس المنطق - نضغط أي زر submit/verify
      
      // ========== الخطوة 7: التحقق من نجاح الدخول ==========
      console.log('⏳ Waiting for login confirmation...');
      await new Promise(resolve => setTimeout(resolve, 8000));

      const currentUrl = this.page.url();
      console.log('🔗 Final URL:', currentUrl);
      
      // التحقق من نجاح الدخول
      const loginSuccess = !currentUrl.includes('login') && !currentUrl.includes('verify') && !currentUrl.includes('more-options');
      
      if (loginSuccess) {
        console.log('🎉 OSN Login successful!');
        this.isLoggedIn = true;
        this.lastActivity = new Date();
        this.loginAttempts = 0;
        
        // حفظ الكوكيز للجلسة
        const cookies = await this.page.cookies();
        console.log(`🍪 Saved ${cookies.length} cookies for session persistence`);
        this._savedCookies = cookies;
        
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

  // ===========================
  // دوال مساعدة داخلية
  // ===========================

  /**
   * تسجيل كل عناصر الصفحة للـ debugging
   */
  async _logPageElements() {
    try {
      const elements = await this.page.evaluate(() => {
        const result = { inputs: [], buttons: [], links: [], forms: [] };
        
        // كل inputs
        document.querySelectorAll('input').forEach(el => {
          const rect = el.getBoundingClientRect();
          result.inputs.push({
            type: el.type, name: el.name, placeholder: el.placeholder,
            id: el.id, class: el.className?.substring(0, 50),
            visible: rect.width > 0 && rect.height > 0,
            rect: `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)}x${Math.round(rect.height)}`
          });
        });
        
        // كل buttons و role=button
        document.querySelectorAll('button, [role="button"], input[type="submit"]').forEach(el => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          result.buttons.push({
            tag: el.tagName, text: (el.textContent || el.value || '').trim().substring(0, 80),
            type: el.type, class: el.className?.substring?.(0, 60),
            id: el.id, disabled: el.disabled,
            visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden',
            rect: `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)}x${Math.round(rect.height)}`,
            ariaLabel: el.getAttribute('aria-label'),
          });
        });

        // كل links (أول 10)
        const links = document.querySelectorAll('a[href]');
        for (let i = 0; i < Math.min(links.length, 10); i++) {
          const el = links[i];
          const rect = el.getBoundingClientRect();
          result.links.push({
            text: (el.textContent || '').trim().substring(0, 50),
            href: el.href?.substring(0, 80),
            visible: rect.width > 0 && rect.height > 0,
          });
        }

        // كل forms
        document.querySelectorAll('form').forEach(el => {
          result.forms.push({
            action: el.action?.substring(0, 80),
            method: el.method,
            id: el.id,
            childButtons: el.querySelectorAll('button, [role="button"], input[type="submit"]').length,
            childInputs: el.querySelectorAll('input').length,
          });
        });

        return result;
      });

      console.log('📋 === PAGE ELEMENTS DEBUG ===');
      console.log('📋 Inputs:', JSON.stringify(elements.inputs));
      console.log('📋 Buttons:', JSON.stringify(elements.buttons));
      console.log('📋 Links:', JSON.stringify(elements.links));
      console.log('📋 Forms:', JSON.stringify(elements.forms));
      console.log('📋 === END PAGE ELEMENTS ===');
    } catch (e) {
      console.log('⚠️ Failed to log page elements:', e.message);
    }
  }

  /**
   * البحث عن حقل الإيميل
   */
  async _findEmailInput() {
    const selectors = [
      'input[type="email"]',
      'input[name="email"]',
      'input[placeholder*="email" i]',
      'input[placeholder*="Email" i]',
      'input[id*="email" i]',
      'input[autocomplete="email"]',
      'input[type="text"]:not([type="hidden"])',
    ];

    for (const selector of selectors) {
      const el = await this.page.$(selector);
      if (el) {
        const isVisible = await this.page.evaluate(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }, el);
        if (isVisible) {
          console.log(`✅ Found email input: ${selector}`);
          return el;
        }
      }
    }
    return null;
  }

  /**
   * البحث عن زر الإرسال والضغط عليه - الطريقة الشاملة
   */
  async _clickSubmitButton() {
    console.log('➡️ === SEARCHING FOR SUBMIT BUTTON ===');

    // === الطريقة 1: CSS Selectors ===
    const selectorList = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button[data-testid*="submit" i]',
      'button[data-testid*="continue" i]',
      'button[data-testid*="send" i]',
      'button[data-testid*="request" i]',
      'button[data-testid*="otp" i]',
      'button[data-testid*="code" i]',
      'button[data-testid*="verify" i]',
      'button[data-testid*="login" i]',
      'button[data-testid*="sign" i]',
      'button[class*="submit" i]',
      'button[class*="continue" i]',
      'button[class*="primary" i]',
      'button[class*="cta" i]',
      'button[class*="btn-primary" i]',
      'button[class*="send" i]',
      'button[class*="login" i]',
      'button[class*="sign" i]',
    ];

    for (const selector of selectorList) {
      const candidates = await this.page.$$(selector);
      for (const candidate of candidates) {
        const isVisible = await this.page.evaluate(el => {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== 'none' && 
                 style.visibility !== 'hidden' && 
                 style.opacity !== '0' &&
                 !el.disabled &&
                 rect.width > 20 && rect.height > 15;
        }, candidate);
        if (isVisible) {
          const text = await this.page.evaluate(el => (el.textContent || el.value || '').trim().substring(0, 50), candidate);
          console.log(`✅ [Method 1] Found button by selector "${selector}": "${text}"`);
          await candidate.click();
          console.log('✅ Button clicked!');
          return { clicked: true, method: 'selector', selector };
        }
      }
    }

    // === الطريقة 2: البحث بالنص ===
    console.log('🔍 [Method 2] Searching by text content...');
    const targetTexts = [
      'continue', 'next', 'sign in', 'log in', 'login', 'submit', 'send',
      'send code', 'send otp', 'request code', 'request otp', 'get code', 'get otp',
      'verify', 'confirm', 'proceed', 'go', 'enter',
      'متابعة', 'تسجيل', 'دخول', 'إرسال', 'أرسل', 'طلب', 'تأكيد',
      'إرسال الرمز', 'طلب الرمز', 'أرسل الرمز', 'تسجيل الدخول',
    ];

    const allClickable = await this.page.$$('button, [role="button"], input[type="submit"], a.btn, a[class*="button" i]');
    for (const el of allClickable) {
      const info = await this.page.evaluate(el => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          text: (el.textContent || el.value || el.getAttribute('aria-label') || '').toLowerCase().trim(),
          isVisible: style.display !== 'none' && 
                     style.visibility !== 'hidden' && 
                     style.opacity !== '0' &&
                     !el.disabled &&
                     rect.width > 20 && rect.height > 15,
          tag: el.tagName,
        };
      }, el);
      
      if (info.isVisible && targetTexts.some(t => info.text.includes(t))) {
        console.log(`✅ [Method 2] Found button by text: "${info.text}" (${info.tag})`);
        await el.click();
        console.log('✅ Button clicked!');
        return { clicked: true, method: 'text', text: info.text };
      }
    }

    // === الطريقة 3: البحث داخل form ===
    console.log('🔍 [Method 3] Searching inside form...');
    const form = await this.page.$('form');
    if (form) {
      const formButtons = await form.$$('button, [role="button"], input[type="submit"]');
      for (const btn of formButtons) {
        const isVisible = await this.page.evaluate(el => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 20 && rect.height > 15 && style.display !== 'none' && !el.disabled;
        }, btn);
        if (isVisible) {
          const text = await this.page.evaluate(el => (el.textContent || '').trim().substring(0, 50), btn);
          console.log(`✅ [Method 3] Found button in form: "${text}"`);
          await btn.click();
          console.log('✅ Button clicked!');
          return { clicked: true, method: 'form', text };
        }
      }
    }

    // === الطريقة 4: أي زر مرئي كبير (الأكبر حجماً) ===
    console.log('🔍 [Method 4] Finding largest visible button...');
    const allBtns = await this.page.$$('button, [role="button"]');
    let largestBtn = null;
    let largestArea = 0;
    
    for (const btn of allBtns) {
      const info = await this.page.evaluate(el => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return {
          area: rect.width * rect.height,
          visible: rect.width > 30 && rect.height > 20 && style.display !== 'none' && style.visibility !== 'hidden' && !el.disabled,
          text: (el.textContent || '').trim().substring(0, 50),
          rect: `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)}x${Math.round(rect.height)}`,
        };
      }, btn);
      
      if (info.visible && info.area > largestArea) {
        largestArea = info.area;
        largestBtn = { element: btn, ...info };
      }
    }

    if (largestBtn && largestArea > 500) {
      console.log(`✅ [Method 4] Clicking largest button: "${largestBtn.text}" (${largestBtn.rect}, area=${largestArea})`);
      await largestBtn.element.click();
      console.log('✅ Button clicked!');
      return { clicked: true, method: 'largest', text: largestBtn.text };
    }

    // === الطريقة 5: Enter و Tab+Enter ===
    console.log('⚠️ [Method 5] No button found! Trying keyboard...');
    await this.page.keyboard.press('Enter');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const urlAfterEnter = this.page.url();
    console.log('🔗 URL after Enter:', urlAfterEnter);
    
    // Tab + Enter
    await this.page.keyboard.press('Tab');
    await new Promise(resolve => setTimeout(resolve, 300));
    await this.page.keyboard.press('Enter');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('🔗 URL after Tab+Enter:', this.page.url());
    
    return { clicked: false, method: 'keyboard_fallback' };
  }

  /**
   * التحقق هل الصفحة انتقلت لصفحة OTP
   */
  async _checkPageChangedToOTP(url) {
    // التحقق من URL
    if (url.includes('otp') || url.includes('verify') || url.includes('code') || url.includes('confirm')) {
      console.log('✅ URL indicates OTP page');
      return true;
    }
    
    // التحقق من وجود حقول OTP في الصفحة
    const hasOtpFields = await this.page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type="text"], input[type="tel"], input[type="number"], input[inputmode="numeric"]');
      // إذا فيه 4-8 حقول رقمية صغيرة، غالباً حقول OTP
      let otpLikeCount = 0;
      inputs.forEach(input => {
        const rect = input.getBoundingClientRect();
        if (rect.width > 0 && rect.width < 80 && rect.height > 0) {
          otpLikeCount++;
        }
      });
      return otpLikeCount >= 4;
    });
    
    if (hasOtpFields) {
      console.log('✅ OTP-like input fields detected on page');
      return true;
    }
    
    // التحقق من وجود نص يدل على OTP
    const hasOtpText = await this.page.evaluate(() => {
      const bodyText = document.body?.textContent?.toLowerCase() || '';
      return bodyText.includes('verification') || bodyText.includes('otp') || 
             bodyText.includes('code') || bodyText.includes('رمز') || 
             bodyText.includes('تحقق');
    });
    
    if (hasOtpText) {
      console.log('✅ OTP-related text found on page');
      return true;
    }
    
    console.log('⚠️ Cannot confirm OTP page - proceeding anyway');
    return false;
  }

  /**
   * إدخال رمز OTP
   */
  async _enterOTP(otp) {
    // البحث عن حقول OTP
    const otpInputs = await this.page.$$('input[type="text"], input[type="tel"], input[type="number"], input[inputmode="numeric"]');
    console.log(`📝 Found ${otpInputs.length} potential OTP inputs`);
    
    // فلترة الحقول المرئية فقط
    const visibleInputs = [];
    for (const input of otpInputs) {
      const isVisible = await this.page.evaluate(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }, input);
      if (isVisible) visibleInputs.push(input);
    }
    
    console.log(`📝 Visible OTP inputs: ${visibleInputs.length}`);

    if (visibleInputs.length >= 4 && visibleInputs.length <= 8) {
      // حقول منفصلة لكل رقم
      console.log('📝 Entering OTP in separate fields...');
      for (let i = 0; i < Math.min(otp.length, visibleInputs.length); i++) {
        await visibleInputs[i].click();
        await new Promise(resolve => setTimeout(resolve, 100));
        await visibleInputs[i].type(otp[i], { delay: 80 });
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    } else if (visibleInputs.length >= 1) {
      // حقل واحد
      console.log('📝 Entering OTP in single field...');
      await visibleInputs[0].click({ clickCount: 3 });
      await new Promise(resolve => setTimeout(resolve, 200));
      await visibleInputs[0].type(otp, { delay: 50 });
    } else {
      // كتابة مباشرة
      console.log('📝 No visible inputs found, typing OTP directly...');
      await this.page.keyboard.type(otp, { delay: 80 });
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
   * استيراد Cookies مباشرة بدون تسجيل دخول
   */
  async importCookies(cookies, email = null) {
    try {
      console.log('🍪 Importing cookies directly...');
      
      if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
        return { success: false, error: 'يرجى تقديم cookies كمصفوفة' };
      }

      await this.openBrowser();
      this.page = await this.browser.newPage();
      
      await this.page.setViewport({ width: 1920, height: 1080 });
      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      const cleanedCookies = cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain || '.osnplus.com',
        path: c.path || '/',
        httpOnly: c.httpOnly !== undefined ? c.httpOnly : false,
        secure: c.secure !== undefined ? c.secure : true,
        sameSite: c.sameSite || 'Lax',
        ...(c.expires ? { expires: c.expires } : {}),
      }));

      await this.page.setCookie(...cleanedCookies);
      console.log(`✅ Injected ${cleanedCookies.length} cookies`);
      this._savedCookies = cleanedCookies;

      console.log('🔍 Verifying session...');
      await this.page.goto('https://osnplus.com', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      await new Promise(resolve => setTimeout(resolve, 3000));
      const currentUrl = this.page.url();
      console.log('🔗 URL after cookie import:', currentUrl);

      const isLoggedIn = !currentUrl.includes('login') && !currentUrl.includes('signin');
      
      if (isLoggedIn) {
        this.isLoggedIn = true;
        this.lastActivity = new Date();
        this.currentEmail = email || 'imported-session';
        this.loginAttempts = 0;
        console.log('🎉 Session imported successfully!');
        
        const screenshot = await this.page.screenshot({ encoding: 'base64' });
        return {
          success: true,
          message: 'تم استيراد الجلسة بنجاح!',
          screenshot: `data:image/png;base64,${screenshot}`,
        };
      } else {
        const screenshot = await this.page.screenshot({ encoding: 'base64' });
        return {
          success: false,
          error: 'الكوكيز منتهية أو غير صالحة',
          screenshot: `data:image/png;base64,${screenshot}`,
        };
      }
    } catch (error) {
      console.error('❌ Cookie import error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * تصدير الكوكيز الحالية
   */
  async exportCookies() {
    if (!this.page) {
      return { success: false, error: 'لا توجد جلسة مفتوحة' };
    }
    try {
      const cookies = await this.page.cookies();
      return { success: true, cookies, count: cookies.length };
    } catch (error) {
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
