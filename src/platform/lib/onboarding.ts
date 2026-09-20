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
export function registrationError(error: unknown, fallback = '処理できませんでした。通信を確認して、もう一度お試しください。') {
  const value = typeof error === 'string' ? error : error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
  if (/invalid login credentials/i.test(value)) return 'メールアドレスまたはパスワードが違います。入力を確認してください。'
  if (/email not confirmed/i.test(value)) return '確認メールのリンクを開いてからログインしてください。メールはこの画面から再送できます。'
  if (/already registered|already exists|user_already_exists/i.test(value)) return '登録済みのメールアドレスです。「ログイン」から続けてください。'
  if (/rate limit|too many|too soon|after .*seconds/i.test(value)) return '操作が続いています。1分ほど待ってから、もう一度お試しください。'
  if (/password|weak_password/i.test(value)) return 'パスワードは6文字以上で設定してください。推測されにくい文字の組み合わせをお使いください。'
  if (/invalid.*email|email.*invalid/i.test(value)) return 'メールアドレスの形式を確認してください。'
  if (/fetch|network|offline|timeout/i.test(value)) return '通信できませんでした。電波やWi-Fiを確認して、もう一度お試しください。'
  if (/JWT|session|authorization/i.test(value)) return 'ログインの有効期限が切れました。ログインし直して続けてください。'
  return fallback
}
