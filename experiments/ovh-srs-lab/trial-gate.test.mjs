import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateTrial} from './trial-gate.mjs';
test('missing real bandwidth fails closed',()=>assert.equal(evaluateTrial().reason,'measured_bandwidth_missing'));
test('missing real playback metrics fails closed',()=>assert.equal(evaluateTrial({measuredMbps:1000}).reason,'real_quality_measurements_missing'));
test('500 viewers require about 487.6Mbps',()=>assert.ok(Math.abs(evaluateTrial({measuredMbps:1000}).requiredMbps-487.6)<0.001));
test('ideal synthetic values are not substituted for real trial',()=>assert.equal(evaluateTrial({measuredMbps:1000,startupSuccessRate:1,rebufferSeconds:0,errorRate:0}).pass,true));
test('insufficient bandwidth rejects',()=>assert.equal(evaluateTrial({measuredMbps:600,startupSuccessRate:1,rebufferSeconds:0,errorRate:0}).pass,false));
