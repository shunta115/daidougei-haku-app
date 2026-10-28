#!/usr/bin/env node
// HAKU local HLS probe. SAFETY: cannot make non-loopback requests.
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export function validateOptions({ url, viewers, seconds }) {
  const target = new URL(url);
  if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) {
    throw new Error('Local-only: http://127.0.0.1, localhost, or [::1] required');
  }
  if (!Number.isInteger(viewers) || viewers < 1 || viewers > 500) throw new Error('viewers must be integer 1..500');
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) throw new Error('seconds must be integer 1..3600');
  if (viewers > 5 && process.env.HAKU_LOCAL_LOAD_APPROVED !== 'YES') {
    throw new Error('More than five test clients require HAKU_LOCAL_LOAD_APPROVED=YES');
  }
  return target;
}

export function segmentUrls(playlist, manifestUrl) {
  if (!playlist.startsWith('#EXTM3U')) throw new Error('Not an HLS playlist');
  const manifest = new URL(manifestUrl);
  const paths = playlist.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
  const urls = [];
  for (const path of paths) {
    const uri = new URL(path, manifest);
    if (uri.origin !== manifest.origin || !['.ts','.m4s','.mp4'].some(ext => uri.pathname.endsWith(ext))) {
      throw new Error('Cross-origin or non-segment playlist URI rejected: ' + uri);
    }
    urls.push(uri.href);
  }
  return urls;
}

export async function runProbe(options) {
  const target=validateOptions(options);
  const start=Date.now();
  const deadline=start+options.seconds*1000;
  const stats={viewers:options.viewers, seconds:options.seconds, playlistRequests:0, segments:0, bytes:0, errors:0, firstSegmentMs:[], requestMs:[]};
  async function get(url) {
    const u = new URL(url);
    if (u.origin !== target.origin) throw new Error('Cross-origin fetch prevented');
    const t=Date.now();
    const response=await fetch(url, {signal:AbortSignal.timeout(3000),cache:'no-store',redirect:'error'});
    if (!response.ok) throw new Error('HTTP '+response.status+' '+url);
    const data=await response.arrayBuffer();
    stats.requestMs.push(Date.now()-t);
    return new Uint8Array(data);
  }
  async function viewer() {
    const seen=new Set();
    let first=true;
    while (Date.now()<deadline) {
      try {
        const playlist=new TextDecoder().decode(await get(target.href));
        stats.playlistRequests++;
        for (const uri of segmentUrls(playlist, target.href)) {
          if (seen.has(uri) || Date.now()>=deadline) continue;
          const data=await get(uri);
          seen.add(uri);
          stats.bytes+=data.length;
          stats.segments++;
          if (first) {stats.firstSegmentMs.push(Date.now()-start);first=false;}
        }
      } catch (error) {stats.errors++;}
      const delay=Math.min(1500,deadline-Date.now());
      if (delay>0) await sleep(delay);
    }
  }
  await Promise.all(Array.from({length:options.viewers},()=>viewer()));
  const values=[...stats.requestMs].sort((a,b)=>a-b);
  return {...stats, requestP95Ms:values.length ? values[Math.ceil(values.length*0.95)-1]:null, viewersWithFirstSegment:stats.firstSegmentMs.length};
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const options={url:'http://127.0.0.1:8080/live/test.m3u8',viewers:5,seconds:10};
  for(const arg of process.argv.slice(2)) {
    const m=/^--(url|viewers|seconds)=(.+)$/.exec(arg);
    if(!m) throw new Error('Unknown argument '+arg);
    options[m[1]]=m[1]==='url'?m[2]:Number(m[2]);
  }
  console.log(JSON.stringify(await runProbe(options),null,2));
}