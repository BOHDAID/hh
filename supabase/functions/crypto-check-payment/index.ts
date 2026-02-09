import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function isValidUUID(uuid: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return typeof uuid === "string" && uuidRegex.test(uuid);
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

const REQUIRED_CONFIRMATIONS = 3;
const BLOCKCYPHER_API = "https://api.blockcypher.com/v1/ltc/main";

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

interface BlockCypherTxResponse {
  confirmations: number;
  value: number;
  received: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting - allow more frequent checks for payment polling
    const clientIP = getClientIP(req);
    if (!checkRateLimit(`crypto-check:${clientIP}`, 30, 60000)) {
      return errorResponse("Too many requests. Please try again later.", 429);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Unauthorized", 401);
    }

    // External database credentials
    const externalUrl =
      Deno.env.get("EXTERNAL_SUPABASE_URL") ||
      Deno.env.get("VITE_EXTERNAL_SUPABASE_URL") ||
      "";
    const externalAnonKey =
      Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") ||
      Deno.env.get("VITE_EXTERNAL_SUPABASE_ANON_KEY") ||
      "";
    const externalServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!externalUrl || !externalAnonKey || !externalServiceKey) {
      return errorResponse("External database not configured", 500);
    }

    const userClient = createClient(externalUrl, externalAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Use getUser() instead of getClaims() for better compatibility
    const { data: userData, error: userError } = await userClient.auth.getUser();

    if (userError || !userData?.user) {
      return errorResponse("Unauthorized", 401);
    }

    const userId = userData.user.id;
    const adminClient = createClient(externalUrl, externalServiceKey);

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
      console.error("BlockCypher API error:", await addressResponse.text());
      return errorResponse("Failed to check payment status", 500);
    }

    const addressData: BlockCypherAddressResponse = await addressResponse.json();

    // Check if any transaction received
    const totalReceived = addressData.total_received / 100000000; // Convert satoshis to LTC
    const expectedAmount = order.ltc_amount || 0;
    
    // Update received_amount in database
    if (totalReceived > 0 && totalReceived !== order.received_amount) {
      await adminClient
        .from("orders")
        .update({ received_amount: totalReceived })
        .eq("id", order_id);
    }
    
    // Allow 1% tolerance for amount (to handle slight variations)
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
    // Get transaction details for confirmation count
    const txUrl = `${BLOCKCYPHER_API}/addrs/${order.payment_address}/full?limit=5`;
    const txResponse = await fetch(txUrl);
    
    let confirmations = 0;
    let validPaymentReceived = 0;
    const orderCreatedAt = new Date(order.created_at).getTime();
    
    if (txResponse.ok) {
      const txData = await txResponse.json();
      if (txData.txs && txData.txs.length > 0) {
        // Find incoming transactions that happened AFTER the order was created
        for (const tx of txData.txs) {
          const txTime = tx.received ? new Date(tx.received).getTime() : 0;
          
          // SECURITY: Only count transactions that happened after order creation
          // This prevents replay attacks using old payments
          if (txTime < orderCreatedAt) {
            console.log(`Skipping old transaction from ${tx.received}, order created at ${order.created_at}`);
            continue;
          }
          
          // Check if this transaction sends to our address
          const isIncoming = tx.outputs?.some((out: any) => 
            out.addresses?.includes(order.payment_address)
          );
          
          if (isIncoming) {
            // Sum up the value sent to our address
            for (const out of tx.outputs || []) {
              if (out.addresses?.includes(order.payment_address)) {
                validPaymentReceived += (out.value || 0) / 100000000; // satoshis to LTC
              }
            }
            // Use the confirmations from the first valid incoming tx
            if (confirmations === 0) {
              confirmations = tx.confirmations || 0;
            }
          }
        }
      }
    }
    
    // SECURITY: Re-validate using only transactions after order creation
    if (validPaymentReceived < minAmount) {
      console.log(`Valid payment received: ${validPaymentReceived} LTC, expected: ${expectedAmount} LTC (after order creation filter)`);
      
      // The blockchain shows payment but it's from before order creation = replay attack
      if (totalReceived >= minAmount && validPaymentReceived < minAmount) {
        console.warn(`SECURITY: Possible replay attack detected! Old payment of ${totalReceived} LTC, valid payment only ${validPaymentReceived} LTC`);
        return successResponse({
          success: true,
          status: "awaiting_payment",
          received: validPaymentReceived,
          expected: expectedAmount,
          confirmations: 0,
          required_confirmations: REQUIRED_CONFIRMATIONS,
          message: "في انتظار تحويل جديد. التحويلات القديمة لا تُحتسب.",
        });
      }
      
      return successResponse({
        success: true,
        status: "awaiting_payment",
        received: validPaymentReceived,
        expected: expectedAmount,
        confirmations: 0,
        required_confirmations: REQUIRED_CONFIRMATIONS,
      });
    }

    // Update order with confirmation count
    await adminClient
      .from("orders")
      .update({ confirmations })
      .eq("id", order_id);

    if (confirmations >= REQUIRED_CONFIRMATIONS) {
      // Payment confirmed! Complete the order
      // IMPORTANT: Call complete-payment on Lovable Cloud using service role key + internal_user_id
      const cloudUrl = Deno.env.get("SUPABASE_URL") || "";
      const cloudServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      
      let orderCompleted = false;
      let completeError: string | null = null;
      
      if (cloudUrl && cloudServiceKey) {
        try {
          console.log("Calling complete-payment on Lovable Cloud:", cloudUrl);
          
          const completeResponse = await fetch(`${cloudUrl}/functions/v1/complete-payment`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${cloudServiceKey}`,  // Use service role key instead of user token
            },
            body: JSON.stringify({ 
              order_id,
              internal_user_id: userId  // Pass user_id for internal validation
            }),
          });
          
          const completeResult = await completeResponse.json();
          console.log("complete-payment response:", completeResponse.status, JSON.stringify(completeResult));
          
          if (completeResponse.ok && completeResult.success) {
            orderCompleted = true;
            console.log("✅ Order completed successfully!");
          } else {
            completeError = completeResult.error || `HTTP ${completeResponse.status}`;
            console.error("❌ Failed to complete order:", completeError);
          }
        } catch (err) {
          completeError = err instanceof Error ? err.message : String(err);
          console.error("❌ Exception calling complete-payment:", completeError);
        }
      } else {
        completeError = "Cloud credentials not configured";
        console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      }

      return successResponse({
        success: true,
        status: "paid",
        received: totalReceived,
        expected: expectedAmount,
        confirmations,
        required_confirmations: REQUIRED_CONFIRMATIONS,
        order_completed: orderCompleted,
        complete_error: completeError,
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
    return errorResponse(error instanceof Error ? error.message : "Unknown error", 500);
  }
});
