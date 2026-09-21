-- Event-day schedule metadata and exact LIVE-to-slot linkage.
-- Additive only: existing slots become regular performances; no rows are rewritten or removed.

begin;
set local lock_timeout = '5s';

alter table public.event_slots
  add column if not exists performance_type text not null default 'regular',
  add column if not exists round_no smallint,
  add column if not exists ranking_position smallint;

alter table public.event_slots
  drop constraint if exists event_slots_performance_type_check,
  add constraint event_slots_performance_type_check
    check (performance_type in ('regular', 'special_final')) not valid,
  drop constraint if exists event_slots_round_no_check,
  add constraint event_slots_round_no_check
    check (round_no is null or round_no between 1 and 3) not valid,
  drop constraint if exists event_slots_ranking_position_check,
  add constraint event_slots_ranking_position_check
    check (ranking_position is null or ranking_position between 1 and 3) not valid,
  drop constraint if exists event_slots_schedule_shape_check,
  add constraint event_slots_schedule_shape_check check (
    (performance_type = 'regular' and ranking_position is null)
    or
    (performance_type = 'special_final' and round_no is null and ranking_position between 1 and 3)
  ) not valid;

alter table public.event_slots validate constraint event_slots_performance_type_check;
alter table public.event_slots validate constraint event_slots_round_no_check;
alter table public.event_slots validate constraint event_slots_ranking_position_check;
alter table public.event_slots validate constraint event_slots_schedule_shape_check;

alter table public.live_sessions
  add column if not exists event_slot_id uuid references public.event_slots (id) on delete set null;

create index if not exists event_slots_event_type_date_idx
  on public.event_slots (event_id, performance_type, date, start_time);

create unique index if not exists event_slots_final_rank_unique
  on public.event_slots (event_id, date, ranking_position)
  where performance_type = 'special_final';

create index if not exists live_sessions_event_slot_idx
  on public.live_sessions (event_slot_id);

commit;
