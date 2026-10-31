-- ONLY aeqskxxykzapgaudbeqa. SQL roles/claims test, not a real Auth/Realtime test.
-- Every synthetic user and row is rolled back; no existing data is deleted.
begin;
set local statement_timeout='25s';
select set_config('haku115.p',gen_random_uuid()::text,true),set_config('haku115.a',gen_random_uuid()::text,true),set_config('haku115.b',gen_random_uuid()::text,true),set_config('haku115.op',gen_random_uuid()::text,true),set_config('haku115.batch',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data) values
 (current_setting('haku115.p')::uuid,'haku115-performer@example.invalid','{"role":"performer","display_name":"HAKU115 rollback only"}'),
 (current_setting('haku115.a')::uuid,'haku115-a@example.invalid','{"role":"fan"}'),
 (current_setting('haku115.b')::uuid,'haku115-b@example.invalid','{"role":"fan"}');
update public.profiles set status='active' where id=current_setting('haku115.p')::uuid;
update public.performers set is_approved=true,is_private_test=false where id=current_setting('haku115.p')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('haku115.p'),true), set_config('request.jwt.claims',json_build_object('sub',current_setting('haku115.p'),'role','authenticated')::text,true);
select set_config('haku115.session',public.reserve_direct_live(current_setting('haku115.p')::uuid,current_setting('haku115.op')::uuid,'Integration115 rollback only')::text,true);
select public.activate_direct_live(current_setting('haku115.p')::uuid,current_setting('haku115.session')::uuid,current_setting('haku115.op')::uuid);
with added as (insert into public.live_schedules(performer_id,title,scheduled_start_at) values(current_setting('haku115.p')::uuid,'Rollback schedule',now()+interval '1 hour') returning id) select set_config('haku115.schedule',(select id::text from added),true);
select set_config('haku115.epoch',(select live_started_at::text from public.performers where id=current_setting('haku115.p')::uuid),true);
select set_config('request.jwt.claim.sub',current_setting('haku115.a'),true), set_config('request.jwt.claims',json_build_object('sub',current_setting('haku115.a'),'role','authenticated')::text,true);
insert into public.live_reservations(live_schedule_id,user_id) values(current_setting('haku115.schedule')::uuid,current_setting('haku115.a')::uuid);
do $$ begin
 if public.record_live_likes(current_setting('haku115.p')::uuid,current_setting('haku115.epoch')::timestamptz,current_setting('haku115.batch')::uuid,5) <> 5 then raise exception 'first total mismatch'; end if;
 if public.record_live_likes(current_setting('haku115.p')::uuid,current_setting('haku115.epoch')::timestamptz,current_setting('haku115.batch')::uuid,5) <> 5 then raise exception 'duplicate counted'; end if;
 begin
  insert into public.live_like_totals values(current_setting('haku115.p')::uuid,now(),99);
  raise exception 'direct write allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform public.home_add_asset('{}'::jsonb);
  raise exception 'client home RPC allowed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('haku115.b'),true),set_config('request.jwt.claims',json_build_object('sub',current_setting('haku115.b'),'role','authenticated')::text,true);
insert into public.live_reservations(live_schedule_id,user_id) values(current_setting('haku115.schedule')::uuid,current_setting('haku115.b')::uuid);
do $$ begin if (select count(*) from public.live_reservations where live_schedule_id=current_setting('haku115.schedule')::uuid) <> 1 then raise exception 'other fan reservation exposed'; end if; end $$;
do $$ begin
 if public.record_live_likes(current_setting('haku115.p')::uuid,current_setting('haku115.epoch')::timestamptz,current_setting('haku115.batch')::uuid,3) <> 8 then raise exception 'second actor aggregate mismatch'; end if;
 begin
  perform public.finish_direct_live(current_setting('haku115.p')::uuid,current_setting('haku115.session')::uuid);
  raise exception 'nonowner end allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
select public.home_add_asset(jsonb_build_object('id',gen_random_uuid(),'performer_id',current_setting('haku115.p'),'kind','video','title','Rollback test video','video_id','yk6Kjl0WHWs','bytes',0));
reset role;
set local role authenticated;
-- This fan cannot read the performer's owned-only home assets.
do $$ begin if exists(select 1 from public.performer_home_assets where performer_id=current_setting('haku115.p')::uuid) then raise exception 'home assets exposed'; end if; end $$;
select set_config('request.jwt.claim.sub',current_setting('haku115.p'),true),set_config('request.jwt.claims',json_build_object('sub',current_setting('haku115.p'),'role','authenticated')::text,true);
do $$ begin if (select count(*) from public.performer_home_assets where performer_id=current_setting('haku115.p')::uuid) <> 1 then raise exception 'owner assets unavailable'; end if; end $$;
do $$ begin if public.notify_live_reservations_started(current_setting('haku115.schedule')::uuid,current_setting('haku115.session')::uuid) <> 2 then raise exception 'reservation notifications missing'; end if; end $$;
select public.finish_direct_live(current_setting('haku115.p')::uuid,current_setting('haku115.session')::uuid);
select set_config('request.jwt.claim.sub',current_setting('haku115.a'),true),set_config('request.jwt.claims',json_build_object('sub',current_setting('haku115.a'),'role','authenticated')::text,true);
do $$ begin
 begin
  perform public.record_live_likes(current_setting('haku115.p')::uuid,current_setting('haku115.epoch')::timestamptz,gen_random_uuid(),1);
  raise exception 'late likes accepted';
 exception when sqlstate '55000' then null; end;
end $$;
reset role;
select json_build_object('passed',14,'transport','remote TEST PostgreSQL SQL roles/claims; no real Auth JWT or Realtime','checks',array['atomic lifecycle','owner schedule create','two fans reserve','reservation RLS isolation','two start notifications','duplicate batch once','direct writes denied','client home RPC denied','two actors total eight','nonowner end denied','service-only asset RPC','fan asset RLS denied','owner asset RLS allowed','ended session rejects likes'],'rolledBack',true) as result;
rollback;
