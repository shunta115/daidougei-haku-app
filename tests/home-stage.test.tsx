// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { HomeStage } from '../src/platform/components/home/HomeStage'
import { homeDiscovery } from '../src/platform/lib/homeDiscovery'
import type { LiveSchedule, Performer } from '../src/platform/lib/types'
const api = vi.hoisted(() => ({ reserve: vi.fn(), cancel: vi.fn() }))
vi.mock('../src/platform/lib/api', () => ({ reserveLiveSchedule:api.reserve,cancelLiveReservation:api.cancel }))
const now = Date.now()
const person = {id:'a',stage_name:'テスト出演者',is_approved:true,is_live:false,created_at:'2020-01-01',genre:'Circus'} as Performer
const schedule = {id:'s',performer_id:'a',status:'scheduled',scheduled_start_at:new Date(now+60000).toISOString(),title:'次のステージ'} as LiveSchedule
const feed = homeDiscovery([person],[],[schedule],[],[],now)
afterEach(() => { cleanup(); vi.resetAllMocks() })
function Harness({ initial = [] as string[] | null, userId = 'fan' as string | null }) {
  const [reserved,setReserved] = useState(initial)
  return <HomeStage feed={feed} reserved={reserved} setReserved={setReserved} userId={userId} onWatch={vi.fn()} onProfile={vi.fn()} onTip={vi.fn()} onSearch={vi.fn()} />
}
describe('home reservations', () => {
  it('reserves once, then requires separate management and explicit cancel confirmation', async () => {
    api.reserve.mockResolvedValue(undefined);api.cancel.mockResolvedValue(undefined)
    render(<Harness />)
    fireEvent.click(screen.getByRole('button',{name:'LIVEを予約'}))
    await screen.findByRole('button',{name:'予約済み ✓'})
    fireEvent.click(screen.getByRole('button',{name:'予約済み ✓'}))
    expect(api.cancel).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'予約を解除する'}))
    expect(api.cancel).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'予約解除を確定'}))
    await screen.findByRole('button',{name:'LIVEを予約'})
    expect(api.reserve).toHaveBeenCalledExactlyOnceWith('s','fan')
    expect(api.cancel).toHaveBeenCalledExactlyOnceWith('s','fan')
  })
  it('does not write when signed out or when reservation reads failed', () => {
    const r=render(<Harness userId={null} />)
    fireEvent.click(screen.getByRole('button',{name:'LIVEを予約'}))
    expect(screen.getByRole('alert').textContent).toContain('ログイン')
    expect(api.reserve).not.toHaveBeenCalled()
    r.unmount(); render(<Harness initial={null} />)
    expect((screen.getByRole('button',{name:'予約状態を確認できません'}) as HTMLButtonElement).disabled).toBe(true)
  })
  it('keeps original state and announces failed writes', async () => {
    api.reserve.mockRejectedValue(new Error('offline'));render(<Harness />)
    fireEvent.click(screen.getByRole('button',{name:'LIVEを予約'}))
    await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('更新できません'))
    expect(screen.queryByRole('button',{name:'予約済み ✓'})).toBeNull()
  })
})
