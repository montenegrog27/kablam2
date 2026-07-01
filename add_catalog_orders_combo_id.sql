-- Allow catalog orders to reference combos as well as products.

ALTER TABLE public.catalog_orders
  ADD COLUMN IF NOT EXISTS combo_id UUID REFERENCES public.combos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS catalog_orders_combo_id_idx
  ON public.catalog_orders(combo_id);
