ALTER TABLE products
ADD COLUMN IF NOT EXISTS has_recipe BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN products.has_recipe IS
'False for finished/resale products that should use product_variants.cost as manual cost instead of recipe + packaging.';
