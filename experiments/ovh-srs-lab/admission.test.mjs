import test from 'node:test';
import assert from 'node:assert/strict';
import {planAdmission} from './admission.mjs';
test('never assume advertised bandwidth proves 500-viewer readiness',()=>{
 const p=planAdmission({});
 assert.equal(p.allowed,false);
 assert.equal(p.reason,'real_network_benchmark_required');
 assert.equal(p.maxSimultaneousStreams,0);
 assert.ok(Math.abs(p.streamMbps-487.6)<0.00001);
});
test('one measured 1Gbps stream only with 35% headroom',()=>{
 const p=planAdmission({measuredSustainedMbps:1000});
 assert.equal(p.allowed,true);
 assert.equal(p.maxSimultaneousStreams,1);
 const full=planAdmission({measuredSustainedMbps:1000,simultaneousStreams:1});
 assert.equal(full.allowed,false);
 assert.equal(full.reason,'network_capacity_exhausted');
});
test('measured 1800Mbps may reserve only two streams with 35% headroom',()=>{
 const p=planAdmission({measuredSustainedMbps:1800});
 assert.equal(p.maxSimultaneousStreams,2);
 assert.equal(planAdmission({measuredSustainedMbps:1800,simultaneousStreams:2}).allowed,false);
});
test('reject 501 viewers and invalid settings',()=>{
 assert.equal(planAdmission({measuredSustainedMbps:2000,viewersPerStream:501}).reason,'viewer_limit_exceeded');
 assert.throws(()=>planAdmission({measuredSustainedMbps:1000,headroomFactor:1.2}),/invalid/);
 assert.throws(()=>planAdmission({measuredSustainedMbps:1000,simultaneousStreams:1.5}),/invalid/);
});
