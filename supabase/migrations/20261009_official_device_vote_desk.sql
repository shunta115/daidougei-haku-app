-- Keep the private admin desk on the same official ballot source as the
-- visitor vote API and the public result function.
begin;

create or replace function public.admin_event_vote_desk(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rule public.event_vote_rules%rowtype;
  legacy_test_votes bigint := 0;
begin
  if not public.is_admin() then
    raise exception 'admin_required';
  end if;

  select * into rule
  from public.event_vote_rules
  where event_id = p_event_id;

  -- Older production schemas do not necessarily contain both legacy ballot
  -- tables. They are diagnostics only, so inspect them when present instead
  -- of making the official device-vote desk depend on obsolete tables.
  if to_regclass('public.event_ballots') is not null then
    execute 'select count(*) from public.event_ballots where event_id = $1'
      into legacy_test_votes using p_event_id;
  end if;
  if to_regclass('public.event_anon_ballots') is not null then
    execute 'select $1 + count(*) from public.event_anon_ballots where event_id = $2'
      into legacy_test_votes using legacy_test_votes, p_event_id;
  end if;

  return jsonb_build_object(
    'voting_enabled', coalesce(rule.voting_enabled, false),
    'voting_open', coalesce(rule.voting_open, false),
    'votes_per_device', coalesce(rule.votes_per_device, 3),
    'total_votes', (
      select count(*)
      from public.event_device_ballots b
      join public.event_lineup l
        on l.event_id = b.event_id
       and l.performer_id = b.performer_id
       and l.is_voting_eligible is true
      where b.event_id = p_event_id
    ),
    'unique_voters', (
      select count(distinct b.device_hash)
      from public.event_device_ballots b
      join public.event_lineup l
        on l.event_id = b.event_id
       and l.performer_id = b.performer_id
       and l.is_voting_eligible is true
      where b.event_id = p_event_id
    ),
    'ranking', coalesce((
      select jsonb_agg(row_to_json(r) order by r.votes desc, r.performer_id)
      from (
        select b.performer_id, count(*)::int as votes
        from public.event_device_ballots b
        join public.event_lineup l
          on l.event_id = b.event_id
         and l.performer_id = b.performer_id
         and l.is_voting_eligible is true
        where b.event_id = p_event_id
        group by b.performer_id
      ) r
    ), '[]'::jsonb),
    'hourly', coalesce((
      select jsonb_agg(row_to_json(h) order by h.hour)
      from (
        select date_trunc('hour', b.created_at) as hour, count(*)::int as votes
        from public.event_device_ballots b
        join public.event_lineup l
          on l.event_id = b.event_id
         and l.performer_id = b.performer_id
         and l.is_voting_eligible is true
        where b.event_id = p_event_id
        group by 1
      ) h
    ), '[]'::jsonb),
    'anomalies', coalesce((
      select jsonb_agg(row_to_json(a))
      from (
        select left(b.device_hash, 8) as voter_prefix,
          count(*)::int as votes,
          extract(epoch from (max(b.created_at) - min(b.created_at)))::int as span_seconds,
          'fast_device_votes' as kind
        from public.event_device_ballots b
        join public.event_lineup l
          on l.event_id = b.event_id
         and l.performer_id = b.performer_id
         and l.is_voting_eligible is true
        where b.event_id = p_event_id
        group by b.device_hash
        having count(*) >= 3
          and extract(epoch from (max(b.created_at) - min(b.created_at))) < 20
      ) a
    ), '[]'::jsonb),
    'legacy_test_votes', legacy_test_votes
  );
end;
$$;

revoke all on function public.admin_event_vote_desk(uuid) from public, anon;
grant execute on function public.admin_event_vote_desk(uuid) to authenticated;

commit;
