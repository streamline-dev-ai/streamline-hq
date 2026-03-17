alter table public.leads
  add column if not exists follow_up_due date;

alter table public.leads
  add column if not exists follow_up_type text;

create index if not exists leads_follow_up_due_idx
  on public.leads(follow_up_due);

