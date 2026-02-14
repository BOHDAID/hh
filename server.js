import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import qrAutomationRoutes from './src/routes/qr-automation.js';
import sessionManager from './src/services/session-manager.js';
import telegramBot from './src/services/telegram-bot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// ============================================================
// Dynamic OG Meta - يجلب البيانات من القاعدة الخارجية
// ============================================================
const EXTERNAL_SUPABASE_URL = process.env.EXTERNAL_SUPABASE_URL || process.env.VITE_EXTERNAL_SUPABASE_URL;
const EXTERNAL_SUPABASE_ANON_KEY = process.env.VITE_EXTERNAL_SUPABASE_ANON_KEY;

let cachedOgSettings = null;
let ogCacheTime = 0;
const OG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

async function fetchOgSettings() {
  // Return cache if fresh
  if (cachedOgSettings && (Date.now() - ogCacheTime < OG_CACHE_TTL)) {
    return cachedOgSettings;
  }

  if (!EXTERNAL_SUPABASE_URL || !EXTERNAL_SUPABASE_ANON_KEY) {
    console.warn('⚠️ External Supabase not configured for OG meta');
    return null;
  }

  try {
    const url = `${EXTERNAL_SUPABASE_URL}/rest/v1/site_settings?key=in.("og_title","og_description","og_image","og_url","store_name","store_logo_url")&select=key,value`;
    const response = await fetch(url, {
      headers: {
        'apikey': EXTERNAL_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${EXTERNAL_SUPABASE_ANON_KEY}`,
      },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    const settings = {};
    data.forEach(s => { if (s.value) settings[s.key] = s.value; });
    
    cachedOgSettings = settings;
    ogCacheTime = Date.now();
    console.log('✅ OG settings fetched from external DB:', Object.keys(settings).join(', '));
    return settings;
  } catch (err) {
    console.error('❌ Failed to fetch OG settings:', err.message);
    return cachedOgSettings; // Return stale cache on error
  }
}

function injectOgMeta(html, settings) {
  if (!settings) return html;

  const ogTitle = settings.og_title || settings.store_name || '';
  const ogDesc = settings.og_description || '';
  const ogImage = settings.og_image || settings.store_logo_url || '';
  const ogUrl = settings.og_url || '';

  console.log('🔄 Injecting OG Meta:', JSON.stringify({ ogTitle, ogDesc, ogImage: ogImage ? ogImage.substring(0, 50) + '...' : '', ogUrl }));

  // Use flexible regex that handles various HTML formats (minified, extra spaces, single/double quotes)
  const replaceMetaProperty = (h, prop, val) => {
    const regex = new RegExp(`<meta\\s+property=["']${prop}["']\\s+content=["'][^"']*["']`, 'i');
    const replacement = `<meta property="${prop}" content="${escapeHtml(val)}"`;
    const matched = regex.test(h);
    console.log(`  ${prop}: ${matched ? '✅ matched' : '❌ NOT matched'}`);
    return h.replace(regex, replacement);
  };

  const replaceMetaName = (h, name, val) => {
    const regex = new RegExp(`<meta\\s+name=["']${name}["']\\s+content=["'][^"']*["']`, 'i');
    const replacement = `<meta name="${name}" content="${escapeHtml(val)}"`;
    const matched = regex.test(h);
    console.log(`  ${name}: ${matched ? '✅ matched' : '❌ NOT matched'}`);
    return h.replace(regex, replacement);
  };

  if (ogTitle) {
    html = replaceMetaProperty(html, 'og:title', ogTitle);
    html = replaceMetaProperty(html, 'og:site_name', ogTitle);
    html = replaceMetaName(html, 'twitter:title', ogTitle);
    html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(ogTitle)}</title>`);
  }
  if (ogDesc) {
    html = replaceMetaProperty(html, 'og:description', ogDesc);
    html = replaceMetaName(html, 'twitter:description', ogDesc);
    html = replaceMetaName(html, 'description', ogDesc);
  }
  if (ogImage) {
    html = replaceMetaProperty(html, 'og:image', ogImage);
    html = replaceMetaName(html, 'twitter:image', ogImage);
  }
  if (ogUrl) {
    html = replaceMetaProperty(html, 'og:url', ogUrl);
  }

  return html;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// QR Automation API routes
app.use('/api/qr', qrAutomationRoutes);

// Debug OG endpoint - shows what the server will inject
app.get('/debug-og', async (req, res) => {
  try {
    // Force fresh fetch (bypass cache)
    cachedOgSettings = null;
    ogCacheTime = 0;
    const settings = await fetchOgSettings();
    
    // Also show what the final HTML looks like
    const htmlPath = join(__dirname, 'dist', 'index.html');
    const rawHtml = readFileSync(htmlPath, 'utf-8');
    const injectedHtml = injectOgMeta(rawHtml, settings);
    
    // Extract meta tags from injected HTML
    const metaRegex = /<meta\s+(property|name)=["']([^"']*)["']\s+content=["']([^"']*)["']/gi;
    const metas = {};
    let match;
    while ((match = metaRegex.exec(injectedHtml)) !== null) {
      metas[match[2]] = match[3];
    }
    
    // Extract title
    const titleMatch = injectedHtml.match(/<title>([^<]*)<\/title>/i);
    
    res.json({
      status: '✅ Debug OG Report',
      dbValues: settings,
      injectedMeta: metas,
      injectedTitle: titleMatch ? titleMatch[1] : 'not found',
      envCheck: {
        EXTERNAL_SUPABASE_URL: EXTERNAL_SUPABASE_URL ? '✅ set' : '❌ missing',
        EXTERNAL_SUPABASE_ANON_KEY: EXTERNAL_SUPABASE_ANON_KEY ? '✅ set' : '❌ missing',
      },
      note: 'If dbValues show correct data but Telegram still shows old card, use @WebpageBot in Telegram to purge cache'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
  const sessionStatus = sessionManager.getStatus();
  const botStatus = telegramBot.getBotStatus();
  res.status(200).json({ 
    status: 'ok', 
    message: 'Server is running',
    session: {
      isLoggedIn: sessionStatus.isLoggedIn,
      email: sessionStatus.email,
      lastActivity: sessionStatus.lastActivity,
    },
    telegramBot: {
      isRunning: botStatus.isRunning,
      activeSessions: botStatus.sessionsCount,
    }
  });
});

// Serve static files from the dist folder (Vite build output)
app.use(express.static(join(__dirname, 'dist')));

// Handle SPA routing - inject dynamic OG meta
app.get('/{*splat}', async (req, res) => {
  try {
    const htmlPath = join(__dirname, 'dist', 'index.html');
    let html = readFileSync(htmlPath, 'utf-8');
    
    const ogSettings = await fetchOgSettings();
    html = injectOgMeta(html, ogSettings);
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    console.error('❌ Error serving HTML:', err.message);
    res.sendFile(join(__dirname, 'dist', 'index.html'));
  }
});

// Start server
const server = app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Server is running on port ${PORT} (ultra-light mode)`);
  console.log(`📍 Health check available at /health`);
  console.log(`📍 QR API available at /api/qr/*`);
  console.log(`💡 Browser opens only when needed - no persistent Chrome process`);

  // 🤖 بدء بوت تيليجرام
  console.log('🤖 Starting Telegram Bot...');
  try {
    await telegramBot.startPolling();
  } catch (error) {
    console.error('❌ Telegram Bot failed to start:', error.message);
  }
});

// Keep-alive heartbeat (lightweight - no browser)
setInterval(() => {
  const status = sessionManager.getStatus();
  console.log(`💓 Heartbeat - ${new Date().toISOString()} | Cookies: ${status.isLoggedIn ? '✅ Stored' : '❌ None'}`);
}, 300000);

// Graceful shutdown function
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log('⚠️ Shutdown already in progress...');
    return;
  }
  
  isShuttingDown = true;
  console.log(`🛑 ${signal} received. Stopping bot and closing browser...`);
  
  // إيقاف البوت أولاً لتحرير الاتصال مع Telegram
  try {
    telegramBot.stopPolling();
    console.log('✅ Telegram bot stopped');
  } catch (err) {
    console.error('❌ Error stopping bot:', err.message);
  }
  
  // إغلاق المتصفح
  try {
    await sessionManager.closeBrowser();
    console.log('✅ Browser closed');
  } catch (err) {
    console.error('❌ Error closing browser:', err.message);
  }
  
  // إغلاق السيرفر
  server.close(() => {
    console.log('👋 Server closed gracefully');
    process.exit(0);
  });
  
  // إجبار الإغلاق بعد 10 ثواني
  setTimeout(() => {
    console.error('⚠️ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

// Handle all shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
