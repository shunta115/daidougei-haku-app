-- Review only. Never apply to production without separate approval.
begin;
create schema if not exists haku_home_private;
revoke all on schema haku_home_private from public, anon, authenticated;
create table public.performer_homepages (
  performer_id uuid primary key references public.performers(id),
  published boolean not null default true,
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 60000),
  updated_at timestamptz not null default now()
);
create table public.performer_home_assets (
  id uuid primary key default gen_random_uuid(),
  performer_id uuid not null references public.performers(id),
  kind text not null check (kind in ('photo','pdf','video')),
  title text not null check (length(title) between 1 and 160),
  description text not null default '' check (length(description) <= 2000),
  object_path text unique,
  thumbnail_path text unique,
  video_id text check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  published boolean not null default false,
  sort_order integer not null default 0,
  is_main boolean not null default false,
  bytes integer not null default 0 check (bytes between 0 and 2097152),
  updated_at timestamptz not null default now(),
  check ((kind = 'video' and video_id is not null and object_path is null and thumbnail_path is null) or
    (kind in ('photo','pdf') and object_path like performer_id::text || '/%' and video_id is null)),
  check (thumbnail_path is null or (kind = 'photo' and thumbnail_path like performer_id::text || '/%'))
);
create index on public.performer_home_assets (performer_id, sort_order);
create unique index performer_home_one_main on public.performer_home_assets (performer_id, kind) where is_main;
alter table public.performer_homepages enable row level security;
alter table public.performer_home_assets enable row level security;
-- All mutations use the authenticated server API, including byte/PDF validation.
revoke all on public.performer_homepages, public.performer_home_assets from anon, authenticated;
grant select on public.performer_homepages, public.performer_home_assets to authenticated;
grant all on public.performer_homepages, public.performer_home_assets to service_role;
-- Public reads are filtered by the server. Client roles can inspect only owned rows.
create policy home_read on public.performer_homepages for select to authenticated using (performer_id = (select auth.uid()));
create policy home_assets_read on public.performer_home_assets for select to authenticated using (performer_id = (select auth.uid()));
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('performer-home-private', 'performer-home-private', false, 2097152, array['image/jpeg','application/pdf']);
-- No client Storage policies: bytes pass validation on server, files served via checked API.
create table haku_home_private.booking_cases (
  id uuid primary key default gen_random_uuid(),
  performer_id uuid not null references public.performers(id),
  payload jsonb not null,
  status text not null default 'new' check (status in ('new','reviewing','checking','quoting','booked','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table haku_home_private.request_limits (key text primary key, hits integer not null, expires_at timestamptz not null);
alter table haku_home_private.booking_cases enable row level security;
alter table haku_home_private.request_limits enable row level security;
-- Serialize per performer to enforce limits, even for concurrent uploads.
create function public.home_add_asset(p_row jsonb) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare n integer; result jsonb; previous public.performer_home_assets;
begin
  perform 1 from public.performers where id = (p_row->>'performer_id')::uuid for update;
  if p_row->>'replace_id' is not null then
    select * into previous from public.performer_home_assets where id=(p_row->>'replace_id')::uuid and performer_id=(p_row->>'performer_id')::uuid and kind=p_row->>'kind' for update;
    if not found then raise exception 'replacement not owned'; end if;
  end if;
  select count(*) into n from public.performer_home_assets where performer_id = (p_row->>'performer_id')::uuid and kind = p_row->>'kind';
  if previous.id is not null then n := n - 1; end if;
  if n >= (case p_row->>'kind' when 'photo' then 20 when 'pdf' then 5 else 10 end) then raise exception 'asset limit reached'; end if;
  if previous.id is not null then delete from public.performer_home_assets where id=previous.id; end if;
  insert into public.performer_home_assets (id, performer_id, kind, title, object_path, thumbnail_path, video_id, bytes, sort_order, published, is_main, description)
  values ((p_row->>'id')::uuid, (p_row->>'performer_id')::uuid, p_row->>'kind', p_row->>'title', p_row->>'object_path', p_row->>'thumbnail_path', p_row->>'video_id', coalesce((p_row->>'bytes')::integer,0), coalesce(previous.sort_order,n), coalesce(previous.published,false), coalesce(previous.is_main,false),coalesce(previous.description,''))
  returning to_jsonb(performer_home_assets.*) into result;
  return result || jsonb_build_object('replaced_paths',jsonb_build_array(previous.object_path,previous.thumbnail_path));
end $$;
create function public.home_reorder_assets(p_performer uuid, p_kind text, p_ids uuid[]) returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.performers where id=p_performer for update;
  if cardinality(p_ids) > 20 or cardinality(p_ids) <> (select count(distinct value) from unnest(p_ids) value) or cardinality(p_ids) <> (select count(*) from public.performer_home_assets where performer_id=p_performer and kind=p_kind) or cardinality(p_ids) <> (select count(*) from public.performer_home_assets where performer_id=p_performer and kind=p_kind and id=any(p_ids)) then raise exception 'invalid reorder'; end if;
  update public.performer_home_assets a set sort_order=v.ordinality-1 from unnest(p_ids) with ordinality v(id,ordinality) where a.id=v.id and a.performer_id=p_performer;
end $$;
revoke all on function public.home_reorder_assets(uuid,text,uuid[]) from public,anon,authenticated;
grant execute on function public.home_reorder_assets(uuid,text,uuid[]) to service_role;
create function public.home_set_main(p_performer uuid, p_id uuid) returns void language plpgsql security invoker set search_path = '' as $$
declare asset_kind text;
begin
  perform 1 from public.performers where id=p_performer for update;
  select kind into asset_kind from public.performer_home_assets where id=p_id and performer_id=p_performer;
  if not found then raise exception 'asset not owned'; end if;
  update public.performer_home_assets set is_main=false where performer_id=p_performer and kind=asset_kind;
  update public.performer_home_assets set is_main=true where performer_id=p_performer and id=p_id;
end $$;
revoke all on function public.home_set_main(uuid,uuid) from public,anon,authenticated;
grant execute on function public.home_set_main(uuid,uuid) to service_role;
create function public.home_submit_booking(p_payload jsonb, p_key text) returns uuid language plpgsql security invoker set search_path = '' as $$
declare request_id uuid; count_now integer; recipients integer;
begin
  -- Existing active office admins only. No performer notification or forwarding.
  select count(*) into recipients from public.profiles where role = 'admin' and status = 'active';
  if recipients = 0 then raise exception 'office not configured'; end if;
  delete from haku_home_private.request_limits where key in (select key from haku_home_private.request_limits where expires_at < now() limit 100);
  insert into haku_home_private.request_limits as limits (key,hits,expires_at) values (p_key,1,now()+interval '1 hour')
  on conflict(key) do update set hits = case when limits.expires_at <= now() then 1 else limits.hits+1 end,
    expires_at = case when limits.expires_at <= now() then now()+interval '1 hour' else limits.expires_at end returning hits into count_now;
  if count_now > 5 then return null; end if;
  insert into haku_home_private.booking_cases (performer_id,payload) values ((p_payload->>'performer_id')::uuid,p_payload) returning id into request_id;
  insert into public.notifications (user_id,title,body,link)
  select id,'新しい出演依頼','HAKU事務局に出演依頼が届きました。管理画面で確認してください。','/haku-admin?section=bookings'
  from public.profiles where role = 'admin' and status = 'active';
  return request_id;
end $$;
create function public.home_manage_cases(p_id uuid default null, p_status text default null, p_query text default '', p_filter text default '') returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  if p_id is not null then
    update haku_home_private.booking_cases set status=p_status, updated_at=now() where id=p_id;
    if not found then raise exception 'case not found'; end if;
  end if;
  select coalesce(jsonb_agg(to_jsonb(c)), '[]') into result from (
    select * from haku_home_private.booking_cases
    where (p_filter='' or status=p_filter) and (p_query='' or payload::text ilike '%' || p_query || '%')
    order by created_at desc limit 100
  ) c;
  return result;
end $$;
grant usage on schema haku_home_private to service_role;
grant all on all tables in schema haku_home_private to service_role;
revoke all on function public.home_add_asset(jsonb), public.home_submit_booking(jsonb,text), public.home_manage_cases(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.home_add_asset(jsonb), public.home_submit_booking(jsonb,text), public.home_manage_cases(uuid,text,text,text) to service_role;
commit;
