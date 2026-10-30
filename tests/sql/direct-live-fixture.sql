-- Local ephemeral test cluster only. Never run against connected TEST/production.
create schema auth; create role anon; create role authenticated; create role service_role;
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema public,auth to authenticated,anon,service_role; grant execute on function auth.uid() to authenticated;
   create table public.profiles(id uuid primary key,role text,status text);
   create table public.performers(id uuid primary key,stage_name text,is_approved boolean,is_live boolean default false,
    live_started_at timestamptz, live_title text,stream_url text,share_location boolean default true,lat float,lng float,location_updated_at timestamptz);
   create table public.live_sessions(id uuid primary key default gen_random_uuid(),performer_id uuid references public.performers(id),
    title text,started_at timestamptz default now(),heartbeat_at timestamptz,ended_at timestamptz,ended_reason text,event_id uuid,venue_id text,event_slot_id uuid);
   create table public.event_slots(id uuid primary key,performer_id uuid,event_id uuid,venue_id text);
   create table public.notification_probe(id uuid);
   create function public.notify_followers_live_start(uuid,text,text) returns void language sql security definer set search_path = 'public' as $$ insert into public.notification_probe values($1) $$;
   insert into public.profiles values('10000000-0000-4000-8000-000000000001','performer','active'),('20000000-0000-4000-8000-000000000002','performer','active');
   insert into public.performers(id,stage_name,is_approved) values('10000000-0000-4000-8000-000000000001','HARIBOW TEST',true),('20000000-0000-4000-8000-000000000002','OTHER',false);
   grant select,insert,update,delete on all tables in schema public to authenticated;
