import { useEffect } from 'react'
import { isSupabaseConfigured, supabase } from './supabase'

export type ProductEventName =
  | 'home_view'
  | 'live_view'
  | 'performer_view'
  | 'follow_click'
  | 'follow_complete'
  | 'tip_cta_click'
  | 'tip_amount_select'
  | 'tip_checkout_start'
  | 'tip_complete'
  | 'merch_view'
  | 'merch_checkout_start'
  | 'merch_purchase'
  | 'vote_complete'
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
  opts?: { performerId?: string | null; eventId?: string | null; liveId?: string | null; props?: Record<string, unknown> },
) {
  if (!isSupabaseConfigured || !supabase) return
  const featuredId = opts?.eventId ?? null
  const path = typeof window !== 'undefined' ? window.location.pathname.slice(0, 200) : null
  const baseProps = opts?.props && typeof opts.props === 'object' ? opts.props : {}
  let referrer = 'direct'
  try {
    referrer = typeof document !== 'undefined' && document.referrer
      ? new URL(document.referrer).hostname.slice(0, 120)
      : 'direct'
  } catch {
    referrer = 'direct'
  }
  const payload = {
    name,
    session_id: sessionId(),
    user_id: null as string | null,
    performer_id: opts?.performerId ?? null,
    event_id: featuredId,
    path,
    props: {
      ...baseProps,
      live_id: opts?.liveId ?? (baseProps.live_id as string | null | undefined) ?? null,
      traffic_source: referrer,
      device:
        typeof navigator !== 'undefined' && /iPhone|Android.+Mobile/i.test(navigator.userAgent)
          ? 'mobile'
          : 'desktop',
    },
  }

  void (async () => {
    try {
      const { data } = await supabase!.auth.getSession()
      payload.user_id = data.session?.user.id ?? null
    } catch {
      payload.user_id = null
    }
    let { error } = await supabase!.from('product_events').insert(payload)
    if (error && payload.user_id) {
      payload.user_id = null
      ;({ error } = await supabase!.from('product_events').insert(payload))
    }
    if (error) console.warn('product_event', name, error.message)
  })()
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
