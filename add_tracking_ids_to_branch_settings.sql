alter table public.branch_settings
  add column if not exists meta_pixel_id text,
  add column if not exists ga4_measurement_id text;
