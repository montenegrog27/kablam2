-- Coupon batch generation, printable campaigns and period limits.
-- Run this once in Supabase SQL editor.

alter table public.coupons
  add column if not exists campaign text,
  add column if not exists batch_id uuid,
  add column if not exists prefix text,
  add column if not exists monthly_limit integer,
  add column if not exists usage_scope text not null default 'global',
  add column if not exists print_label text,
  add column if not exists print_note text;

alter table public.coupon_uses
  add column if not exists customer_phone text,
  add column if not exists used_at timestamptz not null default now();

alter table public.orders
  add column if not exists coupon_id uuid references public.coupons(id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'coupons_usage_scope_check'
  ) then
    alter table public.coupons
      add constraint coupons_usage_scope_check
      check (usage_scope in ('global', 'phone'));
  end if;
end $$;

create index if not exists coupons_tenant_batch_idx
  on public.coupons (tenant_id, batch_id);

create index if not exists coupon_uses_coupon_phone_used_at_idx
  on public.coupon_uses (coupon_id, customer_phone, used_at);

create index if not exists orders_coupon_id_idx
  on public.orders (coupon_id);
