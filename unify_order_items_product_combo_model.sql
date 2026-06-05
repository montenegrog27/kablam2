alter table public.order_items
add column if not exists item_type text not null default 'product';

alter table public.order_items
add column if not exists combo_id uuid references public.combos(id);

alter table public.order_items
alter column variant_id drop not null;

alter table public.order_items
alter column product_id drop not null;

alter table public.order_items
drop constraint if exists order_items_item_type_check;

alter table public.order_items
add constraint order_items_item_type_check
check (item_type in ('product', 'combo', 'promotion'));

update public.order_items oi
set
  item_type = 'combo',
  combo_id = c.id
from public.combos c
where oi.combo_id is null
  and oi.product_id = c.id;

update public.order_items oi
set
  item_type = 'combo',
  combo_id = replace(oi.variant_id::text, '-variant', '')::uuid
where oi.combo_id is null
  and oi.variant_id::text ~* '^[0-9a-f-]{36}-variant$'
  and exists (
    select 1
    from public.combos c
    where c.id = replace(oi.variant_id::text, '-variant', '')::uuid
  );

update public.order_items
set item_type = 'combo'
where combo_id is not null;

update public.order_items
set
  product_id = null,
  variant_id = null
where item_type = 'combo'
  and combo_id is not null;

update public.order_items
set item_type = 'product'
where combo_id is null
  and item_type <> 'product';

create index if not exists order_items_item_type_idx
on public.order_items(item_type);

create index if not exists order_items_combo_id_idx
on public.order_items(combo_id);
