/**
 * OSN Session Manager - Auto Login Version
 * يسجل دخول تلقائي بالإيميل + OTP من Gmail
 * لا يعتمد على كوكيز خارجية
 * مُحسّن لـ 512MB RAM
 */

class OSNSessionManager {
  constructor() {
    this.isLoggedIn = false;
    this.currentEmail = null;
    this.lastActivity = null;
    this.storedCookies = null;
  }

  /**
   * إعدادات Chrome الخفيفة جداً لـ 512MB RAM
   */
  _getChromeArgs() {
    return [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
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
   * فتح متصفح مؤقت - يُغلق بعد كل عملية
   */
  async _withBrowser(fn) {
    let browser = null;
    try {
      const puppeteer = (await import('puppeteer')).default;
      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable';
      
      console.log(`🌐 [_withBrowser] Opening browser... (executablePath: ${executablePath})`);
      console.log(`🌐 [_withBrowser] Memory: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)} MB`);
      
      browser = await puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      console.log('✅ [_withBrowser] Browser launched');
      return await fn(browser);
    } catch (browserError) {
      console.error('❌ [_withBrowser] Error:', browserError.message);
      return { 
        success: false, 
        error: `فشل تشغيل المتصفح: ${browserError.message}`,
      };
    } finally {
      if (browser) {
        try { await browser.close(); console.log('✅ Browser closed'); } catch {}
      }
    }
  }

  /**
   * تطبيق التمويه على الصفحة لتبدو كجهاز حقيقي
   */
  async _applyStealthToPage(page) {
    // User-Agent حقيقي من Chrome على Windows
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    await page.setUserAgent(userAgent);

    // إعداد viewport واقعي
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

    // إضافة headers واقعية
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    });

    // إزالة علامات البوت
    await page.evaluateOnNewDocument(() => {
      // إزالة navigator.webdriver
      Object.defineProperty(navigator, 'webdriver', { get: () => false });

      // إضافة plugins وهمية (المتصفح الحقيقي يملك plugins)
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const plugins = [
            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
            { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
          ];
          plugins.length = 3;
          return plugins;
        },
      });

      // إضافة languages
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'ar'] });
      Object.defineProperty(navigator, 'language', { get: () => 'en-US' });

      // إضافة platform
      Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });

      // إضافة hardware concurrency واقعي
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });

      // إضافة deviceMemory
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });

      // إضافة maxTouchPoints = 0 (ليس جهاز لمس)
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });

      // إخفاء أن Chrome يعمل headless
      Object.defineProperty(navigator, 'userAgentData', {
        get: () => ({
          brands: [
            { brand: 'Google Chrome', version: '131' },
            { brand: 'Chromium', version: '131' },
            { brand: 'Not_A Brand', version: '24' },
          ],
          mobile: false,
          platform: 'Windows',
          getHighEntropyValues: async () => ({
            architecture: 'x86',
            bitness: '64',
            fullVersionList: [
              { brand: 'Google Chrome', version: '131.0.6778.139' },
              { brand: 'Chromium', version: '131.0.6778.139' },
            ],
            model: '',
            platformVersion: '15.0.0',
            uaFullVersion: '131.0.6778.139',
          }),
        }),
      });

      // WebGL vendor/renderer واقعي
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (parameter) {
        if (parameter === 37445) return 'Google Inc. (NVIDIA)';
        if (parameter === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)';
        return getParameter.call(this, parameter);
      };

      // إخفاء automation flags
      window.chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}) };

      // إخفاء StackTrace of Error التي تكشف Puppeteer
      const originalError = Error;
      Error = class extends originalError {
        constructor(...args) {
          super(...args);
          if (this.stack) {
            this.stack = this.stack.replace(/puppeteer/gi, '').replace(/HeadlessChrome/gi, 'Chrome');
          }
        }
      };

      // إضافة screen dimensions واقعية
      Object.defineProperty(screen, 'width', { get: () => 1920 });
      Object.defineProperty(screen, 'height', { get: () => 1080 });
      Object.defineProperty(screen, 'availWidth', { get: () => 1920 });
      Object.defineProperty(screen, 'availHeight', { get: () => 1040 });
      Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
      Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });

      // إخفاء Notification permission (البوتات عادة لا تملكها)
      const originalQuery = window.Notification?.permission;
      if (window.Notification) {
        Object.defineProperty(Notification, 'permission', { get: () => 'default' });
      }

      // إضافة connection info واقعية
      Object.defineProperty(navigator, 'connection', {
        get: () => ({
          effectiveType: '4g',
          rtt: 50,
          downlink: 10,
          saveData: false,
        }),
      });
    });

    console.log('🕵️ [Stealth] Anti-detection measures applied');
  }

  /**
   * تسجيل دخول تلقائي عبر إيميل + OTP
   * @param {object} page - صفحة Puppeteer
   * @param {string} email - إيميل حساب OSN
   * @param {string} gmailAddress - إيميل Gmail لقراءة OTP
   * @param {string} gmailAppPassword - كلمة مرور تطبيق Gmail
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async _loginWithEmail(page, email, gmailAddress, gmailAppPassword) {
    console.log(`🔐 [Login] Starting auto-login for: ${email}`);
    console.log(`📧 [Login] Gmail for OTP: ${gmailAddress}`);

    try {
      // ====== الخطوة 1: الذهاب مباشرة لصفحة تسجيل الدخول بالإيميل ======
      console.log('🌐 [Login] Step 1: Navigating directly to email login page...');
      try {
        await page.goto('https://osnplus.com/en-sa/login/more-options?input_type=email', {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });
      } catch (navErr) {
        console.log('⚠️ [Login] Nav timeout, continuing:', navErr.message);
      }
      await this._sleep(3000);

      const loginUrl = page.url();
      console.log('🔗 [Login] Current URL:', loginUrl);

      // ====== الخطوة 2: البحث عن حقل الإيميل وإدخاله ======
      console.log('🔍 [Login] Step 2: Looking for email input...');
      
      let emailInput = await page.$('input[type="email"]');
      if (!emailInput) {
        emailInput = await page.$('input[name="email"]');
      }
      if (!emailInput) {
        emailInput = await page.$('input[placeholder*="email" i]');
      }
      if (!emailInput) {
        emailInput = await page.$('input[placeholder*="بريد" i]');
      }
      if (!emailInput) {
        // أي input نصي مرئي
        const inputs = await page.$$('input[type="text"], input:not([type])');
        if (inputs.length > 0) emailInput = inputs[0];
      }

      if (!emailInput) {
        const pageText = await page.evaluate(() => document.body?.innerText?.substring(0, 500)?.toLowerCase() || '');
        console.log('📄 [Login] Page text:', pageText.substring(0, 300));
        
        let screenshot = null;
        try { screenshot = await page.screenshot({ encoding: 'base64' }); } catch {}
        
        return { 
          success: false, 
          error: 'لم يتم العثور على حقل الإيميل في صفحة تسجيل الدخول',
          screenshot: screenshot ? `data:image/png;base64,${screenshot}` : null,
        };
      }

      // إدخال الإيميل
      await emailInput.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await emailInput.type(email, { delay: 80 });
      console.log(`📧 [Login] Email entered: ${email}`);
      await this._sleep(1000);

      // ====== الخطوة 3: الضغط على زر المتابعة ======
      console.log('🔍 [Login] Step 3: Looking for continue/submit button...');
      
      const continueBtn = await this._findButton(page, [
        'continue', 'next', 'submit', 'sign in', 'log in', 'send code',
        'متابعة', 'التالي', 'إرسال', 'تسجيل الدخول', 'أرسل الرمز',
        'send', 'verify', 'get code'
      ]);
      
      // تسجيل الوقت قبل الضغط على Continue لتجاهل أي OTP قديم
      const otpRequestTime = new Date().toISOString();
      console.log(`⏱️ [Login] OTP request timestamp: ${otpRequestTime}`);
      
      if (continueBtn) {
        const btnText = await page.evaluate(el => el.textContent?.trim(), continueBtn);
        console.log(`🔘 [Login] Clicking: "${btnText}"`);
        await continueBtn.click();
      } else {
        console.log('⏎ [Login] No button found, pressing Enter');
        await page.keyboard.press('Enter');
      }

      // ====== الخطوة 5: انتظار إرسال OTP ======
      console.log('⏳ [Login] Step 5: Waiting for OTP to be sent...');
      await this._sleep(8000); // انتظار 8 ثواني لإعطاء وقت كافي لوصول الرسالة

      // التحقق من وجود حقل OTP
      let otpInputs = await page.$$('input[type="tel"], input[type="number"], input[inputmode="numeric"], input[maxlength="1"]');
      
      // إذا لم نجد، ننتظر أكثر
      if (otpInputs.length === 0) {
        console.log('⏳ [Login] No OTP inputs yet, waiting more...');
        await this._sleep(5000);
        otpInputs = await page.$$('input[type="tel"], input[type="number"], input[inputmode="numeric"], input[maxlength="1"]');
      }

      // إذا ما زلنا لم نجد حقول OTP، نبحث عن أي input
      if (otpInputs.length === 0) {
        const allInputs = await page.$$('input:not([type="hidden"]):not([type="email"])');
        if (allInputs.length > 0) {
          console.log(`🔍 [Login] Found ${allInputs.length} general inputs for OTP`);
          otpInputs = allInputs;
        }
      }

      const currentPageText = await page.evaluate(() => document.body?.innerText?.substring(0, 500)?.toLowerCase() || '');
      console.log('📄 [Login] After submit page text:', currentPageText.substring(0, 300));

      // التحقق: هل الصفحة تطلب OTP أم لا؟
      const needsOTP = otpInputs.length > 0 || 
        currentPageText.includes('verification') || 
        currentPageText.includes('code') || 
        currentPageText.includes('otp') ||
        currentPageText.includes('رمز') ||
        currentPageText.includes('تحقق');

      if (!needsOTP) {
        // ربما تم تسجيل الدخول مباشرة بدون OTP
        const nowUrl = page.url();
        if (!nowUrl.includes('login')) {
          console.log('✅ [Login] Logged in without OTP!');
          return { success: true };
        }
        
        let screenshot = null;
        try { screenshot = await page.screenshot({ encoding: 'base64' }); } catch {}
        
        return {
          success: false,
          error: 'الصفحة لم تطلب رمز تحقق ولم يتم تسجيل الدخول',
          screenshot: screenshot ? `data:image/png;base64,${screenshot}` : null,
        };
      }

      // ====== الخطوة 6: جلب OTP من Gmail ======
      console.log('📧 [Login] Step 6: Fetching OTP from Gmail...');
      
      let otpCode = null;
      const maxOtpAttempts = 6;
      const otpDelay = 5000; // 5 ثواني بين كل محاولة

      for (let attempt = 1; attempt <= maxOtpAttempts; attempt++) {
        console.log(`📧 [Login] OTP attempt ${attempt}/${maxOtpAttempts}...`);
        
        try {
          // استخدام Edge Function بدل IMAP المحلي (أكثر موثوقية)
          const CLOUD_URL = process.env.SUPABASE_URL || 'https://wueacwqzafxsvowlqbwh.supabase.co';
          const CLOUD_ANON = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
          
          const otpResponse = await fetch(`${CLOUD_URL}/functions/v1/gmail-read-otp`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${CLOUD_ANON}`,
            },
            body: JSON.stringify({
              gmailAddress,
              gmailAppPassword,
              maxAgeMinutes: 3,
              senderFilter: 'osn',
              notBefore: otpRequestTime, // تجاهل أي رسالة قبل هذا الوقت
            }),
          });
          
          const otpResult = await otpResponse.json();
          console.log(`📧 [Login] OTP response:`, JSON.stringify(otpResult));
          
          if (otpResult.success && otpResult.otp) {
            otpCode = otpResult.otp;
            console.log(`✅ [Login] OTP found: ${otpCode}`);
            break;
          }
          console.log(`⏳ [Login] No OTP yet: ${otpResult.error}`);
        } catch (gmailErr) {
          console.error(`❌ [Login] Gmail error: ${gmailErr.message}`);
        }

        if (attempt < maxOtpAttempts) {
          await this._sleep(otpDelay);
        }
      }

      if (!otpCode) {
        let screenshot = null;
        try { screenshot = await page.screenshot({ encoding: 'base64' }); } catch {}
        
        return {
          success: false,
          error: 'لم يتم العثور على رمز OTP في Gmail بعد 30 ثانية. تأكد من صحة بيانات Gmail.',
          screenshot: screenshot ? `data:image/png;base64,${screenshot}` : null,
        };
      }

      // ====== الخطوة 7: إدخال OTP ======
      console.log(`📝 [Login] Step 7: Entering OTP: ${otpCode}`);
      
      // إعادة البحث عن حقول OTP (قد تكون تغيرت)
      otpInputs = await page.$$('input[type="tel"], input[type="number"], input[inputmode="numeric"], input[maxlength="1"]');
      if (otpInputs.length === 0) {
        otpInputs = await page.$$('input:not([type="hidden"]):not([type="email"])');
      }
      
      const digits = otpCode.split('');
      
      if (otpInputs.length >= digits.length) {
        // حقول منفصلة لكل رقم
        for (let i = 0; i < digits.length; i++) {
          await otpInputs[i].click({ clickCount: 3 });
          await page.keyboard.press('Backspace');
          await this._sleep(100);
          await otpInputs[i].type(digits[i], { delay: 100 });
          await this._sleep(150);
        }
      } else if (otpInputs.length === 1) {
        // حقل واحد
        await otpInputs[0].click({ clickCount: 3 });
        await page.keyboard.press('Backspace');
        await otpInputs[0].type(otpCode, { delay: 100 });
      } else {
        // fallback: كتابة عبر الكيبورد
        await page.keyboard.type(otpCode, { delay: 100 });
      }
      
      console.log('✅ [Login] OTP entered');
      await this._sleep(2000);

      // ====== الخطوة 8: الضغط على زر التأكيد (إن وُجد) ======
      const verifyBtn = await this._findButton(page, [
        'verify', 'confirm', 'submit', 'continue', 'تأكيد', 'تحقق', 'متابعة', 'إرسال'
      ]);
      if (verifyBtn) {
        const btnText = await page.evaluate(el => el.textContent?.trim(), verifyBtn);
        console.log(`🔘 [Login] Clicking verify: "${btnText}"`);
        await verifyBtn.click();
      } else {
        await page.keyboard.press('Enter');
      }

      // ====== الخطوة 9: انتظار تسجيل الدخول ======
      console.log('⏳ [Login] Step 9: Waiting for login to complete...');
      await this._sleep(8000);

      const finalUrl = page.url();
      console.log('🔗 [Login] Final URL:', finalUrl);

      const loggedIn = !finalUrl.includes('login');
      
      if (loggedIn) {
        console.log('🎉 [Login] SUCCESS! Logged in!');
        return { success: true };
      } else {
        const pageContent = await page.evaluate(() => document.body?.innerText?.substring(0, 300)?.toLowerCase() || '');
        console.log('📄 [Login] Still on login. Page:', pageContent.substring(0, 200));
        
        let screenshot = null;
        try { screenshot = await page.screenshot({ encoding: 'base64' }); } catch {}
        
        return {
          success: false,
          error: 'فشل تسجيل الدخول بعد إدخال OTP. قد يكون الرمز خاطئ أو منتهي.',
          screenshot: screenshot ? `data:image/png;base64,${screenshot}` : null,
        };
      }

    } catch (loginErr) {
      console.error('❌ [Login] Error:', loginErr.message);
      let screenshot = null;
      try { screenshot = await page.screenshot({ encoding: 'base64' }); } catch {}
      return {
        success: false,
        error: `خطأ أثناء تسجيل الدخول: ${loginErr.message}`,
        screenshot: screenshot ? `data:image/png;base64,${screenshot}` : null,
      };
    }
  }

  /**
   * إدخال كود التلفزيون مع تسجيل دخول تلقائي
   * @param {string} tvCode - الكود المعروض على شاشة التلفزيون
   * @param {object} credentials - بيانات الجلسة {email}
   */
  async enterTVCode(tvCode, credentials = {}) {
    const { email } = credentials;
    console.log(`📺 [enterTVCode] START - code: ${tvCode}, email: ${email}, hasCookies: ${!!(this.storedCookies?.length)}`);

    // التحقق من وجود كوكيز
    if (!this.storedCookies || !Array.isArray(this.storedCookies) || this.storedCookies.length === 0) {
      console.log('❌ [enterTVCode] No cookies available');
      return {
        success: false,
        paired: false,
        failed: true,
        message: '❌ لا توجد جلسة نشطة. يرجى استيراد الكوكيز أولاً.',
        method: 'api',
      };
    }

    console.log(`🚀 [enterTVCode] Using direct API method (cookies only, no browser)`);
    
    const authToken = this._extractAuthToken(this.storedCookies);
    const deviceId = this._extractDeviceId(this.storedCookies);
    
    if (!authToken) {
      console.log('❌ [enterTVCode] No auth token found in cookies');
      return {
        success: false,
        paired: false,
        failed: true,
        message: '❌ التوكن غير موجود في الكوكيز. يرجى إعادة استيراد الكوكيز.',
        method: 'api',
      };
    }

    console.log(`🔑 [enterTVCode] Auth token found (${authToken.substring(0, 20)}...)`);
    console.log(`📱 [enterTVCode] Device ID: ${deviceId}`);
    
    // محاولة أولى
    const apiResult = await this._linkTVViaAPI(tvCode, authToken, deviceId);
    
    if (apiResult.success) {
      this.lastActivity = new Date();
      return apiResult;
    }
    
    // إذا التوكن منتهي، نحاول تحديثه مرة واحدة
    if (apiResult.tokenExpired) {
      console.log('🔄 [enterTVCode] Token expired, trying to refresh...');
      const refreshResult = await this._refreshToken(this.storedCookies);
      if (refreshResult.newToken) {
        console.log('✅ [enterTVCode] Token refreshed, retrying...');
        const retryResult = await this._linkTVViaAPI(tvCode, refreshResult.newToken, deviceId);
        if (retryResult.success) {
          this.lastActivity = new Date();
          return retryResult;
        }
        return {
          success: false,
          paired: false,
          failed: true,
          message: retryResult.message || '❌ الكود غير صحيح أو منتهي الصلاحية',
          method: 'api',
        };
      }
      return {
        success: false,
        paired: false,
        failed: true,
        message: '❌ انتهت صلاحية الجلسة. يرجى إعادة استيراد الكوكيز.',
        method: 'api',
      };
    }
    
    // أي خطأ آخر - نرجع الرسالة مباشرة بدون fallback
    return {
      success: false,
      paired: false,
      failed: true,
      message: apiResult.message || apiResult.error || '❌ الكود غير صحيح أو منتهي الصلاحية',
      method: 'api',
    };
  }

  /**
   * استخراج Auth Token من الكوكيز
   */
  _extractAuthToken(cookies) {
    // ====== الطريقة الصحيحة: كوكيز auth مشفرة بـ URL Encoding ======
    const authCookie = cookies.find(c => c.name === 'auth');
    if (authCookie?.value) {
      try {
        const decoded = decodeURIComponent(authCookie.value);
        const authData = JSON.parse(decoded);
        if (authData.requestToken) {
          console.log(`🔑 Found requestToken from 'auth' cookie (${authData.requestToken.substring(0, 20)}...)`);
          return authData.requestToken;
        }
        // fallback: أي حقل token آخر داخل الكوكيز
        const possibleKeys = ['accessToken', 'access_token', 'token', 'jwt'];
        for (const key of possibleKeys) {
          if (authData[key]) {
            console.log(`🔑 Found ${key} from 'auth' cookie`);
            return authData[key];
          }
        }
        console.log('⚠️ auth cookie found but no token field. Keys:', Object.keys(authData).join(', '));
      } catch (e) {
        console.log(`⚠️ Failed to parse 'auth' cookie: ${e.message}`);
      }
    }

    // ====== Fallback: البحث في كوكيز أخرى ======
    const tokenCookieNames = ['access_token', 'token', 'auth_token', 'jwt', 'session', 'osnplus_token'];
    for (const name of tokenCookieNames) {
      const cookie = cookies.find(c => c.name?.toLowerCase() === name.toLowerCase());
      if (cookie?.value) {
        console.log(`🔑 Found token in cookie: ${name}`);
        return cookie.value;
      }
    }

    // البحث عن JWT token
    for (const cookie of cookies) {
      if (cookie.value && cookie.value.startsWith('eyJ') && cookie.value.includes('.')) {
        console.log(`🔑 Found JWT-like token in cookie: ${cookie.name}`);
        return cookie.value;
      }
    }

    console.log('❌ No auth token found. Available cookies:', cookies.map(c => c.name).join(', '));
    return null;
  }

  /**
   * استخراج Device ID من الكوكيز أو توليد واحد
   */
  _extractDeviceId(cookies) {
    // أولاً: البحث عن كوكيز udid مباشرة
    const udidCookie = cookies.find(c => c.name === 'udid');
    if (udidCookie?.value) {
      console.log(`📱 Found UDID from 'udid' cookie: ${udidCookie.value}`);
      return udidCookie.value;
    }

    // ثانياً: البحث في كوكيز auth عن UDID
    const authCookie = cookies.find(c => c.name === 'auth');
    if (authCookie?.value) {
      try {
        const decoded = decodeURIComponent(authCookie.value);
        const authData = JSON.parse(decoded);
        if (authData.udid || authData.deviceId || authData.device_id) {
          const udid = authData.udid || authData.deviceId || authData.device_id;
          console.log(`📱 Found UDID from auth cookie: ${udid}`);
          return udid;
        }
      } catch {}
    }

    const deviceCookieNames = ['device_id', 'deviceId', 'X-Device-Id', 'did'];
    for (const name of deviceCookieNames) {
      const cookie = cookies.find(c => c.name?.toLowerCase() === name.toLowerCase());
      if (cookie?.value) return cookie.value;
    }

    // Fallback: استخدام UDID ثابت معروف
    console.log('⚠️ No UDID found in cookies, using default');
    return '724b2fad-a96a-4582-ae59-b8e69ee7c75e';
  }

  /**
   * ربط التلفزيون عبر API مباشر (بدون متصفح!)
   */
  async _linkTVViaAPI(tvCode, authToken, deviceId) {
    try {
      const url = 'https://www.osnplus.com/api/v1/devices/link';
      
      console.log(`📡 [API] POST ${url} - code: ${tvCode}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'X-Device-Id': deviceId || this._extractDeviceId([]),
          'X-Platform': 'web',
          'Accept': 'application/json, text/plain, */*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          linkCode: tvCode,
        }),
      });

      const statusCode = response.status;
      let responseText = '';
      try { responseText = await response.text(); } catch {}
      
      console.log(`📬 [API] Response: ${statusCode} - ${responseText.substring(0, 300)}`);

      // التحقق من أن الرد JSON وليس HTML (OSN يرجع HTML مع 200 عند فشل الكود)
      const isHtml = responseText.trim().startsWith('<!') || responseText.trim().startsWith('<html');
      
      if (isHtml) {
        console.log('❌ [API] Received HTML instead of JSON - code is likely invalid');
        return {
          success: false,
          paired: false,
          failed: true,
          message: '❌ الكود غير صحيح أو منتهي الصلاحية',
          method: 'api',
        };
      }

      // محاولة تحليل JSON
      let jsonResponse = null;
      try { jsonResponse = JSON.parse(responseText); } catch {}

      if ((statusCode === 200 || statusCode === 201) && jsonResponse && !isHtml) {
        // التحقق من أن الرد يدل فعلاً على نجاح
        const hasError = jsonResponse.error || jsonResponse.errors || jsonResponse.message?.toLowerCase().includes('invalid');
        if (hasError) {
          console.log('❌ [API] Server returned error in JSON:', jsonResponse.error || jsonResponse.message);
          return {
            success: false,
            paired: false,
            failed: true,
            message: `❌ ${jsonResponse.message || jsonResponse.error || 'الكود غير صحيح'}`,
            method: 'api',
          };
        }
        
        console.log('🎉 [API] TV linked successfully!');
        return {
          success: true,
          paired: true,
          failed: false,
          message: '✅ تم ربط التلفزيون بنجاح عبر API!',
          method: 'api',
        };
      }

      if (statusCode === 401 || statusCode === 403) {
        console.log('🔒 [API] Token expired or unauthorized');
        return {
          success: false,
          tokenExpired: true,
          error: `توكن منتهي أو غير مصرح (${statusCode})`,
          method: 'api',
        };
      }

      // أي خطأ آخر
      let errorMsg = responseText;
      try {
        const errorJson = JSON.parse(responseText);
        errorMsg = errorJson.message || errorJson.error || responseText;
      } catch {}

      return {
        success: false,
        paired: false,
        failed: true,
        error: `فشل ربط التلفزيون: ${statusCode} - ${errorMsg}`,
        method: 'api',
      };

    } catch (fetchError) {
      console.error('❌ [API] Fetch error:', fetchError.message);
      return {
        success: false,
        error: `خطأ في الاتصال بـ API: ${fetchError.message}`,
        method: 'api',
      };
    }
  }

  /**
   * محاولة تحديث التوكن
   */
  async _refreshToken(cookies) {
    try {
      const refreshToken = cookies.find(c => 
        c.name?.toLowerCase().includes('refresh') && c.value
      );
      
      if (!refreshToken) {
        return { newToken: null };
      }

      console.log(`🔄 [Refresh] Trying refresh token: ${refreshToken.name}`);
      
      const response = await fetch('https://www.osnplus.com/api/v1/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        body: JSON.stringify({
          refreshToken: refreshToken.value,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const newToken = data.access_token || data.token;
        if (newToken) {
          console.log('✅ [Refresh] Got new token!');
          return { newToken };
        }
      }

      return { newToken: null };
    } catch (err) {
      console.error('❌ [Refresh] Error:', err.message);
      return { newToken: null };
    }
  }

  /**
   * تحويل الكوكيز لصيغة Puppeteer
   */
  _convertCookies(cookies) {
    const mapSameSite = (ss) => {
      if (!ss || ss === 'unspecified' || ss === '') return undefined;
      if (ss === 'no_restriction') return 'None';
      if (ss === 'lax') return 'Lax';
      if (ss === 'strict') return 'Strict';
      if (['Lax', 'Strict', 'None'].includes(ss)) return ss;
      return undefined;
    };

    return cookies
      .filter(c => c.name && c.value !== undefined)
      .map(c => ({
        name: c.name,
        value: c.value,
        domain: '.osnplus.com',
        path: '/',
        secure: true,
      }));
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

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * حالة الجلسة
   */
  getStatus() {
    return {
      isLoggedIn: this.isLoggedIn,
      email: this.currentEmail,
      lastActivity: this.lastActivity?.toISOString() || null,
      hasCookies: !!(this.storedCookies && this.storedCookies.length > 0),
    };
  }

  /**
   * إغلاق الجلسة
   */
  async closeBrowser() {
    this.isLoggedIn = false;
    this.storedCookies = null;
    this.currentEmail = null;
    console.log('✅ Session cleared');
  }

  /**
   * استيراد كوكيز (للتوافق مع النظام القديم)
   */
  async importCookies(cookies, email) {
    this.storedCookies = cookies;
    this.isLoggedIn = true;
    this.currentEmail = email || 'imported-session';
    this.lastActivity = new Date();
    console.log(`🍪 Imported ${cookies.length} cookies for ${this.currentEmail}`);
    return { success: true, message: 'تم استيراد الكوكيز', email: this.currentEmail };
  }

  /**
   * جلب OTP من Gmail
   */
  async getClientOTP(gmailAddress, gmailAppPassword) {
    if (!gmailAddress || !gmailAppPassword) {
      return { success: false, error: 'بيانات Gmail غير متوفرة' };
    }

    try {
      const GmailReader = (await import('./gmail-reader.js')).default;
      const reader = new GmailReader(gmailAddress, gmailAppPassword);
      const result = await reader.getLatestOTP(5);
      
      if (result.success && result.otp) {
        return { success: true, otp: result.otp };
      }
      return { success: false, error: result.error || 'لم يتم العثور على رمز OTP' };
    } catch (error) {
      return { success: false, error: `خطأ في قراءة Gmail: ${error.message}` };
    }
  }

  /**
   * تفعيل Crunchyroll على التلفزيون بإدخال كود 6 أرقام
   */
  async crunchyrollActivateTV(tvCode, email, password) {
    return await this._withBrowser(async (browser) => {
      const page = await browser.newPage();
      await this._applyStealthToPage(page);

      try {
        // الذهاب لصفحة تفعيل Crunchyroll
        console.log('📺 [Crunchyroll] Navigating to crunchyroll.com/activate');
        await page.goto('https://www.crunchyroll.com/ar/activate', { waitUntil: 'networkidle2', timeout: 30000 });
        await this._sleep(3000);

        // تسجيل الدخول أولاً إذا مطلوب
        const pageUrl = page.url();
        if (pageUrl.includes('login') || pageUrl.includes('signin')) {
          console.log('🔐 [Crunchyroll] Login required, logging in...');
          const emailInput = await page.$('input[type="email"], input[name="email"], #email_field');
          if (emailInput) {
            await emailInput.type(email, { delay: 80 });
            await this._sleep(500);
          }
          const passInput = await page.$('input[type="password"], input[name="password"], #password_field');
          if (passInput) {
            await passInput.type(password, { delay: 80 });
            await this._sleep(500);
          }
          const loginBtn = await this._findButton(page, ['log in', 'sign in', 'submit', 'تسجيل الدخول']);
          if (loginBtn) await loginBtn.click();
          else await page.keyboard.press('Enter');
          await this._sleep(5000);

          // إعادة التوجيه لصفحة التفعيل
          await page.goto('https://www.crunchyroll.com/ar/activate', { waitUntil: 'networkidle2', timeout: 30000 });
          await this._sleep(3000);
        }

        // إدخال كود التفعيل
        console.log(`📺 [Crunchyroll] Entering TV code: ${tvCode}`);
        const codeInput = await page.$('input[type="text"], input[name="code"], input[placeholder*="code" i], input[maxlength="6"]');
        if (!codeInput) {
          // محاولة البحث عن أي input مرئي
          const inputs = await page.$$('input:not([type="hidden"])');
          if (inputs.length > 0) {
            await inputs[0].type(tvCode, { delay: 100 });
          } else {
            return { success: false, error: 'لم يتم العثور على حقل إدخال الكود' };
          }
        } else {
          await codeInput.click({ clickCount: 3 });
          await page.keyboard.press('Backspace');
          await codeInput.type(tvCode, { delay: 100 });
        }
        await this._sleep(1000);

        // الضغط على زر التفعيل
        const activateBtn = await this._findButton(page, ['activate', 'link', 'submit', 'connect', 'تفعيل', 'ربط']);
        if (activateBtn) await activateBtn.click();
        else await page.keyboard.press('Enter');
        await this._sleep(5000);

        // التحقق من النجاح
        const resultText = await page.evaluate(() => document.body?.innerText?.toLowerCase() || '');
        if (resultText.includes('success') || resultText.includes('activated') || resultText.includes('linked') || resultText.includes('connected')) {
          console.log('✅ [Crunchyroll] TV activated successfully!');
          return { success: true, message: 'تم تفعيل Crunchyroll على التلفزيون بنجاح!' };
        }

        if (resultText.includes('invalid') || resultText.includes('expired') || resultText.includes('error')) {
          return { success: false, error: 'الكود غير صحيح أو منتهي الصلاحية' };
        }

        // غير متأكد - نعتبره نجاح مبدئي
        return { success: true, message: 'تم إدخال الكود. تحقق من شاشة التلفزيون.' };
      } catch (err) {
        console.error('❌ [Crunchyroll] TV activation error:', err.message);
        return { success: false, error: err.message };
      }
    });
  }

  /**
   * تغيير كلمة مرور Crunchyroll بعد تفعيل الهاتف
   */
  async crunchyrollChangePassword(email, gmailAddress, gmailAppPassword) {
    return await this._withBrowser(async (browser) => {
      const page = await browser.newPage();
      await this._applyStealthToPage(page);

      try {
        // طلب تغيير كلمة المرور من Crunchyroll - الرابط الصحيح
        console.log('🔐 [Crunchyroll] Requesting password reset via sso.crunchyroll.com...');
        await page.goto('https://sso.crunchyroll.com/reset-password', { waitUntil: 'networkidle2', timeout: 30000 });
        await this._sleep(4000);

        // Debug: log page content to identify form structure
        const pageUrl = page.url();
        console.log(`🔍 [Crunchyroll] Current URL: ${pageUrl}`);
        const pageTitle = await page.title();
        console.log(`🔍 [Crunchyroll] Page title: ${pageTitle}`);
        
        // Log all input elements on page
        const inputsInfo = await page.evaluate(() => {
          const inputs = document.querySelectorAll('input');
          return Array.from(inputs).map(i => ({
            type: i.type, name: i.name, id: i.id, placeholder: i.placeholder, className: i.className?.substring(0, 50)
          }));
        });
        console.log(`🔍 [Crunchyroll] Found ${inputsInfo.length} inputs:`, JSON.stringify(inputsInfo));

        // البحث عن حقل الإيميل بسيلكتورات موسعة
        const emailSelectors = [
          'input[type="email"]',
          'input[name="email"]', 
          'input[name="username"]',
          'input[type="text"]',
          'input[placeholder*="email" i]',
          'input[placeholder*="mail" i]',
          'input[id*="email" i]',
          'input[aria-label*="email" i]',
          'input:not([type="hidden"]):not([type="submit"]):not([type="checkbox"])',
        ];
        
        let emailInput = null;
        for (const selector of emailSelectors) {
          emailInput = await page.$(selector);
          if (emailInput) {
            console.log(`✅ [Crunchyroll] Found email input with selector: ${selector}`);
            break;
          }
        }
        
        if (emailInput) {
          await emailInput.click();
          await this._sleep(300);
          await emailInput.type(email, { delay: 80 });
          await this._sleep(500);
        } else {
          // Try iframe approach - some sites embed forms in iframes
          const frames = page.frames();
          console.log(`🔍 [Crunchyroll] Checking ${frames.length} frames...`);
          for (const frame of frames) {
            emailInput = await frame.$('input[type="email"], input[name="email"], input[type="text"]');
            if (emailInput) {
              console.log(`✅ [Crunchyroll] Found email input inside iframe: ${frame.url()}`);
              await emailInput.click();
              await this._sleep(300);
              await emailInput.type(email, { delay: 80 });
              await this._sleep(500);
              break;
            }
          }
          
          if (!emailInput) {
            const html = await page.content();
            console.error(`❌ [Crunchyroll] Email input not found. Page HTML (first 2000 chars): ${html.substring(0, 2000)}`);
            return { success: false, error: 'لم يتم العثور على حقل الإيميل في صفحة تغيير الباسورد' };
          }
        }

        // الضغط على زر الإرسال
        const submitBtn = await this._findButton(page, ['submit', 'send', 'reset', 'إرسال', 'Request', 'request']);
        if (submitBtn) await submitBtn.click();
        else await page.keyboard.press('Enter');
        await this._sleep(5000);
        
        console.log('✅ [Crunchyroll] Password reset request submitted');

        // انتظار رابط تغيير الباسورد من Gmail
        if (!gmailAddress || !gmailAppPassword) {
          return { success: false, error: 'بيانات Gmail غير متوفرة لقراءة رابط تغيير الباسورد' };
        }

        console.log('📧 [Crunchyroll] Waiting for password reset email...');
        let resetLink = null;
        const CLOUD_URL = process.env.SUPABASE_URL || 'https://wueacwqzafxsvowlqbwh.supabase.co';
        const CLOUD_ANON = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

        for (let attempt = 1; attempt <= 6; attempt++) {
          console.log(`📧 [Crunchyroll] Attempt ${attempt}/6 to find reset link...`);
          try {
            const otpResponse = await fetch(`${CLOUD_URL}/functions/v1/gmail-read-otp`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CLOUD_ANON}`,
              },
              body: JSON.stringify({
                gmailAddress,
                gmailAppPassword,
                maxAgeMinutes: 5,
                senderFilter: 'crunchyroll',
                extractType: 'link',
                linkFilter: 'crunchyroll.com',
              }),
            });
            const result = await otpResponse.json();
            if (result.success && (result.link || result.otp)) {
              resetLink = result.link || result.otp;
              break;
            }
          } catch (err) {
            console.error(`❌ Gmail error: ${err.message}`);
          }
          await this._sleep(5000);
        }

        if (!resetLink) {
          return { success: false, error: 'لم يتم العثور على رابط تغيير كلمة المرور في Gmail' };
        }

        // فتح رابط تغيير الباسورد (مثل https://sso.crunchyroll.com/new-password?token=xxx)
        console.log(`🔗 [Crunchyroll] Opening reset link: ${resetLink.substring(0, 80)}...`);
        await page.goto(resetLink, { waitUntil: 'networkidle2', timeout: 30000 });
        await this._sleep(3000);

        // إنشاء كلمة مرور جديدة
        const newPassword = 'CR' + Math.random().toString(36).substring(2, 8) + '!' + Math.floor(Math.random() * 100);
        console.log(`🔐 [Crunchyroll] New password: ${newPassword}`);

        // البحث عن حقول كلمة المرور
        const passInputs = await page.$$('input[type="password"]');
        if (passInputs.length >= 2) {
          await passInputs[0].type(newPassword, { delay: 80 });
          await this._sleep(300);
          await passInputs[1].type(newPassword, { delay: 80 });
          await this._sleep(500);
        } else if (passInputs.length === 1) {
          await passInputs[0].type(newPassword, { delay: 80 });
          await this._sleep(500);
        } else {
          return { success: false, error: 'لم يتم العثور على حقل كلمة المرور في صفحة إعادة التعيين' };
        }

        // الضغط على حفظ
        const saveBtn = await this._findButton(page, ['save', 'submit', 'reset', 'change', 'حفظ', 'تغيير']);
        if (saveBtn) await saveBtn.click();
        else await page.keyboard.press('Enter');
        await this._sleep(5000);

        console.log('✅ [Crunchyroll] Password changed successfully!');
        return { success: true, newPassword, message: 'تم تغيير كلمة المرور بنجاح' };
      } catch (err) {
        console.error('❌ [Crunchyroll] Password change error:', err.message);
        return { success: false, error: err.message };
      }
    });
  }
}

const sessionManager = new OSNSessionManager();
export default sessionManager;
