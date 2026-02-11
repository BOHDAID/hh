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
      
      console.log(`🌐 [_withBrowser] Opening browser... (executablePath: ${executablePath})`);
      console.log(`🌐 [_withBrowser] Memory usage: ${JSON.stringify(process.memoryUsage().rss / 1024 / 1024)} MB`);
      
      browser = await puppeteer.launch({
        headless: 'new',
        executablePath,
        args: this._getChromeArgs(),
        timeout: 30000,
      });

      console.log('✅ [_withBrowser] Browser launched successfully');
      const result = await fn(browser);
      return result;
    } catch (browserError) {
      console.error('❌ [_withBrowser] Browser error:', browserError.message);
      console.error('❌ [_withBrowser] Stack:', browserError.stack?.substring(0, 300));
      return { 
        success: false, 
        error: `فشل تشغيل المتصفح: ${browserError.message}. تأكد أن Chrome مثبت على السيرفر (Docker image).`,
      };
    } finally {
      if (browser) {
        try {
          await browser.close();
          console.log('✅ [_withBrowser] Browser closed - RAM freed');
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
    console.log(`📺 [enterTVCode] START - code: ${tvCode}, isLoggedIn: ${this.isLoggedIn}, hasCookies: ${!!this.storedCookies}, cookiesCount: ${this.storedCookies?.length || 0}`);
    
    if (!this.storedCookies || !Array.isArray(this.storedCookies) || this.storedCookies.length === 0) {
      console.error('❌ [enterTVCode] ABORT - no cookies');
      return { success: false, error: 'لا توجد كوكيز. يرجى استيراد كوكيز OSN أولاً.' };
    }

    return await this._withBrowser(async (browser) => {
      let page = null;
      try {
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // ====== الخطوة 1: تحويل وحقن الكوكيز ======
        const puppeteerCookies = this._convertCookies(this.storedCookies);
        console.log(`🍪 [enterTVCode] Setting ${puppeteerCookies.length} cookies...`);
        
        const authCookie = puppeteerCookies.find(c => c.name === 'auth');
        if (authCookie) {
          console.log(`🔑 Auth cookie: domain=${authCookie.domain}, secure=${authCookie.secure}`);
        } else {
          console.warn('⚠️ NO auth cookie in cookies!');
        }
        
        await page.setCookie(...puppeteerCookies);

        // ====== الخطوة 2: زيارة الصفحة الرئيسية وانتظار JS لتجديد التوكن ======
        console.log('🌐 Step 1: Visiting homepage (networkidle2 for token refresh)...');
        try {
          await page.goto('https://osnplus.com/', {
            waitUntil: 'networkidle2',
            timeout: 25000,
          });
        } catch (navErr) {
          console.log('⚠️ Homepage nav timeout, continuing:', navErr.message);
        }
        // انتظار إضافي للسماح لـ JS بتجديد التوكن
        await new Promise(resolve => setTimeout(resolve, 3000));

        // ====== الخطوة 2.5: حفظ الكوكيز المحدّثة (بعد تجديد التوكن بواسطة JS) ======
        const refreshedCookies = await page.cookies('https://osnplus.com');
        if (refreshedCookies.length > 0) {
          const newAuth = refreshedCookies.find(c => c.name === 'auth');
          if (newAuth) {
            console.log(`🔄 Auth cookie refreshed by JS! New value length: ${newAuth.value.length}`);
            // حفظ الكوكيز المحدّثة في الذاكرة
            this.storedCookies = refreshedCookies.map(c => ({
              name: c.name,
              value: c.value,
              domain: c.domain,
              path: c.path,
              secure: c.secure,
              httpOnly: c.httpOnly,
              sameSite: c.sameSite,
              ...(c.expires && c.expires > 0 ? { expirationDate: c.expires } : {}),
            }));
            this._refreshedCookies = this.storedCookies; // للحفظ في DB لاحقاً
          }
        }
        
        const homeUrl = page.url();
        console.log('🔗 Homepage URL:', homeUrl);

        // ====== الخطوة 3: التوجه مباشرة لصفحة TV code ======
        // استخدام /en/ بدل اللغة المحلية لتفادي إعادة التوجيه
        const tvUrl = 'https://osnplus.com/en/login/tv';
        console.log(`🌐 Step 2: Navigating to ${tvUrl}...`);
        try {
          await page.goto(tvUrl, {
            waitUntil: 'networkidle2',
            timeout: 30000,
          });
        } catch (navErr) {
          console.log('⚠️ TV page timeout, continuing:', navErr.message);
        }
        await new Promise(resolve => setTimeout(resolve, 3000));

        const currentUrl = page.url();
        console.log('🔗 Current URL:', currentUrl);

        // ====== الخطوة 4: التحقق من حالة الصفحة ======
        let beforeScreenshot = null;
        try {
          beforeScreenshot = await page.screenshot({ encoding: 'base64' });
        } catch {}

        // البحث عن حقول الإدخال أولاً
        let codeInputs = await page.$$('input[type="tel"], input[type="number"], input[inputmode="numeric"], input[maxlength="1"]');
        console.log(`🔍 Code inputs found: ${codeInputs.length}`);

        // إذا لم نجد حقول، ننتظر أكثر (الصفحة قد تكون SPA)
        if (codeInputs.length === 0) {
          console.log('⏳ No inputs yet, waiting 5s for SPA render...');
          await new Promise(resolve => setTimeout(resolve, 5000));
          codeInputs = await page.$$('input[type="tel"], input[type="number"], input[inputmode="numeric"], input[maxlength="1"]');
          console.log(`🔍 Code inputs after wait: ${codeInputs.length}`);
        }

        // إذا ما زالت لا توجد حقول، نتحقق من محتوى الصفحة
        if (codeInputs.length === 0) {
          const pageText = await page.evaluate(() => document.body?.innerText?.substring(0, 1000)?.toLowerCase() || '');
          console.log('📄 Page text:', pageText.substring(0, 400));

          const isLoginPage = ['continue with google', 'continue with apple', 'sign up or login', 'create your account']
            .some(k => pageText.includes(k));

          if (isLoginPage) {
            console.error('❌ Login page detected. Session invalid.');
            this.isLoggedIn = false;
            this.storedCookies = null;
            return {
              success: false,
              error: 'الكوكيز منتهية الصلاحية - الموقع يعرض صفحة تسجيل الدخول. يرجى تصدير كوكيز جديدة من المتصفح.',
              screenshot: beforeScreenshot ? `data:image/png;base64,${beforeScreenshot}` : null,
              finalUrl: currentUrl,
            };
          }

          // محاولة أخيرة: البحث عن أي input
          const anyInputs = await page.$$('input:not([type="hidden"])');
          if (anyInputs.length > 0) {
            console.log(`🔍 Found ${anyInputs.length} general inputs, using those`);
            codeInputs = anyInputs;
          } else {
            return {
              success: false,
              error: 'لم يتم العثور على حقول إدخال. الصفحة قد لم تُحمّل بشكل صحيح.',
              screenshot: beforeScreenshot ? `data:image/png;base64,${beforeScreenshot}` : null,
              finalUrl: currentUrl,
            };
          }
        }

        // ====== الخطوة 5: إدخال الكود ======
        const digits = tvCode.replace(/[\s\-]/g, '').split('');
        console.log(`📝 Entering ${digits.length} digits into ${codeInputs.length} fields`);

        if (codeInputs.length >= digits.length) {
          // حقول منفصلة لكل رقم
          for (let i = 0; i < digits.length; i++) {
            await codeInputs[i].click({ clickCount: 3 });
            await page.keyboard.press('Backspace');
            await new Promise(r => setTimeout(r, 100));
            await codeInputs[i].type(digits[i], { delay: 150 });
            await new Promise(r => setTimeout(r, 200));
          }
        } else if (codeInputs.length === 1) {
          await codeInputs[0].click({ clickCount: 3 });
          await page.keyboard.press('Backspace');
          await codeInputs[0].type(tvCode, { delay: 100 });
        } else {
          // fallback: كتابة عبر الكيبورد
          await codeInputs[0].click();
          await page.keyboard.type(tvCode, { delay: 150 });
        }
        console.log('✅ Code entered');

        await new Promise(r => setTimeout(r, 1500));

        // ====== الخطوة 6: الضغط على زر التأكيد ======
        const confirmButton = await this._findButton(page, [
          'connect', 'link', 'pair', 'submit', 'confirm', 'verify',
          'ربط', 'تأكيد', 'إرسال', 'continue', 'next', 'متابعة', 'التالي'
        ]);
        if (confirmButton) {
          const btnText = await page.evaluate(el => el.textContent?.trim(), confirmButton);
          console.log(`🔘 Clicking: "${btnText}"`);
          await confirmButton.click();
        } else {
          console.log('⏎ No button, pressing Enter');
          await page.keyboard.press('Enter');
        }

        // ====== الخطوة 7: انتظار النتيجة ======
        await new Promise(r => setTimeout(r, 6000));

        let resultScreenshot = null;
        try {
          resultScreenshot = await page.screenshot({ encoding: 'base64' });
        } catch {}

        const finalUrl = page.url();
        const pageContent = await page.evaluate(() => document.body?.innerText?.toLowerCase() || '');
        console.log('📄 Result:', pageContent.substring(0, 300));

        const isSuccess = ['success', 'connected', 'paired', 'linked', 'activated', 'done',
          'نجاح', 'تم الربط', 'مرتبط', 'تم التفعيل', 'تم بنجاح', 'device linked', 'enjoy watching']
          .some(k => pageContent.includes(k));
        const isFailed = ['invalid', 'expired', 'wrong', 'error', 'try again', 'incorrect',
          'غير صحيح', 'منتهي', 'خطأ', 'حاول مرة أخرى']
          .some(k => pageContent.includes(k));

        console.log(`📊 Result: success=${isSuccess}, failed=${isFailed}`);
        this.lastActivity = new Date();

        return {
          success: true,
          paired: isSuccess,
          failed: isFailed,
          refreshedCookies: !!this._refreshedCookies,
          screenshot: resultScreenshot ? `data:image/png;base64,${resultScreenshot}` : 
                     (beforeScreenshot ? `data:image/png;base64,${beforeScreenshot}` : null),
          finalUrl,
          message: isSuccess ? 'تم ربط التلفزيون بنجاح!' 
            : isFailed ? 'فشل ربط التلفزيون - الكود غير صحيح أو منتهي'
            : 'تم إدخال الكود - تحقق من الصورة للنتيجة',
        };
      } catch (innerError) {
        console.error('❌ [enterTVCode] ERROR:', innerError.message);
        let errorScreenshot = null;
        if (page) { try { errorScreenshot = await page.screenshot({ encoding: 'base64' }); } catch {} }
        return {
          success: false,
          error: `خطأ أثناء إدخال الكود: ${innerError.message}`,
          screenshot: errorScreenshot ? `data:image/png;base64,${errorScreenshot}` : null,
        };
      }
    });
  }

  /**
   * تحويل الكوكيز من صيغة Chrome Extension لصيغة Puppeteer
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
      .map(c => {
        const sameSite = mapSameSite(c.sameSite);
        const cookie = {
          name: c.name,
          value: c.value,
          domain: c.domain || '.osnplus.com',
          path: c.path || '/',
          secure: sameSite === 'None' ? true : (c.secure || false),
          httpOnly: c.httpOnly || false,
          ...(c.expirationDate ? { expires: c.expirationDate } : {}),
        };
        if (sameSite) cookie.sameSite = sameSite;
        return cookie;
      });
  }
          screenshot: resultScreenshot ? `data:image/png;base64,${resultScreenshot}` : (beforeScreenshot ? `data:image/png;base64,${beforeScreenshot}` : null),
          finalUrl,
          message: isSuccess 
            ? 'تم ربط التلفزيون بنجاح!' 
            : isFailed
            ? 'فشل ربط التلفزيون - الكود غير صحيح أو منتهي'
            : 'تم إدخال الكود - تحقق من الصورة للنتيجة',
        };
      } catch (innerError) {
        console.error('❌ [enterTVCode] INNER ERROR:', innerError.message);
        console.error('❌ [enterTVCode] Stack:', innerError.stack?.substring(0, 500));
        
        // محاولة أخذ screenshot حتى عند الخطأ
        let errorScreenshot = null;
        if (page) {
          try {
            errorScreenshot = await page.screenshot({ encoding: 'base64' });
          } catch {}
        }

        return {
          success: false,
          error: `خطأ أثناء إدخال الكود: ${innerError.message}`,
          screenshot: errorScreenshot ? `data:image/png;base64,${errorScreenshot}` : null,
        };
      }
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
