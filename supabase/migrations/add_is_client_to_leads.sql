alter table public.leads
  add column if not exists is_client boolean;

create index if not exists leads_is_client_idx
  on public.leads(is_client);

