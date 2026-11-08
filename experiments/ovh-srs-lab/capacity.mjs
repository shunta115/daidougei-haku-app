#!/usr/bin/env node
// Planning arithmetic only; NO live endpoints, purchases or traffic.
const values = {viewers:500, videoKbps:800, audioKbps:48, overhead:0.15, hoursPerDay:3, days:30, performers:1, simultaneousStreams:1};
for (const argument of process.argv.slice(2)) {
  const m = /^--([a-z-]+)=(.+)$/.exec(argument);
  if (!m) throw Error('Invalid argument: ' + argument);
  const key = m[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
  if (!(key in values)) throw Error('Unknown setting: ' + key);
  const n = Number(m[2]);
  if (!Number.isFinite(n) || n < 0) throw Error('Invalid value: ' + argument);
  values[key] = n;
}
for (const key of ['viewers','days','performers','simultaneousStreams']) { if (!Number.isInteger(values[key])) throw Error(key+' must be integer'); }
const perViewerMbps=(values.videoKbps+values.audioKbps)*(1+values.overhead)/1000;
const downstreamMbps=values.viewers*perViewerMbps;
const gigabytesPerHour=downstreamMbps*3600/8000;
const report={inputs:values,perViewerMbps,downstreamMbps,peakMbps:downstreamMbps*values.simultaneousStreams,gigabytesPerHour,monthlyTerabytes:gigabytesPerHour*values.hoursPerDay*values.days*values.performers/1000,verified500Viewers:false};
console.log(JSON.stringify(report,null,2));
