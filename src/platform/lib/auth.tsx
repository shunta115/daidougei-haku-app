import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, requireSupabase, supabase } from './supabase'
import type { Performer, Profile, UserRole } from './types'

type AuthState = {
  ready: boolean
  session: Session | null
  user: User | null
  profile: Profile | null
  performer: Performer | null
  configured: boolean
  refreshProfile: () => Promise<void>
  signUp: (email: string, password: string, role: 'fan' | 'performer' | 'organizer', displayName: string) => Promise<string | null>
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

async function loadProfile(userId: string): Promise<{ profile: Profile | null; performer: Performer | null }> {
  const sb = requireSupabase()
  const { data: profile } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle()
  let performer: Performer | null = null
  if (profile?.role === 'performer') {
    const { data } = await sb.from('performers').select('*').eq('id', userId).maybeSingle()
    performer = (data as Performer) ?? null
    if (!performer) {
      const stageName = profile.display_name?.trim() || 'Performer'
      const { data: inserted } = await sb
        .from('performers')
        .insert({ id: userId, stage_name: stageName, is_approved: false })
        .select('*')
        .maybeSingle()
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

  const refreshProfile = useCallback(async () => {
    if (!supabase) return
    const uid = (await supabase.auth.getUser()).data.user?.id
    if (!uid) {
      setProfile(null)
      setPerformer(null)
      return
    }
    const loaded = await loadProfile(uid)
    setProfile(loaded.profile)
    setPerformer(loaded.performer)
  }, [])

  useEffect(() => {
    if (!supabase) return
    let mounted = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      setSession(data.session)
      if (data.session?.user) {
        const loaded = await loadProfile(data.session.user.id)
        if (!mounted) return
        setProfile(loaded.profile)
        setPerformer(loaded.performer)
      }
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next)
      if (next?.user) {
        const loaded = await loadProfile(next.user.id)
        setProfile(loaded.profile)
        setPerformer(loaded.performer)
        // Touch updated_at for DAU/MAU proxies
        void requireSupabase()
          .from('profiles')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', next.user.id)
      } else {
        setProfile(null)
        setPerformer(null)
      }
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string, role: UserRole, displayName: string) => {
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
      if (error) return error.message
      if (!data.session) return 'check-email'
      return null
    } catch (e) {
      return e instanceof Error ? e.message : 'Sign up failed'
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const sb = requireSupabase()
      const { error } = await sb.auth.signInWithPassword({ email, password })
      return error?.message ?? null
    } catch (e) {
      return e instanceof Error ? e.message : 'Sign in failed'
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
      refreshProfile,
      signUp,
      signIn,
      signOut,
    }),
    [ready, session, profile, performer, refreshProfile, signUp, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
