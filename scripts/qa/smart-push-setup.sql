-- TEST ONLY: apply to aeqskxxykzapgaudbeqa after checking the project ID.
-- No real provider calls. Definer is outside the exposed API schema.
begin;
create schema if not exists haku_smart_push_qa;
revoke all on schema haku_smart_push_qa from public,anon;
grant usage on schema haku_smart_push_qa to authenticated;
create or replace function haku_smart_push_qa.session_probe(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e uuid; d record; n integer:=0; own_id uuid:=auth.uid();
begin
  if own_id is null or coalesce((auth.jwt()->'app_metadata'->>'smart_push_qa')::boolean,false) is not true then raise exception 'qa_identity_required' using errcode='42501'; end if;
  if not exists(select 1 from public.live_sessions where id=p_session_id and performer_id=own_id) then raise exception 'not_owner' using errcode='42501'; end if;
  e:=public.enqueue_live_start_push(p_session_id,own_id);
  if e is null then return jsonb_build_object('enqueued',false,'claimed',0,'providerCalls',0); end if;
  for d in select * from public.claim_live_start_push_deliveries(e,5) loop
    if d.endpoint not like 'https://push.invalid/smart-%' or d.payload->>'performerId'<>own_id::text then raise exception 'non_synthetic_target'; end if;
    n:=n+1;
  end loop;
  return jsonb_build_object('enqueued',true,'claimed',n,'ownPerformerOnly',true,'providerCalls',0);
end; $$;
revoke all on function haku_smart_push_qa.session_probe(uuid) from public,anon;
grant execute on function haku_smart_push_qa.session_probe(uuid) to authenticated;
create or replace function public.qa_smart_push_session(p_session_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select haku_smart_push_qa.session_probe(p_session_id) $$;
revoke all on function public.qa_smart_push_session(uuid) from public,anon;
grant execute on function public.qa_smart_push_session(uuid) to authenticated;
commit;
