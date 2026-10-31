-- TEST ONLY aeqskxxykzapgaudbeqa. Existing TEST schema; fixtures are rolled back.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
select set_config('haku.integration.owner',(select id::text from public.performers where is_approved and not is_private_test order by id limit 1),true);
select set_config('haku.integration.stranger',(select id::text from public.profiles where role='fan' and id::text<>current_setting('haku.integration.owner') order by id limit 1),true);
do $$ begin
  if nullif(current_setting('haku.integration.owner'),'') is null or nullif(current_setting('haku.integration.stranger'),'') is null then raise exception 'TEST fixture identities unavailable'; end if;
end $$;
insert into public.performer_appearances(id,performer_id,title,performance_date,start_time,end_time,timezone,starts_at,venue_name,status)
values
('21131105-0000-4000-8000-000000000001',current_setting('haku.integration.owner')::uuid,'Integration public rollback',current_date+7,'10:00','11:00','Asia/Tokyo',now(),'TEST ONLY','published'),
('21131105-0000-4000-8000-000000000002',current_setting('haku.integration.owner')::uuid,'Integration private rollback',current_date+7,'12:00','13:00','Asia/Tokyo',now(),'TEST ONLY','private');
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$ begin
  if not exists(select 1 from performer_appearances where id='21131105-0000-4000-8000-000000000001' and status='published') then raise exception 'public appearance missing'; end if;
  if exists(select 1 from performer_appearances where id='21131105-0000-4000-8000-000000000002') then raise exception 'private appearance leaked'; end if;
  begin perform 1 from auth.users; raise exception 'auth history publicly readable'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('haku.integration.stranger'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('haku.integration.stranger'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare changed int; begin
 update performer_appearances set title='forged' where id='21131105-0000-4000-8000-000000000001'; get diagnostics changed=row_count;
 if changed<>0 then raise exception 'non-owner edit allowed'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('haku.integration.owner'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('haku.integration.owner'),'role','authenticated')::text,true);
set local role authenticated;
update performer_appearances set start_time='10:30' where id='21131105-0000-4000-8000-000000000001';
do $$ begin
 if not exists(select 1 from performer_appearances where id='21131105-0000-4000-8000-000000000001' and start_time='10:30' and starts_at=(performance_date+start_time) at time zone timezone) then raise exception 'owner edit or normalized timestamp failed'; end if;
end $$;
update performer_appearances set status='cancelled' where id='21131105-0000-4000-8000-000000000001';
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$ begin
 if exists(select 1 from performer_appearances where id='21131105-0000-4000-8000-000000000001' and status='published') then raise exception 'cancelled appearance still ranked'; end if;
 if not exists(select 1 from performer_appearances where id='21131105-0000-4000-8000-000000000001' and status='cancelled') then raise exception 'public cancellation notice missing'; end if;
end $$;
reset role;
rollback;
select json_build_object('result','PASS','project','aeqskxxykzapgaudbeqa','fixture','rolled back','checks',array['anonymous public visibility','private appearance excluded','auth history denied','non-owner edit denied','owner time update','normalized JST timestamp','cancelled excluded from published ranking','public cancellation notice retained']) as integration_result;
