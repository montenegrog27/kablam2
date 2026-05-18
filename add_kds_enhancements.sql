-- 1. Add extras JSONB to order_items (stores selected modifiers and removed ingredients)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS extras JSONB DEFAULT '[]'::jsonb;

-- 2. Add is_preparable to products (controls KDS visibility)
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_preparable BOOLEAN DEFAULT true;

-- 3. Print tracking columns for printer agent (realtime-driven)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS preparing_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reprint_at TIMESTAMPTZ;
