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
        headless: 'new',
        executablePath,
        args: this._getChromeArgs(),
        timeout: 30000,
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
      await this._sleep(5000);

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
              maxAgeMinutes: 5,
              senderFilter: 'osn',
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
   * @param {object} credentials - بيانات الجلسة {email, gmailAddress, gmailAppPassword}
   */
  async enterTVCode(tvCode, credentials = {}) {
    const { email, gmailAddress, gmailAppPassword } = credentials;
    console.log(`📺 [enterTVCode] START - code: ${tvCode}, email: ${email}, hasGmail: ${!!gmailAddress}`);

    return await this._withBrowser(async (browser) => {
      let page = null;
      try {
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // ====== المحاولة 1: استخدام كوكيز محفوظة (إن وُجدت) ======
        let needsLogin = true;

        if (this.storedCookies && Array.isArray(this.storedCookies) && this.storedCookies.length > 0) {
          console.log(`🍪 [enterTVCode] Trying ${this.storedCookies.length} cached cookies...`);
          const puppeteerCookies = this._convertCookies(this.storedCookies);
          await page.setCookie(...puppeteerCookies);
          
          try {
            await page.goto('https://osnplus.com/en/login/tv', {
              waitUntil: 'networkidle2',
              timeout: 25000,
            });
          } catch (navErr) {
            console.log('⚠️ Nav timeout, continuing');
          }
          await this._sleep(3000);

          const url = page.url();
          console.log('🔗 URL with cookies:', url);
          
          // إذا لم يُعاد توجيهنا لصفحة login = الكوكيز شغالة
          if (!url.includes('/login') || url.includes('/login/tv')) {
            const codeInputs = await page.$$('input[type="tel"], input[type="number"], input[inputmode="numeric"], input[maxlength="1"]');
            if (codeInputs.length > 0) {
              console.log('✅ [enterTVCode] Cookies still valid! Found TV code inputs.');
              needsLogin = false;
            }
          }
        }

        // ====== المحاولة 2: تسجيل دخول تلقائي بالإيميل + OTP ======
        if (needsLogin) {
          console.log('🔐 [enterTVCode] Cookies invalid/missing. Starting auto-login...');
          
          if (!email || !gmailAddress || !gmailAppPassword) {
            return {
              success: false,
              error: 'بيانات تسجيل الدخول غير متوفرة (إيميل OSN + بيانات Gmail). يرجى تحديث الإعدادات في لوحة الإدارة.',
            };
          }

          const loginResult = await this._loginWithEmail(page, email, gmailAddress, gmailAppPassword);
          
          if (!loginResult.success) {
            return {
              success: false,
              error: `فشل تسجيل الدخول التلقائي: ${loginResult.error}`,
              screenshot: loginResult.screenshot || null,
            };
          }

          // حفظ الكوكيز الجديدة بعد تسجيل الدخول الناجح
          console.log('💾 [enterTVCode] Saving new session cookies...');
          const newCookies = await page.cookies('https://osnplus.com');
          this.storedCookies = newCookies.map(c => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path,
            secure: c.secure,
            httpOnly: c.httpOnly,
            sameSite: c.sameSite,
            ...(c.expires && c.expires > 0 ? { expirationDate: c.expires } : {}),
          }));
          this.isLoggedIn = true;
          this.currentEmail = email;
          this.lastActivity = new Date();
          this._newSessionCookies = this.storedCookies; // للحفظ في DB
          console.log(`✅ [enterTVCode] Saved ${this.storedCookies.length} new cookies`);

          // ====== الانتقال لصفحة TV code بعد تسجيل الدخول ======
          console.log('🌐 [enterTVCode] Navigating to TV code page...');
          try {
            await page.goto('https://osnplus.com/en/login/tv', {
              waitUntil: 'networkidle2',
              timeout: 30000,
            });
          } catch (navErr) {
            console.log('⚠️ TV page timeout, continuing');
          }
          await this._sleep(3000);
        }

        // ====== الآن نحن في صفحة TV code (مسجلين دخول) ======
        const currentUrl = page.url();
        console.log('🔗 [enterTVCode] TV page URL:', currentUrl);

        let beforeScreenshot = null;
        try { beforeScreenshot = await page.screenshot({ encoding: 'base64' }); } catch {}

        // البحث عن حقول إدخال الكود
        let codeInputs = await page.$$('input[type="tel"], input[type="number"], input[inputmode="numeric"], input[maxlength="1"]');
        console.log(`🔍 Code inputs found: ${codeInputs.length}`);

        if (codeInputs.length === 0) {
          console.log('⏳ No inputs yet, waiting 5s for SPA...');
          await this._sleep(5000);
          codeInputs = await page.$$('input[type="tel"], input[type="number"], input[inputmode="numeric"], input[maxlength="1"]');
          console.log(`🔍 Code inputs after wait: ${codeInputs.length}`);
        }

        if (codeInputs.length === 0) {
          const pageText = await page.evaluate(() => document.body?.innerText?.substring(0, 500)?.toLowerCase() || '');
          console.log('📄 Page text:', pageText.substring(0, 300));

          // هل ما زلنا في صفحة login؟
          if (['continue with google', 'continue with apple', 'sign up or login'].some(k => pageText.includes(k))) {
            return {
              success: false,
              error: 'فشل تسجيل الدخول - الموقع لا زال يعرض صفحة تسجيل الدخول',
              screenshot: beforeScreenshot ? `data:image/png;base64,${beforeScreenshot}` : null,
              finalUrl: currentUrl,
            };
          }

          // بحث عام عن أي input
          const anyInputs = await page.$$('input:not([type="hidden"])');
          if (anyInputs.length > 0) {
            codeInputs = anyInputs;
          } else {
            return {
              success: false,
              error: 'لم يتم العثور على حقول إدخال كود التلفزيون',
              screenshot: beforeScreenshot ? `data:image/png;base64,${beforeScreenshot}` : null,
              finalUrl: currentUrl,
            };
          }
        }

        // ====== إدخال الكود ======
        const digits = tvCode.replace(/[\s\-]/g, '').split('');
        console.log(`📝 Entering ${digits.length} digits into ${codeInputs.length} fields`);

        if (codeInputs.length >= digits.length) {
          for (let i = 0; i < digits.length; i++) {
            await codeInputs[i].click({ clickCount: 3 });
            await page.keyboard.press('Backspace');
            await this._sleep(100);
            await codeInputs[i].type(digits[i], { delay: 150 });
            await this._sleep(200);
          }
        } else if (codeInputs.length === 1) {
          await codeInputs[0].click({ clickCount: 3 });
          await page.keyboard.press('Backspace');
          await codeInputs[0].type(tvCode, { delay: 100 });
        } else {
          await codeInputs[0].click();
          await page.keyboard.type(tvCode, { delay: 150 });
        }
        console.log('✅ Code entered');
        await this._sleep(1500);

        // ====== الضغط على زر التأكيد ======
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

        // ====== انتظار النتيجة ======
        await this._sleep(6000);

        let resultScreenshot = null;
        try { resultScreenshot = await page.screenshot({ encoding: 'base64' }); } catch {}

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
          newSessionCookies: !!this._newSessionCookies,
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
}

const sessionManager = new OSNSessionManager();
export default sessionManager;
