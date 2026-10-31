"""Starts only an isolated /private/tmp PostgreSQL, never a connected Supabase project."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import subprocess, tempfile, json
PG=Path('/usr/local/opt/postgresql@17/bin')
root=Path(tempfile.mkdtemp(prefix='haku-live-likes-pg-',dir='/private/tmp'))
def cmd(*args):return subprocess.run([str(x) for x in args],capture_output=True,text=True,check=True)
cmd(PG/'initdb','-D',root/'data','-A','trust','--no-locale','-E','UTF8')
cmd(PG/'pg_ctl','-D',root/'data','-l',root/'postgres.log','-o',f"-h '' -k {root} -p 55879",'start')
def sql(text,check=True):
 r=subprocess.run([str(PG/'psql'),'-X','-v','ON_ERROR_STOP=1','-h',str(root),'-p','55879','-d','postgres','-Atc',text],capture_output=True,text=True)
 if check and r.returncode:raise RuntimeError(r.stderr)
 return r
p='10000000-0000-4000-8000-000000000001';a='10000000-0000-4000-8000-000000000002';b='10000000-0000-4000-8000-000000000003';epoch='2026-10-31T00:00:00Z'
def send(actor,batch,count=1):
 return sql(f"begin;set local role authenticated;set local request.jwt.claim.sub='{actor}';select record_live_likes('{p}','{epoch}','20000000-0000-4000-8000-{batch:012d}',{count});commit;",False)
results=[]
try:
 sql(f"""create schema auth;create role anon;create role authenticated;grant usage on schema public,auth to anon,authenticated;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select '{{}}'::jsonb$$;
 create table profiles(id uuid primary key,status text);create table performers(id uuid primary key,is_live boolean,is_approved boolean,is_private_test boolean,live_started_at timestamptz);
 grant select on performers to anon,authenticated;insert into profiles values('{a}','active'),('{b}','active');insert into performers values('{p}',true,true,false,'{epoch}');""")
 sql(Path('supabase/migrations/20261031030528_durable_live_likes.sql').read_text())
 with ThreadPoolExecutor(2) as pool:rows=list(pool.map(lambda _:send(a,1,5),range(2)))
 assert all(r.returncode==0 for r in rows),[r.stderr for r in rows]
 assert sql('select total from live_like_totals').stdout.strip()=='5';results.append('simultaneous duplicate commits count once')
 with ThreadPoolExecutor(2) as pool:
  f1=pool.submit(send,a,2,4);f2=pool.submit(send,b,1,3)
  assert f1.result().returncode==f2.result().returncode==0
 assert sql('select total from live_like_totals').stdout.strip()=='12';results.append('simultaneous different users aggregate exactly')
 # A writer holding the performer lock ends first; a delayed like must fail.
 with ThreadPoolExecutor(2) as pool:
  close=pool.submit(sql,f"begin;update performers set is_live=false where id='{p}';select pg_sleep(0.5);commit;")
  import time;time.sleep(.2)
  late=pool.submit(send,b,3,1)
  close.result();assert late.result().returncode!=0
 assert sql('select total from live_like_totals').stdout.strip()=='12'
 assert sql('select is_live from performers').stdout.strip()=='f';results.append('end-before-delivery rejects late batch without resurrecting session')
 print(json.dumps({'engine':'PostgreSQL 17 local independent connections','passed':results,'productionAccess':False},indent=2))
finally:
 cmd(PG/'pg_ctl','-D',root/'data','stop','-m','fast')
