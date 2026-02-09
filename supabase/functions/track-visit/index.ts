import { createClient } from "npm:@supabase/supabase-js@2";

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

// ==================== Rate Limiting ====================
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(identifier: string, maxRequests: number = 5, windowMs: number = 60000): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);

  // Clean old entries periodically
  if (rateLimitMap.size > 10000) {
    const cutoff = now - windowMs;
    for (const [key, value] of rateLimitMap.entries()) {
      if (value.resetTime < cutoff) {
        rateLimitMap.delete(key);
      }
    }
  }

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

// ==================== Input Validation ====================
function validatePagePath(path: unknown): string | null {
  if (typeof path !== 'string') return null;
  // Must start with / and be reasonable length
  if (!path.startsWith('/') || path.length > 500) return null;
  // Block suspicious patterns
  if (path.includes('<') || path.includes('>') || path.includes('javascript:')) return null;
  // Sanitize the path
  return path.slice(0, 500);
}

function validateReferrer(referrer: unknown): string | null {
  if (referrer === null || referrer === undefined) return null;
  if (typeof referrer !== 'string') return null;
  if (referrer.length > 500) return null;
  // Block suspicious patterns
  if (referrer.includes('<') || referrer.includes('>') || referrer.includes('javascript:')) return null;
  try {
    // Must be a valid URL or empty
    if (referrer && referrer.length > 0) {
      new URL(referrer);
    }
    return referrer.slice(0, 500) || null;
  } catch {
    return null;
  }
}

// Simple hash function for IP anonymization
async function hashIP(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + "visit-salt-2024");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").substring(0, 32);
}

// Detect device type from user agent
function getDeviceType(userAgent: string): string {
  const mobileKeywords = [
    "Mobile", "Android", "iPhone", "iPad", "iPod", "webOS", 
    "BlackBerry", "IEMobile", "Opera Mini", "Windows Phone"
  ];
  
  for (const keyword of mobileKeywords) {
    if (userAgent.includes(keyword)) {
      return "mobile";
    }
  }
  return "desktop";
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: allHeaders }
    );
  }

  try {
    // Get client IP for rate limiting
    const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    // Apply rate limiting - 5 requests per minute per IP
    if (!checkRateLimit(`track:${clientIP}`, 5, 60000)) {
      // Silently accept but don't process - don't reveal rate limiting
      return new Response(
        JSON.stringify({ success: true }),
        { headers: allHeaders }
      );
    }

    const body = await req.json();

    // Validate and sanitize inputs
    const page_path = validatePagePath(body.page_path) || "/";
    const referrer = validateReferrer(body.referrer);

    // Get user agent
    const userAgent = req.headers.get("user-agent") || "";

    // Hash IP for privacy
    const ipHash = await hashIP(clientIP);

    // Detect device type
    const deviceType = getDeviceType(userAgent);

    // Get country from IP using ipapi.co (more reliable for Edge Functions)
    let countryCode = null;
    let countryName = null;

    if (clientIP !== "unknown" && clientIP !== "127.0.0.1" && clientIP !== "::1") {
      try {
        // Use ipapi.co which works better in Edge Functions environment
        const geoResponse = await fetch(`https://ipapi.co/${clientIP}/json/`, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'DigitalStore/1.0',
          },
        });
        if (geoResponse.ok) {
          const geoData = await geoResponse.json();
          if (geoData.country_code && !geoData.error) {
            countryCode = geoData.country_code;
            countryName = geoData.country_name;
            console.log(`Geo lookup success: ${clientIP} -> ${countryCode} (${countryName})`);
          } else if (geoData.error) {
            console.log("Geo lookup error:", geoData.reason || geoData.error);
          }
        }
      } catch (geoError) {
        console.log("Geo lookup failed:", geoError);
        // Continue without country data
      }
    }

    // Create Supabase client for EXTERNAL database (user's database)
    const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Insert with all available data including referrer
    const { error } = await supabase.from("page_visits").insert({
      ip_hash: ipHash,
      page_path: page_path,
      country_code: countryCode,
      country_name: countryName,
      referrer: referrer,
      device_type: deviceType,
    });

    if (error) {
      console.error("Insert error:", error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: allHeaders }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: allHeaders }
    );
  } catch (error) {
    console.error("Track visit error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal error" }),
      { status: 500, headers: allHeaders }
    );
  }
});
