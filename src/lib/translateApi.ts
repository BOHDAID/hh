import { supabase } from '@/integrations/supabase/client';

export const translateText = async (text: string, targetLang: string = 'en'): Promise<string> => {
  if (!text || text.trim() === '') return '';
  
  try {
    const { data, error } = await supabase.functions.invoke('auto-translate', {
      body: { text, targetLang },
    });

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
