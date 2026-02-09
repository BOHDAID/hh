import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import qrAutomationRoutes from './src/routes/qr-automation.js';
import sessionManager from './src/services/session-manager.js';
import telegramBot from './src/services/telegram-bot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// QR Automation API routes
app.use('/api/qr', qrAutomationRoutes);

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

// Handle SPA routing - serve index.html for all routes
app.get('/{*splat}', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
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
