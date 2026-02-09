import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * ============================================================
 * نسخة Self-Hosted مستقلة 100%
 * crypto-check-payment: التحقق من حالة الدفع بالكريبتو
 * ============================================================
 * 
 * Secrets المطلوبة في Supabase Dashboard:
 * - SUPABASE_URL
 * - SUPABASE_ANON_KEY
 * - SUPABASE_SERVICE_ROLE_KEY
 * ============================================================
 */

// ==================== CORS Headers ====================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ==================== Security Headers ====================
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
};

const allHeaders = {
  ...corsHeaders,
  ...securityHeaders,
  "Content-Type": "application/json",
};

// ==================== Constants ====================
const REQUIRED_CONFIRMATIONS = 3;
const BLOCKCYPHER_API = "https://api.blockcypher.com/v1/ltc/main";

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

function isValidUUID(uuid: string): boolean {
  if (!uuid || typeof uuid !== "string") return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// Rate limiting (in-memory for edge functions)
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

// ==================== Types ====================
interface CheckPaymentRequest {
  order_id: string;
}

interface BlockCypherAddressResponse {
  address: string;
  total_received: number;
  total_sent: number;
  balance: number;
  unconfirmed_balance: number;
  final_balance: number;
  n_tx: number;
  unconfirmed_n_tx: number;
  final_n_tx: number;
}

// ==================== Main Handler ====================
serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting
    const clientIP = getClientIP(req);
    if (!checkRateLimit(`crypto-check:${clientIP}`, 30, 60000)) {
      return errorResponse("Too many requests. Please try again later.", 429);
    }

    // Validate authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Unauthorized", 401);
    }

    // Get Supabase credentials
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      console.error("Missing Supabase credentials");
      return errorResponse("Server configuration error", 500);
    }

    // Verify user with getUser()
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    
    if (userError || !userData?.user) {
      console.error("Auth error:", userError);
      return errorResponse("Unauthorized", 401);
    }

    const userId = userData.user.id;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const body = await req.json();
    const { order_id }: CheckPaymentRequest = body;

    if (!order_id || !isValidUUID(order_id)) {
      return errorResponse("Invalid order ID");
    }

    // Get order with payment address
    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .eq("user_id", userId)
      .single();

    if (orderError || !order) {
      console.error("Order error:", orderError);
      return errorResponse("Order not found", 404);
    }

    if (!order.payment_address) {
      return errorResponse("No payment address found for this order");
    }

    // SECURITY: Always re-verify payment from blockchain even if DB says "paid"
    // This prevents database manipulation attacks
    const mustVerifyBlockchain = true;
    
    // Only trust DB status if order is already marked completed AND has confirmations
    if ((order.payment_status === "paid" || order.status === "completed") && !mustVerifyBlockchain) {
      return successResponse({
        success: true,
        status: "paid",
        confirmations: order.confirmations || REQUIRED_CONFIRMATIONS,
        required_confirmations: REQUIRED_CONFIRMATIONS,
      });
    }

    // Check if order has expired
    if (order.expires_at) {
      const expiresAt = new Date(order.expires_at);
      const now = new Date();
      if (now > expiresAt && order.payment_status === "awaiting_payment") {
        // Mark order as expired
        await adminClient
          .from("orders")
          .update({ 
            payment_status: "expired",
            status: "cancelled"
          })
          .eq("id", order_id);

        return successResponse({
          success: true,
          status: "expired",
          message: "انتهت مهلة الدفع. يرجى إنشاء طلب جديد.",
        });
      }
    }

    // Check balance via BlockCypher API
    const addressUrl = `${BLOCKCYPHER_API}/addrs/${order.payment_address}`;
    const addressResponse = await fetch(addressUrl);
    
    if (!addressResponse.ok) {
      const errorText = await addressResponse.text();
      console.error("BlockCypher API error:", errorText);
      return errorResponse("Failed to check payment status", 500);
    }

    const addressData: BlockCypherAddressResponse = await addressResponse.json();

    // Calculate received amount
    const totalReceived = addressData.total_received / 100000000; // Convert satoshis to LTC
    const expectedAmount = order.ltc_amount || 0;
    
    // Update received_amount in database
    if (totalReceived > 0 && totalReceived !== order.received_amount) {
      await adminClient
        .from("orders")
        .update({ received_amount: totalReceived })
        .eq("id", order_id);
    }
    
    // Allow 1% tolerance for amount
    const minAmount = expectedAmount * 0.99;

    if (totalReceived < minAmount) {
      // Check if partial payment
      if (totalReceived > 0) {
        const remaining = expectedAmount - totalReceived;
        return successResponse({
          success: true,
          status: "partial_payment",
          received: totalReceived,
          expected: expectedAmount,
          remaining: remaining,
          confirmations: 0,
          required_confirmations: REQUIRED_CONFIRMATIONS,
          has_pending: addressData.unconfirmed_balance > 0,
          message: `تم استلام ${totalReceived.toFixed(8)} LTC. المتبقي: ${remaining.toFixed(8)} LTC`,
        });
      }
      
      // No payment yet
      return successResponse({
        success: true,
        status: "awaiting_payment",
        received: totalReceived,
        expected: expectedAmount,
        confirmations: 0,
        required_confirmations: REQUIRED_CONFIRMATIONS,
        has_pending: addressData.unconfirmed_balance > 0,
        expires_at: order.expires_at,
      });
    }

    // Payment received, check confirmations
    const txUrl = `${BLOCKCYPHER_API}/addrs/${order.payment_address}/full?limit=1`;
    const txResponse = await fetch(txUrl);
    
    let confirmations = 0;
    
    if (txResponse.ok) {
      const txData = await txResponse.json();
      if (txData.txs && txData.txs.length > 0) {
        // Find the first incoming transaction
        const incomingTx = txData.txs.find((tx: any) => 
          tx.outputs?.some((out: any) => 
            out.addresses?.includes(order.payment_address)
          )
        );
        if (incomingTx) {
          confirmations = incomingTx.confirmations || 0;
        }
      }
    }

    // Update order with confirmation count
    await adminClient
      .from("orders")
      .update({ confirmations })
      .eq("id", order_id);

    if (confirmations >= REQUIRED_CONFIRMATIONS) {
      // Payment confirmed! Call complete-payment
      try {
        const completeResponse = await fetch(`${supabaseUrl}/functions/v1/complete-payment`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ order_id }),
        });

        const completeResult = await completeResponse.json();
        console.log("Complete payment result:", completeResult);
      } catch (completeError) {
        console.error("Failed to call complete-payment:", completeError);
      }

      return successResponse({
        success: true,
        status: "paid",
        received: totalReceived,
        expected: expectedAmount,
        confirmations,
        required_confirmations: REQUIRED_CONFIRMATIONS,
        order_completed: true,
      });
    }

    // Payment received but awaiting confirmations
    return successResponse({
      success: true,
      status: "confirming",
      received: totalReceived,
      expected: expectedAmount,
      confirmations,
      required_confirmations: REQUIRED_CONFIRMATIONS,
    });

  } catch (error) {
    console.error("Crypto check payment error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error", 
      500
    );
  }
});
