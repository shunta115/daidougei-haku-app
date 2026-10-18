// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JSDOM } from 'jsdom'

const fake = vi.hoisted(() => ({
  profile: { id: 'fan-1', role: 'fan', status: 'active', display_name: '元の名前', email: 'fixed@example.test', avatar_url: null },
  refresh: vi.fn(), updateName: vi.fn(),
}))

vi.mock('../src/platform/lib/auth', () => ({
  useAuth: () => ({ profile: fake.profile, user: { id: 'fan-1' }, refreshProfile: fake.refresh, signOut: vi.fn() }),
}))
vi.mock('../src/platform/lib/api', () => ({
  listFollowedPerformers: vi.fn().mockResolvedValue([]),
  listMyMerchOrders: vi.fn().mockResolvedValue([]),
  updateOwnAvatar: vi.fn(),
  updateOwnDisplayName: fake.updateName,
}))

import { FanProfileScreen } from '../src/platform/screens/FanProfileScreen'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', new JSDOM('', { url: 'http://localhost' }).window.localStorage)
  localStorage.setItem('daidougei-lang', 'ja')
  fake.updateName.mockResolvedValue('新しい名前')
  fake.refresh.mockImplementation(async () => { fake.profile.display_name = '新しい名前' })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('fan profile display name editor', () => {
  it('opens from the profile header, saves, refreshes, and keeps the login identifier unchanged', async () => {
    render(<FanProfileScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'プロフィール編集' }))
    const input = screen.getByLabelText('公開表示名') as HTMLInputElement
    expect(input.value).toBe('元の名前')
    fireEvent.change(input, { target: { value: '  新しい名前  ' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(fake.updateName).toHaveBeenCalledWith('新しい名前'))
    expect(fake.refresh).toHaveBeenCalledOnce()
    expect(await screen.findByText('新しい名前')).toBeTruthy()
    expect(screen.getByText('@fixed')).toBeTruthy()
  })

  it('keeps the editor and original name visible when persistence fails', async () => {
    fake.profile.display_name = '元の名前'
    fake.updateName.mockRejectedValue(new Error('database detail'))
    render(<FanProfileScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'プロフィール編集' }))
    fireEvent.change(screen.getByLabelText('公開表示名'), { target: { value: '保存失敗名' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect((await screen.findByRole('alert')).textContent).toContain('名前を保存できませんでした')
    expect(screen.getByRole('heading', { name: '元の名前' })).toBeTruthy()
    expect(screen.getByLabelText('公開表示名')).toBeTruthy()
    expect(fake.refresh).not.toHaveBeenCalled()
  })
})
