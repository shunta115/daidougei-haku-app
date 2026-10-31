-- LOCAL isolated-cluster fixture only. Never use as a remote seed.
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema storage;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.profiles(id uuid primary key, role text not null, status text not null);
create table public.performers(id uuid primary key references public.profiles(id) on delete cascade);
create table public.admin_members(user_id uuid primary key,permission text,status text,email text);
create table public.notifications(id uuid default gen_random_uuid(),user_id uuid,title text,body text,link text);
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit integer,allowed_mime_types text[]);
grant usage on schema public,auth to service_role,authenticated;
grant select on public.profiles,public.performers to service_role;
grant insert on public.notifications to service_role;
insert into public.profiles values('10000000-0000-4000-8000-000000000001','performer','active'),('20000000-0000-4000-8000-000000000002','performer','active'),('30000000-0000-4000-8000-000000000003','admin','active');
insert into public.performers values('10000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002');
insert into public.admin_members(user_id,permission,status) values('30000000-0000-4000-8000-000000000003','admin','active');
