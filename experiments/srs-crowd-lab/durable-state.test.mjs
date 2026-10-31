import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { openSqliteCrowdStore } from './state-store.mjs';
import { makeSrsCrowdGate } from './publish-gate.mjs';
import { makeWatchTickets } from './hls-access.mjs';
const owner={id:'10000000-0000-4000-8000-000000000001',role:'performer',approved:true,active:true};
const fan={id:'20000000-0000-4000-8000-000000000001',role:'fan',approved:false,active:true};
const next={id:'30000000-0000-4000-8000-000000000001',role:'fan',approved:false,active:true};
const viewer={id:'40000000-0000-4000-8000-000000000001',role:'fan',approved:false,active:true};
function fixture(t,callbacks={}){
 const dir=mkdtempSync(join(tmpdir(),'haku-crowd-durable-'));const file=join(dir,'state.sqlite');const stores=[];
 t.after(()=>{for(const store of stores)try{store.close()}catch{}rmSync(dir,{recursive:true,force:true})});
 const gate=()=>{const store=openSqliteCrowdStore(file);stores.push(store);return makeSrsCrowdGate({store,openMedia:async()=>({answer:'v=0 PRIVATE_SDP_MUST_NOT_PERSIST'}),closeMedia:async()=>{},...callbacks})};
 return {gate,file};
}
async function armed(gate){const room=gate.create(owner);await gate.consent(owner,room.id,true);const qr=gate.qr(owner,room.id);return {room,qr,grant:gate.request(fan,room.id,'camera-a',qr.token,true)}}

test('restart preserves QR identity, one-time grant, media fence and signing key',async t=>{
 const {gate,file}=fixture(t);const a=gate(),b=gate();const {room,grant}=await armed(a);
 await b.publish(fan,room.id,'camera-a',grant.nonce,grant.epoch,'v=0');
 const restarted=gate();assert.equal(restarted.state(owner,room.id).phase,'live');
 assert.deepEqual(restarted.watchSecret(),a.watchSecret());
 await assert.rejects(restarted.publish(fan,room.id,'camera-a',grant.nonce,grant.epoch,'v=0'));
 await restarted.stop(owner,room.id);assert.equal(a.state(owner,room.id).phase,'ended');
 assert.equal(readFileSync(file).includes(Buffer.from('PRIVATE_SDP_MUST_NOT_PERSIST')),false);
});

test('two workers claim a publish grant exactly once',async t=>{
 let opened=0;const {gate}=fixture(t,{openMedia:async()=>{opened++;await new Promise(r=>setTimeout(r,20));return {answer:'v=0'}}});
 const a=gate(),b=gate();const {room,grant}=await armed(a);
 const result=await Promise.allSettled([a,b].map(g=>g.publish(fan,room.id,'camera-a',grant.nonce,grant.epoch,'v=0')));
 assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.equal(opened,1);
});

test('stop during pending SRS open survives another worker and cannot resurrect media',async t=>{
 let finish;let closed=0;const {gate}=fixture(t,{openMedia:()=>new Promise(r=>{finish=r}),closeMedia:async()=>{closed++}});
 const a=gate(),b=gate();const {room,grant}=await armed(a);const pending=a.publish(fan,room.id,'camera-a',grant.nonce,grant.epoch,'v=0');
 assert.throws(()=>b.authorizeWatch(owner,room.id),/watch_not_authorized/);
 await assert.rejects(b.stop(owner,room.id),/srs_disconnect_unconfirmed/);
 const c=gate();assert.equal(c.state(owner,room.id).phase,'ended');assert.throws(()=>c.authorizeWatch(owner,room.id));
 finish({answer:'v=0'});await assert.rejects(pending,/publish_revoked/);assert.ok(closed>=2);
 assert.equal(c.canWatchClaim(fan.id,room.id,grant.epoch,null),false);
});

test('handoff remains fenced across restart until SRS disconnect succeeds',async t=>{
 let fail=false;const {gate}=fixture(t,{closeMedia:async()=>{if(fail)throw Error('SFU unavailable')}});const a=gate();const {room,qr,grant}=await armed(a);
 await a.publish(fan,room.id,'camera-a',grant.nonce,grant.epoch,'v=0');a.request(next,room.id,'camera-b',qr.token,true);
 fail=true;await assert.rejects(a.handoff(owner,room.id,'camera-b'),/srs_disconnect_unconfirmed/);
 const b=gate();assert.throws(()=>b.acknowledgeStop(fan,room.id,'camera-a'),/srs_disconnect_unconfirmed/);
 fail=false;await b.sweep();b.acknowledgeStop(fan,room.id,'camera-a');const nextGrant=b.authority.pendingGrant(next,room.id,'camera-b');
 await b.publish(next,room.id,'camera-b',nextGrant.nonce,nextGrant.epoch,'v=0');assert.equal(a.state(owner,room.id).publisherId,next.id);
});

test('public audience requires owner opt-in and tickets revoke durably on audience change',async t=>{
 const {gate}=fixture(t);const a=gate(),b=gate();const {room,grant}=await armed(a);await a.publish(fan,room.id,'camera-a',grant.nonce,grant.epoch,'v=0');
 assert.throws(()=>b.authorizeWatch(viewer,room.id),/watch_not_authorized/);assert.throws(()=>b.setAudience(viewer,room.id,true),/performer_only/);
 a.setAudience(owner,room.id,true);const access=b.authorizeWatch(viewer,room.id);const tickets=makeWatchTickets({secret:a.watchSecret()});
 const token=tickets.issue({roomId:room.id,actorId:viewer.id,epoch:access.epoch,audienceGeneration:access.audienceGeneration});
 const verify=()=>tickets.verify(token,room.id,b.state(owner,room.id),(...args)=>b.canWatchClaim(...args));assert.equal(verify(),true);
 a.setAudience(owner,room.id,false);assert.equal(verify(),false);a.setAudience(owner,room.id,true);assert.equal(verify(),false);
 await b.stop(owner,room.id);assert.equal(verify(),false);
});

test('SQLite transaction serializes independent Node processes without lost updates',async t=>{
 const {file}=fixture(t);const store=openSqliteCrowdStore(file);store.close();
 const moduleUrl=new URL('./state-store.mjs',import.meta.url).href;
 const code=`import {openSqliteCrowdStore} from ${JSON.stringify(moduleUrl)};const s=openSqliteCrowdStore(process.argv[1]);for(let i=0;i<40;i++)s.transaction(v=>{v.counter=(v.counter||0)+1});s.close()`;
 await Promise.all([0,1].map(()=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,['--input-type=module','-e',code,file],{stdio:['ignore','ignore','pipe']});let error='';p.stderr.on('data',x=>error+=x);p.on('error',reject);p.on('exit',status=>status===0?resolve():reject(Error(error)))})));
 const result=openSqliteCrowdStore(file);assert.equal(result.transaction(v=>v.counter),80);result.close();
});

test('daily creation cap and private-performer rejection persist independently of workers',async t=>{
 const {gate}=fixture(t);for(let i=0;i<3;i++){const g=gate();const room=g.create(owner);await g.stop(owner,room.id)}
 assert.throws(()=>gate().create(owner),/daily_live_limit/);
 assert.throws(()=>gate().create({...owner,id:viewer.id,isPrivateTest:true}),/private_live_not_supported/);
});
