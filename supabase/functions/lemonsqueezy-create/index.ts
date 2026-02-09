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

function isValidAmount(amount: number): boolean {
  return typeof amount === "number" && amount > 0 && amount < 1_000_000;
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

interface LemonSqueezyRequest {
  order_id: string;
  amount: number;
  product_name: string;
  customer_email: string;
  customer_name?: string;
}

interface SiteSettings {
  [key: string]: string;
}

function isMissingColumnError(err: unknown, column: string) {
  const msg =
    typeof err === "object" && err && "message" in err
      ? String((err as any).message)
      : "";
  const code =
    typeof err === "object" && err && "code" in err
      ? String((err as any).code)
      : "";

  return code === "PGRST204" && msg.includes(`'${column}'`);
}

async function getSettings(supabase: any): Promise<SiteSettings> {
  const { data, error } = await supabase
    .from("site_settings")
    .select("key, value")
    .in("key", [
      "lemonsqueezy_api_key",
      "lemonsqueezy_store_id",
      "lemonsqueezy_variant_id",
      "store_name",
      "store_url",
    ]);

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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting
    const clientIP = getClientIP(req);
    if (!checkRateLimit(clientIP, 10, 60000)) {
      return errorResponse("Rate limit exceeded", 429);
    }

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Unauthorized", 401);
    }

    // Use external Supabase for data operations
    const externalUrl = Deno.env.get("VITE_EXTERNAL_SUPABASE_URL")!;
    const externalAnonKey = Deno.env.get("VITE_EXTERNAL_SUPABASE_ANON_KEY")!;
    const externalServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;

    if (!externalUrl || !externalAnonKey || !externalServiceKey) {
      console.error("External Supabase not configured");
      return errorResponse("External database not configured", 500);
    }

    // Verify user via external DB
    const userClient = createClient(externalUrl, externalAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return errorResponse("Unauthorized", 401);
    }

    const userId = claimsData.claims.sub as string;

    // Admin client (external DB)
    const adminClient = createClient(externalUrl, externalServiceKey);

    const { order_id, amount, product_name, customer_email, customer_name }: LemonSqueezyRequest = await req.json();

    // Validate inputs
    if (!order_id || !isValidUUID(order_id)) {
      return errorResponse("Invalid order ID");
    }

    if (!isValidAmount(amount)) {
      return errorResponse("Invalid amount");
    }

    // Verify order exists and belongs to user
    // NOTE: some external schemas may not have `payment_status`
    let order: any = null;
    let orderError: any = null;

    console.log("Looking for order:", order_id);

    // Try query without payment_status first (safer for external schemas)
    const queryResult = await adminClient
      .from("orders")
      .select("id, user_id, total_amount")
      .eq("id", order_id)
      .single();

    if (queryResult.error) {
      console.error("Order query failed:", queryResult.error);
      orderError = queryResult.error;
    } else {
      order = queryResult.data;
      console.log("Order found:", order);
    }

    if (orderError || !order) {
      console.error("Order not found for ID:", order_id, "Error:", orderError);
      return errorResponse("Order not found");
    }

    if (order.user_id !== userId) {
      return errorResponse("Unauthorized", 403);
    }

    if (order.payment_status && order.payment_status === "paid") {
      return errorResponse("Order already paid");
    }

    // Get settings
    const settings = await getSettings(adminClient);

    const apiKey = settings.lemonsqueezy_api_key;
    const storeId = settings.lemonsqueezy_store_id;
    const variantId = settings.lemonsqueezy_variant_id;
    // Use store_url from settings, fallback to preview URL
    const storeUrl = settings.store_url || "https://id-preview--384e7966-16d3-4c93-b75e-9579727e361b.lovable.app";

    if (!apiKey || !storeId) {
      console.error("Lemon Squeezy not configured - missing API key or store ID");
      return errorResponse("Payment gateway not configured: missing API key or Store ID", 500);
    }

    if (!variantId) {
      console.error("Lemon Squeezy Variant ID not configured");
      return errorResponse("Payment gateway not configured: missing Variant ID. Please create a 'Pay What You Want' product in Lemon Squeezy and add the Variant ID in settings.", 500);
    }
    // Lemon Squeezy requires minimum $0.50 for custom prices
    const priceInCents = Math.round(amount * 100);
    const minimumCents = 50; // $0.50 minimum
    
    if (priceInCents < minimumCents) {
      console.error(`Price too low: ${priceInCents} cents (minimum: ${minimumCents})`);
      return errorResponse(`Price must be at least $0.50. Current price: $${amount.toFixed(2)}`, 422);
    }

    // Create Lemon Squeezy checkout with dynamic price
    const checkoutPayload = {
      data: {
        type: "checkouts",
        attributes: {
          custom_price: priceInCents,
          product_options: {
            name: product_name || "Digital Product",
            description: `Order #${order_id.slice(0, 8)}`,
            redirect_url: `${storeUrl}/order/${order_id}`,
            receipt_button_text: "عرض الطلب",
            receipt_link_url: `${storeUrl}/order/${order_id}`,
            receipt_thank_you_note: "شكراً لشرائك! سيتم تسليم طلبك فوراً.",
          },
          checkout_options: {
            embed: false,
            media: false, // Hide original product media
            logo: true,
            desc: false, // Hide original product description
            discount: false,
            button_color: "#7c3aed",
          },
          checkout_data: {
            email: customer_email || undefined,
            name: customer_name || undefined, // Omit if empty - Lemon Squeezy rejects empty strings
            custom: {
              order_id: order_id,
              user_id: userId,
            },
          },
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
          test_mode: true, // Test mode - change to false for production
        },
        relationships: {
          store: {
            data: {
              type: "stores",
              id: storeId,
            },
          },
          variant: {
            data: {
              type: "variants",
              id: variantId,
            },
          },
        },
      },
    };

    console.log("Creating Lemon Squeezy checkout:", JSON.stringify(checkoutPayload, null, 2));

    const lsResponse = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(checkoutPayload),
    });

    const lsData = await lsResponse.json();

    if (!lsResponse.ok) {
      console.error("Lemon Squeezy API error:", lsData);
      return errorResponse(lsData.errors?.[0]?.detail || "Failed to create checkout", lsResponse.status);
    }

    const checkoutUrl = lsData.data?.attributes?.url;
    const checkoutId = lsData.data?.id;

    if (!checkoutUrl) {
      console.error("No checkout URL returned:", lsData);
      return errorResponse("Failed to get checkout URL", 500);
    }

    // Update order with Lemon Squeezy checkout ID
    await adminClient
      .from("orders")
      .update({
        payment_method: "lemonsqueezy",
        payment_address: checkoutId, // Store checkout ID for reference
      })
      .eq("id", order_id);

    console.log("Lemon Squeezy checkout created:", checkoutUrl);

    return successResponse({
      success: true,
      checkout_url: checkoutUrl,
      checkout_id: checkoutId,
    });
  } catch (error) {
    console.error("Error in lemonsqueezy-create:", error);
    return errorResponse(error instanceof Error ? error.message : "Unknown error", 500);
  }
});
