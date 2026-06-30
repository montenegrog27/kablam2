alter table public.reservation_events
  add column if not exists hero_layout text not null default 'center_bottom',
  add column if not exists hero_show_logo boolean not null default true,
  add column if not exists hero_show_title boolean not null default true,
  add column if not exists hero_show_description boolean not null default true,
  add column if not exists hero_show_cta boolean not null default true;

alter table public.reservation_events
drop constraint if exists reservation_events_hero_layout_check;

alter table public.reservation_events
add constraint reservation_events_hero_layout_check
check (
  hero_layout in (
    'center_bottom',
    'center_card',
    'left_panel',
    'top_logo_bottom_cta',
    'poster_clean'
  )
);
