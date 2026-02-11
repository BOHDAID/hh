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
    
    if (!this.isLoggedIn || !this.storedCookies) {
      console.error('❌ [enterTVCode] ABORT - no session/cookies');
      return { success: false, error: 'الجلسة غير متصلة - يرجى استيراد الكوكيز أولاً' };
    }

    return await this._withBrowser(async (browser) => {
      let page = null;
      try {
        console.log('📺 [enterTVCode] Browser opened, creating page...');
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // حقن الكوكيز المحفوظة
        console.log(`🍪 [enterTVCode] Setting ${this.storedCookies.length} cookies...`);
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
        console.log('✅ [enterTVCode] Cookies set');

        // الذهاب لصفحة ربط التلفزيون
        console.log('🌐 [enterTVCode] Navigating to https://osnplus.com/en/login/tv ...');
        try {
          await page.goto('https://osnplus.com/en/login/tv', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          });
          console.log('✅ [enterTVCode] Navigation complete');
        } catch (navErr) {
          console.log('⚠️ [enterTVCode] Navigation timeout but continuing:', navErr.message);
        }

        await new Promise(resolve => setTimeout(resolve, 3000));

        const currentUrl = page.url();
        console.log('🔗 [enterTVCode] Current URL:', currentUrl);

        // أخذ screenshot قبل إدخال الكود
        let beforeScreenshot = null;
        try {
          beforeScreenshot = await page.screenshot({ encoding: 'base64' });
          console.log('📸 [enterTVCode] Before-screenshot taken');
        } catch (ssErr) {
          console.log('⚠️ [enterTVCode] Screenshot failed:', ssErr.message);
        }

        // التحقق أن الجلسة لا تزال صالحة - بفحص محتوى الصفحة وليس URL فقط
        // لأن URL يبقى /login/tv حتى لو عرض صفحة تسجيل الدخول العادية
        const pageTextCheck = await page.evaluate(() => document.body?.innerText?.toLowerCase() || '');
        const isLoginPage = pageTextCheck.includes('continue with google') || 
                           pageTextCheck.includes('continue with apple') ||
                           pageTextCheck.includes('continue with facebook') ||
                           pageTextCheck.includes('sign up or login') ||
                           pageTextCheck.includes('more ways to sign up');
        
        const hasCodeInputs = await page.$$eval(
          'input[type="tel"], input[type="number"], input[inputmode="numeric"]',
          inputs => inputs.length
        ).catch(() => 0);

        console.log(`🔍 [enterTVCode] Page analysis: isLoginPage=${isLoginPage}, codeInputsFound=${hasCodeInputs}`);

        if (isLoginPage && hasCodeInputs === 0) {
          console.error('❌ [enterTVCode] Page shows LOGIN form instead of TV code form! Cookies are expired or invalid.');
          this.isLoggedIn = false;
          this.storedCookies = null;
          return { 
            success: false, 
            error: 'الكوكيز منتهية أو غير صالحة - الموقع يعرض صفحة تسجيل الدخول بدل صفحة كود التلفزيون. يرجى استيراد كوكيز جديدة من الجلسة.',
            screenshot: beforeScreenshot ? `data:image/png;base64,${beforeScreenshot}` : null,
            finalUrl: currentUrl,
          };
        }

        // انتظار إضافي للتأكد أن الحقول جاهزة
        console.log('⏳ [enterTVCode] Waiting for code input fields...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // انتظار حقول الكود تحديداً
        try {
          await page.waitForSelector('input[type="tel"], input[type="number"], input[inputmode="numeric"], input[maxlength="1"]', { timeout: 10000 });
          console.log('✅ [enterTVCode] Code input fields found');
        } catch {
          console.log('⚠️ [enterTVCode] No code input found after waiting 10s, trying any input...');
          try {
            await page.waitForSelector('input', { timeout: 5000 });
          } catch {
            console.log('⚠️ [enterTVCode] No input found at all');
          }
        }

        // البحث عن حقول الإدخال - OSN عادة 5 حقول منفصلة
        const allInputs = await page.$$('input[type="text"], input[type="tel"], input[type="number"], input[inputmode="numeric"], input:not([type="hidden"])');
        console.log(`🔍 [enterTVCode] Found ${allInputs.length} input fields`);

        // طباعة تفاصيل كل حقل
        for (let i = 0; i < allInputs.length; i++) {
          const info = await page.evaluate(el => ({
            type: el.type,
            name: el.name,
            id: el.id,
            placeholder: el.placeholder,
            className: el.className.substring(0, 50),
            inputMode: el.inputMode,
            maxLength: el.maxLength,
          }), allInputs[i]);
          console.log(`  📝 Input[${i}]:`, JSON.stringify(info));
        }

        const digits = tvCode.replace(/[\s\-]/g, '').split('');
        console.log(`📝 [enterTVCode] Digits: ${digits.join(', ')} (${digits.length})`);

        if (allInputs.length >= digits.length) {
          console.log(`📝 [enterTVCode] Using ${digits.length} separate fields`);
          for (let i = 0; i < digits.length; i++) {
            await allInputs[i].click({ clickCount: 3 });
            await page.keyboard.press('Backspace');
            await new Promise(resolve => setTimeout(resolve, 150));
            await allInputs[i].type(digits[i], { delay: 200 });
            console.log(`  ✅ Digit ${i}: '${digits[i]}' entered`);
            await new Promise(resolve => setTimeout(resolve, 300));
          }
          console.log('✅ [enterTVCode] All digits entered');
        } else if (allInputs.length === 1) {
          console.log('📝 [enterTVCode] Single input - entering full code');
          await allInputs[0].click({ clickCount: 3 });
          await page.keyboard.press('Backspace');
          await allInputs[0].type(tvCode, { delay: 100 });
        } else if (allInputs.length === 0) {
          console.error('❌ [enterTVCode] NO INPUT FIELDS FOUND! Page might not have loaded correctly.');
          // طباعة محتوى الصفحة للتحليل
          const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || 'EMPTY');
          console.log('📄 [enterTVCode] Page content preview:', bodyText);
          
          return {
            success: false,
            error: 'لم يتم العثور على حقول إدخال في الصفحة. الصفحة قد لم تُحمّل بشكل صحيح.',
            screenshot: beforeScreenshot ? `data:image/png;base64,${beforeScreenshot}` : null,
            finalUrl: currentUrl,
            debug: bodyText.substring(0, 200),
          };
        } else {
          // حقول أقل من المتوقع
          console.log(`⚠️ [enterTVCode] Found ${allInputs.length} fields, expected ${digits.length}. Trying advanced selectors...`);
          const advancedSelectors = [
            'input[placeholder*="code" i]',
            'input[placeholder*="رمز" i]',
            'input[name*="code" i]',
            'input[name*="pin" i]',
          ];
          let found = false;
          for (const selector of advancedSelectors) {
            const input = await page.$(selector);
            if (input) {
              console.log(`✅ [enterTVCode] Found input via: ${selector}`);
              await input.click({ clickCount: 3 });
              await page.keyboard.press('Backspace');
              await input.type(tvCode, { delay: 100 });
              found = true;
              break;
            }
          }
          if (!found) {
            console.log('⚠️ [enterTVCode] Fallback: typing via keyboard directly...');
            await page.keyboard.type(tvCode, { delay: 150 });
          }
        }

        await new Promise(resolve => setTimeout(resolve, 1500));

        // البحث عن زر التأكيد
        console.log('🔘 [enterTVCode] Looking for confirm button...');
        const confirmButton = await this._findButton(page, [
          'connect', 'link', 'pair', 'submit', 'confirm', 'verify',
          'ربط', 'تأكيد', 'إرسال', 'اتصال', 'continue', 'next', 'متابعة', 'التالي'
        ]);

        if (confirmButton) {
          const btnText = await page.evaluate(el => el.textContent?.trim(), confirmButton);
          console.log(`🔘 [enterTVCode] Clicking button: "${btnText}"`);
          await confirmButton.click();
        } else {
          console.log('⏎ [enterTVCode] No button found, pressing Enter...');
          await page.keyboard.press('Enter');
        }

        // انتظار النتيجة
        console.log('⏳ [enterTVCode] Waiting 6s for result...');
        await new Promise(resolve => setTimeout(resolve, 6000));

        // أخذ screenshot النتيجة
        let resultScreenshot = null;
        try {
          resultScreenshot = await page.screenshot({ encoding: 'base64' });
          console.log('📸 [enterTVCode] Result screenshot taken');
        } catch (ssErr) {
          console.log('⚠️ [enterTVCode] Result screenshot failed:', ssErr.message);
        }

        const finalUrl = page.url();
        console.log('🔗 [enterTVCode] Final URL:', finalUrl);

        const pageContent = await page.evaluate(() => document.body?.innerText?.toLowerCase() || '');
        console.log('📄 [enterTVCode] Page content (first 300):', pageContent.substring(0, 300));

        const successKeywords = [
          'success', 'connected', 'paired', 'linked', 'activated', 'done',
          'نجاح', 'تم الربط', 'مرتبط', 'تم التفعيل', 'تم بنجاح', 'مفعّل',
          'device linked', 'tv linked', 'enjoy watching'
        ];
        const failKeywords = [
          'invalid', 'expired', 'wrong', 'error', 'try again', 'incorrect',
          'غير صحيح', 'منتهي', 'خطأ', 'حاول مرة أخرى'
        ];
        const isSuccess = successKeywords.some(k => pageContent.includes(k));
        const isFailed = failKeywords.some(k => pageContent.includes(k));

        console.log(`📊 [enterTVCode] Result: success=${isSuccess}, failed=${isFailed}`);
        this.lastActivity = new Date();

        return {
          success: true,
          paired: isSuccess,
          failed: isFailed,
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
