// Run on an existing approved TEST/production worker only. No Egress or new service.
import { pathToFileURL } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function watchdogOrigin(value) {
  const base = new URL(value)
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname))) throw Error('HTTPS origin required')
  if (base.pathname !== '/' || base.search || base.hash || base.username || base.password) throw Error('Bare origin required')
  return base
}
/** Drain keyset pages in one cadence, retaining the cursor across bounded passes. */
export async function watchdogPass({ origin, secret, cursor = null, fetcher = fetch, signal, now = Date.now, budgetMs = 20_000 }) {
  const base = watchdogOrigin(origin)
  if (!secret || (cursor && !UUID.test(cursor))) throw Error('Watchdog configuration invalid')
  const started = now()
  const summary = { cursor, ended: 0, scanned: 0, unknown: 0, cleanupPending: 0, pages: 0, complete: false }
  try {
    do {
      const url = new URL('/api/livekit/presence', base)
      if (summary.cursor) url.searchParams.set('cursor', summary.cursor)
      const timeout = AbortSignal.timeout(15_000)
      const response = await fetcher(url, {
        headers: { Authorization: `Bearer ${secret}` }, redirect: 'error',
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      })
      if (!response.ok) throw Error(`watchdog HTTP ${response.status}`)
      const result = await response.json()
      if (result.ok !== true || ![result.ended,result.scanned,result.unknown,result.cleanupPending].every(n => Number.isInteger(n) && n >= 0)
        || (result.nextCursor !== null && (typeof result.nextCursor !== 'string' || !UUID.test(result.nextCursor)))
        || (result.nextCursor && result.nextCursor === summary.cursor)) throw Error('Invalid watchdog response')
      summary.pages++; summary.ended += result.ended; summary.scanned += result.scanned
      summary.unknown += result.unknown; summary.cleanupPending += result.cleanupPending; summary.cursor = result.nextCursor
      if (!summary.cursor) { summary.complete = true; break }
    } while (summary.pages < 20 && now() - started < budgetMs)
    return summary
  } catch (error) {
    // The last unprocessed cursor is safe to retry. Never infer absence on failures.
    throw Object.assign(error, { cursor: summary.cursor })
  }
}
async function main() {
  const origin = watchdogOrigin(process.env.HAKU_WATCHDOG_ORIGIN || '').origin
  const secret = process.env.CRON_SECRET
  if (!secret) throw Error('CRON_SECRET required')
  const stop = new AbortController()
  for (const event of ['SIGINT','SIGTERM']) process.on(event, () => stop.abort())
  let cursor = null
  do {
    const started = Date.now()
    try {
      const result = await watchdogPass({ origin, secret, cursor, signal: stop.signal })
      cursor = result.cursor
      console.log(JSON.stringify({ at: new Date().toISOString(), ...result }))
    } catch (error) {
      cursor = error.cursor ?? cursor
      if (!stop.signal.aborted) console.error('watchdog observation failed; no absence inferred; cursor retained')
    }
    if (process.argv.includes('--once') || stop.signal.aborted) break
    await sleep(Math.max(0, 25_000 - (Date.now() - started)), undefined, { signal: stop.signal }).catch(() => {})
  } while (!stop.signal.aborted)
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
