CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  show_in_home BOOLEAN NOT NULL DEFAULT false,
  badge TEXT,
  promotion_type TEXT NOT NULL DEFAULT 'visual',
  image_type TEXT NOT NULL DEFAULT 'product',
  image_url TEXT,
  additional_product_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  usage_count INTEGER NOT NULL DEFAULT 0,
  generated_sales NUMERIC NOT NULL DEFAULT 0,
  discount_granted NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS promotions_tenant_idx
ON promotions(tenant_id, active, created_at DESC);

CREATE TABLE IF NOT EXISTS promotion_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  promotion_id UUID REFERENCES promotions(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  discount_type TEXT,
  discount_value NUMERIC,
  minimum_amount NUMERIC,
  buy_quantity INTEGER,
  get_quantity INTEGER,
  second_unit_discount_percent NUMERIC,
  priority INTEGER NOT NULL DEFAULT 0,
  stackable BOOLEAN NOT NULL DEFAULT true,
  active BOOLEAN NOT NULL DEFAULT true,
  valid_products UUID[] NOT NULL DEFAULT '{}',
  valid_combos UUID[] NOT NULL DEFAULT '{}',
  valid_categories UUID[] NOT NULL DEFAULT '{}',
  valid_branches UUID[] NOT NULL DEFAULT '{}',
  days_of_week INTEGER[] NOT NULL DEFAULT '{}',
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  start_hour TEXT,
  end_hour TEXT,
  payment_methods UUID[] NOT NULL DEFAULT '{}',
  usage_limit INTEGER,
  usage_per_customer INTEGER,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS promotion_rules_tenant_idx
ON promotion_rules(tenant_id, active, priority DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS promotion_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('product', 'combo', 'category')),
  target_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (promotion_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS promotion_targets_promotion_idx
ON promotion_targets(promotion_id, target_type);

CREATE TABLE IF NOT EXISTS promotion_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  promotion_id UUID,
  promotion_name TEXT NOT NULL,
  promotion_type TEXT NOT NULL,
  order_id UUID,
  customer_id UUID,
  subtotal_before_discount NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  final_total NUMERIC NOT NULL DEFAULT 0,
  extras_total NUMERIC NOT NULL DEFAULT 0,
  items_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS promotion_analytics_tenant_idx
ON promotion_analytics(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS promotion_analytics_promotion_idx
ON promotion_analytics(promotion_id, created_at DESC);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS promotion_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS promotion_names TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS subtotal_before_discount NUMERIC,
  ADD COLUMN IF NOT EXISTS final_total NUMERIC;

ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_item_type_check;

ALTER TABLE order_items
  ADD CONSTRAINT order_items_item_type_check
  CHECK (item_type IN ('product', 'combo', 'promotion'));

ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "promotions_select" ON promotions;
DROP POLICY IF EXISTS "promotions_insert" ON promotions;
DROP POLICY IF EXISTS "promotions_update" ON promotions;
DROP POLICY IF EXISTS "promotions_delete" ON promotions;

CREATE POLICY "promotions_select" ON promotions FOR SELECT USING (
  tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
);
CREATE POLICY "promotions_insert" ON promotions FOR INSERT WITH CHECK (
  tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
);
CREATE POLICY "promotions_update" ON promotions FOR UPDATE USING (
  tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
) WITH CHECK (
  tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
);
CREATE POLICY "promotions_delete" ON promotions FOR DELETE USING (
  tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "promotion_rules_select" ON promotion_rules;
DROP POLICY IF EXISTS "promotion_rules_insert" ON promotion_rules;
DROP POLICY IF EXISTS "promotion_rules_update" ON promotion_rules;
DROP POLICY IF EXISTS "promotion_rules_delete" ON promotion_rules;

CREATE POLICY "promotion_rules_select" ON promotion_rules FOR SELECT USING (
  tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
);
CREATE POLICY "promotion_rules_insert" ON promotion_rules FOR INSERT WITH CHECK (
  tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
);
CREATE POLICY "promotion_rules_update" ON promotion_rules FOR UPDATE USING (
  tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
) WITH CHECK (
  tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
);
CREATE POLICY "promotion_rules_delete" ON promotion_rules FOR DELETE USING (
  tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "promotion_targets_select" ON promotion_targets;
DROP POLICY IF EXISTS "promotion_targets_insert" ON promotion_targets;
DROP POLICY IF EXISTS "promotion_targets_update" ON promotion_targets;
DROP POLICY IF EXISTS "promotion_targets_delete" ON promotion_targets;

CREATE POLICY "promotion_targets_select" ON promotion_targets FOR SELECT USING (
  tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
);
CREATE POLICY "promotion_targets_insert" ON promotion_targets FOR INSERT WITH CHECK (
  tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
);
CREATE POLICY "promotion_targets_update" ON promotion_targets FOR UPDATE USING (
  tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
) WITH CHECK (
  tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
);
CREATE POLICY "promotion_targets_delete" ON promotion_targets FOR DELETE USING (
  tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "promotion_analytics_select" ON promotion_analytics;
DROP POLICY IF EXISTS "promotion_analytics_insert" ON promotion_analytics;
DROP POLICY IF EXISTS "promotion_analytics_update" ON promotion_analytics;
DROP POLICY IF EXISTS "promotion_analytics_delete" ON promotion_analytics;

CREATE POLICY "promotion_analytics_select" ON promotion_analytics FOR SELECT USING (
  tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
);
CREATE POLICY "promotion_analytics_insert" ON promotion_analytics FOR INSERT WITH CHECK (
  tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
);
CREATE POLICY "promotion_analytics_update" ON promotion_analytics FOR UPDATE USING (
  tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
) WITH CHECK (
  tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
);
CREATE POLICY "promotion_analytics_delete" ON promotion_analytics FOR DELETE USING (
  tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
);
