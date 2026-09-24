// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: unknown) => unknown),
  insideCallback: false, from: vi.fn(), signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(), updateUser: vi.fn(),
}))
vi.mock('../src/platform/lib/supabase', () => {
  const client = {
    auth: {
      onAuthStateChange: (listener: typeof fake.listener) => { fake.listener = listener; return { data: { subscription: { unsubscribe: vi.fn() } } } },
      signUp: fake.signUp,
      resetPasswordForEmail: fake.resetPasswordForEmail,
      updateUser: fake.updateUser,
    },
    from: (...args: unknown[]) => { if (fake.insideCallback) throw new Error('Auth callback must not query DB'); return fake.from(...args) },
  }
  return { isSupabaseConfigured: true, supabase: client, requireSupabase: () => client }
})
import { AuthProvider, useAuth } from '../src/platform/lib/auth'

function Probe() { const auth = useAuth(); return <div>{auth.ready ? `${auth.profile?.role ?? 'guest'}:${auth.performer?.stage_name ?? ''}:${auth.profileError ?? ''}` : 'loading'}</div> }
function PasswordProbe() {
  const auth = useAuth()
  return <><button onClick={() => void auth.sendPasswordReset('fan@example.com')}>reset</button><button onClick={() => void auth.updatePassword('new-password')}>update</button></>
}
function emit(session: unknown) {
  fake.insideCallback = true
  const returned = fake.listener?.('SIGNED_IN', session)
  fake.insideCallback = false
  expect(returned).not.toBeInstanceOf(Promise)
}

beforeEach(() => {
  vi.clearAllMocks()
  fake.resetPasswordForEmail.mockResolvedValue({ error: null })
  fake.updateUser.mockResolvedValue({ error: null })
  fake.from.mockImplementation((table) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === 'profiles' ? { id: 'fixture', role: 'performer', display_name: '芸名' } : { id: 'fixture', stage_name: '芸名' }, error: null }) }) }) }))
})
afterEach(cleanup)

it('loads performer records outside the Supabase auth callback and recovers the role on login', async () => {
  render(<AuthProvider><Probe /></AuthProvider>)
  act(() => emit({ user: { id: 'fixture' } }))
  await screen.findByText('performer:芸名:')
  expect(fake.from).toHaveBeenCalledWith('performers')
})

it('does not retain a performer profile after logout', async () => {
  render(<AuthProvider><Probe /></AuthProvider>)
  act(() => emit({ user: { id: 'fixture' } }))
  await screen.findByText('performer:芸名:')
  act(() => emit(null))
  await screen.findByText('guest::')
})

it('shows an actionable error instead of silently treating a failed performer lookup as a fan', async () => {
  fake.from.mockImplementation(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'DB unavailable' } }) }) }) }))
  render(<AuthProvider><Probe /></AuthProvider>)
  act(() => emit({ user: { id: 'fixture' } }))
  await waitFor(() => expect(screen.getByText(/登録情報を読み込めませんでした/)).toBeTruthy())
})

it('uses Supabase recovery APIs without exposing password reset details to the database layer', async () => {
  render(<AuthProvider><PasswordProbe /></AuthProvider>)
  screen.getByText('reset').click()
  await waitFor(() => expect(fake.resetPasswordForEmail).toHaveBeenCalledWith('fan@example.com', {
    redirectTo: `${window.location.origin}/live?auth=1`,
  }))
  screen.getByText('update').click()
  await waitFor(() => expect(fake.updateUser).toHaveBeenCalledWith({ password: 'new-password' }))
})
