import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function translateText(text: string, apiKey: string): Promise<string> {
  if (!text || text.trim() === '') return '';
  
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: `You are a professional translator. Translate the following Arabic text to English.
          
IMPORTANT RULES:
- Return ONLY the translated text, nothing else
- Keep brand names as-is
- If text is already in English, return it unchanged
- Do not add quotes or explanations`
        },
        { role: 'user', content: text }
      ],
      max_tokens: 500,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    console.error('Translation failed:', await response.text());
    return '';
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'LOVABLE_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use external Supabase
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const results = {
      categories: { updated: 0, failed: 0 },
      products: { updated: 0, failed: 0 },
      variants: { updated: 0, failed: 0 },
    };

    // Translate categories
    console.log('Translating categories...');
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name, name_en')
      .or('name_en.is.null,name_en.eq.');

    if (categories) {
      for (const cat of categories) {
        if (!cat.name_en) {
          const name_en = await translateText(cat.name, apiKey);
          if (name_en) {
            const { error } = await supabase
              .from('categories')
              .update({ name_en })
              .eq('id', cat.id);
            
            if (error) {
              console.error('Failed to update category:', cat.id, error);
              results.categories.failed++;
            } else {
              console.log(`Translated category: ${cat.name} -> ${name_en}`);
              results.categories.updated++;
            }
          }
        }
      }
    }

    // Translate products
    console.log('Translating products...');
    const { data: products } = await supabase
      .from('products')
      .select('id, name, description, name_en, description_en')
      .or('name_en.is.null,name_en.eq.');

    if (products) {
      for (const prod of products) {
        const updates: any = {};
        
        if (!prod.name_en) {
          updates.name_en = await translateText(prod.name, apiKey);
        }
        if (prod.description && !prod.description_en) {
          updates.description_en = await translateText(prod.description, apiKey);
        }
        
        if (Object.keys(updates).length > 0) {
          const { error } = await supabase
            .from('products')
            .update(updates)
            .eq('id', prod.id);
          
          if (error) {
            console.error('Failed to update product:', prod.id, error);
            results.products.failed++;
          } else {
            console.log(`Translated product: ${prod.name} -> ${updates.name_en}`);
            results.products.updated++;
          }
        }
      }
    }

    // Translate variants
    console.log('Translating variants...');
    const { data: variants } = await supabase
      .from('product_variants')
      .select('id, name, description, name_en, description_en')
      .or('name_en.is.null,name_en.eq.');

    if (variants) {
      for (const variant of variants) {
        const updates: any = {};
        
        if (!variant.name_en) {
          updates.name_en = await translateText(variant.name, apiKey);
        }
        if (variant.description && !variant.description_en) {
          updates.description_en = await translateText(variant.description, apiKey);
        }
        
        if (Object.keys(updates).length > 0) {
          const { error } = await supabase
            .from('product_variants')
            .update(updates)
            .eq('id', variant.id);
          
          if (error) {
            console.error('Failed to update variant:', variant.id, error);
            results.variants.failed++;
          } else {
            console.log(`Translated variant: ${variant.name} -> ${updates.name_en}`);
            results.variants.updated++;
          }
        }
      }
    }

    console.log('Translation complete:', results);

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
