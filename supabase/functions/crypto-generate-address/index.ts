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

interface GenerateAddressRequest {
  order_id: string;
  crypto?: string; // LTC or BTC
}

interface SiteSettings {
  [key: string]: string;
}

// Required columns in orders table for crypto payments
const REQUIRED_ORDER_COLUMNS = ["payment_address", "payment_method", "payment_status", "ltc_amount"];

// Version bytes for P2PKH addresses
const LTC_VERSION = 0x30; // 48 = "L" prefix
const BTC_VERSION = 0x00; // 0 = "1" prefix

// Base58 alphabet
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// Base58 decode
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
  // Add leading zeros
  for (const c of str) {
    if (c !== "1") break;
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

// Base58 encode
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
  // Add leading zeros
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

// Parse serialized extended public key (xpub format)
function parseXpub(xpub: string): { chainCode: Uint8Array; publicKey: Uint8Array } {
  const decoded = base58Decode(xpub);
  
  // xpub format: 4 bytes version + 1 byte depth + 4 bytes fingerprint + 4 bytes child number + 32 bytes chain code + 33 bytes public key + 4 bytes checksum
  // Total: 82 bytes
  if (decoded.length !== 82) {
    throw new Error(`Invalid xpub length: ${decoded.length}, expected 82`);
  }
  
  // Verify checksum
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

// BIP32 child key derivation (public key only, non-hardened)
function deriveChildPublicKey(
  parentPublicKey: Uint8Array, 
  parentChainCode: Uint8Array, 
  index: number
): { publicKey: Uint8Array; chainCode: Uint8Array } {
  if (index >= 0x80000000) {
    throw new Error("Cannot derive hardened child from public key");
  }
  
  // Data = serP(Kpar) || ser32(i)
  const data = new Uint8Array(37);
  data.set(parentPublicKey, 0);
  data[33] = (index >> 24) & 0xff;
  data[34] = (index >> 16) & 0xff;
  data[35] = (index >> 8) & 0xff;
  data[36] = index & 0xff;
  
  // I = HMAC-SHA512(Key = cpar, Data)
  const I = hmac(sha512, parentChainCode, data);
  const IL = I.slice(0, 32);
  const IR = I.slice(32);
  
  // Ki = point(parse256(IL)) + Kpar
  // Convert IL to bigint
  const ilBigInt = BigInt("0x" + Array.from(IL).map(b => b.toString(16).padStart(2, "0")).join(""));
  
  // Get parent point
  const parentPoint = secp256k1.ProjectivePoint.fromHex(parentPublicKey);
  
  // Get IL * G
  const ilPoint = secp256k1.ProjectivePoint.BASE.multiply(ilBigInt);
  
  // Ki = IL*G + Kpar
  const childPoint = parentPoint.add(ilPoint);
  
  // Serialize compressed public key
  const childPublicKey = childPoint.toRawBytes(true);
  
  return {
    publicKey: childPublicKey,
    chainCode: IR
  };
}

// Derive path from xpub (e.g., "m/0/5")
function deriveFromXpub(xpub: string, path: string): Uint8Array {
  const { chainCode, publicKey } = parseXpub(xpub);
  
  // Parse path
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

// Generate P2PKH address from public key
function publicKeyToAddress(publicKey: Uint8Array, version: number): string {
  // SHA256 of public key
  const sha256Hash = sha256(publicKey);
  
  // RIPEMD160 of SHA256 result
  const ripemd160Hash = ripemd160(sha256Hash);
  
  // Add version byte
  const versionedPayload = new Uint8Array(21);
  versionedPayload[0] = version;
  versionedPayload.set(ripemd160Hash, 1);
  
  // Double SHA256 for checksum
  const checksum = sha256(sha256(versionedPayload)).slice(0, 4);
  
  // Combine and Base58 encode
  const fullPayload = new Uint8Array(25);
  fullPayload.set(versionedPayload);
  fullPayload.set(checksum, 21);
  
  return base58Encode(fullPayload);
}

// Derive LTC/BTC address from xPub
function deriveAddressFromXpub(xpub: string, index: number, isLTC: boolean): string {
  try {
    console.log(`Deriving address from xPub at path m/0/${index}...`);
    
    // Derive public key at path m/0/index (external chain)
    const childPublicKey = deriveFromXpub(xpub, `m/0/${index}`);
    
    // Convert to address
    const version = isLTC ? LTC_VERSION : BTC_VERSION;
    const address = publicKeyToAddress(childPublicKey, version);
    
    console.log(`Derived ${isLTC ? 'LTC' : 'BTC'} address at index ${index}: ${address}`);
    
    return address;
  } catch (error) {
    console.error("HD derivation error:", error);
    throw new Error(`Failed to derive address: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Helper function to get settings from database
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

// Extract missing column name from PGRST204 error
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
    // Rate limiting
    const clientIP = getClientIP(req);
    if (!checkRateLimit(`crypto-generate:${clientIP}`, 10, 60000)) {
      return errorResponse("Too many requests. Please try again later.", 429);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Unauthorized", 401);
    }

    // Use external Supabase (where data actually lives)
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
      console.error("External DB env vars missing");
      return errorResponse("Backend not configured", 500);
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

    // Get settings from site_settings
    const settings = await getSettings(adminClient, [
      "ltc_address", "btc_address", // Static addresses (priority)
      "ltc_xpub", "btc_xpub", // xPub (fallback)
      "enabled_cryptos",
      "crypto_fee_percent",
      "crypto_payment_timeout_minutes"
    ]);

    const body = await req.json();
    const { order_id, crypto = "LTC" }: GenerateAddressRequest = body;

    if (!order_id || !isValidUUID(order_id)) {
      return errorResponse("Invalid order ID");
    }

    // Verify order belongs to user
    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .eq("user_id", userId)
      .single();

    if (orderError || !order) {
      return errorResponse("Order not found", 404);
    }

    // If address already exists, return it
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

    // PRIORITY 1: Use static address if available
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
    } 
    // PRIORITY 2: Derive from xPub
    else {
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

      // Get next index by counting orders that already have a payment_address
      // This works even without crypto_index column in external DB
      const { count } = await adminClient
        .from("orders")
        .select("*", { count: "exact", head: true })
        .not("payment_address", "is", null)
        .like("payment_method", `%${isLTC ? 'litecoin' : 'bitcoin'}%`);
      
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

    // Calculate fee percentage and expiry
    const feePercent = parseFloat(settings.crypto_fee_percent || "3");
    const timeoutMinutes = parseInt(settings.crypto_payment_timeout_minutes || "60", 10);
    const expiresAt = new Date(Date.now() + timeoutMinutes * 60 * 1000);
    
    // Fetch current LTC price from CoinGecko
    const isLTC = cryptoUpper === "LTC";
    let cryptoPrice = 0;
    
    try {
      const priceUrl = isLTC 
        ? "https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=usd"
        : "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd";
      
      const priceResponse = await fetch(priceUrl);
      if (priceResponse.ok) {
        const priceData = await priceResponse.json();
        cryptoPrice = isLTC ? priceData.litecoin?.usd : priceData.bitcoin?.usd;
      }
    } catch (priceError) {
      console.error("Failed to fetch crypto price:", priceError);
    }
    
    if (!cryptoPrice || cryptoPrice <= 0) {
      return errorResponse("فشل في جلب سعر العملة الرقمية. حاول مرة أخرى.", 500);
    }
    
    // Calculate crypto amount from USD total_amount
    const totalUSD = order.total_amount || 0;
    const baseCryptoAmount = totalUSD / cryptoPrice;
    const cryptoWithFee = baseCryptoAmount * (1 + feePercent / 100);
    const finalCryptoAmount = Math.round(cryptoWithFee * 100000000) / 100000000; // Round to 8 decimals
    
    console.log(`Converting $${totalUSD} to ${cryptoUpper}: price=${cryptoPrice}, amount=${finalCryptoAmount}`);

    // Save address to order - only use columns that exist in external DB
    // Note: crypto_fee_percent and crypto_index are NOT saved (columns may not exist in external DB)
    const updateData: Record<string, unknown> = {
      payment_address: paymentAddress,
      payment_method: paymentMethod,
      payment_status: "awaiting_payment",
      ltc_amount: finalCryptoAmount,
      expires_at: expiresAt.toISOString(),
    };

    console.log("Updating order with:", JSON.stringify(updateData));

    const { error: updateError } = await adminClient
      .from("orders")
      .update(updateData)
      .eq("id", order_id);

    if (updateError) {
      console.error("Failed to update order:", updateError);
      
      // Check if it's a missing column error
      const missingCol = extractMissingColumn(updateError.message);
      if (missingCol && REQUIRED_ORDER_COLUMNS.includes(missingCol)) {
        return errorResponse(
          `عمود '${missingCol}' غير موجود في جدول orders. يرجى إضافته في قاعدة البيانات ثم إعادة تحميل الـ Schema Cache من: Settings → API → Reload schema`,
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
      ltc_amount: finalCryptoAmount,
      crypto_price: cryptoPrice,
      fee_percent: feePercent,
    });
  } catch (error) {
    console.error("Crypto generate address error:", error);
    return errorResponse(error instanceof Error ? error.message : "Unknown error", 500);
  }
});
