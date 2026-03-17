create table if not exists public.lead_stage_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  changed_at timestamptz not null default now()
);

create index if not exists lead_stage_events_lead_id_changed_at_idx
  on public.lead_stage_events(lead_id, changed_at desc);

insert into public.lead_stage_events (lead_id, from_stage, to_stage, changed_at)
select l.id, null, coalesce(l.stage, 'new')::text, coalesce(l.created_at, now())
from public.leads l
where not exists (
  select 1 from public.lead_stage_events e where e.lead_id = l.id
);

