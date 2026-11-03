-- Run this once in the Supabase SQL editor.
-- Desktop POS stores sales locally in SQLite, then upserts into this table when online.

create table if not exists public.pos_sync_records (
  id text primary key,
  entity_type text not null,
  entity_id text not null,
  operation text not null,
  payload jsonb not null default '{}'::jsonb,
  device_id text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_pos_sync_updated on public.pos_sync_records (updated_at);
create index if not exists idx_pos_sync_entity on public.pos_sync_records (entity_type, entity_id);

alter table public.pos_sync_records enable row level security;

drop policy if exists pos_sync_records_all on public.pos_sync_records;
create policy pos_sync_records_all
  on public.pos_sync_records
  for all
  using (true)
  with check (true);

notify pgrst, 'reload schema';
