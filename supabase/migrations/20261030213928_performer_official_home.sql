-- Review only. Never apply to production without separate approval.
begin;
-- Fail closed instead of touching any pre-existing private schema/permissions.
DO $preflight$ begin
  if to_regnamespace('haku_home_private') is not null then
    raise exception 'haku_home_private already exists; review drift before applying';
  end if;
end $preflight$;
create schema haku_home_private;
revoke all on schema haku_home_private from public, anon, authenticated;
create table public.performer_homepages (
  performer_id uuid primary key references public.performers(id) on delete cascade,
  published boolean not null default true,
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 60000),
  updated_at timestamptz not null default now()
);
create table public.performer_home_assets (
  id uuid primary key default gen_random_uuid(),
  performer_id uuid not null references public.performers(id) on delete cascade,
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
  performer_id uuid references public.performers(id) on delete set null,
  payload jsonb not null,
  status text not null default 'new' check (status in ('new','reviewing','checking','quoting','booked','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  retention_due_at timestamptz not null default now() + interval '180 days',
  anonymized_at timestamptz,
  hold_basis text check (hold_basis in ('statutory_review','statutory_record','dispute')),
  hold_review_due_at timestamptz,
  check ((hold_basis is null) = (hold_review_due_at is null)),
  check (not (payload ? 'performer_id')),
  check (anonymized_at is null or (payload = '{}'::jsonb and performer_id is null and hold_basis is null))
);
create table haku_home_private.request_limits (key text primary key, hits integer not null, expires_at timestamptz not null);
alter table haku_home_private.booking_cases enable row level security;
alter table haku_home_private.request_limits enable row level security;
-- Additive, column-scoped server read. No browser grant, role change or allowlist change.
grant select (user_id, permission, status) on public.admin_members to service_role;
create table haku_home_private.asset_locks (
  performer_id uuid primary key references public.performers(id) on delete cascade
);
create table haku_home_private.storage_cleanup (
  path_hash text primary key,
  object_path text,
  performer_id uuid,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  check ((processed_at is null and object_path is not null) or (processed_at is not null and object_path is null and performer_id is null))
);
create table haku_home_private.case_audit (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references haku_home_private.booking_cases(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('list','status','hold','release_hold','erase','retention')),
  created_at timestamptz not null default now()
);
alter table haku_home_private.asset_locks enable row level security;
alter table haku_home_private.storage_cleanup enable row level security;
alter table haku_home_private.case_audit enable row level security;
create index on haku_home_private.booking_cases(retention_due_at) where anonymized_at is null and hold_basis is null;
create index on haku_home_private.storage_cleanup(created_at) where processed_at is null;
-- Serialize ONLY on feature-owned rows. Parent FK checks do not need parent UPDATE.
-- Serialize per performer to enforce limits, even for concurrent uploads.
create function public.home_add_asset(p_row jsonb) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare n integer; result jsonb; previous public.performer_home_assets;
begin
  insert into haku_home_private.asset_locks values ((p_row->>'performer_id')::uuid) on conflict do nothing;
  perform 1 from haku_home_private.asset_locks where performer_id=(p_row->>'performer_id')::uuid for update;
  if exists (select 1 from haku_home_private.storage_cleanup where path_hash in (
    encode(sha256(convert_to(p_row->>'object_path','UTF8')),'hex'),
    encode(sha256(convert_to(p_row->>'thumbnail_path','UTF8')),'hex')
  )) then raise exception 'retired object path'; end if;
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
  insert into haku_home_private.asset_locks values (p_performer) on conflict do nothing;
  perform 1 from haku_home_private.asset_locks where performer_id=p_performer for update;
  if cardinality(p_ids) > 20 or cardinality(p_ids) <> (select count(distinct value) from unnest(p_ids) value) or cardinality(p_ids) <> (select count(*) from public.performer_home_assets where performer_id=p_performer and kind=p_kind) or cardinality(p_ids) <> (select count(*) from public.performer_home_assets where performer_id=p_performer and kind=p_kind and id=any(p_ids)) then raise exception 'invalid reorder'; end if;
  update public.performer_home_assets a set sort_order=v.ordinality-1 from unnest(p_ids) with ordinality v(id,ordinality) where a.id=v.id and a.performer_id=p_performer;
end $$;
revoke all on function public.home_reorder_assets(uuid,text,uuid[]) from public,anon,authenticated;
grant execute on function public.home_reorder_assets(uuid,text,uuid[]) to service_role;
create function public.home_set_main(p_performer uuid, p_id uuid) returns void language plpgsql security invoker set search_path = '' as $$
declare asset_kind text;
begin
  insert into haku_home_private.asset_locks values (p_performer) on conflict do nothing;
  perform 1 from haku_home_private.asset_locks where performer_id=p_performer for update;
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
  select count(*) into recipients from public.profiles p where p.role = 'admin' and p.status = 'active' and exists (select 1 from public.admin_members m where m.user_id=p.id and m.status='active' and m.permission in ('admin','super_admin'));
  if recipients = 0 then raise exception 'office not configured'; end if;
  delete from haku_home_private.request_limits where key in (select key from haku_home_private.request_limits where expires_at < now() limit 100);
  insert into haku_home_private.request_limits as limits (key,hits,expires_at) values (p_key,1,now()+interval '1 hour')
  on conflict(key) do update set hits = case when limits.expires_at <= now() then 1 else limits.hits+1 end,
    expires_at = case when limits.expires_at <= now() then now()+interval '1 hour' else limits.expires_at end returning hits into count_now;
  if count_now > 5 then return null; end if;
  insert into haku_home_private.booking_cases (performer_id,payload) values ((p_payload->>'performer_id')::uuid,p_payload - 'performer_id') returning id into request_id;
  insert into public.notifications (user_id,title,body,link)
  select id,'新しい出演依頼','HAKU事務局に出演依頼が届きました。管理画面で確認してください。','/haku-admin?section=bookings'
  from public.profiles p where p.role = 'admin' and p.status = 'active' and exists (select 1 from public.admin_members m where m.user_id=p.id and m.status='active' and m.permission in ('admin','super_admin'));
  return request_id;
end $$;
create function public.home_manage_cases(p_id uuid default null, p_status text default null, p_query text default '', p_filter text default '', p_actor uuid default null) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  if p_actor is null then raise exception 'office actor required'; end if;
  if p_id is not null then
    update haku_home_private.booking_cases set status=p_status, updated_at=now(),
      retention_due_at=case when p_status='declined' then least(retention_due_at,now()+interval '90 days') else retention_due_at end,
      hold_basis=case when p_status in ('quoting','booked') then coalesce(hold_basis,'statutory_review') else hold_basis end,
      hold_review_due_at=case when p_status in ('quoting','booked') then coalesce(hold_review_due_at,now()+interval '30 days') else hold_review_due_at end
    where id=p_id and anonymized_at is null;
    if not found then raise exception 'case not found or erased'; end if;
    insert into haku_home_private.case_audit(case_id,actor_id,action) values(p_id,p_actor,'status');
  else
    -- Never record search text, which can itself contain requester PII.
    insert into haku_home_private.case_audit(actor_id,action) values(p_actor,'list');
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
revoke all on function public.home_add_asset(jsonb), public.home_submit_booking(jsonb,text), public.home_manage_cases(uuid,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.home_add_asset(jsonb), public.home_submit_booking(jsonb,text), public.home_manage_cases(uuid,text,text,text,uuid) to service_role;


-- Triggers touch only new feature records. SECURITY DEFINER is necessary for
-- cascades/profile soft-delete from callers without feature-table write rights.
-- No standalone browser or service invocation; fixed empty search_path.
create function haku_home_private.queue_deleted_asset() returns trigger language plpgsql security definer set search_path='' as $$
declare path text;
begin
  foreach path in array array[old.object_path,old.thumbnail_path] loop
    if path is not null then
      insert into haku_home_private.storage_cleanup(path_hash,object_path,performer_id)
      values (encode(sha256(convert_to(path,'UTF8')),'hex'),path,old.performer_id) on conflict do nothing;
    end if;
  end loop;
  return old;
end $$;
create trigger home_asset_cleanup after delete on public.performer_home_assets for each row execute function haku_home_private.queue_deleted_asset();
create function haku_home_private.on_profile_deleted() returns trigger language plpgsql security definer set search_path='' as $$
begin
  delete from public.performer_home_assets where performer_id=new.id;
  delete from public.performer_homepages where performer_id=new.id;
  delete from haku_home_private.asset_locks where performer_id=new.id;
  return new;
end $$;
create trigger home_profile_deleted after update of status on public.profiles for each row
when (new.status::text='deleted' and old.status is distinct from new.status) execute function haku_home_private.on_profile_deleted();
revoke all on function haku_home_private.queue_deleted_asset(),haku_home_private.on_profile_deleted() from public,anon,authenticated,service_role;

create function public.home_claim_cleanup(p_owner uuid default null, p_limit integer default 50) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
  with batch as (
    select path_hash from haku_home_private.storage_cleanup
    where processed_at is null and (lease_until is null or lease_until < now()) and (p_owner is null or performer_id=p_owner)
    order by created_at limit greatest(1,least(p_limit,100)) for update skip locked
  ), claimed as (
    update haku_home_private.storage_cleanup q set lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes'
    from batch b where q.path_hash=b.path_hash returning q.path_hash,q.object_path,q.lease_token
  ) select coalesce(jsonb_agg(to_jsonb(claimed)),'[]') into result from claimed;
  return result;
end $$;
create function public.home_ack_cleanup(p_hash text,p_token uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
  update haku_home_private.storage_cleanup set processed_at=now(),object_path=null,performer_id=null,lease_token=null,lease_until=null
    where path_hash=p_hash and lease_token=p_token and processed_at is null;
  return found;
end $$;
create function public.home_case_privacy(p_id uuid,p_actor uuid,p_action text,p_basis text default null) returns void language plpgsql security invoker set search_path='' as $$
declare item haku_home_private.booking_cases;
begin
  if p_actor is null then raise exception 'office actor required'; end if;
  select * into item from haku_home_private.booking_cases where id=p_id for update;
  if not found or item.anonymized_at is not null then raise exception 'case not found or erased'; end if;
  if p_action='hold' and p_basis in ('statutory_record','dispute') then
    update haku_home_private.booking_cases set hold_basis=p_basis,hold_review_due_at=now()+interval '30 days' where id=p_id;
  elsif p_action='release_hold' then
    -- Office must first preserve legally required documents in its approved record system.
    update haku_home_private.booking_cases set hold_basis=null,hold_review_due_at=null where id=p_id;
  elsif p_action='erase' then
    if item.hold_basis is not null then raise exception 'legal hold requires review'; end if;
    update haku_home_private.booking_cases set payload='{}',performer_id=null,anonymized_at=now(),updated_at=now() where id=p_id;
  else raise exception 'invalid privacy action'; end if;
  insert into haku_home_private.case_audit(case_id,actor_id,action) values(p_id,p_actor,p_action);
end $$;
create function public.home_retention(p_actor uuid,p_execute boolean default false,p_limit integer default 100) returns jsonb language plpgsql security invoker set search_path='' as $$
declare due_count integer; held_count integer; cleaned integer:=0; item record;
begin
  if p_actor is null then raise exception 'office actor required'; end if;
  select count(*) into due_count from haku_home_private.booking_cases where anonymized_at is null and hold_basis is null and retention_due_at<=now();
  select count(*) into held_count from haku_home_private.booking_cases where anonymized_at is null and hold_basis is not null and hold_review_due_at<=now();
  if p_execute then
    for item in select id from haku_home_private.booking_cases where anonymized_at is null and hold_basis is null and retention_due_at<=now()
      order by retention_due_at limit greatest(1,least(p_limit,100)) for update skip locked
    loop
      update haku_home_private.booking_cases set payload='{}',performer_id=null,anonymized_at=now(),updated_at=now() where id=item.id;
      insert into haku_home_private.case_audit(case_id,actor_id,action) values(item.id,p_actor,'retention');
      cleaned:=cleaned+1;
    end loop;
    -- Minimized operational audit: one year; preserve audit for unresolved legal holds.
    delete from haku_home_private.case_audit a where a.created_at < now()-interval '365 days'
      and not exists(select 1 from haku_home_private.booking_cases c where c.id=a.case_id and c.hold_basis is not null);
    delete from haku_home_private.booking_cases where anonymized_at < now()-interval '365 days';
  end if;
  return jsonb_build_object('due',due_count,'held_overdue',held_count,'processed',cleaned);
end $$;
revoke all on function public.home_claim_cleanup(uuid,integer),public.home_ack_cleanup(text,uuid),public.home_case_privacy(uuid,uuid,text,text),public.home_retention(uuid,boolean,integer) from public,anon,authenticated;
grant execute on function public.home_claim_cleanup(uuid,integer),public.home_ack_cleanup(text,uuid),public.home_case_privacy(uuid,uuid,text,text),public.home_retention(uuid,boolean,integer) to service_role;
-- Explicit grants for all new private tables, including cleanup and audit. No old-table DML grants.
grant all on haku_home_private.asset_locks,haku_home_private.storage_cleanup,haku_home_private.case_audit to service_role;
commit;
