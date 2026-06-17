-- Prode winner WhatsApp notifications.
-- Run this in Supabase SQL editor after add_prode_mordisco.sql.

CREATE TABLE IF NOT EXISTS public.prode_reward_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  match_id UUID NOT NULL REFERENCES public.prode_matches(id) ON DELETE CASCADE,
  prediction_id UUID NOT NULL REFERENCES public.prode_predictions(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  reward_type TEXT NOT NULL CHECK (reward_type IN ('exact', 'scorer', 'double')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  message TEXT,
  response TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(prediction_id, reward_type)
);

CREATE INDEX IF NOT EXISTS idx_prode_reward_notifications_tenant
  ON public.prode_reward_notifications (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prode_reward_notifications_match
  ON public.prode_reward_notifications (match_id);

ALTER TABLE public.prode_reward_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prode_reward_notifications_admin_select ON public.prode_reward_notifications;
DROP POLICY IF EXISTS prode_reward_notifications_admin_insert ON public.prode_reward_notifications;
DROP POLICY IF EXISTS prode_reward_notifications_admin_update ON public.prode_reward_notifications;

CREATE POLICY prode_reward_notifications_admin_select
ON public.prode_reward_notifications
FOR SELECT
USING (
  tenant_id IN (
    SELECT users.tenant_id
    FROM public.users
    WHERE users.id = auth.uid()
      AND users.role IN ('owner', 'admin')
  )
);

CREATE POLICY prode_reward_notifications_admin_insert
ON public.prode_reward_notifications
FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT users.tenant_id
    FROM public.users
    WHERE users.id = auth.uid()
      AND users.role IN ('owner', 'admin')
  )
);

CREATE POLICY prode_reward_notifications_admin_update
ON public.prode_reward_notifications
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
