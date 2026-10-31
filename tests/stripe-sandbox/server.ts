import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { createServer as createViteServer } from 'vite'
import { loadTestEnvironment } from './environment'
loadTestEnvironment()
const secret = readFileSync('/private/tmp/haku-pr112-webhook.log','utf8').match(/whsec_[A-Za-z0-9_]+/)?.[0]
if (!secret) throw new Error('sandbox_listener_signature_secret_required')
process.env.STRIPE_WEBHOOK_SECRET = secret
const { default: tip } = await import('../../api/stripe/tip')
const { default: webhook } = await import('../../api/stripe/webhook')
const { default: confirm } = await import('../../api/stripe/confirm')
const { getStripe } = await import('../../api/stripe/_shared')
const existing = await getStripe().checkout.sessions.list({limit:1})
if (existing.data.some(session => session.livemode)) throw new Error('live_stripe_session_refused')
const vite = await createViteServer({server:{middlewareMode:true}, appType:'spa'})
const server = createServer(async (req:any,res:any) => {
  const url = new URL(req.url,'http://127.0.0.1:4196')
  res.status=(code:number)=>{res.statusCode=code;return res}
  res.json=(data:unknown)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return res}
  req.query=Object.fromEntries(url.searchParams)
  if(url.pathname==='/api/livekit/status') return res.json({configured:false})
  if(['/api/stripe/tip','/api/stripe/confirm'].includes(url.pathname)) {
    const chunks=[];for await(const chunk of req)chunks.push(chunk)
    try {req.body=JSON.parse(Buffer.concat(chunks).toString()||'{}')}catch{return res.status(400).json({code:'invalid_payment_request'})}
    return url.pathname.endsWith('/tip') ? tip(req,res) : confirm(req,res)
  }
  if(url.pathname==='/api/stripe/webhook') return webhook(req,res)
  if(url.pathname.startsWith('/api/')) return res.status(503).json({error:'external_media_disabled_for_payment_test'})
  vite.middlewares(req,res)
})
server.listen(4196,'127.0.0.1',()=>console.log(JSON.stringify({ready:true,stripeMode:'test',db:'aeqskxxykzapgaudbeqa',media:'disabled'})))
