import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabase, requireAuthUser } from '../stripe/_shared.js'

import liveStart from '../../server/notifications/liveStart.js'
import selfTest from '../../server/notifications/selfTest.js'
import reminders from '../../server/notifications/reminders.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.query?.mode === 'reminders') return reminders(req, res)
  if (req.query?.mode === 'live-start') return liveStart(req, res)
  if (req.query.mode === 'self-test') return selfTest(req, res)
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })
  const user = await requireAuthUser(req, res)
  if (!user) return
  const eventId = typeof req.body?.eventId === 'string' ? req.body.eventId : ''
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return res.status(400).json({ error: 'invalid_event' })

  const sb = getAdminSupabase()
  const { data: event, error: eventError } = await sb
    .from('appearance_notification_events')
    .select('id,performer_id')
    .eq('id', eventId)
    .maybeSingle()
  if (eventError || !event) return res.status(404).json({ error: 'event_not_found' })
  if (event.performer_id !== user.id) return res.status(403).json({ error: 'not_owner' })

  // The authenticated owner only announces the event. The bounded scheduler owns
  // delivery and its at-most-once claim; legacy retry transport is retired.
  return res.status(202).json({ queued: true, dispatchEnabled: false })
}
