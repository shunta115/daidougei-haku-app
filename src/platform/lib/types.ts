export type UserRole = 'fan' | 'performer' | 'admin'
export type AccountStatus = 'pending' | 'active' | 'suspended' | 'deleted'
export type TipStatus = 'pending' | 'succeeded' | 'failed' | 'refunded'

export type Profile = {
  id: string
  role: UserRole
  status: AccountStatus
  display_name: string
  email: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export type Performer = {
  id: string
  stage_name: string
  bio: string
  genre: string
  country: string
  city: string
  photo_url: string | null
  support_blurb: string
  stripe_account_id: string | null
  stripe_onboarding_complete: boolean
  is_approved: boolean
  is_live: boolean
  live_started_at: string | null
  live_title: string | null
  stream_url: string | null
  share_location: boolean
  lat: number | null
  lng: number | null
  location_updated_at: string | null
  created_at: string
  updated_at: string
}

export type LiveSession = {
  id: string
  performer_id: string
  started_at: string
  ended_at: string | null
  stream_url: string | null
  title: string | null
  tip_count: number
  tip_amount_total: number
  viewer_peak: number
}

export type LiveComment = {
  id: string
  performer_id: string
  live_session_id: string | null
  user_id: string
  display_name: string
  body: string
  created_at: string
}

export type TipRow = {
  id: string
  fan_id: string | null
  performer_id: string
  amount_cents: number
  currency: string
  platform_fee_cents: number
  status: TipStatus
  stripe_session_id: string | null
  stripe_payment_intent: string | null
  created_at: string
  updated_at: string
}

export type TipSummary = {
  count: number
  amount_total: number
  fee_total: number
}

export type NotificationRow = {
  id: string
  user_id: string
  title: string
  body: string
  link: string | null
  read_at: string | null
  created_at: string
}

export type AdminMetrics = {
  signups_today: number
  performers_total: number
  fans_total: number
  lives_total: number
  live_now: number
  tips_today_count: number
  tips_today_amount: number
  fees_today: number
  dau_proxy: number
  mau_proxy: number
}

export type PlatformScreen =
  | 'welcome'
  | 'auth'
  | 'fan-home'
  | 'search'
  | 'live-list'
  | 'profile'
  | 'notifications'
  | 'performer-home'
  | 'performer-edit'
  | 'performer-live'
  | 'performer-history'
  | 'live-watch'
  | 'tip'
  | 'admin'
  | 'admin-users'
  | 'setup'
