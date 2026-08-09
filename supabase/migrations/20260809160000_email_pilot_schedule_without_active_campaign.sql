-- Scheduling is queueing, not sending. Requiring an active campaign here made it
-- impossible to approve anything before activation, which is the documented order
-- of operations (create inactive -> import -> approve -> activate).
--
-- Nothing can leave the building from an inactive or paused campaign regardless:
-- claim_due_campaign_send is the single send-time gate and independently checks
-- active, paused_at, business hours, the daily cap, and suppression.
begin;

create or replace function public.schedule_campaign_message(
  p_membership_id uuid, p_scheduled_for timestamptz
) returns void language plpgsql security definer
set search_path = public, streamline_hq, pg_temp as $$
declare v_member streamline_hq.campaign_memberships%rowtype; v_campaign streamline_hq.outreach_campaigns%rowtype;
begin
  select m.* into v_member from streamline_hq.campaign_memberships m where m.id = p_membership_id for update;
  if not found or v_member.status <> 'approved' or v_member.approved_version is null then
    raise exception 'Only an approved message may be scheduled';
  end if;
  select * into v_campaign from streamline_hq.outreach_campaigns where id = v_member.campaign_id for share;
  if not found then raise exception 'Campaign not found'; end if;
  if exists (select 1 from streamline_hq.prospects p where p.id = v_member.prospect_id and p.popia_optout)
     or exists (select 1 from streamline_hq.suppression_list s where s.prospect_id = v_member.prospect_id) then
    raise exception 'Suppressed prospect cannot be scheduled';
  end if;
  update streamline_hq.campaign_memberships
    set status = 'scheduled', scheduled_for = p_scheduled_for, updated_at = now()
    where id = p_membership_id;
end $$;

revoke all on function public.schedule_campaign_message(uuid,timestamptz) from public, anon;
grant execute on function public.schedule_campaign_message(uuid,timestamptz) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
