alter table public.performers
  add column if not exists youtube_live_video_id text,
  add column if not exists youtube_live_url text,
  add column if not exists youtube_live_enabled boolean not null default false;

alter table public.performers
  drop constraint if exists performers_youtube_live_video_id_check,
  add constraint performers_youtube_live_video_id_check
    check (youtube_live_video_id is null or youtube_live_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  drop constraint if exists performers_youtube_live_url_check,
  add constraint performers_youtube_live_url_check
    check (youtube_live_url is null or youtube_live_url ~ '^https://www\\.youtube\\.com/watch\\?v=[A-Za-z0-9_-]{11}$'),
  drop constraint if exists performers_youtube_live_complete_check,
  add constraint performers_youtube_live_complete_check
    check (not youtube_live_enabled or (youtube_live_video_id is not null and youtube_live_url is not null));

create index if not exists performers_youtube_live_enabled_idx
  on public.performers (youtube_live_enabled, updated_at desc)
  where youtube_live_enabled = true and is_approved = true;

comment on column public.performers.youtube_live_video_id is 'Validated public YouTube video ID for official IFrame playback; never a stream key.';
comment on column public.performers.youtube_live_enabled is 'Performer-controlled HAKU CONNECT LIVE visibility. Player state remains authoritative for actual live status.';
