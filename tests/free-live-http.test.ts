import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import type { Server } from 'node:http'
import { request as httpRequest } from 'node:http'
// @ts-expect-error Node-only experimental server.
import { createLabServer } from '../experiments/free-live/server.mjs'

let server: Server, base = '', ownerToken = '', fanToken = '', roomId = ''
async function request(action: string, token: string, data = {}) {
  const res = await fetch(base + '/api/free-live', { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({action,roomId,peerId:'host-peer',...data}) })
  return { status:res.status, body:await res.json() }
}
beforeAll(async () => {
  server = createLabServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('missing test port')
  base = `http://127.0.0.1:${address.port}`
  ownerToken = (await request('login','',{fixtureId:'demo-performer'})).body.token
  fanToken = (await request('login','',{fixtureId:'demo-fan-1'})).body.token
})
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())) })
describe('local LIVE HTTP boundary', () => {
  it('advertises fixture authentication and rejects forged tokens', async () => {
    expect((await (await fetch(base + '/api/free-live')).json()).mode).toBe('local-fixtures')
    expect((await request('create','forged')).status).toBe(401)
    expect((await request('create',fanToken)).status).toBe(403)
    const created=await request('create',ownerToken); expect(created.status).toBe(200);roomId=created.body.id
  })
  it('rejects cross-origin writes and DNS rebinding hosts', async () => {
    const cross=await fetch(base+'/api/free-live',{method:'POST',headers:{Origin:'https://attacker.example','Content-Type':'application/json'},body:JSON.stringify({action:'login',fixtureId:'demo-performer'})})
    expect(cross.status).toBe(403)
    const rebound = await new Promise<number | undefined>(resolve => {
      const req=httpRequest(base+'/api/free-live',{headers:{Host:'attacker.example'}}, res=>{ res.resume();resolve(res.statusCode) });req.end()
    })
    expect(rebound).toBe(403)
  })
  it('completes publisher/viewer signaling and rejects a spoofed recipient', async () => {
    const grant=(await request('direct',ownerToken)).body
    expect((await request('claim',ownerToken,{nonce:grant.nonce,epoch:grant.epoch})).body.phase).toBe('live')
    expect((await request('join',fanToken,{peerId:'viewer-1'})).body.viewers).toBe(1)
    const msg={type:'offer',to:'viewer-1',targetId:'demo-fan-1',epoch:grant.epoch,sdp:{type:'offer',sdp:'test-only'}}
    expect((await request('signal',ownerToken,{message:{...msg,targetId:'demo-performer'}})).status).toBe(403)
    expect((await request('signal',ownerToken,{message:msg})).status).toBe(200)
    const poll=await request('poll',fanToken,{peerId:'viewer-1'})
    expect(poll.body.messages[0].senderId).toBe('demo-performer')
    expect((await request('poll',fanToken,{peerId:'viewer-1'})).body.messages).toEqual([])
    expect((await request('stop',ownerToken)).body.phase).toBe('ended')
    expect((await request('signal',ownerToken,{message:msg})).status).toBe(410)
  })
})
