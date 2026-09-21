// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JSDOM } from 'jsdom'

const fake = vi.hoisted(() => ({
  auth: {} as Record<string, unknown>, signUp: vi.fn(), signIn: vi.fn(), update: vi.fn(),
  refresh: vi.fn(), queryUpdate: vi.fn(), upload: vi.fn(), resend: vi.fn(),
}))
vi.mock('../src/platform/lib/auth', () => ({ useAuth: () => ({ ...fake.auth, signUp: fake.signUp, signIn: fake.signIn, refreshProfile: fake.refresh, signOut: vi.fn() }) }))
vi.mock('../src/platform/lib/track', () => ({ trackProductEvent: vi.fn() }))
vi.mock('../src/platform/lib/api', () => ({ updatePerformer: fake.update, uploadAvatar: fake.upload }))
vi.mock('../src/platform/lib/supabase', () => ({
  supabaseAuthHeaders: async () => ({}),
  requireSupabase: () => ({ auth: { resend: fake.resend }, from: () => ({ update: fake.queryUpdate }) }),
}))

import { AuthScreen } from '../src/platform/screens/AuthScreen'
import { PerformerEditScreen } from '../src/platform/screens/PerformerEditScreen'
import { PayoutSetup } from '../src/platform/components/PayoutSetup'

const performer = { id: 'performer-fixture', stage_name: '登録テスト', genre: '', bio: '', city: '', country: '日本', photo_url: null, support_blurb: '', sns_json: [{ label: 'Instagram', url: 'https://instagram.com/example' }], updated_at: '2026-09-01T00:00:00Z' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', new JSDOM('', { url: 'http://localhost' }).window.localStorage)
  localStorage.clear()
  fake.auth = { performer, profile: { id: performer.id, role: 'performer', status: 'pending' } }
  fake.signUp.mockResolvedValue(null)
  fake.signIn.mockResolvedValue(null)
  fake.update.mockResolvedValue(undefined)
  fake.refresh.mockResolvedValue(undefined)
  fake.queryUpdate.mockReturnValue({ eq: async () => ({ error: null }) })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('smartphone performer registration', () => {
  it('does not offer office privileges during public signup', () => {
    render(<AuthScreen onDone={vi.fn()} />)
    expect(screen.getByRole('radio', { name: 'ファン' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'パフォーマー' })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: '主催者' })).toBeNull()
  })

  it('submits a performer account from the dedicated entry, never fan', async () => {
    render(<AuthScreen performerEntry initialRole="performer" onDone={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('芸名（公開されます）'), { target: { value: 'テスト芸名' } })
    fireEvent.change(screen.getByLabelText('メールアドレス（非公開）'), { target: { value: 'fixture@example.test' } })
    fireEvent.change(screen.getByLabelText('パスワード（6文字以上）'), { target: { value: 'fixture-only-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'パフォーマーとして登録' }))
    await waitFor(() => expect(fake.signUp).toHaveBeenCalledWith('fixture@example.test', 'fixture-only-password', 'performer', 'テスト芸名'))
  })
  it('shows email confirmation and can return to login without changing the role', async () => {
    fake.signUp.mockResolvedValue('check-email')
    render(<AuthScreen performerEntry initialRole="performer" onDone={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('芸名（公開されます）'), { target: { value: 'テスト' } })
    fireEvent.change(screen.getByLabelText('メールアドレス（非公開）'), { target: { value: 'fixture@example.test' } })
    fireEvent.change(screen.getByLabelText('パスワード（6文字以上）'), { target: { value: 'fixture-only-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'パフォーマーとして登録' }))
    await screen.findByRole('button', { name: 'ログインして続ける' })
    expect(screen.getByRole('status').textContent).toContain('確認メール')
    expect(screen.getByRole('button', { name: '確認メールを再送' })).toBeTruthy()
  })
  it('restores unsaved public fields after leaving and saves a partial profile to the existing DB fields', async () => {
    const first = render(<PerformerEditScreen onBack={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('ジャンル'), { target: { value: 'ジャグリング' } })
    await waitFor(() => expect(localStorage.getItem('pl-profile-draft:performer-fixture')).toContain('ジャグリング'))
    first.unmount()
    render(<PerformerEditScreen onBack={vi.fn()} />)
    expect((screen.getByLabelText('ジャンル') as HTMLInputElement).value).toBe('ジャグリング')
    fireEvent.click(screen.getByRole('button', { name: 'プロフィールを保存' }))
    await screen.findByText('プロフィールを保存しました。登録状況に戻って次へ進めます。')
    const patch = fake.update.mock.calls[0][1]
    expect(patch.genre).toBe('ジャグリング')
    expect(patch.sns_json).toContainEqual({ label: 'Instagram', url: 'https://instagram.com/example' })
    expect(patch).not.toHaveProperty('is_approved')
    expect(patch).not.toHaveProperty('stripe_account_id')
    expect(patch).not.toHaveProperty('real_name')
    expect(localStorage.getItem('pl-profile-draft:performer-fixture')).toBeNull()
  })
  it('stores a ticket sales link with the existing public link data', async () => {
    render(<PerformerEditScreen onBack={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('チケット販売ページ'), { target: { value: 'https://tickets.example.test/show' } })
    fireEvent.click(screen.getByRole('button', { name: 'プロフィールを保存' }))
    await screen.findByText('プロフィールを保存しました。登録状況に戻って次へ進めます。')
    expect(fake.update.mock.calls[0][1].sns_json).toContainEqual({ label: 'チケット', url: 'https://tickets.example.test/show' })
  })
  it('does not report success when profile persistence fails', async () => {
    fake.update.mockRejectedValue({ message: 'private database message' })
    render(<PerformerEditScreen onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'プロフィールを保存' }))
    expect((await screen.findByRole('alert')).textContent).toContain('保存できませんでした')
    expect(screen.queryByText('private database message')).toBeNull()
  })
  it('checks the real Stripe status on mount and allows retry after failure', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValueOnce({ ok: true, json: async () => ({ complete: true, connected: true }) })
    vi.stubGlobal('fetch', fetchMock)
    const onStatus = vi.fn()
    render(<PayoutSetup performerId={performer.id} onStatus={onStatus} />)
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: '状態を更新' }))
    await screen.findByText('受取設定が完了しました')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ performerId: performer.id, action: 'status' })
    expect(onStatus).toHaveBeenCalledWith({ complete: true, connected: true })
  })
})
