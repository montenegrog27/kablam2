-- Extra customer catalog form settings per branch.

ALTER TABLE public.branch_settings
  ADD COLUMN IF NOT EXISTS catalog_order_show_date BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS catalog_order_show_note BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS catalog_order_form_title TEXT,
  ADD COLUMN IF NOT EXISTS catalog_order_submit_label TEXT;
