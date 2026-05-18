-- Lead Engine schema — applied 2026-05-18 to Supabase project
-- lpjwfjkgqpgydzozuusj (schema: streamline_hq). Idempotent.
-- Kept separate from public.* (admin/Baseline) tables.

create schema if not exists streamline_hq;

create table if not exists streamline_hq.prospects (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'manual' check (source in ('google_maps','instagram','snupit','yellow_pages','manual')),
  business_name text not null,
  slug text unique not null,
  niche text not null,
  suburb text,
  phone_e164 text,
  whatsapp_e164 text,
  email text,
  website text,
  instagram_handle text,
  instagram_followers int,
  google_rating numeric(2,1),
  google_reviews_count int,
  raw_data jsonb,
  status text default 'raw',
  popia_optout boolean default false,
  popia_optout_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_prospects_status on streamline_hq.prospects(status);
create index if not exists idx_prospects_suburb on streamline_hq.prospects(suburb);
create unique index if not exists idx_prospects_phone on streamline_hq.prospects(phone_e164) where phone_e164 is not null;

create table if not exists streamline_hq.gap_analyses (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references streamline_hq.prospects(id) on delete cascade,
  gaps jsonb not null,
  hook_angle text,
  recommended_tier text,
  primary_color_hex text,
  model_used text default 'claude-haiku-4-5',
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10,6),
  created_at timestamptz default now()
);
create index if not exists idx_gap_analyses_prospect on streamline_hq.gap_analyses(prospect_id);

create table if not exists streamline_hq.demos (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references streamline_hq.prospects(id) on delete cascade,
  slug text unique not null,
  url text not null,
  config jsonb not null,
  primary_color text,
  logo_url text,
  views_count int default 0,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists streamline_hq.messages (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references streamline_hq.prospects(id) on delete cascade,
  demo_id uuid references streamline_hq.demos(id),
  sequence_step int not null,
  draft_text text not null,
  final_text text,
  status text default 'pending_approval',
  scheduled_for timestamptz,
  sent_at timestamptz,
  approval_action text,
  approved_at timestamptz,
  evolution_message_id text,
  error text,
  created_at timestamptz default now()
);
create index if not exists idx_messages_scheduled on streamline_hq.messages(scheduled_for) where status='approved';
create index if not exists idx_messages_status on streamline_hq.messages(status);

create table if not exists streamline_hq.replies (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references streamline_hq.prospects(id) on delete cascade,
  message_id uuid references streamline_hq.messages(id),
  body text not null,
  sentiment text,
  ai_tagged_at timestamptz,
  ai_suggested_response text,
  responded boolean default false,
  responded_at timestamptz,
  evolution_payload jsonb,
  received_at timestamptz default now()
);
create index if not exists idx_replies_sentiment on streamline_hq.replies(sentiment);

create table if not exists streamline_hq.approval_queue (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references streamline_hq.messages(id) on delete cascade,
  telegram_message_id bigint,
  expires_at timestamptz default now() + interval '48 hours',
  resolved boolean default false,
  resolved_at timestamptz
);

create table if not exists streamline_hq.api_costs (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references streamline_hq.prospects(id) on delete cascade,
  service text not null,
  operation text not null,
  cost_usd numeric(10,6) not null,
  metadata jsonb,
  created_at timestamptz default now()
);

create or replace function streamline_hq.schedule_followups()
returns trigger as $$
begin
  if NEW.status='sent' and NEW.sequence_step=0 then
    insert into streamline_hq.messages(prospect_id, demo_id, sequence_step, draft_text, status, scheduled_for)
    values
      (NEW.prospect_id, NEW.demo_id, 1, '', 'pending_draft', NEW.sent_at + interval '4 days'),
      (NEW.prospect_id, NEW.demo_id, 2, '', 'pending_draft', NEW.sent_at + interval '10 days'),
      (NEW.prospect_id, NEW.demo_id, 3, '', 'pending_draft', NEW.sent_at + interval '18 days');
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists trg_schedule_followups on streamline_hq.messages;
create trigger trg_schedule_followups
after update of status on streamline_hq.messages
for each row execute function streamline_hq.schedule_followups();

alter table streamline_hq.prospects      disable row level security;
alter table streamline_hq.gap_analyses   disable row level security;
alter table streamline_hq.demos          disable row level security;
alter table streamline_hq.messages       disable row level security;
alter table streamline_hq.replies        disable row level security;
alter table streamline_hq.approval_queue disable row level security;
alter table streamline_hq.api_costs      disable row level security;
