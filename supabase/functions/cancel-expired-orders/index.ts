import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Duration in minutes after which pending orders are cancelled
const EXPIRY_MINUTES = 60;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // External database credentials
    const externalUrl =
      Deno.env.get("EXTERNAL_SUPABASE_URL") ||
      Deno.env.get("VITE_EXTERNAL_SUPABASE_URL") ||
      "";
    const externalServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!externalUrl || !externalServiceKey) {
      return new Response(
        JSON.stringify({ error: "External database not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(externalUrl, externalServiceKey);

    // Calculate the cutoff time (60 minutes ago)
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - EXPIRY_MINUTES);
    const cutoffIso = cutoffTime.toISOString();

    console.log(`Checking for orders pending before: ${cutoffIso}`);

    // Find pending orders older than 60 minutes
    const { data: expiredOrders, error: fetchError } = await adminClient
      .from("orders")
      .select("id, order_number, created_at, payment_status, status")
      .eq("status", "pending")
      .in("payment_status", ["pending", "awaiting_payment"])
      .lt("created_at", cutoffIso);

    if (fetchError) {
      console.error("Error fetching expired orders:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch orders", details: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!expiredOrders || expiredOrders.length === 0) {
      console.log("No expired orders found");
      return new Response(
        JSON.stringify({ success: true, cancelled_count: 0, message: "No expired orders" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${expiredOrders.length} expired orders to cancel`);

    // Cancel each expired order
    const cancelledIds: string[] = [];
    const errors: string[] = [];

    for (const order of expiredOrders) {
      const { error: updateError } = await adminClient
        .from("orders")
        .update({
          status: "cancelled",
          payment_status: "expired",
        })
        .eq("id", order.id);

      if (updateError) {
        console.error(`Failed to cancel order ${order.order_number}:`, updateError);
        errors.push(order.order_number);
      } else {
        console.log(`✅ Cancelled order: ${order.order_number}`);
        cancelledIds.push(order.id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        cancelled_count: cancelledIds.length,
        cancelled_orders: cancelledIds,
        errors: errors.length > 0 ? errors : undefined,
        message: `تم إلغاء ${cancelledIds.length} طلب منتهي الصلاحية`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Cancel expired orders error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
