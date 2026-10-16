begin;

do $$
declare
  v_event_id uuid;
  v_rocks_id uuid;
  v_fuji_id uuid;
  v_yuta_id uuid;
begin
  select id into strict v_event_id from public.events where slug = 'award-winning-performers-2026';
  select id into strict v_rocks_id from public.performers where lower(btrim(stage_name)) in ('rocks', lower('Performance Team “ROCKS”'));
  select id into strict v_fuji_id from public.performers where lower(btrim(stage_name)) in ('fuji', 'performer fuji');
  select id into strict v_yuta_id from public.performers where btrim(stage_name) in ('ゆうた', '大道芸人ゆうた');

  insert into public.event_official_navigators (event_id, event_date, performer_id, show_on_home, updated_at)
  values
    (v_event_id, date '2026-10-10', v_rocks_id, true, now()),
    (v_event_id, date '2026-10-11', v_fuji_id, true, now()),
    (v_event_id, date '2026-10-12', v_yuta_id, true, now())
  on conflict (event_id, event_date) do update
  set performer_id = excluded.performer_id, show_on_home = excluded.show_on_home, updated_at = excluded.updated_at;
end
$$;

commit;
