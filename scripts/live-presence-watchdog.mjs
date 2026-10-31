// Run only on an existing approved TEST/production worker; never enabled by importing this file.
// Keep one observer per environment. Missing/failed observations cannot count as host absence.
const base = new URL(process.env.HAKU_WATCHDOG_ORIGIN || '')
if (base.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(base.hostname)) throw Error('HTTPS origin required')
if (base.pathname !== '/' || base.search || base.username || base.password) throw Error('Bare origin required')
const secret = process.env.CRON_SECRET
if (!secret) throw Error('CRON_SECRET required')
const interval = 25_000
let stopping = false
process.on('SIGINT', () => { stopping = true })
process.on('SIGTERM', () => { stopping = true })
do {
  const started = Date.now()
  try {
    const response = await fetch(new URL('/api/livekit/presence', base), {
      headers: { Authorization: `Bearer ${secret}` }, redirect: 'error', signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) console.error(`watchdog HTTP ${response.status}; no absence inferred`)
    else { const result = await response.json(); console.log(JSON.stringify({ at: new Date().toISOString(), ended: result.ended, ok: result.ok })) }
  } catch { console.error('watchdog observation failed; no absence inferred') }
  if (process.argv.includes('--once')) break
  if (!stopping) await new Promise(resolve => setTimeout(resolve, Math.max(0, interval - (Date.now() - started))))
} while (!stopping)
