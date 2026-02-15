import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * ============================================================
 * نسخة Self-Hosted مستقلة 100%
 * track-visit: تتبع زيارات الصفحات
 * ============================================================
 * 
 * Secrets المطلوبة في Supabase Dashboard:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
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

function getClientIP(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";
}

function hashIP(ip: string): string {
  // Simple hash function for privacy
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

function validateReferrer(referrer: unknown): string | null {
  if (referrer === null || referrer === undefined) return null;
  if (typeof referrer !== 'string') return null;
  if (referrer.length > 500) return null;
  if (referrer.includes('<') || referrer.includes('>') || referrer.includes('javascript:')) return null;
  if (referrer.startsWith('utm:')) return referrer.slice(0, 500);
  try {
    if (referrer.length > 0) new URL(referrer);
    return referrer.slice(0, 500) || null;
  } catch {
    return null;
  }
}

function getDeviceType(userAgent: string): string {
  if (!userAgent) return "unknown";
  const ua = userAgent.toLowerCase();
  if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")) {
    return "mobile";
  } else if (ua.includes("tablet") || ua.includes("ipad")) {
    return "tablet";
  }
  return "desktop";
}

// Rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(identifier: string, maxRequests: number = 10, windowMs: number = 60000): boolean {
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

// ==================== Types ====================
interface TrackVisitRequest {
  page_path: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

// ==================== Main Handler ====================
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientIP = getClientIP(req);
    
    // Rate limiting - 10 requests per minute per IP
    if (!checkRateLimit(`track:${clientIP}`, 10, 60000)) {
      return successResponse({ success: true }); // Silently accept but don't track
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return errorResponse("Server configuration error", 500);
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { page_path, referrer }: TrackVisitRequest = body;

    if (!page_path) {
      return errorResponse("Missing page_path");
    }

    const userAgent = req.headers.get("user-agent") || "";
    const ipHash = hashIP(clientIP);
    const deviceType = getDeviceType(userAgent);
    const validatedReferrer = validateReferrer(referrer);

    // Insert visit record
    const { error } = await adminClient
      .from("page_visits")
      .insert({
        page_path: page_path.slice(0, 255),
        ip_hash: ipHash,
        user_agent: userAgent.slice(0, 500),
        referrer: validatedReferrer,
        device_type: deviceType,
      });

    if (error) {
      console.error("Failed to track visit:", error);
    }

    return successResponse({ success: true });

  } catch (error) {
    console.error("Track visit error:", error);
    return successResponse({ success: true }); // Don't expose errors for tracking
  }
});
