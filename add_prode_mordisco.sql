-- Prode Mordisco - Mundial predictions
CREATE TABLE IF NOT EXISTS prode_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  match_date TIMESTAMPTZ NOT NULL,
  home_score INT,
  away_score INT,
  first_scorer TEXT,
  status TEXT DEFAULT 'pending', -- pending | live | finished
  round TEXT DEFAULT 'group', -- group | round16 | quarter | semi | final
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prode_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  match_id UUID REFERENCES prode_matches(id) ON DELETE CASCADE,
  home_score INT NOT NULL,
  away_score INT NOT NULL,
  first_scorer TEXT,
  total_goals INT,
  points_earned INT DEFAULT 0,
  bonus_points INT DEFAULT 0,
  status TEXT DEFAULT 'pending', -- pending | finished
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(customer_id, match_id)
);

CREATE TABLE IF NOT EXISTS prode_standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  total_points INT DEFAULT 0,
  correct_results INT DEFAULT 0,
  correct_scorers INT DEFAULT 0,
  correct_goals INT DEFAULT 0,
  perfect_predictions INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, customer_id)
);

ALTER TABLE prode_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE prode_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prode_standings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "pm_select" ON prode_matches FOR SELECT USING (true);
  CREATE POLICY "pm_insert" ON prode_matches FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));
  CREATE POLICY "pm_update" ON prode_matches FOR UPDATE USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));
  CREATE POLICY "pp_select" ON prode_predictions FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));
  CREATE POLICY "pp_insert" ON prode_predictions FOR INSERT WITH CHECK (customer_id IN (SELECT id FROM customers WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())));
  CREATE POLICY "ps_select" ON prode_standings FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
