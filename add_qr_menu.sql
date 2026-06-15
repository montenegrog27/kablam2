-- QR menu controls for customer table-scan menu.
-- Run this once in Supabase SQL editor.

alter table categories
  add column if not exists qr_visible boolean not null default true,
  add column if not exists qr_position integer;

alter table products
  add column if not exists qr_visible boolean not null default true,
  add column if not exists qr_position integer;

update categories
set qr_position = coalesce(qr_position, position, 0)
where qr_position is null;

update products
set qr_position = ranked.position
from (
  select
    id,
    row_number() over (
      partition by branch_id, category_id
      order by name asc, id asc
    ) - 1 as position
  from products
) as ranked
where products.id = ranked.id
  and products.qr_position is null;

-- Optional repair if this script was tested before product ordering existed.
with duplicated as (
  select branch_id, category_id
  from products
  group by branch_id, category_id
  having count(*) > 1 and count(distinct qr_position) <= 1
),
ranked as (
  select
    p.id,
    row_number() over (
      partition by p.branch_id, p.category_id
      order by p.name asc, p.id asc
    ) - 1 as position
  from products p
  join duplicated d
    on d.branch_id = p.branch_id
   and coalesce(d.category_id::text, '') = coalesce(p.category_id::text, '')
)
update products
set qr_position = ranked.position
from ranked
where products.id = ranked.id;

create index if not exists idx_categories_qr_menu
  on categories (tenant_id, qr_visible, qr_position);

create index if not exists idx_products_qr_menu
  on products (branch_id, category_id, qr_visible, qr_position);
