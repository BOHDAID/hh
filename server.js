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

  if (ogTitle) {
    html = html.replace(/<meta property="og:title" content="[^"]*"/, `<meta property="og:title" content="${escapeHtml(ogTitle)}"`);
    html = html.replace(/<meta property="og:site_name" content="[^"]*"/, `<meta property="og:site_name" content="${escapeHtml(ogTitle)}"`);
    html = html.replace(/<meta name="twitter:title" content="[^"]*"/, `<meta name="twitter:title" content="${escapeHtml(ogTitle)}"`);
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(ogTitle)}</title>`);
  }
  if (ogDesc) {
    html = html.replace(/<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="${escapeHtml(ogDesc)}"`);
    html = html.replace(/<meta name="twitter:description" content="[^"]*"/, `<meta name="twitter:description" content="${escapeHtml(ogDesc)}"`);
    html = html.replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${escapeHtml(ogDesc)}"`);
  }
  if (ogImage) {
    html = html.replace(/<meta property="og:image" content="[^"]*"/, `<meta property="og:image" content="${escapeHtml(ogImage)}"`);
    html = html.replace(/<meta name="twitter:image" content="[^"]*"/, `<meta name="twitter:image" content="${escapeHtml(ogImage)}"`);
  }
  if (ogUrl) {
    html = html.replace(/<meta property="og:url" content="[^"]*"/, `<meta property="og:url" content="${escapeHtml(ogUrl)}"`);
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
  const settings = await fetchOgSettings();
  res.json({
    cached: cachedOgSettings ? true : false,
    cacheAge: ogCacheTime ? `${Math.round((Date.now() - ogCacheTime) / 1000)}s ago` : 'none',
    settings,
    envCheck: {
      hasUrl: !!EXTERNAL_SUPABASE_URL,
      hasKey: !!EXTERNAL_SUPABASE_ANON_KEY,
    }
  });
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
