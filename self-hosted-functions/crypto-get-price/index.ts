import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

/**
 * ============================================================
 * نسخة Self-Hosted مستقلة 100%
 * crypto-get-price: جلب سعر العملات المشفرة
 * ============================================================
 * 
 * لا تحتاج أي Secrets - تستخدم CoinGecko API المجاني
 * ============================================================
 */

// ==================== CORS Headers ====================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const allHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

// ==================== Helper Functions ====================
function errorResponse(message: string, status: number = 400): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: allHeaders }
  );
}

function successResponse(data: unknown, status: number = 200): Response {
  return new Response(
    JSON.stringify(data),
    { status, headers: allHeaders }
  );
}

// Rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(identifier: string, maxRequests: number = 30, windowMs: number = 60000): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (record.count >= maxRequests) {
    return false;
  }

  record.count++;
  return true;
}

function getClientIP(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
}

// ==================== Coin ID Mapping ====================
const COIN_IDS: Record<string, string> = {
  BTC: "bitcoin",
  LTC: "litecoin",
  ETH: "ethereum",
  USDT: "tether",
  USDC: "usd-coin",
  DOGE: "dogecoin",
  XRP: "ripple",
  SOL: "solana",
  BNB: "binancecoin",
  ADA: "cardano",
  TRX: "tron",
};

// ==================== Types ====================
interface GetPriceRequest {
  crypto: string;
  amount_usd?: number;
}

// ==================== Main Handler ====================
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting
    const clientIP = getClientIP(req);
    if (!checkRateLimit(`crypto-price:${clientIP}`, 60, 60000)) {
      return errorResponse("Too many requests. Please try again later.", 429);
    }

    const body = await req.json();
    const { crypto, amount_usd }: GetPriceRequest = body;

    if (!crypto) {
      return errorResponse("Missing crypto parameter");
    }

    const cryptoUpper = crypto.toUpperCase();
    const coinId = COIN_IDS[cryptoUpper];

    if (!coinId) {
      return errorResponse(`Unsupported cryptocurrency: ${crypto}. Supported: ${Object.keys(COIN_IDS).join(", ")}`);
    }

    // Fetch price from CoinGecko
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`;
    
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      console.error("CoinGecko API error:", await response.text());
      return errorResponse("Failed to fetch cryptocurrency price", 500);
    }

    const data = await response.json();
    const priceUsd = data[coinId]?.usd;

    if (!priceUsd) {
      return errorResponse("Price not available for this cryptocurrency", 404);
    }

    // Calculate crypto amount if USD amount provided
    let cryptoAmount = null;
    if (amount_usd && amount_usd > 0) {
      cryptoAmount = amount_usd / priceUsd;
    }

    return successResponse({
      success: true,
      crypto: cryptoUpper,
      price_usd: priceUsd,
      amount_usd: amount_usd || null,
      crypto_amount: cryptoAmount,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("Crypto get price error:", error);
    return errorResponse(error instanceof Error ? error.message : "Unknown error", 500);
  }
});
