alter table public.messages
add column if not exists reply_to_message_id uuid references public.messages(id) on delete set null;

alter table public.messages
add column if not exists reply_to_whatsapp_message_id text;

create index if not exists messages_whatsapp_message_id_idx
on public.messages(whatsapp_message_id);

create index if not exists messages_reply_to_message_id_idx
on public.messages(reply_to_message_id);

create index if not exists messages_reply_to_whatsapp_message_id_idx
on public.messages(reply_to_whatsapp_message_id);
