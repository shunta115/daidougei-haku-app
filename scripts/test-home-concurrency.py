"""Local PG17 only: creates/stops a new throwaway cluster; never accepts a DB URL."""
import json, os, pathlib, shutil, subprocess, tempfile

root=pathlib.Path(__file__).resolve().parent.parent
pgbin=pathlib.Path(os.environ.get('HAKU_LOCAL_PG_BIN','/usr/local/opt/postgresql@17/bin'))
if not (pgbin/'initdb').is_file(): raise SystemExit('Set HAKU_LOCAL_PG_BIN to installed PostgreSQL 17 binaries.')
work=pathlib.Path(tempfile.mkdtemp(prefix='haku-pr103-isolated-'))
port='55983'
args=[str(pgbin/'psql'),'-X','-qAt','-v','ON_ERROR_STOP=1','-h',str(work),'-p',port,'-d','postgres']
owner='10000000-0000-4000-8000-000000000001'
checks=[]
def sql(text):
 return subprocess.run(args,input=text,text=True,capture_output=True,check=True).stdout.strip()
def row(n):
 return json.dumps(dict(id=f'40000000-0000-4000-8000-{n:012d}',performer_id=owner,kind='photo',title=f'local {n}',object_path=f'{owner}/40000000-0000-4000-8000-{n:012d}.jpg',bytes=100))
def transaction(body): return 'begin;set local role service_role;'+body+';select pg_sleep(0.5);commit;'
started=False
try:
 subprocess.run([str(pgbin/'initdb'),'-D',str(work/'data'),'-A','trust','--no-locale'],check=True,stdout=subprocess.DEVNULL)
 subprocess.run([str(pgbin/'pg_ctl'),'-D',str(work/'data'),'-l',str(work/'server.log'),'-o',f"-k {work} -h '' -p {port} -F",'-w','start'],check=True,stdout=subprocess.DEVNULL)
 started=True
 sql((root/'tests/fixtures/official-home/schema.sql').read_text())
 sql((root/'supabase/migrations/20261030213928_performer_official_home.sql').read_text())
 assert sql("select has_any_column_privilege('service_role','public.performers','UPDATE')")=='f'
 checks.append('service_role still has no performers UPDATE privilege')
 for n in range(19): sql("set role service_role;select public.home_add_asset('%s'::jsonb)"%row(n))
 first=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 second=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 first.stdin.write(transaction("select public.home_add_asset('%s'::jsonb)"%row(19)));first.stdin.close()
 second.stdin.write(transaction("select public.home_add_asset('%s'::jsonb)"%row(20)));second.stdin.close()
 first.wait(timeout=15);second.wait(timeout=15)
 assert sum(p.returncode==0 for p in [first,second])==1
 assert sql('select count(*) from public.performer_home_assets')=='20'
 checks.append('two real sessions race for final photo slot: exactly one succeeds, count stays 20')
 procs=[]
 for n in [0,1]:
  p=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  p.stdin.write(transaction(f"select public.home_set_main('{owner}','40000000-0000-4000-8000-{n:012d}')"));p.stdin.close();procs.append(p)
 for p in procs:p.wait(timeout=15)
 assert all(p.returncode==0 for p in procs)
 assert sql('select count(*) from public.performer_home_assets where is_main')=='1'
 checks.append('concurrent main selection serializes without uniqueness errors; exactly one main')
 identifiers=sql('select id from public.performer_home_assets order by sort_order').splitlines()[::-1]
 id_sql=','.join("'%s'::uuid"%value for value in identifiers)
 sql(f"set role service_role;select public.home_reorder_assets('{owner}','photo',array[{id_sql}])")
 assert sql('select id from public.performer_home_assets order by sort_order').splitlines()==identifiers
 checks.append('reorder succeeds under restricted service_role')
 assert sql("set role service_role;select count(permission) from admin_members")=='1'
 denied=subprocess.run(args,input='set role service_role;select email from admin_members;',text=True,capture_output=True)
 assert denied.returncode!=0
 checks.append('office membership lookup works; membership email stays denied')
 report={'scope':'new isolated PostgreSQL cluster, Unix socket only; no remote DB', 'checks':checks,'passed':len(checks)}
 output=root/'artifacts/official-home/revision-concurrency.json';output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps(report,indent=2))
finally:
 if started:subprocess.run([str(pgbin/'pg_ctl'),'-D',str(work/'data'),'-m','immediate','-w','stop'],stdout=subprocess.DEVNULL,check=False)
 # Only this script's freshly created, marked temporary directory is removed.
 if work.name.startswith('haku-pr103-isolated-'):shutil.rmtree(work)
