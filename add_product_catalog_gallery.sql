-- Product catalog gallery and consult-price mode.
-- Run this in Supabase SQL editor before using the new product fields in Admin.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS gallery_images JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS catalog_price_mode TEXT NOT NULL DEFAULT 'priced',
  ADD COLUMN IF NOT EXISTS catalog_cta_label TEXT;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_catalog_price_mode_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_catalog_price_mode_check
  CHECK (catalog_price_mode IN ('priced', 'consult'));

CREATE INDEX IF NOT EXISTS idx_products_catalog_price_mode
  ON public.products(catalog_price_mode);
