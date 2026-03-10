import { db } from '@/lib/supabaseClient';

// Edge function URL for Lovable Cloud (where auto-translate runs)
const LOVABLE_FUNCTIONS_URL = 'https://wueacwqzafxsvowlqbwh.supabase.co/functions/v1';
const LOVABLE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1ZWFjd3F6YWZ4c3Zvd2xxYndoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NTQ4NjYsImV4cCI6MjA4NjIzMDg2Nn0.oAm52uJqIMD5jWjy2iJJuioTKMv0Xl1ayZEbXjj33Ug';

export const translateText = async (text: string, targetLang: string = 'en'): Promise<string> => {
  if (!text || text.trim() === '') return '';
  
  try {
    // Call Lovable Cloud edge function directly via fetch (works on any domain)
    const response = await fetch(`${LOVABLE_FUNCTIONS_URL}/auto-translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_ANON_KEY}`,
        'apikey': LOVABLE_ANON_KEY,
      },
      body: JSON.stringify({ text, targetLang }),
    });

    if (!response.ok) {
      console.error('Translation error:', response.statusText);
      return '';
    }

    const data = await response.json();

    if (error) {
      console.error('Translation error:', error);
      return '';
    }

    if (data?.success && data?.translated) {
      return data.translated;
    }
    
    return '';
  } catch (error) {
    console.error('Translation failed:', error);
    return '';
  }
};

export const translateProduct = async (product: {
  name: string;
  description?: string | null;
}) => {
  const [name_en, description_en] = await Promise.all([
    translateText(product.name, 'en'),
    product.description ? translateText(product.description, 'en') : Promise.resolve(''),
  ]);

  return { name_en, description_en };
};

export const translateCategory = async (name: string) => {
  const name_en = await translateText(name, 'en');
  return { name_en };
};

export const translateVariant = async (variant: {
  name: string;
  description?: string | null;
}) => {
  const [name_en, description_en] = await Promise.all([
    translateText(variant.name, 'en'),
    variant.description ? translateText(variant.description, 'en') : Promise.resolve(''),
  ]);

  return { name_en, description_en };
};
