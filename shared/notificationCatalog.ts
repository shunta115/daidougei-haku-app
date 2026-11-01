// Stable names for the requested launch categories. Only implemented producers
// may emit events. Declaring a category never enables sending or grants consent.
export const notificationCatalog = {
  live_start: { audience: 'fan', priority: 'normal', consent: 'live', implemented: true },
  reserved_live_reminder: { audience: 'fan', priority: 'normal', consent: 'reservations', implemented: false },
  appearance_published: { audience: 'fan', priority: 'normal', consent: 'appearances', implemented: true },
  appearance_previous_day: { audience: 'fan', priority: 'normal', consent: 'appearances', implemented: false },
  appearance_changed: { audience: 'fan', priority: 'high', consent: 'appearances', implemented: true },
  reserved_live_changed: { audience: 'fan', priority: 'high', consent: 'reservations', implemented: false },
  follower_activity: { audience: 'performer', priority: 'low', consent: 'activity', implemented: false },
  support_received: { audience: 'performer', priority: 'high', consent: 'support', implemented: false },
  reservation_milestone: { audience: 'performer', priority: 'low', consent: 'activity', implemented: false },
  appearance_preflight: { audience: 'performer', priority: 'normal', consent: 'activity', implemented: false },
  payout_important: { audience: 'performer', priority: 'high', consent: 'operations', implemented: false },
  operations_important: { audience: 'performer', priority: 'high', consent: 'operations', implemented: false },
} as const
export type NotificationCategory = keyof typeof notificationCatalog
