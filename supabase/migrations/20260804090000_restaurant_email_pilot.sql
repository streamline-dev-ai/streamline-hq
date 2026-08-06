-- Controlled restaurant email pilot. Additive: keeps the existing Lead Engine CRM
-- records as the canonical lead/thread history and never enables a sender itself.
--
-- Every outbound email is human-approved. Follow-ups re-enter the same approval
-- path rather than bypassing it, so the daily cap and suppression checks cover
-- them too.
begin;

create table if not exists streamline_hq.outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  offer text not null default 'restaurant_site',
  channel text not null check (channel in ('email', 'instagram', 'facebook')),
  sender_identity text,
  sender_display_name text,
  reply_to text,
  signature_footer text not null default
    'If you''d rather not hear from me, just reply "no thanks" and I won''t email you again.',
  daily_limit integer not null default 5 check (daily_limit between 1 and 50),
  timezone text not null default 'Africa/Johannesburg',
  business_start time not null default time '08:30',
  business_end time not null default time '16:30',
  active boolean not null default false,
  paused_at timestamptz,
  pause_reason text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists streamline_hq.campaign_memberships (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references streamline_hq.outreach_campaigns(id) on delete cascade,
  prospect_id uuid not null references streamline_hq.prospects(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  channel text not null check (channel in ('email', 'instagram', 'facebook')),
  status text not null default 'draft' check (status in (
    'draft', 'approved', 'scheduled', 'sending', 'sent', 'failed', 'replied',
    'handover', 'closed_no_response', 'suppressed', 'manually_reactivated', 'skipped'
  )),
  subject_draft text,
  draft_text text,
  approved_subject text,
  approved_text text,
  approved_version integer,
  approved_at timestamptz,
  approved_by uuid,
  scheduled_for timestamptz,
  sending_claimed_at timestamptz,
  sent_at timestamptz,
  -- Never cleared. sent_at is reset when a follow-up re-enters the draft state,
  -- so the 30-day sweeper and the audit trail read last_sent_at instead.
  last_sent_at timestamptz,
  replied_at timestamptz,
  follow_up_step integer not null default 0,
  follow_up_due_at timestamptz,
  closed_at timestamptz,
  skip_reason text,
  reactivation_reason text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, prospect_id)
);

create table if not exists streamline_hq.outreach_approval_versions (
  id uuid primary key default gen_random_uuid(),
  campaign_membership_id uuid not null references streamline_hq.campaign_memberships(id) on delete cascade,
  version integer not null,
  subject text,
  body text not null,
  follow_up_step integer not null default 0,
  status text not null check (status in ('draft', 'approved', 'superseded', 'cancelled')),
  created_by uuid default auth.uid(),
  approved_by uuid,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  unique (campaign_membership_id, version)
);

create table if not exists streamline_hq.import_batches (
  id uuid primary key default gen_random_uuid(),
  source_filename text,
  channel text not null check (channel in ('email', 'instagram', 'facebook')),
  offer text not null default 'restaurant_site',
  campaign_id uuid references streamline_hq.outreach_campaigns(id) on delete set null,
  total_rows integer not null default 0,
  accepted_rows integer not null default 0,
  rejected_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  suppressed_rows integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists streamline_hq.import_row_results (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references streamline_hq.import_batches(id) on delete cascade,
  row_number integer not null,
  raw_row jsonb not null,
  normalized_row jsonb,
  status text not null check (status in ('accepted', 'invalid', 'duplicate', 'suppressed')),
  issues jsonb not null default '[]'::jsonb,
  prospect_id uuid references streamline_hq.prospects(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (batch_id, row_number)
);

create table if not exists streamline_hq.outreach_handovers (
  id uuid primary key default gen_random_uuid(),
  campaign_membership_id uuid references streamline_hq.campaign_memberships(id) on delete set null,
  lead_id uuid references public.leads(id) on delete cascade,
  reason text not null check (reason in ('interested', 'complaint', 'opt_out', 'uncertain', 'question')),
  summary text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);

-- South African public holidays. Seeded through 2027; top up before 2028.
create table if not exists streamline_hq.sa_public_holidays (
  holiday_date date primary key,
  name text not null
);

insert into streamline_hq.sa_public_holidays (holiday_date, name) values
  ('2026-01-01', 'New Year''s Day'),
  ('2026-03-21', 'Human Rights Day'),
  ('2026-04-03', 'Good Friday'),
  ('2026-04-06', 'Family Day'),
  ('2026-04-27', 'Freedom Day'),
  ('2026-05-01', 'Workers'' Day'),
  ('2026-06-16', 'Youth Day'),
  ('2026-08-09', 'National Women''s Day'),
  ('2026-08-10', 'National Women''s Day observed'),
  ('2026-09-24', 'Heritage Day'),
  ('2026-12-16', 'Day of Reconciliation'),
  ('2026-12-25', 'Christmas Day'),
  ('2026-12-26', 'Day of Goodwill'),
  ('2027-01-01', 'New Year''s Day'),
  ('2027-03-21', 'Human Rights Day'),
  ('2027-03-22', 'Human Rights Day observed'),
  ('2027-03-26', 'Good Friday'),
  ('2027-03-29', 'Family Day'),
  ('2027-04-27', 'Freedom Day'),
  ('2027-05-01', 'Workers'' Day'),
  ('2027-06-16', 'Youth Day'),
  ('2027-08-09', 'National Women''s Day'),
  ('2027-09-24', 'Heritage Day'),
  ('2027-12-16', 'Day of Reconciliation'),
  ('2027-12-25', 'Christmas Day'),
  ('2027-12-26', 'Day of Goodwill'),
  ('2027-12-27', 'Day of Goodwill observed')
on conflict (holiday_date) do nothing;

alter table public.outreach_messages
  add column if not exists subject text,
  add column if not exists provider_message_id text,
  add column if not exists provider_thread_id text,
  add column if not exists in_reply_to text,
  add column if not exists delivery_status text,
  add column if not exists campaign_membership_id uuid;

alter table public.follow_ups
  add column if not exists campaign_membership_id uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'outreach_messages_campaign_membership_id_fkey') then
    alter table public.outreach_messages add constraint outreach_messages_campaign_membership_id_fkey
      foreign key (campaign_membership_id) references streamline_hq.campaign_memberships(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'follow_ups_campaign_membership_id_fkey') then
    alter table public.follow_ups add constraint follow_ups_campaign_membership_id_fkey
      foreign key (campaign_membership_id) references streamline_hq.campaign_memberships(id) on delete set null;
  end if;
end $$;

create unique index if not exists outreach_messages_provider_message_uidx
  on public.outreach_messages (provider_message_id) where provider_message_id is not null;
create index if not exists outreach_messages_thread_idx
  on public.outreach_messages (provider_thread_id) where provider_thread_id is not null;
create index if not exists outreach_messages_membership_idx
  on public.outreach_messages (campaign_membership_id, sent_at desc) where campaign_membership_id is not null;
create index if not exists campaign_memberships_due_idx
  on streamline_hq.campaign_memberships (campaign_id, scheduled_for, id)
  where status = 'scheduled';
create index if not exists campaign_memberships_cap_idx
  on streamline_hq.campaign_memberships (campaign_id, status);
create index if not exists campaign_memberships_prospect_idx
  on streamline_hq.campaign_memberships (prospect_id, created_at desc);
create index if not exists import_row_results_batch_idx
  on streamline_hq.import_row_results (batch_id, status, row_number);
create index if not exists outreach_handovers_open_idx
  on streamline_hq.outreach_handovers (created_at desc) where status = 'open';

-- The opt-out path in ingest_campaign_reply relies on `on conflict do nothing`,
-- which was a silent no-op without a matching unique constraint.
create unique index if not exists suppression_list_prospect_uidx
  on streamline_hq.suppression_list (prospect_id) where prospect_id is not null;

alter table streamline_hq.outreach_campaigns enable row level security;
alter table streamline_hq.campaign_memberships enable row level security;
alter table streamline_hq.outreach_approval_versions enable row level security;
alter table streamline_hq.import_batches enable row level security;
alter table streamline_hq.import_row_results enable row level security;
alter table streamline_hq.outreach_handovers enable row level security;
alter table streamline_hq.sa_public_holidays enable row level security;

revoke all on streamline_hq.outreach_campaigns, streamline_hq.campaign_memberships,
  streamline_hq.outreach_approval_versions, streamline_hq.import_batches,
  streamline_hq.import_row_results, streamline_hq.outreach_handovers,
  streamline_hq.sa_public_holidays from anon, public;
grant select, insert, update, delete on streamline_hq.outreach_campaigns, streamline_hq.campaign_memberships,
  streamline_hq.outreach_approval_versions, streamline_hq.import_batches,
  streamline_hq.import_row_results, streamline_hq.outreach_handovers to authenticated;
grant select on streamline_hq.sa_public_holidays to authenticated;

-- Membership state, approval history, and handover resolution are mutation-only
-- through guarded RPCs.
revoke insert, update, delete, truncate on streamline_hq.campaign_memberships,
  streamline_hq.outreach_approval_versions, streamline_hq.outreach_handovers from authenticated;
grant select on streamline_hq.campaign_memberships, streamline_hq.outreach_approval_versions,
  streamline_hq.outreach_handovers to authenticated;
-- Holidays are reference data; default privileges would otherwise leave them writable.
revoke insert, update, delete, truncate on streamline_hq.sa_public_holidays from authenticated;

do $$ declare t text; begin
  foreach t in array array['outreach_campaigns','campaign_memberships','outreach_approval_versions','import_batches','import_row_results','outreach_handovers','sa_public_holidays'] loop
    execute format('drop policy if exists hq_authenticated_all on streamline_hq.%I', t);
    execute format('create policy hq_authenticated_all on streamline_hq.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- =====================================================================
-- Business-day helper
-- =====================================================================

create or replace function public.next_sa_business_day(
  p_from timestamptz, p_days integer default 1, p_timezone text default 'Africa/Johannesburg'
) returns timestamptz language plpgsql stable
set search_path = public, streamline_hq, pg_temp as $$
declare
  v_local timestamp := p_from at time zone p_timezone;
  v_date date := v_local::date;
  v_time time := v_local::time;
  v_remaining integer := greatest(coalesce(p_days, 1), 0);
begin
  -- p_days = 0 still rolls forward off a weekend or public holiday.
  while v_remaining > 0 loop
    v_date := v_date + 1;
    if extract(isodow from v_date) < 6
       and not exists (select 1 from streamline_hq.sa_public_holidays h where h.holiday_date = v_date) then
      v_remaining := v_remaining - 1;
    end if;
  end loop;
  while extract(isodow from v_date) >= 6
     or exists (select 1 from streamline_hq.sa_public_holidays h where h.holiday_date = v_date) loop
    v_date := v_date + 1;
  end loop;
  return (v_date + v_time) at time zone p_timezone;
end $$;

-- =====================================================================
-- Guarded RPCs
-- =====================================================================

create or replace function public.create_campaign_membership(
  p_campaign_id uuid, p_prospect_id uuid, p_draft_text text default null, p_subject_draft text default null
) returns uuid language plpgsql security definer
set search_path = public, streamline_hq, pg_temp as $$
declare v_channel text; v_membership_id uuid;
begin
  select channel into v_channel from streamline_hq.outreach_campaigns where id = p_campaign_id;
  if not found then raise exception 'Campaign not found'; end if;
  if exists (select 1 from streamline_hq.prospects p where p.id=p_prospect_id and (p.popia_optout or (v_channel='email' and p.email is null))) then
    raise exception 'Prospect is suppressed or lacks a usable channel contact';
  end if;
  if exists (select 1 from streamline_hq.suppression_list s where s.prospect_id=p_prospect_id) then raise exception 'Suppressed prospect cannot be queued'; end if;
  insert into streamline_hq.campaign_memberships (campaign_id, prospect_id, channel, draft_text, subject_draft)
    values (p_campaign_id, p_prospect_id, v_channel, nullif(trim(p_draft_text),''), nullif(trim(p_subject_draft),''))
    on conflict (campaign_id, prospect_id) do update set
      draft_text = coalesce(excluded.draft_text, streamline_hq.campaign_memberships.draft_text),
      subject_draft = coalesce(excluded.subject_draft, streamline_hq.campaign_memberships.subject_draft),
      updated_at = now()
    returning id into v_membership_id;
  return v_membership_id;
end $$;

create or replace function public.approve_campaign_message(
  p_membership_id uuid, p_subject text, p_body text
) returns jsonb language plpgsql security definer
set search_path = public, streamline_hq, pg_temp as $$
declare v_member streamline_hq.campaign_memberships%rowtype; v_version integer;
begin
  if nullif(trim(p_body), '') is null then raise exception 'Approved message is required'; end if;
  select * into v_member from streamline_hq.campaign_memberships where id = p_membership_id for update;
  if not found then raise exception 'Campaign membership not found'; end if;
  if v_member.channel = 'email' and nullif(trim(p_subject), '') is null then
    raise exception 'Approved subject is required for email';
  end if;
  if v_member.status in ('sent','sending','replied','handover','closed_no_response','suppressed') then
    raise exception 'Message cannot be approved from status %', v_member.status;
  end if;
  if exists (select 1 from streamline_hq.prospects p where p.id = v_member.prospect_id and p.popia_optout) or
     exists (select 1 from streamline_hq.suppression_list s where s.prospect_id = v_member.prospect_id) then
    raise exception 'Suppressed prospect cannot be approved';
  end if;
  v_version := coalesce((select max(version) + 1 from streamline_hq.outreach_approval_versions where campaign_membership_id = p_membership_id), 1);
  update streamline_hq.outreach_approval_versions set status = 'superseded'
    where campaign_membership_id = p_membership_id and status = 'approved';
  insert into streamline_hq.outreach_approval_versions (campaign_membership_id, version, subject, body, follow_up_step, status, approved_by, approved_at)
    values (p_membership_id, v_version, nullif(trim(p_subject),''), trim(p_body), v_member.follow_up_step, 'approved', auth.uid(), now());
  update streamline_hq.campaign_memberships set approved_subject = nullif(trim(p_subject),''), approved_text = trim(p_body),
    approved_version = v_version, approved_at = now(), approved_by = auth.uid(), status = 'approved', updated_at = now()
    where id = p_membership_id;
  return jsonb_build_object('membership_id', p_membership_id, 'version', v_version, 'status', 'approved');
end $$;

create or replace function public.schedule_campaign_message(
  p_membership_id uuid, p_scheduled_for timestamptz
) returns void language plpgsql security definer
set search_path = public, streamline_hq, pg_temp as $$
declare v_member streamline_hq.campaign_memberships%rowtype; v_campaign streamline_hq.outreach_campaigns%rowtype;
begin
  select m.* into v_member from streamline_hq.campaign_memberships m where m.id = p_membership_id for update;
  if not found or v_member.status <> 'approved' or v_member.approved_version is null then raise exception 'Only an approved message may be scheduled'; end if;
  select * into v_campaign from streamline_hq.outreach_campaigns where id = v_member.campaign_id for share;
  if not found or not v_campaign.active or v_campaign.paused_at is not null then raise exception 'Campaign is not active'; end if;
  if exists (select 1 from streamline_hq.prospects p where p.id = v_member.prospect_id and p.popia_optout) or exists (select 1 from streamline_hq.suppression_list s where s.prospect_id = v_member.prospect_id) then raise exception 'Suppressed prospect cannot be scheduled'; end if;
  update streamline_hq.campaign_memberships set status = 'scheduled', scheduled_for = p_scheduled_for, updated_at = now() where id = p_membership_id;
end $$;

create or replace function public.claim_due_campaign_send(p_campaign_id uuid)
returns table(
  membership_id uuid, campaign_id uuid, lead_id uuid, prospect_id uuid, recipient_email text,
  business_name text, owner_first_name text, approved_subject text, approved_text text,
  approved_version integer, follow_up_step integer, signature_footer text,
  sender_identity text, sender_display_name text, reply_to text, provider_thread_id text
)
language plpgsql security definer set search_path = public, streamline_hq, pg_temp as $$
declare v_campaign streamline_hq.outreach_campaigns%rowtype; v_member streamline_hq.campaign_memberships%rowtype; v_sent integer;
begin
  select * into v_campaign from streamline_hq.outreach_campaigns where id = p_campaign_id for update;
  if not found or not v_campaign.active or v_campaign.paused_at is not null then return; end if;
  if (now() at time zone v_campaign.timezone)::time < v_campaign.business_start
     or (now() at time zone v_campaign.timezone)::time >= v_campaign.business_end then return; end if;

  -- A claimed-but-unrecorded send has sent_at = null; counting only sent_at would
  -- permanently free its slot and let the campaign exceed the daily cap. The date
  -- comparison also has to happen in the campaign timezone, not the session's.
  select count(*) into v_sent from streamline_hq.campaign_memberships m
    where m.campaign_id = p_campaign_id
      and m.status in ('sending','sent')
      and (coalesce(m.sent_at, m.sending_claimed_at) at time zone v_campaign.timezone)::date
          = (now() at time zone v_campaign.timezone)::date;
  if v_sent >= v_campaign.daily_limit then return; end if;

  select m.* into v_member from streamline_hq.campaign_memberships m join streamline_hq.prospects p on p.id = m.prospect_id
    where m.campaign_id = p_campaign_id and m.status = 'scheduled' and m.scheduled_for <= now()
      and p.email is not null and not p.popia_optout and not exists (select 1 from streamline_hq.suppression_list s where s.prospect_id = p.id)
    order by m.scheduled_for, m.id for update of m skip locked limit 1;
  if not found then return; end if;
  update streamline_hq.campaign_memberships set status = 'sending', sending_claimed_at = now(), updated_at = now() where id = v_member.id;

  return query
    select v_member.id, v_member.campaign_id, v_member.lead_id, v_member.prospect_id, p.email,
           p.business_name, p.owner_first_name, v_member.approved_subject, v_member.approved_text,
           v_member.approved_version, v_member.follow_up_step, v_campaign.signature_footer,
           v_campaign.sender_identity, v_campaign.sender_display_name, v_campaign.reply_to,
           (select om.provider_thread_id from public.outreach_messages om
             where om.campaign_membership_id = v_member.id and om.provider_thread_id is not null
             order by om.sent_at limit 1)
    from streamline_hq.prospects p where p.id = v_member.prospect_id;
end $$;

create or replace function public.record_campaign_provider_result(
  p_membership_id uuid, p_approved_version integer, p_provider_message_id text,
  p_provider_thread_id text, p_success boolean, p_error text default null
) returns uuid language plpgsql security definer set search_path = public, streamline_hq, pg_temp as $$
declare v_member streamline_hq.campaign_memberships%rowtype; v_lead_id uuid; v_message_id uuid;
begin
  if p_success and nullif(trim(p_provider_message_id),'') is not null then
    select id into v_message_id from public.outreach_messages where provider_message_id = p_provider_message_id;
    if v_message_id is not null then return v_message_id; end if;
  end if;
  select * into v_member from streamline_hq.campaign_memberships where id = p_membership_id for update;
  if not found or v_member.status <> 'sending' then raise exception 'Send was not claimed'; end if;
  if v_member.approved_version <> p_approved_version then raise exception 'Approved version mismatch'; end if;
  if not p_success then
    update streamline_hq.campaign_memberships set status='failed', last_error=nullif(trim(p_error),''), updated_at=now() where id=p_membership_id;
    return null;
  end if;
  v_lead_id := coalesce(v_member.lead_id, public.promote_prospect_to_lead(v_member.prospect_id));
  insert into public.outreach_messages (
    lead_id, direction, subject, message_text, channel, sent_at, replied, metadata,
    provider_message_id, provider_thread_id, delivery_status, campaign_membership_id
  ) values (
    v_lead_id, 'outbound', v_member.approved_subject, v_member.approved_text, 'email', now(), false,
    jsonb_build_object('source','zoho_email_pilot','approved_version',p_approved_version,'follow_up_step',v_member.follow_up_step),
    nullif(trim(p_provider_message_id),''),
    coalesce(nullif(trim(p_provider_thread_id),''), nullif(trim(p_provider_message_id),'')),
    'sent', p_membership_id
  ) returning id into v_message_id;
  update streamline_hq.campaign_memberships set lead_id=v_lead_id, status='sent', sent_at=now(),
    last_sent_at=now(), follow_up_due_at=null, last_error=null, updated_at=now() where id=p_membership_id;
  return v_message_id;
end $$;

create or replace function public.ingest_campaign_reply(
  p_provider_message_id text, p_provider_thread_id text, p_body text,
  p_classification text default 'unclassified', p_summary text default null
) returns uuid language plpgsql security definer set search_path = public, streamline_hq, pg_temp as $$
declare v_outbound public.outreach_messages%rowtype; v_message_id uuid; v_reason text; v_prospect_id uuid;
begin
  if nullif(trim(p_provider_message_id),'') is null or nullif(trim(p_body),'') is null then raise exception 'Provider message id and reply body are required'; end if;
  select id into v_message_id from public.outreach_messages where provider_message_id = p_provider_message_id;
  if v_message_id is not null then return v_message_id; end if;

  select * into v_outbound from public.outreach_messages
    where provider_thread_id = p_provider_thread_id and direction='outbound'
    order by sent_at desc limit 1 for update;
  if not found then raise exception 'No outbound message matches provider thread'; end if;

  insert into public.outreach_messages (
    lead_id, direction, message_text, channel, sent_at, replied, reply_at, classification, summary,
    provider_message_id, provider_thread_id, in_reply_to, delivery_status, campaign_membership_id, metadata
  ) values (
    v_outbound.lead_id, 'inbound', trim(p_body), 'email', now(), true, now(), p_classification, nullif(trim(p_summary),''),
    p_provider_message_id, p_provider_thread_id, v_outbound.provider_message_id, 'received',
    v_outbound.campaign_membership_id, jsonb_build_object('source','zoho_inbox')
  ) returning id into v_message_id;

  -- Any reply cancels pending follow-ups, by lead and by membership.
  update public.follow_ups set status='cancelled', cancelled_at=now(), outcome='reply_received'
    where status='pending'
      and (lead_id = v_outbound.lead_id
           or (v_outbound.campaign_membership_id is not null and campaign_membership_id = v_outbound.campaign_membership_id));

  v_reason := case
    when p_classification = 'stop' then 'opt_out'
    when p_classification = 'unclassified' then 'uncertain'
    when p_classification in ('interested','complaint','question') then p_classification
    else null end;

  update streamline_hq.campaign_memberships
    set status = case when v_reason is null then 'replied' else 'handover' end,
        replied_at = now(), follow_up_due_at = null, updated_at = now()
    where id = v_outbound.campaign_membership_id;

  if v_reason is not null then
    insert into streamline_hq.outreach_handovers (campaign_membership_id, lead_id, reason, summary)
      values (v_outbound.campaign_membership_id, v_outbound.lead_id, v_reason, nullif(trim(p_summary),''));
  end if;

  if p_classification = 'stop' and v_outbound.campaign_membership_id is not null then
    select cm.prospect_id into v_prospect_id from streamline_hq.campaign_memberships cm where cm.id = v_outbound.campaign_membership_id;
    if v_prospect_id is not null then
      insert into streamline_hq.suppression_list (prospect_id, reason) values (v_prospect_id, 'email_opt_out')
        on conflict (prospect_id) where prospect_id is not null do nothing;
      update streamline_hq.prospects set popia_optout=true, popia_optout_at=now(), status='dead', updated_at=now() where id=v_prospect_id;
      update streamline_hq.campaign_memberships set status='suppressed', updated_at=now()
        where prospect_id=v_prospect_id and status not in ('sent','replied','handover','closed_no_response');
    end if;
  end if;
  return v_message_id;
end $$;

-- A follow-up re-enters the approval path on the same membership: it never sends
-- on its own, and it consumes a slot from the same daily cap.
create or replace function public.queue_campaign_follow_up(
  p_membership_id uuid, p_subject_draft text default null, p_draft_text text default null,
  p_business_days integer default 3
) returns jsonb language plpgsql security definer set search_path = public, streamline_hq, pg_temp as $$
declare v_member streamline_hq.campaign_memberships%rowtype; v_campaign streamline_hq.outreach_campaigns%rowtype; v_due timestamptz;
begin
  select * into v_member from streamline_hq.campaign_memberships where id = p_membership_id for update;
  if not found then raise exception 'Campaign membership not found'; end if;
  if v_member.status <> 'sent' then raise exception 'Only a sent message may be followed up, not %', v_member.status; end if;
  if exists (select 1 from public.outreach_messages om where om.campaign_membership_id = p_membership_id and om.direction = 'inbound') then
    raise exception 'Thread already has a reply; follow-up is not allowed';
  end if;
  if exists (select 1 from streamline_hq.prospects p where p.id = v_member.prospect_id and p.popia_optout)
     or exists (select 1 from streamline_hq.suppression_list s where s.prospect_id = v_member.prospect_id) then
    raise exception 'Suppressed prospect cannot be followed up';
  end if;
  select * into v_campaign from streamline_hq.outreach_campaigns where id = v_member.campaign_id for share;
  v_due := public.next_sa_business_day(coalesce(v_member.last_sent_at, now()), greatest(coalesce(p_business_days,3),1), coalesce(v_campaign.timezone,'Africa/Johannesburg'));

  update streamline_hq.campaign_memberships set
    status = 'draft',
    follow_up_step = v_member.follow_up_step + 1,
    follow_up_due_at = v_due,
    subject_draft = coalesce(nullif(trim(p_subject_draft),''), 'Re: ' || coalesce(v_member.approved_subject, 'following up')),
    draft_text = nullif(trim(p_draft_text),''),
    approved_subject = null, approved_text = null, approved_version = null,
    approved_at = null, approved_by = null, scheduled_for = null, sending_claimed_at = null,
    sent_at = null, updated_at = now()
  where id = p_membership_id;

  insert into public.follow_ups (lead_id, campaign_membership_id, step, channel, due_at, status, draft_text)
    select v_member.lead_id, p_membership_id, v_member.follow_up_step + 1, 'email', v_due, 'pending', nullif(trim(p_draft_text),'')
    where v_member.lead_id is not null
  on conflict (lead_id, step, due_at) do nothing;

  return jsonb_build_object('membership_id', p_membership_id, 'follow_up_step', v_member.follow_up_step + 1, 'due_at', v_due);
end $$;

-- Closes, never deletes. Re-contact still requires manually_reactivate_campaign_member.
create or replace function public.close_stale_campaign_members(p_days integer default 30)
returns integer language plpgsql security definer set search_path = public, streamline_hq, pg_temp as $$
declare v_count integer;
begin
  with closed as (
    update streamline_hq.campaign_memberships m
      set status = 'closed_no_response', closed_at = now(), follow_up_due_at = null, updated_at = now()
      where m.status in ('sent','draft')
        and m.last_sent_at is not null
        and m.last_sent_at < now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
        and not exists (select 1 from public.outreach_messages om where om.campaign_membership_id = m.id and om.direction = 'inbound')
      returning m.id
  )
  select count(*) into v_count from closed;
  update public.follow_ups f set status = 'cancelled', cancelled_at = now(), outcome = 'closed_no_response'
    where f.status = 'pending' and f.campaign_membership_id in (
      select m.id from streamline_hq.campaign_memberships m where m.status = 'closed_no_response');
  return v_count;
end $$;

create or replace function public.skip_campaign_member(p_membership_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public, streamline_hq, pg_temp as $$
declare v_status text;
begin
  select status into v_status from streamline_hq.campaign_memberships where id = p_membership_id for update;
  if not found then raise exception 'Campaign membership not found'; end if;
  if v_status in ('sending','sent','replied','handover') then raise exception 'Cannot skip from status %', v_status; end if;
  update streamline_hq.campaign_memberships set status='skipped', skip_reason=nullif(trim(p_reason),''),
    scheduled_for=null, follow_up_due_at=null, updated_at=now() where id=p_membership_id;
end $$;

create or replace function public.suppress_campaign_prospect(p_prospect_id uuid, p_reason text default 'manual_optout')
returns void language plpgsql security definer set search_path = public, streamline_hq, pg_temp as $$
begin
  if not exists (select 1 from streamline_hq.prospects where id = p_prospect_id) then raise exception 'Prospect not found'; end if;
  insert into streamline_hq.suppression_list (prospect_id, reason) values (p_prospect_id, coalesce(nullif(trim(p_reason),''),'manual_optout'))
    on conflict (prospect_id) where prospect_id is not null do nothing;
  update streamline_hq.prospects set popia_optout=true, popia_optout_at=now(), updated_at=now() where id=p_prospect_id;
  update streamline_hq.campaign_memberships set status='suppressed', scheduled_for=null, follow_up_due_at=null, updated_at=now()
    where prospect_id=p_prospect_id and status not in ('sent','replied','handover','closed_no_response');
  update public.follow_ups f set status='cancelled', cancelled_at=now(), outcome='suppressed'
    where f.status='pending' and f.campaign_membership_id in (
      select m.id from streamline_hq.campaign_memberships m where m.prospect_id = p_prospect_id);
end $$;

create or replace function public.resolve_outreach_handover(p_handover_id uuid)
returns void language plpgsql security definer set search_path = public, streamline_hq, pg_temp as $$
begin
  update streamline_hq.outreach_handovers set status='resolved', resolved_at=now(), resolved_by=auth.uid()
    where id=p_handover_id and status='open';
  if not found then raise exception 'Open handover not found'; end if;
end $$;

create or replace function public.pause_outreach_campaign(p_campaign_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public, streamline_hq, pg_temp as $$
begin update streamline_hq.outreach_campaigns set active=false,paused_at=now(),pause_reason=nullif(trim(p_reason),''),updated_at=now() where id=p_campaign_id; if not found then raise exception 'Campaign not found'; end if; end $$;

create or replace function public.manually_reactivate_campaign_member(p_membership_id uuid, p_reason text, p_new_campaign_id uuid)
returns uuid language plpgsql security definer set search_path = public, streamline_hq, pg_temp as $$
declare v_member streamline_hq.campaign_memberships%rowtype; v_new_id uuid;
begin
  if nullif(trim(p_reason),'') is null then raise exception 'Manual reactivation reason is required'; end if;
  select * into v_member from streamline_hq.campaign_memberships where id=p_membership_id for update;
  if not found or v_member.status <> 'closed_no_response' then raise exception 'Only closed records may be manually reactivated'; end if;
  if exists (select 1 from streamline_hq.prospects p where p.id=v_member.prospect_id and p.popia_optout) or exists (select 1 from streamline_hq.suppression_list s where s.prospect_id=v_member.prospect_id) then raise exception 'Suppressed prospects cannot be reactivated'; end if;
  if p_new_campaign_id = v_member.campaign_id then raise exception 'Re-contact requires a new campaign'; end if;
  insert into streamline_hq.campaign_memberships (campaign_id,prospect_id,lead_id,channel,status,reactivation_reason)
    select c.id,v_member.prospect_id,v_member.lead_id,c.channel,'manually_reactivated',trim(p_reason)
    from streamline_hq.outreach_campaigns c where c.id=p_new_campaign_id returning id into v_new_id;
  if v_new_id is null then raise exception 'Target campaign not found'; end if;
  return v_new_id;
end $$;

-- =====================================================================
-- Grants
-- =====================================================================

revoke all on function
  public.next_sa_business_day(timestamptz,integer,text),
  public.create_campaign_membership(uuid,uuid,text,text),
  public.approve_campaign_message(uuid,text,text),
  public.schedule_campaign_message(uuid,timestamptz),
  public.claim_due_campaign_send(uuid),
  public.record_campaign_provider_result(uuid,integer,text,text,boolean,text),
  public.ingest_campaign_reply(text,text,text,text,text),
  public.queue_campaign_follow_up(uuid,text,text,integer),
  public.close_stale_campaign_members(integer),
  public.skip_campaign_member(uuid,text),
  public.suppress_campaign_prospect(uuid,text),
  public.resolve_outreach_handover(uuid),
  public.pause_outreach_campaign(uuid,text),
  public.manually_reactivate_campaign_member(uuid,text,uuid)
from public, anon;

-- Supabase's default privileges grant EXECUTE to authenticated on creation, so the
-- sender/inbox path has to be revoked from it by name or it stays browser-reachable.
revoke all on function
  public.claim_due_campaign_send(uuid),
  public.record_campaign_provider_result(uuid,integer,text,text,boolean,text),
  public.ingest_campaign_reply(text,text,text,text,text),
  public.close_stale_campaign_members(integer)
from authenticated;

grant execute on function
  public.next_sa_business_day(timestamptz,integer,text),
  public.create_campaign_membership(uuid,uuid,text,text),
  public.approve_campaign_message(uuid,text,text),
  public.schedule_campaign_message(uuid,timestamptz),
  public.queue_campaign_follow_up(uuid,text,text,integer),
  public.skip_campaign_member(uuid,text),
  public.suppress_campaign_prospect(uuid,text),
  public.resolve_outreach_handover(uuid),
  public.pause_outreach_campaign(uuid,text),
  public.manually_reactivate_campaign_member(uuid,text,uuid)
to authenticated, service_role;

-- Sender/inbox path is service_role only. Never reachable from the browser.
grant execute on function
  public.claim_due_campaign_send(uuid),
  public.record_campaign_provider_result(uuid,integer,text,text,boolean,text),
  public.ingest_campaign_reply(text,text,text,text,text),
  public.close_stale_campaign_members(integer)
to service_role;

commit;

notify pgrst, 'reload schema';
