-- Coordenadas para calcular envio desde direcciones guardadas.

alter table public.customer_addresses
  add column if not exists latitude numeric,
  add column if not exists longitude numeric;
