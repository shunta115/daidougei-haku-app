/** Read-only adapter for a future stateful deployment. No service-role key needed.
 * Never enabled by the local fixture server or the public device Preview.
 */
export async function authenticateHaku({ authorization, url, publishableKey, fetcher = fetch }) {
  if (!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization || '')) throw new LiveAuthError('authentication_required')
  const base = new URL(url)
  if (base.protocol !== 'https:' || !base.hostname.endsWith('.supabase.co') || base.pathname !== '/') throw new LiveAuthError('invalid_auth_origin')
  const headers = { Authorization: authorization, apikey: publishableKey }
  const auth = await fetcher(new URL('/auth/v1/user', base), { headers, signal: AbortSignal.timeout(5000) })
  if (!auth.ok) throw new LiveAuthError('invalid_session')
  const user = await auth.json()
  if (!/^[a-f0-9-]{36}$/i.test(user.id || '') || user.is_anonymous) throw new LiveAuthError('registered_account_required')
  // User-editable user_metadata is deliberately ignored for all permissions.
  const profileRes = await fetcher(new URL(`/rest/v1/profiles?id=eq.${user.id}&select=id,role,status`, base), { headers, signal: AbortSignal.timeout(5000) })
  if (!profileRes.ok) throw new LiveAuthError('profile_unavailable')
  const [profile] = await profileRes.json()
  if (!profile || profile.status !== 'active' || !['fan','performer','admin'].includes(profile.role)) throw new LiveAuthError('inactive_account')
  let approved = false
  if (profile.role === 'performer') {
    const result = await fetcher(new URL(`/rest/v1/performers?id=eq.${user.id}&select=id,is_approved`, base), { headers, signal: AbortSignal.timeout(5000) })
    if (!result.ok) throw new LiveAuthError('performer_unavailable')
    const [performer] = await result.json(); approved = performer?.is_approved === true
  }
  return { id: user.id, role: profile.role, active: true, approved }
}
export class LiveAuthError extends Error {}
