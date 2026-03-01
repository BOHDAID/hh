import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find cart items older than 1 hour that haven't been reminded yet
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: abandonedCarts, error: cartError } = await supabase
      .from('cart_items')
      .select('user_id, id, product_id, created_at, products(name, name_en, image_url)')
      .eq('reminder_sent', false)
      .lt('created_at', oneHourAgo);

    if (cartError) {
      console.error('Error fetching abandoned carts:', cartError);
      return new Response(JSON.stringify({ error: cartError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!abandonedCarts || abandonedCarts.length === 0) {
      return new Response(JSON.stringify({ message: 'No abandoned carts found', notified: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Group by user_id
    const userCarts: Record<string, typeof abandonedCarts> = {};
    for (const item of abandonedCarts) {
      if (!userCarts[item.user_id]) {
        userCarts[item.user_id] = [];
      }
      userCarts[item.user_id].push(item);
    }

    let notifiedCount = 0;
    const cartItemIds: string[] = [];

    for (const [userId, items] of Object.entries(userCarts)) {
      const itemCount = items.length;
      const firstProduct = (items[0] as any).products;
      const productName = firstProduct?.name || 'منتج';

      const title = 'سلة التسوق بانتظارك! 🛒';
      const message = itemCount === 1
        ? `لديك "${productName}" في سلة التسوق. أكمل عملية الشراء قبل نفاد الكمية!`
        : `لديك ${itemCount} منتجات في سلة التسوق. أكمل عملية الشراء قبل نفاد الكمية!`;

      // Create notification
      const { error: notifError } = await supabase
        .from('notifications')
        .insert({
          user_id: userId,
          title,
          message,
          type: 'cart_reminder',
          link: '/cart',
        });

      if (!notifError) {
        notifiedCount++;
        cartItemIds.push(...items.map(i => i.id));
      } else {
        console.error('Error creating notification for user', userId, notifError);
      }
    }

    // Mark cart items as reminded
    if (cartItemIds.length > 0) {
      await supabase
        .from('cart_items')
        .update({ reminder_sent: true, reminder_sent_at: new Date().toISOString() })
        .in('id', cartItemIds);
    }

    return new Response(JSON.stringify({ 
      message: `Notified ${notifiedCount} users`,
      notified: notifiedCount,
      items_marked: cartItemIds.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
