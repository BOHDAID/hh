import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

/**
 * ============================================================
 * نسخة Self-Hosted مستقلة 100%
 * remove-background: إزالة خلفية الصور باستخدام AI
 * ============================================================
 * 
 * Secrets المطلوبة في Supabase Dashboard:
 * - REMOVE_BG_API_KEY (من remove.bg)
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

// Rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(identifier: string, maxRequests: number = 5, windowMs: number = 60000): boolean {
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

// ==================== Main Handler ====================
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ==================== Authentication Check ====================
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Unauthorized - missing token", 401);
    }

    // Create Supabase client with service role for verification
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Dynamic import to avoid bundling issues
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return errorResponse("Unauthorized - invalid token", 401);
    }

    // Check if user has admin access
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    const isAdmin = roleData?.role === "admin" || roleData?.role === "full_access";
    if (!isAdmin) {
      return errorResponse("Forbidden - admin access required", 403);
    }
    // ==================== End Authentication ====================

    // Rate limiting - 5 requests per minute (additional layer)
    const clientIP = getClientIP(req);
    if (!checkRateLimit(`remove-bg:${clientIP}`, 5, 60000)) {
      return errorResponse("Too many requests. Please try again later.", 429);
    }

    const apiKey = Deno.env.get("REMOVE_BG_API_KEY");
    if (!apiKey) {
      return errorResponse("Remove.bg API not configured", 500);
    }

    const formData = await req.formData();
    const imageFile = formData.get("image") as File | null;
    const imageUrl = formData.get("image_url") as string | null;

    if (!imageFile && !imageUrl) {
      return errorResponse("Missing image file or URL");
    }

    // Prepare request to remove.bg
    const removeBgFormData = new FormData();
    
    if (imageFile) {
      removeBgFormData.append("image_file", imageFile);
    } else if (imageUrl) {
      removeBgFormData.append("image_url", imageUrl);
    }
    
    removeBgFormData.append("size", "auto");

    const response = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
      },
      body: removeBgFormData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Remove.bg error:", errorData);
      return errorResponse(
        errorData?.errors?.[0]?.title || "Failed to remove background",
        response.status
      );
    }

    // Return the processed image
    const imageBlob = await response.blob();
    
    return new Response(imageBlob, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "image/png",
        "Content-Disposition": 'attachment; filename="no-bg.png"',
      },
    });

  } catch (error) {
    console.error("Remove background error:", error);
    return errorResponse(error instanceof Error ? error.message : "Unknown error", 500);
  }
});
