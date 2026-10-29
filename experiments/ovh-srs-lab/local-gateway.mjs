// LOCAL ONLY: same-origin gateway for SRS WHIP and HLS.
// No external interface, dynamic upstream, production token or HAKU data.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';

const HERE=dirname(fileURLToPath(import.meta.url));
const MAX_SDP=128*1024;
export function classifyRequest(method,path) {
  if(method==='GET' && path==='/') return {file:'whip-local.html',type:'text/html; charset=utf-8'};
  if(method==='GET' && path==='/whip-publisher.mjs') return {file:'whip-publisher.mjs',type:'text/javascript; charset=utf-8'};
  if(method==='POST' && path==='/rtc/v1/whip/') return {port:1985,type:'whip'};
  if(method==='DELETE' && /^\/rtc\/v1\/whip\/[a-zA-Z0-9/_-]{1,150}$/.test(path)) return {port:1985,type:'whip-delete'};
  if(method==='GET' && /^\/live\/haku-lab(?:-[a-z0-9]+)?\.(?:m3u8|ts|m4s|mp4)$/.test(path)) return {port:8080,type:'hls'};
  return null;
}

export function makeGateway({host='127.0.0.1',port=4319,whipPort=1985,hlsPort=8080}={}) {
  if(host!=='127.0.0.1' || !Number.isInteger(port) || port<1 || port>65535) throw Error('local_only');
  const server=createServer(async(req,res)=>{
    const send=(status,body)=>{res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);};
    try {
      const localOrigin='http://127.0.0.1:'+(server.address()?.port||port);
      if(req.headers.host!==new URL(localOrigin).host || req.headers['sec-fetch-site']==='cross-site' ||
        (req.headers.origin && req.headers.origin!==localOrigin)) {send(403,'Local origin only');return;}
      const u=new URL(req.url||'/',localOrigin);
      const route=classifyRequest(req.method,u.pathname);
      if(!route || (u.search && route.file)) {send(404,'Not found');return;}
      if(route.file) {
        const data=await readFile(join(HERE,route.file));
        res.writeHead(200,{'Content-Type':route.type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
        res.end(data);return;
      }
      if(route.type==='whip') {
        if(u.searchParams.get('app')!=='live' || u.searchParams.get('stream')!=='haku-lab' || [...u.searchParams.keys()].some(k=>!['app','stream'].includes(k))) {send(403,'Invalid test stream');return;}
      } else if(u.search) {send(403,'Query not allowed');return;}
      const chunks=[];let size=0;
      if(req.method==='POST') {
        if(!String(req.headers['content-type']||'').startsWith('application/sdp')) {send(415,'SDP required');return;}
        for await(const chunk of req) {size+=chunk.length;if(size>MAX_SDP){send(413,'SDP too large');return;}chunks.push(chunk);}
      }
      const upstreamPort=route.port===1985?whipPort:hlsPort;
      const upstream='http://127.0.0.1:'+upstreamPort+u.pathname+u.search;
      const response=await fetch(upstream,{method:req.method,headers:req.method==='POST'?{'Content-Type':'application/sdp','Accept':'application/sdp'}:{},body:req.method==='POST'?Buffer.concat(chunks):undefined,redirect:'error',signal:AbortSignal.timeout(5000)});
      const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
      const type=response.headers.get('content-type');
      if(type)headers['Content-Type']=type;
      const location=response.headers.get('location');
      if(location) {
        const loc=new URL(location,upstream);
        if(loc.origin==='http://127.0.0.1:'+upstreamPort && /^\/rtc\/v1\/whip\/[a-zA-Z0-9/_-]{1,150}$/.test(loc.pathname)) headers.Location=loc.pathname;
      }
      res.writeHead(response.status,headers);
      res.end(Buffer.from(await response.arrayBuffer()));
    }catch(error){send(503,'Local SRS unavailable');}
  });
  return server;
}

if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) {
  const server=makeGateway();
  server.listen(4319,'127.0.0.1',()=>console.log('HAKU local-only gateway: http://127.0.0.1:4319/'));
}
