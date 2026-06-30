alter table public.whatsapp_quick_replies
  add column if not exists show_in_whatsapp_tab boolean not null default true,
  add column if not exists show_in_order_sidebar boolean not null default true;
