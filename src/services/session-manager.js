/**
 * OSN Session Manager - Ultra Light Version
 * المتصفح يُفتح فقط عند الحاجة ويُغلق فوراً بعد كل عملية
 * مُحسّن لـ 512MB RAM
 */

class OSNSessionManager {
  constructor() {
    this.isLoggedIn = false;
    this.currentEmail = null;
    this.lastActivity = null;
    this.loginAttempts = 0;
    this.maxLoginAttempts = 3;
    this.storedCookies = null; // نحتفظ بالكوكيز في الذاكرة فقط
  }

  /**
   * إعدادات Chrome الخفيفة جداً لـ 512MB RAM
   */
  _getChromeArgs() {
    return [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--single-process',
      '--no-zygote',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--disable-features=site-per-process,TranslateUI',
      '--no-first-run',
      '--mute-audio',
      '--hide-scrollbars',
      // تقليل استهلاك الذاكرة
      '--js-flags=--max-old-space-size=128',
      '--disable-canvas-aa',
      '--disable-2d-canvas-clip-aa',
      '--disable-gl-drawing-for-tests',
      '--disable-font-subpixel-positioning',
      '--disable-remote-fonts',
      '--disable-webgl',
      '--disable-accelerated-2d-canvas',
      '--disable-accelerated-jpeg-decoding',
      '--disable-accelerated-mjpeg-decode',
      '--disable-accelerated-video-decode',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-component-extensions-with-background-pages',
      '--disable-component-update',
      '--disable-domain-reliability',
      '--disable-hang-monitor',
      '--disable-ipc-flooding-protection',
      '--disable-notifications',
      '--disable-offer-store-unmasked-wallet-cards',
      '--disable-popup-blocking',
      '--disable-print-preview',
      '--disable-prompt-on-repost',
      '--disable-renderer-backgrounding',
      '--disable-speech-api',
      '--metrics-recording-only',
      '--no-default-browser-check',
      '--ignore-certificate-errors',
    ];
  }

  /**
   * فتح متصفح مؤقت - يُستخدم داخلياً فقط
   * يُغلق بعد كل عملية!
   */
  async _withBrowser(fn) {
    let browser = null;
    try {
      const puppeteer = (await import('puppeteer')).default;
      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable';
      
      console.log('🌐 Opening lightweight browser...');
      browser = await puppeteer.launch({
        headless: 'new',
        executablePath,
        args: this._getChromeArgs(),
      });

      const result = await fn(browser);
      return result;
    } finally {
      if (browser) {
        try {
          await browser.close();
          console.log('✅ Browser closed - RAM freed');
        } catch {}
      }
    }
  }

  /**
   * إنشاء صفحة خفيفة - بدون صور وخطوط وCSS
   */
  async _createLightPage(browser) {
    const page = await browser.newPage();
    
    // Viewport صغير لتوفير الذاكرة
    await page.setViewport({ width: 800, height: 600 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // حظر الموارد الثقيلة (صور، خطوط، CSS، فيديو)
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'font', 'stylesheet', 'media', 'texttrack', 'manifest'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    return page;
  }

  /**
   * تهيئة الجلسة - بدون فتح متصفح
   */
  async initialize(email, gmailAppPassword) {
    console.log('🚀 Initializing OSN Session Manager (ultra-light mode)...');
    this.loginAttempts = 0;
    this.currentEmail = email;
    
    // لا نفتح متصفح هنا - فقط نحفظ البيانات
    console.log('✅ Session manager ready. Browser will open only when needed.');
    return { 
      success: true, 
      message: 'تم تجهيز المدير. المتصفح يُفتح فقط عند الحاجة لتوفير الذاكرة.' 
    };
  }

  /**
   * إغلاق المتصفح (للتوافق)
   */
  async closeBrowser() {
    // لا يوجد متصفح مفتوح دائماً
    this.isLoggedIn = false;
    this.storedCookies = null;
    this.currentEmail = null;
    console.log('✅ Session cleared');
  }

  /**
   * استيراد كوكيز - يفتح متصفح مؤقت للتحقق ثم يُغلقه
   */
  async importCookies(cookies, email) {
    return await this._withBrowser(async (browser) => {
      console.log(`🍪 Importing ${cookies.length} cookies...`);

      const page = await this._createLightPage(browser);

      // تحويل الكوكيز لصيغة Puppeteer
      const puppeteerCookies = cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain || '.osnplus.com',
        path: c.path || '/',
        secure: c.secure || false,
        httpOnly: c.httpOnly || false,
        ...(c.expirationDate ? { expires: c.expirationDate } : {}),
      }));

      await page.setCookie(...puppeteerCookies);
      console.log('✅ Cookies set in browser');

      // التحقق من الجلسة
      try {
        await page.goto('https://osnplus.com/', {
          waitUntil: 'domcontentloaded',
          timeout: 20000,
        });
      } catch (navError) {
        console.log('⚠️ Navigation slow but continuing:', navError.message);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      const currentUrl = page.url();
      console.log('🔗 URL after cookie import:', currentUrl);

      const loggedIn = !currentUrl.includes('login');

      if (loggedIn) {
        // حفظ الكوكيز في الذاكرة للاستخدام لاحقاً
        this.storedCookies = cookies;
        this.isLoggedIn = true;
        this.currentEmail = email || 'imported-session';
        this.lastActivity = new Date();
        this.loginAttempts = 0;

        console.log('🎉 Cookie import successful! Logged in as:', this.currentEmail);
        return {
          success: true,
          message: 'تم استيراد الكوكيز بنجاح',
          email: this.currentEmail,
        };
      } else {
        console.error('❌ Cookie import failed - redirected to login');
        return {
          success: false,
          error: 'الكوكيز منتهية الصلاحية أو غير صالحة',
        };
      }
    });
  }




  /**
   * إدخال كود التلفزيون في صفحة ربط الأجهزة
   * @param {string} tvCode - الكود المعروض على شاشة التلفزيون
   */
  async enterTVCode(tvCode) {
    if (!this.isLoggedIn || !this.storedCookies) {
      return { success: false, error: 'الجلسة غير متصلة - يرجى استيراد الكوكيز أولاً' };
    }

    return await this._withBrowser(async (browser) => {
      console.log(`📺 Entering TV code: ${tvCode}`);

      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // حقن الكوكيز المحفوظة
      const puppeteerCookies = this.storedCookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain || '.osnplus.com',
        path: c.path || '/',
        secure: c.secure || false,
        httpOnly: c.httpOnly || false,
        ...(c.expirationDate ? { expires: c.expirationDate } : {}),
      }));
      await page.setCookie(...puppeteerCookies);

      // الذهاب لصفحة ربط التلفزيون
      try {
        await page.goto('https://osnplus.com/en/login/tv', {
          waitUntil: 'domcontentloaded',
          timeout: 25000,
        });
      } catch {
        console.log('⚠️ TV login page slow, continuing...');
      }

      await new Promise(resolve => setTimeout(resolve, 3000));

      const currentUrl = page.url();
      console.log('🔗 TV login page URL:', currentUrl);

      // التحقق أن الجلسة لا تزال صالحة
      if (currentUrl.includes('login') && !currentUrl.includes('login/tv')) {
        this.isLoggedIn = false;
        this.storedCookies = null;
        return { success: false, error: 'الكوكيز منتهية - يرجى استيراد كوكيز جديدة' };
      }

      // البحث عن حقل إدخال الكود
      const codeInputSelectors = [
        'input[type="text"]',
        'input[type="tel"]',
        'input[inputmode="numeric"]',
        'input[placeholder*="code" i]',
        'input[placeholder*="رمز" i]',
        'input[name*="code" i]',
        'input[name*="pin" i]',
      ];

      let codeInput = null;
      for (const selector of codeInputSelectors) {
        codeInput = await page.$(selector);
        if (codeInput) {
          console.log(`✅ Found code input: ${selector}`);
          break;
        }
      }

      // إذا كان هناك عدة حقول (كل حقل لرقم واحد)
      const allInputs = await page.$$('input[type="text"], input[type="tel"], input[inputmode="numeric"]');
      
      if (allInputs.length >= 4 && allInputs.length <= 8) {
        // حقول منفصلة لكل رقم (مثل OTP inputs)
        console.log(`📝 Found ${allInputs.length} separate input fields - entering digits one by one`);
        const digits = tvCode.replace(/\s/g, '').split('');
        for (let i = 0; i < Math.min(digits.length, allInputs.length); i++) {
          await allInputs[i].click();
          await allInputs[i].type(digits[i], { delay: 100 });
        }
      } else if (codeInput) {
        // حقل واحد
        console.log('📝 Found single input field - entering full code');
        await codeInput.click();
        await codeInput.type(tvCode, { delay: 50 });
      } else {
        // لم نجد حقل - نحاول الكتابة مباشرة
        console.log('⚠️ No input found, trying keyboard input...');
        await page.keyboard.type(tvCode, { delay: 100 });
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      // البحث عن زر التأكيد والضغط عليه
      const confirmButton = await this._findButton(page, [
        'connect', 'link', 'pair', 'submit', 'confirm', 'verify',
        'ربط', 'تأكيد', 'إرسال', 'اتصال', 'continue', 'next', 'متابعة', 'التالي'
      ]);

      if (confirmButton) {
        console.log('🔘 Clicking confirm button...');
        await confirmButton.click();
      } else {
        // ضغط Enter كبديل
        console.log('⏎ No confirm button found, pressing Enter...');
        await page.keyboard.press('Enter');
      }

      // انتظار النتيجة
      await new Promise(resolve => setTimeout(resolve, 5000));

      // أخذ screenshot للنتيجة
      const resultScreenshot = await page.screenshot({ encoding: 'base64' });
      const finalUrl = page.url();
      
      // محاولة اكتشاف النجاح
      const pageContent = await page.evaluate(() => document.body.innerText.toLowerCase());
      const isSuccess = pageContent.includes('success') || 
                        pageContent.includes('connected') || 
                        pageContent.includes('paired') ||
                        pageContent.includes('نجاح') ||
                        pageContent.includes('تم الربط') ||
                        pageContent.includes('مرتبط');

      this.lastActivity = new Date();

      return {
        success: true,
        paired: isSuccess,
        screenshot: `data:image/png;base64,${resultScreenshot}`,
        finalUrl,
        message: isSuccess 
          ? 'تم ربط التلفزيون بنجاح!' 
          : 'تم إدخال الكود - تحقق من الصورة للنتيجة',
      };
    });
  }

  /**
   * بحث عن زر بالنص
   */
  async _findButton(page, texts) {
    const buttons = await page.$$('button, a, [role="button"]');
    for (const btn of buttons) {
      const text = await page.evaluate(el => (el.textContent || '').toLowerCase().trim(), btn);
      if (texts.some(t => text.includes(t))) {
        return btn;
      }
    }
    return null;
  }

  /**
   * حالة الجلسة
   */
  getStatus() {
    return {
      isLoggedIn: this.isLoggedIn,
      email: this.currentEmail,
      lastActivity: this.lastActivity?.toISOString() || null,
      browserConnected: false, // المتصفح لا يبقى مفتوحاً
    };
  }

  /**
   * التحقق من صلاحية الجلسة
   */
  async ensureLoggedIn() {
    if (this.isLoggedIn && this.storedCookies) {
      return { success: true };
    }
    this.isLoggedIn = false;
    return { success: false, error: 'الجلسة منتهية. يرجى استيراد كوكيز جديدة.' };
  }

  /**
   * جلب OTP من Gmail عبر GmailReader
   * @param {string} gmailAddress - عنوان Gmail
   * @param {string} gmailAppPassword - كلمة مرور التطبيق
   */
  async getClientOTP(gmailAddress, gmailAppPassword) {
    if (!gmailAddress || !gmailAppPassword) {
      return { success: false, error: 'بيانات Gmail غير متوفرة' };
    }

    try {
      const GmailReader = (await import('./gmail-reader.js')).default;
      const reader = new GmailReader(gmailAddress, gmailAppPassword);
      
      console.log(`📧 Reading OTP from Gmail: ${gmailAddress}`);
      const result = await reader.getLatestOTP(5); // آخر 5 دقائق
      
      if (result.success && result.otp) {
        console.log(`✅ OTP found from Gmail: ${result.otp}`);
        return { success: true, otp: result.otp };
      } else {
        console.log(`❌ No OTP found: ${result.error}`);
        return { success: false, error: result.error || 'لم يتم العثور على رمز OTP' };
      }
    } catch (error) {
      console.error('❌ Gmail OTP Error:', error.message);
      return { success: false, error: `خطأ في قراءة Gmail: ${error.message}` };
    }
  }
}

// Singleton instance
const sessionManager = new OSNSessionManager();

export default sessionManager;
