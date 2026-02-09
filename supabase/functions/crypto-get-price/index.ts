import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

// ==================== Standalone security helpers (no local imports) ====================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "default-src 'none'",
};

const allHeaders = {
  ...corsHeaders,
  ...securityHeaders,
  "Content-Type": "application/json",
};

function errorResponse(message: string, status: number = 400): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: allHeaders });
}

function successResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: allHeaders });
}

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
function checkRateLimit(identifier: string, maxRequests = 10, windowMs = 60000): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);
  if (!record || now > record.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }
  if (record.count >= maxRequests) return false;
  record.count++;
  return true;
}

function getClientIP(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

const COINGECKO_API = "https://api.coingecko.com/api/v3";

// Cache price for 60 seconds
let cachedPrice: { price: number; timestamp: number } | null = null;
const CACHE_DURATION = 60000; // 60 seconds

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting
    const clientIP = getClientIP(req);
    if (!checkRateLimit(`crypto-price:${clientIP}`, 30, 60000)) {
      return errorResponse("Too many requests. Please try again later.", 429);
    }

    const now = Date.now();

    // Check cache
    if (cachedPrice && now - cachedPrice.timestamp < CACHE_DURATION) {
      return successResponse({
        success: true,
        price: cachedPrice.price,
        currency: "usd",
        cached: true,
      });
    }

    // Fetch current LTC price from CoinGecko
    const response = await fetch(
      `${COINGECKO_API}/simple/price?ids=litecoin&vs_currencies=usd`
    );

    if (!response.ok) {
      console.error("CoinGecko API error:", await response.text());
      
      // Return cached price if available, even if stale
      if (cachedPrice) {
        return successResponse({
          success: true,
          price: cachedPrice.price,
          currency: "usd",
          cached: true,
          stale: true,
        });
      }
      
      return errorResponse("Failed to fetch LTC price", 500);
    }

    const data = await response.json();
    const ltcPrice = data.litecoin?.usd;

    if (!ltcPrice || typeof ltcPrice !== "number") {
      return errorResponse("Invalid price data", 500);
    }

    // Update cache
    cachedPrice = { price: ltcPrice, timestamp: now };

    return successResponse({
      success: true,
      price: ltcPrice,
      currency: "usd",
      cached: false,
    });
  } catch (error) {
    console.error("Crypto get price error:", error);
    return errorResponse(error instanceof Error ? error.message : "Unknown error", 500);
  }
});
