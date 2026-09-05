import { useEffect } from 'react'
import { isSupabaseConfigured, supabase } from './supabase'

export type ProductEventName =
  | 'view_home'
  | 'view_performer'
  | 'click_tip'
  | 'tip_start'
  | 'tip_success'
  | 'signup_start'
  | 'signup_complete'
  | 'follow'
  | 'vote'
  | 'live_view_start'

const SID_KEY = 'ops-sid'

function sessionId(): string {
  try {
    let id = sessionStorage.getItem(SID_KEY)
    if (!id) {
      id = crypto.randomUUID()
      sessionStorage.setItem(SID_KEY, id)
    }
    return id.slice(0, 80)
  } catch {
    return 'anon'
  }
}

export function trackProductEvent(
  name: ProductEventName,
  opts?: { performerId?: string | null; eventId?: string | null; props?: Record<string, unknown> },
) {
  if (!isSupabaseConfigured || !supabase) return
  const featuredId = opts?.eventId ?? null
  const path = typeof window !== 'undefined' ? window.location.pathname.slice(0, 200) : null
  void supabase.auth
    .getSession()
    .then(({ data }) =>
      supabase!.from('product_events').insert({
        name,
        session_id: sessionId(),
        user_id: data.session?.user.id ?? null,
        performer_id: opts?.performerId ?? null,
        event_id: featuredId,
        path,
        props: opts?.props && typeof opts.props === 'object' ? opts.props : {},
      }),
    )
    .catch(() => undefined)
}

export function useTrackView(
  name: ProductEventName,
  opts?: { performerId?: string | null },
  ready = true,
) {
  const performerId = opts?.performerId ?? null
  useEffect(() => {
    if (!ready) return
    trackProductEvent(name, { performerId })
  }, [name, performerId, ready])
}
