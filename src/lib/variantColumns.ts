// Explicit columns for product_variants to avoid schema cache errors
// when the external database doesn't have all columns (e.g. fulfillment_type)
export const VARIANT_COLUMNS = "id, product_id, name, name_en, description, description_en, price, stock, image_url, is_active, is_unlimited, warranty_days, display_order, created_at, updated_at";
