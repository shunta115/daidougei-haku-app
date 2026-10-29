import { requireSupabase } from './supabase'

/** Idempotently creates in-app reminders for the signed-in user's local-today appearances. */
export async function ensureTodayAppearanceReminders() {
  const { data, error } = await requireSupabase().rpc('ensure_my_day_of_appearance_reminders')
  if (error) throw error
  return typeof data === 'number' ? data : 0
}
