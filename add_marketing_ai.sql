-- ==========================================
-- MARKETING AI SYSTEM - Multi-tenant
-- ==========================================

-- Customer metrics (refreshed nightly)
CREATE TABLE IF NOT EXISTS customer_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  first_order_at TIMESTAMPTZ,
  last_order_at TIMESTAMPTZ,
  days_since_last_order INT DEFAULT 999,
  total_orders INT DEFAULT 0,
  total_spent DECIMAL(12,2) DEFAULT 0,
  avg_ticket DECIMAL(12,2) DEFAULT 0,
  orders_last_30d INT DEFAULT 0,
  orders_last_90d INT DEFAULT 0,
  favorite_product TEXT,
  favorite_category TEXT,
  favorite_day_of_week INT,
  favorite_hour INT,
  delivery_orders INT DEFAULT 0,
  pickup_orders INT DEFAULT 0,
  lifetime_value DECIMAL(12,2) DEFAULT 0,
  customer_segment TEXT DEFAULT 'new',
  predicted_churn_risk TEXT DEFAULT 'low',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, customer_id)
);

-- Customer segments
CREATE TABLE IF NOT EXISTS customer_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  criteria JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_segment_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID REFERENCES customer_segments(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  UNIQUE(segment_id, customer_id)
);

-- Marketing insights
CREATE TABLE IF NOT EXISTS marketing_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  type TEXT NOT NULL,
  priority INT DEFAULT 5,
  title TEXT NOT NULL,
  description TEXT,
  recommended_action TEXT,
  estimated_revenue DECIMAL(12,2),
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  segment_id UUID REFERENCES customer_segments(id),
  segment_name TEXT,
  target_count INT DEFAULT 0,
  estimated_revenue DECIMAL(12,2) DEFAULT 0,
  message_template TEXT,
  cta_text TEXT,
  cta_url TEXT,
  is_auto BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Campaign deliveries (batched sending)
CREATE TABLE IF NOT EXISTS campaign_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  phone TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  error TEXT,
  batch_id INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Customer patterns
CREATE TABLE IF NOT EXISTS customer_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  pattern_type TEXT NOT NULL,
  pattern_value TEXT,
  score DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Growth scores (daily snapshot)
CREATE TABLE IF NOT EXISTS growth_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  date DATE NOT NULL,
  score INT DEFAULT 0,
  retention_score INT DEFAULT 0,
  recurrence_score INT DEFAULT 0,
  vip_score INT DEFAULT 0,
  frequency_score INT DEFAULT 0,
  growth_score INT DEFAULT 0,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, date)
);

-- RLS
ALTER TABLE customer_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_segment_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_scores ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "cm_tenant" ON customer_metrics FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
  CREATE POLICY "cs_tenant" ON customer_segments FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
  CREATE POLICY "csm_tenant" ON customer_segment_members FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
  CREATE POLICY "mi_tenant" ON marketing_insights FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
  CREATE POLICY "camp_tenant" ON campaigns FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
  CREATE POLICY "cd_tenant" ON campaign_deliveries FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
  CREATE POLICY "cp_tenant" ON customer_patterns FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
  CREATE POLICY "gs_tenant" ON growth_scores FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN null;
END $$;
