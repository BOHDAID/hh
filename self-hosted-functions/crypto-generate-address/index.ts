import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as secp256k1 from "https://esm.sh/@noble/secp256k1@2.1.0";
import { ripemd160 } from "https://esm.sh/@noble/hashes@1.3.3/ripemd160";
import { sha256 } from "https://esm.sh/@noble/hashes@1.3.3/sha256";
import { sha512 } from "https://esm.sh/@noble/hashes@1.3.3/sha512";
import { hmac } from "https://esm.sh/@noble/hashes@1.3.3/hmac";

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

/**
 * نسخة Self-Hosted - للنشر على Supabase الخارجي
 * تستخدم SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY المتاحة تلقائياً
 */

interface GenerateAddressRequest {
  order_id: string;
  crypto?: string; // LTC or BTC
}

interface SiteSettings {
  [key: string]: string;
}

const REQUIRED_ORDER_COLUMNS = ["payment_address", "payment_method", "payment_status", "ltc_amount"];

const LTC_VERSION = 0x30;
const BTC_VERSION = 0x00;

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(str: string): Uint8Array {
  const bytes: number[] = [];
  for (const c of str) {
    const idx = BASE58_ALPHABET.indexOf(c);
    if (idx === -1) throw new Error("Invalid base58 character");
    let carry = idx;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const c of str) {
    if (c !== "1") break;
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

function base58Encode(bytes: Uint8Array): string {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let result = "";
  for (const byte of bytes) {
    if (byte !== 0) break;
    result += "1";
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]];
  }
  return result;
}

function parseXpub(xpub: string): { chainCode: Uint8Array; publicKey: Uint8Array } {
  const decoded = base58Decode(xpub);
  
  if (decoded.length !== 82) {
    throw new Error(`Invalid xpub length: ${decoded.length}, expected 82`);
  }
  
  const payload = decoded.slice(0, 78);
  const checksum = decoded.slice(78);
  const hash = sha256(sha256(payload));
  
  if (hash[0] !== checksum[0] || hash[1] !== checksum[1] || hash[2] !== checksum[2] || hash[3] !== checksum[3]) {
    throw new Error("Invalid xpub checksum");
  }
  
  const chainCode = decoded.slice(13, 45);
  const publicKey = decoded.slice(45, 78);
  
  return { chainCode, publicKey };
}

function deriveChildPublicKey(
  parentPublicKey: Uint8Array, 
  parentChainCode: Uint8Array, 
  index: number
): { publicKey: Uint8Array; chainCode: Uint8Array } {
  if (index >= 0x80000000) {
    throw new Error("Cannot derive hardened child from public key");
  }
  
  const data = new Uint8Array(37);
  data.set(parentPublicKey, 0);
  data[33] = (index >> 24) & 0xff;
  data[34] = (index >> 16) & 0xff;
  data[35] = (index >> 8) & 0xff;
  data[36] = index & 0xff;
  
  const I = hmac(sha512, parentChainCode, data);
  const IL = I.slice(0, 32);
  const IR = I.slice(32);
  
  const ilBigInt = BigInt("0x" + Array.from(IL).map(b => b.toString(16).padStart(2, "0")).join(""));
  
  const parentPoint = secp256k1.ProjectivePoint.fromHex(parentPublicKey);
  const ilPoint = secp256k1.ProjectivePoint.BASE.multiply(ilBigInt);
  const childPoint = parentPoint.add(ilPoint);
  const childPublicKey = childPoint.toRawBytes(true);
  
  return {
    publicKey: childPublicKey,
    chainCode: IR
  };
}

function deriveFromXpub(xpub: string, path: string): Uint8Array {
  const { chainCode, publicKey } = parseXpub(xpub);
  
  const parts = path.replace(/^m\/?/, "").split("/").filter(p => p.length > 0);
  
  let currentPublicKey = publicKey;
  let currentChainCode = chainCode;
  
  for (const part of parts) {
    if (part.endsWith("'") || part.endsWith("h")) {
      throw new Error("Cannot derive hardened path from public key");
    }
    const index = parseInt(part, 10);
    if (isNaN(index) || index < 0) {
      throw new Error(`Invalid path component: ${part}`);
    }
    
    const derived = deriveChildPublicKey(currentPublicKey, currentChainCode, index);
    currentPublicKey = derived.publicKey;
    currentChainCode = derived.chainCode;
  }
  
  return currentPublicKey;
}

function publicKeyToAddress(publicKey: Uint8Array, version: number): string {
  const sha256Hash = sha256(publicKey);
  const ripemd160Hash = ripemd160(sha256Hash);
  
  const versionedPayload = new Uint8Array(21);
  versionedPayload[0] = version;
  versionedPayload.set(ripemd160Hash, 1);
  
  const checksum = sha256(sha256(versionedPayload)).slice(0, 4);
  
  const fullPayload = new Uint8Array(25);
  fullPayload.set(versionedPayload);
  fullPayload.set(checksum, 21);
  
  return base58Encode(fullPayload);
}

function deriveAddressFromXpub(xpub: string, index: number, isLTC: boolean): string {
  try {
    console.log(`Deriving address from xPub at path m/0/${index}...`);
    
    const childPublicKey = deriveFromXpub(xpub, `m/0/${index}`);
    const version = isLTC ? LTC_VERSION : BTC_VERSION;
    const address = publicKeyToAddress(childPublicKey, version);
    
    console.log(`Derived ${isLTC ? 'LTC' : 'BTC'} address at index ${index}: ${address}`);
    
    return address;
  } catch (error) {
    console.error("HD derivation error:", error);
    throw new Error(`Failed to derive address: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function getSettings(supabase: any, keys: string[]): Promise<SiteSettings> {
  const { data, error } = await supabase
    .from("site_settings")
    .select("key, value")
    .in("key", keys);

  if (error) {
    console.error("Error fetching settings:", error);
    throw new Error("Failed to fetch site settings");
  }

  const settings: SiteSettings = {};
  data?.forEach((item: { key: string; value: string | null }) => {
    settings[item.key] = item.value || "";
  });

  return settings;
}

function extractMissingColumn(message?: string | null): string | null {
  if (!message) return null;
  const match = message.match(/Could not find the '([^']+)' column of 'orders'/);
  return match?.[1] ?? null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientIP = getClientIP(req);
    if (!checkRateLimit(`crypto-generate:${clientIP}`, 10, 60000)) {
      return errorResponse("Too many requests. Please try again later.", 429);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Unauthorized", 401);
    }

    // استخدام المتغيرات المتاحة تلقائياً في Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      console.error("Supabase env vars missing");
      return errorResponse("Backend not configured", 500);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return errorResponse("Unauthorized", 401);
    }

    const userId = userData.user.id;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const settings = await getSettings(adminClient, [
      "ltc_address", "btc_address",
      "ltc_xpub", "btc_xpub",
      "enabled_cryptos",
      "crypto_fee_percent",
      "crypto_payment_timeout_minutes"
    ]);

    const body = await req.json();
    const { order_id, crypto = "LTC" }: GenerateAddressRequest = body;

    if (!order_id || !isValidUUID(order_id)) {
      return errorResponse("Invalid order ID");
    }

    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .eq("user_id", userId)
      .single();

    if (orderError || !order) {
      return errorResponse("Order not found", 404);
    }

    if (order.payment_address) {
      return successResponse({
        success: true,
        address: order.payment_address,
        index: order.crypto_index,
        already_generated: true,
        is_static: order.crypto_index === null,
      });
    }

    const cryptoUpper = crypto.toUpperCase();
    let paymentAddress: string;
    let cryptoIndex: number | null = null;
    let paymentMethod: string;
    let isStaticAddress = false;

    if (cryptoUpper === "BTC" && settings.btc_address) {
      paymentAddress = settings.btc_address;
      paymentMethod = "bitcoin_direct";
      isStaticAddress = true;
      console.log("Using static BTC address:", paymentAddress);
    } else if (cryptoUpper === "LTC" && settings.ltc_address) {
      paymentAddress = settings.ltc_address;
      paymentMethod = "litecoin_direct";
      isStaticAddress = true;
      console.log("Using static LTC address:", paymentAddress);
    } else {
      const isLTC = cryptoUpper === "LTC";
      const xpubKey = isLTC ? settings.ltc_xpub : settings.btc_xpub;
      
      if (!xpubKey) {
        return errorResponse(
          isLTC 
            ? "لم يتم تكوين عنوان Litecoin. يرجى إضافة عنوان LTC في الإعدادات." 
            : "لم يتم تكوين عنوان Bitcoin. يرجى إضافة عنوان BTC في الإعدادات.", 
          500
        );
      }

      paymentMethod = isLTC ? "litecoin_direct" : "bitcoin_direct";

      const { count } = await adminClient
        .from("orders")
        .select("*", { count: "exact", head: true })
        .not("crypto_index", "is", null);
      
      const nextIndex = (count || 0);
      
      console.log(`Deriving ${cryptoUpper} address at index ${nextIndex}...`);
      
      try {
        paymentAddress = deriveAddressFromXpub(xpubKey, nextIndex, isLTC);
        cryptoIndex = nextIndex;
      } catch (deriveError) {
        console.error("Derivation failed:", deriveError);
        return errorResponse(
          `فشل توليد العنوان. يُرجى استخدام عنوان ثابت بدلاً من xPub. (${deriveError instanceof Error ? deriveError.message : 'Unknown'})`, 
          500
        );
      }
    }

    const feePercent = parseFloat(settings.crypto_fee_percent || "3");
    const timeoutMinutes = parseInt(settings.crypto_payment_timeout_minutes || "60", 10);
    const expiresAt = new Date(Date.now() + timeoutMinutes * 60 * 1000);
    
    const originalLtcAmount = order.ltc_amount || 0;
    const ltcWithFee = originalLtcAmount * (1 + feePercent / 100);
    const finalLtcAmount = Math.round(ltcWithFee * 100000000) / 100000000;

    const updateData = {
      payment_address: paymentAddress,
      payment_method: paymentMethod,
      payment_status: "awaiting_payment",
      ltc_amount: finalLtcAmount,
    };

    console.log("Updating order with:", JSON.stringify(updateData));

    const { error: updateError } = await adminClient
      .from("orders")
      .update(updateData)
      .eq("id", order_id);

    if (updateError) {
      console.error("Failed to update order:", updateError);
      
      const missingCol = extractMissingColumn(updateError.message);
      if (missingCol && REQUIRED_ORDER_COLUMNS.includes(missingCol)) {
        return errorResponse(
          `عمود '${missingCol}' غير موجود في جدول orders. يرجى إضافته في قاعدة البيانات.`,
          500
        );
      }
      
      return errorResponse(`فشل حفظ عنوان الدفع: ${updateError.message}`, 500);
    }

    console.log("Order updated successfully with payment address:", paymentAddress);

    return successResponse({
      success: true,
      address: paymentAddress,
      index: cryptoIndex,
      crypto: cryptoUpper,
      is_static: isStaticAddress,
      expires_at: expiresAt.toISOString(),
      ltc_amount: finalLtcAmount,
      fee_percent: feePercent,
    });
  } catch (error) {
    console.error("Crypto generate address error:", error);
    return errorResponse(error instanceof Error ? error.message : "Unknown error", 500);
  }
});
