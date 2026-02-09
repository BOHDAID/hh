import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// Self-Hosted Function (External): admin-adjust-wallet
// تعديلات الرصيد من لوحة الأدمن بدون مشاكل RLS (باستخدام Service Role)
// ============================================================

// --- Inline security utilities ---
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

function sanitizeString(input: string): string {
  if (!input || typeof input !== "string") return "";
  return input
    .replace(/[<>]/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+=/gi, "")
    .trim()
    .slice(0, 10000);
}

function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

function isValidAmount(amount: number): boolean {
  return typeof amount === "number" && amount > 0 && amount < 1000000;
}

function errorResponse(message: string, status: number = 400): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: allHeaders });
}

function successResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: allHeaders });
}

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(identifier: string, maxRequests: number = 10, windowMs: number = 60000): boolean {
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
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
// --- End inline utilities ---

type AdjustType = "add" | "subtract";

interface AdjustWalletRequest {
  target_user_id: string;
  type: AdjustType;
  amount: number;
  description?: string;
}

function isMissingColumnError(err: unknown, column: string) {
  const msg = typeof err === "object" && err && "message" in err ? String((err as any).message) : "";
  const code = typeof err === "object" && err && "code" in err ? String((err as any).code) : "";
  return code === "PGRST204" && msg.includes(`'${column}'`);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const ip = getClientIP(req);
  if (!checkRateLimit(`admin-adjust-wallet:${ip}`, 30, 60_000)) {
    return errorResponse("Too many requests", 429);
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return errorResponse("Unauthorized", 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      console.error("Supabase env missing");
      return errorResponse("Backend not configured", 500);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      console.error("Auth error:", userError);
      return errorResponse("Unauthorized", 401);
    }

    const callerId = userData.user.id;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller role using service role (reliable even if RLS blocks reads)
    const { data: roleRow, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .maybeSingle();

    if (roleError) {
      console.error("Role check error:", roleError);
      return errorResponse("Failed to verify role", 500);
    }

    const role = roleRow?.role;
    if (role !== "admin" && role !== "full_access") {
      return errorResponse("Admin access required", 403);
    }

    const body = (await req.json().catch(() => null)) as AdjustWalletRequest | null;
    if (!body) return errorResponse("Invalid JSON body", 400);

    const targetUserId = String(body.target_user_id || "").trim();
    const type = body.type;
    const amount = Number(body.amount);
    const description = sanitizeString(body.description || "");

    if (!isValidUUID(targetUserId)) {
      return errorResponse("Invalid target_user_id", 400);
    }
    if (type !== "add" && type !== "subtract") {
      return errorResponse("Invalid type", 400);
    }
    if (!isValidAmount(amount)) {
      return errorResponse("Invalid amount", 400);
    }

    // Get or create wallet
    const { data: existingWallet, error: getWalletError } = await adminClient
      .from("wallets")
      .select("id, balance, total_earned")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (getWalletError) {
      console.error("Fetch wallet error:", getWalletError);
      return errorResponse(getWalletError.message, 500);
    }

    let wallet = existingWallet;
    if (!wallet) {
      const { data: created, error: createError } = await adminClient
        .from("wallets")
        .insert({ user_id: targetUserId, balance: 0, total_earned: 0 })
        .select("id, balance, total_earned")
        .single();

      if (createError) {
        console.error("Create wallet error:", createError);
        return errorResponse(createError.message, 500);
      }
      wallet = created;
    }

    const currentBalance = Number(wallet.balance || 0);
    const currentTotalEarned = Number(wallet.total_earned || 0);

    const newBalance = type === "add" ? currentBalance + amount : Math.max(0, currentBalance - amount);

    const newTotalEarned = type === "add" ? currentTotalEarned + amount : currentTotalEarned;

    const patchWithTimestamp: Record<string, unknown> = {
      balance: newBalance,
      ...(type === "add" ? { total_earned: newTotalEarned } : {}),
      updated_at: new Date().toISOString(),
    };

    const firstUpdate = await adminClient.from("wallets").update(patchWithTimestamp).eq("id", wallet.id);

    if (firstUpdate.error) {
      if (isMissingColumnError(firstUpdate.error, "updated_at")) {
        const { updated_at, ...patchNoTimestamp } = patchWithTimestamp;
        const secondUpdate = await adminClient.from("wallets").update(patchNoTimestamp).eq("id", wallet.id);
        if (secondUpdate.error) {
          console.error("Update wallet error:", secondUpdate.error);
          return errorResponse(secondUpdate.error.message, 500);
        }
      } else {
        console.error("Update wallet error:", firstUpdate.error);
        return errorResponse(firstUpdate.error.message, 500);
      }
    }

    const txType = type === "add" ? "deposit" : "withdrawal";
    const txAmount = type === "add" ? amount : -amount;
    const txDescription = description || (type === "add" ? "إضافة رصيد يدوي بواسطة الأدمن" : "خصم رصيد يدوي بواسطة الأدمن");

    const tx = await adminClient.from("wallet_transactions").insert({
      wallet_id: wallet.id,
      type: txType,
      amount: txAmount,
      description: txDescription,
      status: "completed",
    });

    if (tx.error) {
      console.error("Insert wallet transaction error:", tx.error);
    }

    const { data: finalWallet, error: finalWalletError } = await adminClient
      .from("wallets")
      .select("id, user_id, balance, total_earned")
      .eq("id", wallet.id)
      .single();

    if (finalWalletError) {
      console.error("Fetch final wallet error:", finalWalletError);
      return successResponse({ success: true, wallet: { ...wallet, balance: newBalance, total_earned: newTotalEarned } }, 200);
    }

    return successResponse({ success: true, wallet: finalWallet }, 200);
  } catch (e) {
    console.error("Runtime error:", e);
    return errorResponse("Internal error", 500);
  }
});
