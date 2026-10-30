begin;
-- Additive only: venue coordinates are optional and never inferred from a
-- performer's shared/current location. Existing appearances remain unchanged.
alter table public.performer_appearances
  add column if not exists venue_lat double precision,
  add column if not exists venue_lng double precision;

alter table public.performer_appearances
  drop constraint if exists performer_appearances_venue_coordinates_check;
alter table public.performer_appearances
  add constraint performer_appearances_venue_coordinates_check check (
    (venue_lat is null and venue_lng is null)
    or (venue_lat is not null and venue_lng is not null
      and venue_lat between -90 and 90 and venue_lng between -180 and 180)
  );

create index if not exists performer_appearances_public_map_idx
  on public.performer_appearances (starts_at, ends_at)
  where status = 'published' and venue_lat is not null and venue_lng is not null;

commit;
