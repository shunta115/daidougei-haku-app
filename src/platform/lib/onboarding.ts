import { t } from '../../i18n'
import type { Performer } from './types'

export const PERFORMER_REGISTER_PATH = '/live/register'

export function profileMissingFields(performer: Partial<Performer>): string[] {
  return [
    !performer.stage_name?.trim() && '芸名',
    !performer.genre?.trim() && 'ジャンル',
    !performer.bio?.trim() && '自己紹介',
    !performer.city?.trim() && '活動地域',
    !performer.photo_url && 'プロフィール写真',
  ].filter((value): value is string => Boolean(value))
}

export function performerRegistrationStatus(performer: Partial<Performer>) {
  const missing = profileMissingFields(performer)
  const profileComplete = missing.length === 0
  const payoutsComplete = Boolean(performer.stripe_account_id && performer.stripe_onboarding_complete)
  const approved = Boolean(performer.is_approved)
  return {
    missing, profileComplete, payoutsComplete, approved,
    next: !profileComplete ? 'profile' : !payoutsComplete ? 'payouts' : !approved ? 'approval' : 'complete',
  } as const
}

// Only known messages reach the UI; provider errors can contain private details.
export function registrationError(error: unknown, fallback = ''): string {
  const value = typeof error === 'string' ? error : error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
  if (/invalid login credentials/i.test(value)) return t('authBadLogin')
  if (/email not confirmed/i.test(value)) return t('authEmailUnconfirmed')
  if (/already registered|already exists|user_already_exists/i.test(value)) return t('authAlreadyRegistered')
  if (/rate limit|too many|too soon|after .*seconds/i.test(value)) return t('authRateLimit')
  if (/password|weak_password/i.test(value)) return t('authWeakPassword')
  if (/invalid.*email|email.*invalid/i.test(value)) return t('authBadEmail')
  if (/fetch|network|offline|timeout/i.test(value)) return t('authNetwork')
  if (/JWT|session|authorization/i.test(value)) return t('authSessionExpired')
  return fallback || t('authGenericFail')
}
