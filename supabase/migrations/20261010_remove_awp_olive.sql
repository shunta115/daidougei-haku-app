-- Remove the withdrawn 2026-10-10 AWP statue/roving appearance only.
-- Performer accounts, voting data, event slots, and all other appearances are unchanged.

begin;
set local lock_timeout = '5s';

do $$
declare
  target_count integer;
  deleted_count integer;
begin
  select count(*) into target_count
    from public.event_guest_appearances a
    join public.events e on e.id = a.event_id
    where e.slug = 'award-winning-performers-2026'
      and a.official_name_ja = 'オリーブ'
      and a.appearance_type = 'statue_roving'
      and a.appearance_date = date '2026-10-10'
      and a.source_key = 'awp-2026-2026-10-10-appearance-1';

  if target_count = 0 then
    return;
  end if;
  if target_count <> 1 then
    raise exception 'expected exactly 1 AWP Olive appearance, found %', target_count;
  end if;

  delete from public.event_guest_appearances a
  using public.events e
  where e.id = a.event_id
    and e.slug = 'award-winning-performers-2026'
    and a.official_name_ja = 'オリーブ'
    and a.appearance_type = 'statue_roving'
    and a.appearance_date = date '2026-10-10'
    and a.source_key = 'awp-2026-2026-10-10-appearance-1';

  get diagnostics deleted_count = row_count;
  if deleted_count <> 1 then
    raise exception 'expected to delete exactly 1 AWP Olive appearance, deleted %', deleted_count;
  end if;
end $$;

commit;
