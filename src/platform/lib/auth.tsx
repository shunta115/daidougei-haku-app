import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, requireSupabase, supabase } from './supabase'
import type { Performer, Profile } from './types'
import { registrationError } from './onboarding'

type AuthState = {
  ready: boolean
  session: Session | null
  user: User | null
  profile: Profile | null
  performer: Performer | null
  configured: boolean
  profileError: string | null
  refreshProfile: () => Promise<void>
  signUp: (email: string, password: string, role: 'fan' | 'performer' | 'organizer', displayName: string) => Promise<string | null>
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

async function loadProfile(userId: string): Promise<{ profile: Profile | null; performer: Performer | null }> {
  const sb = requireSupabase()
  const { data: profile, error: profileError } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (profileError) throw profileError
  if (!profile) throw new Error('Profile unavailable')
  let performer: Performer | null = null
  if (profile?.role === 'performer') {
    const { data, error } = await sb.from('performers').select('*').eq('id', userId).maybeSingle()
    if (error) throw error
    performer = (data as Performer) ?? null
    if (!performer) {
      const stageName = profile.display_name?.trim() || 'Performer'
      const { error: insertError } = await sb
        .from('performers')
        .insert({ id: userId, stage_name: stageName, is_approved: false })
      if (insertError && insertError.code !== '23505') throw insertError
      const { data: inserted, error: reloadError } = await sb.from('performers').select('*').eq('id', userId).single()
      if (reloadError) throw reloadError
      performer = (inserted as Performer) ?? null
    }
  } else if (profile?.role === 'admin') {
    const { data } = await sb.from('performers').select('*').eq('id', userId).maybeSingle()
    performer = (data as Performer) ?? null
  }
  return { profile: (profile as Profile) ?? null, performer }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!isSupabaseConfigured)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [performer, setPerformer] = useState<Performer | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [authRevision, setAuthRevision] = useState(0)
  const currentUserId = useRef<string | null>(null)

  const refreshProfile = useCallback(async () => {
    if (!supabase) return
    const uid = currentUserId.current
    if (!uid) {
      setProfile(null)
      setPerformer(null)
      return
    }
    const loaded = await loadProfile(uid)
    if (currentUserId.current !== uid) return
    setProfile(loaded.profile)
    setPerformer(loaded.performer)
    setProfileError(null)
  }, [])

  useEffect(() => {
    if (!supabase) return
    let mounted = true
    // Supabase auth callbacks hold an auth lock. Load DB rows outside the callback.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!mounted) return
      const changed = currentUserId.current !== (next?.user.id ?? null)
      currentUserId.current = next?.user.id ?? null
      setSession(next)
      setAuthRevision((revision) => revision + 1)
      if (changed || !next) {
        setProfile(null)
        setPerformer(null)
        setProfileError(null)
      }
      if (changed || !next) setReady(!next)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    let active = true
    void loadProfile(userId).then((loaded) => {
      if (!active || currentUserId.current !== userId) return
      setProfile(loaded.profile)
      setPerformer(loaded.performer)
      setProfileError(null)
      // Preserve the existing activity timestamp without holding the auth lock.
      void (async () => {
        try { await requireSupabase().from('profiles').update({ updated_at: new Date().toISOString() }).eq('id', userId) }
        catch { /* Activity metrics must not prevent registration. */ }
      })()
    }).catch(() => {
      if (active) setProfileError('登録情報を読み込めませんでした。通信を確認し、再読み込みしてください。')
    }).finally(() => { if (active) setReady(true) })
    return () => { active = false }
  }, [userId, authRevision])

  const signUp = useCallback(async (email: string, password: string, role: 'fan' | 'performer' | 'organizer', displayName: string) => {
    try {
      const sb = requireSupabase()
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
          data: { role, display_name: displayName },
          emailRedirectTo: `${window.location.origin}/live`,
        },
      })
      if (error) return registrationError(error)
      if (!data.session) return 'check-email'
      return null
    } catch (e) {
      return registrationError(e)
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const sb = requireSupabase()
      const { error } = await sb.auth.signInWithPassword({ email, password })
      return error ? registrationError(error) : null
    } catch (e) {
      return registrationError(e)
    }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      ready,
      session,
      user: session?.user ?? null,
      profile,
      performer,
      configured: isSupabaseConfigured,
      profileError,
      refreshProfile,
      signUp,
      signIn,
      signOut,
    }),
    [ready, session, profile, performer, profileError, refreshProfile, signUp, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
