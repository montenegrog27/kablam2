-- Prode Mordisco - Mundial predictions
-- Run this in Supabase SQL editor for each environment that uses /prode.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.prode_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  match_date TIMESTAMPTZ NOT NULL,
  home_score INT,
  away_score INT,
  first_scorer TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'live', 'finished')),
  round TEXT NOT NULL DEFAULT 'group',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.prode_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  match_id UUID NOT NULL REFERENCES public.prode_matches(id) ON DELETE CASCADE,
  home_score INT NOT NULL,
  away_score INT NOT NULL,
  first_scorer TEXT,
  total_goals INT,
  points_earned INT NOT NULL DEFAULT 0,
  bonus_points INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'finished')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(customer_id, match_id)
);

CREATE TABLE IF NOT EXISTS public.prode_standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  total_points INT NOT NULL DEFAULT 0,
  correct_results INT NOT NULL DEFAULT 0,
  correct_scorers INT NOT NULL DEFAULT 0,
  correct_goals INT NOT NULL DEFAULT 0,
  perfect_predictions INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_prode_matches_tenant_date ON public.prode_matches (tenant_id, match_date);
CREATE INDEX IF NOT EXISTS idx_prode_matches_active_pending ON public.prode_matches (tenant_id, is_active, status, match_date);
CREATE INDEX IF NOT EXISTS idx_prode_predictions_match ON public.prode_predictions (match_id);
CREATE INDEX IF NOT EXISTS idx_prode_predictions_customer ON public.prode_predictions (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_prode_standings_tenant_points ON public.prode_standings (tenant_id, total_points DESC);

ALTER TABLE public.prode_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prode_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prode_standings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prode_matches_public_select ON public.prode_matches;
DROP POLICY IF EXISTS prode_matches_admin_insert ON public.prode_matches;
DROP POLICY IF EXISTS prode_matches_admin_update ON public.prode_matches;
DROP POLICY IF EXISTS prode_matches_admin_delete ON public.prode_matches;
DROP POLICY IF EXISTS prode_predictions_customer_select ON public.prode_predictions;
DROP POLICY IF EXISTS prode_predictions_customer_insert ON public.prode_predictions;
DROP POLICY IF EXISTS prode_predictions_customer_update ON public.prode_predictions;
DROP POLICY IF EXISTS prode_predictions_admin_update ON public.prode_predictions;
DROP POLICY IF EXISTS prode_standings_public_select ON public.prode_standings;
DROP POLICY IF EXISTS prode_standings_admin_insert ON public.prode_standings;
DROP POLICY IF EXISTS prode_standings_admin_update ON public.prode_standings;

CREATE POLICY prode_matches_public_select
ON public.prode_matches
FOR SELECT
USING (true);

CREATE POLICY prode_matches_admin_insert
ON public.prode_matches
FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT users.tenant_id
    FROM public.users
    WHERE users.id = auth.uid()
      AND users.role IN ('owner', 'admin')
  )
);

CREATE POLICY prode_matches_admin_update
ON public.prode_matches
FOR UPDATE
USING (
  tenant_id IN (
    SELECT users.tenant_id
    FROM public.users
    WHERE users.id = auth.uid()
      AND users.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT users.tenant_id
    FROM public.users
    WHERE users.id = auth.uid()
      AND users.role IN ('owner', 'admin')
  )
);

CREATE POLICY prode_matches_admin_delete
ON public.prode_matches
FOR DELETE
USING (
  tenant_id IN (
    SELECT users.tenant_id
    FROM public.users
    WHERE users.id = auth.uid()
      AND users.role IN ('owner', 'admin')
  )
);

CREATE POLICY prode_predictions_customer_select
ON public.prode_predictions
FOR SELECT
USING (
  customer_id IN (
    SELECT customers.id
    FROM public.customers
    WHERE customers.tenant_id = prode_predictions.tenant_id
  )
  OR tenant_id IN (
    SELECT users.tenant_id
    FROM public.users
    WHERE users.id = auth.uid()
      AND users.role IN ('owner', 'admin')
  )
);

CREATE POLICY prode_predictions_customer_insert
ON public.prode_predictions
FOR INSERT
WITH CHECK (
  customer_id IN (
    SELECT customers.id
    FROM public.customers
    WHERE customers.tenant_id = prode_predictions.tenant_id
  )
);

CREATE POLICY prode_predictions_customer_update
ON public.prode_predictions
FOR UPDATE
USING (
  customer_id IN (
    SELECT customers.id
    FROM public.customers
    WHERE customers.tenant_id = prode_predictions.tenant_id
  )
)
WITH CHECK (
  customer_id IN (
    SELECT customers.id
    FROM public.customers
    WHERE customers.tenant_id = prode_predictions.tenant_id
  )
);

CREATE POLICY prode_predictions_admin_update
ON public.prode_predictions
FOR UPDATE
USING (
  tenant_id IN (
    SELECT users.tenant_id
    FROM public.users
    WHERE users.id = auth.uid()
      AND users.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT users.tenant_id
    FROM public.users
    WHERE users.id = auth.uid()
      AND users.role IN ('owner', 'admin')
  )
);

CREATE POLICY prode_standings_public_select
ON public.prode_standings
FOR SELECT
USING (true);

CREATE POLICY prode_standings_admin_insert
ON public.prode_standings
FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT users.tenant_id
    FROM public.users
    WHERE users.id = auth.uid()
      AND users.role IN ('owner', 'admin')
  )
);

CREATE POLICY prode_standings_admin_update
ON public.prode_standings
FOR UPDATE
USING (
  tenant_id IN (
    SELECT users.tenant_id
    FROM public.users
    WHERE users.id = auth.uid()
      AND users.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT users.tenant_id
    FROM public.users
    WHERE users.id = auth.uid()
      AND users.role IN ('owner', 'admin')
  )
);

NOTIFY pgrst, 'reload schema';
