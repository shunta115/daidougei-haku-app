"""Real independent PostgreSQL sessions, private unix socket, no remote DB access.
Requires local PostgreSQL 17 binaries. Creates only a fresh /private/tmp cluster.
"""
import getpass, json, os, pathlib, subprocess, tempfile, time, shutil
ROOT=pathlib.Path(__file__).resolve().parents[2]
BIN=pathlib.Path('/usr/local/opt/postgresql@17/bin')
OWNER='10000000-0000-4000-8000-000000000001'
OTHER='20000000-0000-4000-8000-000000000002'
OP='30000000-0000-4000-8000-000000000003'
AUTH=f"set role authenticated; select set_config('request.jwt.claim.sub','{OWNER}',false);"
results=[]
with tempfile.TemporaryDirectory(prefix='haku-live-races-',dir='/private/tmp') as folder:
 env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
 base=[str(BIN/'psql'),'-X','-qAt','-v','ON_ERROR_STOP=1','-h',folder,'-p','54379','-U','haku_race_owner','-d','postgres']
 def sql(s,ok=True):
  p=subprocess.run(base,input=s,text=True,capture_output=True,env=env,timeout=15)
  if ok and p.returncode: raise AssertionError(p.stderr)
  if not ok: assert p.returncode, p.stdout
  return p.stdout.strip()
 def begin_locked():
  p=subprocess.Popen(base,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env)
  p.stdin.write(f"begin; select id from public.performers where id='{OWNER}' for update;\n\\echo LOCKED\n");p.stdin.flush()
  while True:
   line=p.stdout.readline()
   if line.strip()=='LOCKED': return p
   if not line: raise AssertionError(p.stderr.read())
 def waiter(stmt):
  p=subprocess.Popen(base,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env)
  p.stdin.write('select pg_backend_pid();\n'+stmt+'\n\\q\n');p.stdin.close()
  pid=int(p.stdout.readline().strip())
  deadline=time.monotonic()+5
  while time.monotonic()<deadline:
   if sql(f"select wait_event_type from pg_stat_activity where pid={pid}")=='Lock': return p
   if p.poll() is not None: raise AssertionError('race did not block: '+p.stdout.read()+p.stderr.read())
   time.sleep(.02)
  raise AssertionError('lock barrier timed out')
 def release(p,stmt):
  p.stdin.write(stmt+';commit;\n\\q\n');p.stdin.close();out=p.stdout.read();err=p.stderr.read();assert p.wait(timeout=10)==0,err
  return out.strip()
 def finish_wait(p,ok=True):
  out=p.stdout.read().strip();err=p.stderr.read();code=p.wait(timeout=10)
  assert (code==0)==ok,(out,err)
  return out if ok else err
 def prep(live=False):
  sql(f"select public.close_direct_live_session('{OWNER}',id,'test_reset') from public.direct_live_leases where ended_at is null")
  sid=sql(AUTH+f"select public.reserve_direct_live('{OWNER}','{OP}','LOCAL TEST')").splitlines()[-1]
  if live:sql(AUTH+f"select public.activate_direct_live('{OWNER}','{sid}','{OP}')")
  sql(f"update public.direct_live_leases set heartbeat_at=clock_timestamp()-interval '5 minutes',host_absent_since=clock_timestamp()-interval '121 seconds',host_last_absent_at=clock_timestamp() where id='{sid}'")
  return sid
 def renew(sid):return f"set role service_role;select public.renew_direct_live_lease('{OWNER}','{sid}','{OP}')"
 def observe(sid,stamp,host):return f"set role service_role;select public.observe_direct_live_host('{OWNER}','{sid}','{stamp}',{host})"
 def heartbeat(sid):return sql(f"select heartbeat_at::text from public.direct_live_leases where id='{sid}'")
 def live():return sql(f"select is_live from public.performers where id='{OWNER}'")
 subprocess.run([str(BIN/'initdb'),'-D',folder+'/data','-U','haku_race_owner','--auth=trust','--no-locale','-E','UTF8'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,check=True)
 subprocess.run([str(BIN/'pg_ctl'),'-D',folder+'/data','-l',folder+'/server.log','-o',f"-k {folder} -p 54379 -c listen_addresses=''",'-w','start'],env=env,stdout=subprocess.DEVNULL,check=True)
 try:
  sql((ROOT/'tests/sql/direct-live-fixture.sql').read_text())
  migration=(ROOT/'supabase/migrations/20261031010000_direct_live_lifecycle.sql').read_text()
  sql(migration);sql(migration)
  sid=prep();a=begin_locked();b=waiter('set role service_role;select public.expire_direct_live_leases()');release(a,renew(sid));assert finish_wait(b)=='0';results.append('renew wins preparation-expiry race')
  sid=prep();a=begin_locked();b=waiter(renew(sid));release(a,'select public.expire_direct_live_leases()');assert finish_wait(b)=='f';results.append('expiry wins: late renewal is false, no resurrection')
  sid=prep(True);old=heartbeat(sid);a=begin_locked();b=waiter(observe(sid,old,'false'));release(a,renew(sid));assert finish_wait(b)=='stale';assert live()=='t';assert sql(f"select l.heartbeat_at=s.heartbeat_at from public.direct_live_leases l join public.live_sessions s using(id) where l.id='{sid}'")=='t';results.append('renew wins LIVE absence race; atomic mirrored timestamp')
  sid=prep(True);old=heartbeat(sid);a=begin_locked();b=waiter(renew(sid));release(a,observe(sid,old,'false'));assert finish_wait(b)=='f';assert live()=='f';results.append('verified absence-end wins: no 200-equivalent renewal')
  sid=prep();a=begin_locked();b=waiter(AUTH+f"select public.activate_direct_live('{OWNER}','{sid}','{OP}')");release(a,f"select public.close_direct_live_session('{OWNER}','{sid}','test_end')");assert 'LIVE_SESSION_EXPIRED' in finish_wait(b,False);assert live()=='f';results.append('end wins activation race')
  sid=prep();a=begin_locked();b=waiter('set role service_role;select public.expire_direct_live_leases()');release(a,renew(sid)+';reset role;'+AUTH+f"select public.activate_direct_live('{OWNER}','{sid}','{OP}')");assert finish_wait(b)=='0';assert live()=='t';results.append('activation wins: stale preparing candidate cannot end LIVE')
  sid=prep(True);assert sql('set role service_role;select public.expire_direct_live_leases()')=='0';assert live()=='t'
  assert sql(observe(sid,heartbeat(sid),'true'))=='healthy';assert live()=='t';results.append('healthy SFU observation survives late browser heartbeat')
  sql(f"update public.direct_live_leases set heartbeat_at=clock_timestamp()-interval '5 minutes',host_absent_since=null where id='{sid}'")
  assert sql(observe(sid,heartbeat(sid),'false'))=='grace';assert sql(observe(sid,heartbeat(sid),'false'))=='grace';assert live()=='t'
  assert sql(observe(sid,heartbeat(sid),'null'))=='unknown';assert live()=='t'
  assert sql(observe(sid,heartbeat(sid),'true'))=='healthy';assert sql(f"select host_absent_since is null from public.direct_live_leases where id='{sid}'")=='t';results.append('reconnecting grace, unknown outage, recovery reset')
  sql(f"update public.direct_live_leases set heartbeat_at=clock_timestamp()-interval '5 minutes',host_absent_since=clock_timestamp()-interval '5 minutes',host_last_absent_at=clock_timestamp()-interval '46 seconds' where id='{sid}'")
  assert sql(observe(sid,heartbeat(sid),'false'))=='grace';assert live()=='t';results.append('gap in SFU evidence resets absence grace instead of ending')
  sql(migration,False);assert live()=='t';results.append('reapplying migration while LIVE aborts without state changes')
  funcs=["close_direct_live_session(uuid,uuid,text)","expire_direct_live_leases()","renew_direct_live_lease(uuid,uuid,uuid)","observe_direct_live_host(uuid,uuid,timestamptz,boolean)","notify_followers_live_start(uuid,text,text)"]
  for role in ['anon','authenticated']:
   for fn in funcs:assert sql(f"select has_function_privilege('{role}','public.{fn}','EXECUTE')")=='f',(role,fn)
  err=sql(f"set role authenticated;select set_config('request.jwt.claim.sub','{OTHER}',false);select public.finish_direct_live('{OWNER}','{sid}')",False)
  results.append('PUBLIC/anon/authenticated internal EXECUTE denied; foreign owner denied')
  # Native transactional failure: mirror failure must roll back the lease update too.
  sql("create function public.fail_mirror() returns trigger language plpgsql as $$ begin raise exception 'mirror_failure'; end $$; create trigger fail_mirror before update on public.live_sessions for each row execute function public.fail_mirror()")
  old=heartbeat(sid);sql(renew(sid),False);assert heartbeat(sid)==old;sql('drop trigger fail_mirror on public.live_sessions');results.append('mirror failure rolls renewal back')
  print(json.dumps({'engine':sql('select version()'),'cases':results,'count':len(results),'remoteDBUsed':False},indent=2))
 finally:
  subprocess.run([str(BIN/'pg_ctl'),'-D',folder+'/data','-m','immediate','-w','stop'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
