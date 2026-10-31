// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
const fake = vi.hoisted(() => ({ user: 'fan-a' as string | null, home: vi.fn(), sessions: vi.fn(), reservations: vi.fn(), reserve: vi.fn(), cancel: vi.fn(), live: vi.fn() }))
vi.mock('../src/platform/lib/api', () => ({
  liveReservationsEnabled: true, getFeaturedEvent: async()=>null, getTodayOfficialNavigator: async()=>null,
  listLivePerformers: fake.live, listUpcomingLiveSchedules: async()=>[{id:'schedule',performer_id:'planned',title:'予約LIVE',status:'scheduled',scheduled_start_at:new Date(Date.now()+60000).toISOString()}],
  listOwnLiveReservationIds:fake.reservations,reserveLiveSchedule:fake.reserve,cancelLiveReservation:fake.cancel,
  listOshiPerformers:async()=>[],listFollowedPerformers:async()=>[],
}))
vi.mock('../src/platform/lib/homeRanking',()=>({loadHomeRanking:fake.home,appearanceLabel:()=> '明日 11/1 12:00'}))
vi.mock('../src/platform/lib/homeDiscoveryApi',()=>({listHomeSessions:fake.sessions}))
vi.mock('../src/platform/lib/auth',()=>({useAuth:()=>({user:fake.user?{id:fake.user}:null})}))
vi.mock('../src/platform/lib/track',()=>({useTrackView:()=>{}}))
import { FanHomeScreen } from '../src/platform/screens/FanHomeScreen'
import { LangProvider } from '../src/i18n/LangProvider'
const p=(id:string,live=false)=>({id,stage_name:id,genre:'Circus',is_approved:true,is_private_test:false,is_live:live,photo_url:null,city:'Tokyo',created_at:'2020-01-01'})
const home={performers:[p('active'),p('live',true),p('planned'),p('idle')],ranking:{ids:['active','live','planned','idle'],featured:['active','live'],upcoming:[{performerId:'planned',startsAt:'2099-01-01',endsAt:null,title:'出演'}],recent:[],unscheduled:['active','idle','live']}}
const props=()=>({onOpenPerformer:vi.fn(),onWatchLive:vi.fn(),onOpenSearch:vi.fn(),onOpenLiveList:vi.fn(),onOpenMap:vi.fn(),onTip:vi.fn()})
const show=(callbacks=props())=>render(<FanHomeScreen {...callbacks}/>,{wrapper:LangProvider})
const deferred=<T,>()=>{let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>{resolve=r});return{promise,resolve}}
beforeEach(()=>{
 const storage=new JSDOM('',{url:'http://localhost'}).window.localStorage;storage.setItem('daidougei-lang','ja');vi.stubGlobal('localStorage',storage)
 vi.resetAllMocks();fake.user='fan-a';fake.home.mockResolvedValue(home);fake.live.mockResolvedValue([p('live',true)])
 fake.sessions.mockImplementation(async()=>[{performer_id:'live',started_at:new Date().toISOString(),ended_at:null,heartbeat_at:new Date().toISOString()}]);fake.reservations.mockResolvedValue([]);fake.reserve.mockResolvedValue(undefined);fake.cancel.mockResolvedValue(undefined)
})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
describe('integrated home: 105 LIVE/reservations and 113 ranking',()=>{
 it('keeps confirmed LIVE and reservation UI independent of activity and appearance rails',async()=>{
  const callbacks=props();show(callbacks)
  await screen.findByRole('button',{name:'今すぐ視聴 →'})
  expect(within(screen.getByRole('region',{name:'注目のパフォーマー'})).getAllByRole('listitem').map(e=>e.querySelector('strong')!.textContent)).toEqual(['active','live'])
  const appearance=screen.getByRole('region',{name:'まもなく出演'})
  expect(within(appearance).getByText('planned')).toBeTruthy()
  expect(within(appearance).queryByText('idle')).toBeNull()
  expect(within(screen.getByRole('region',{name:'パフォーマーを探す'})).getAllByText('公開出演予定なし')).toHaveLength(3)
  fireEvent.click(screen.getByRole('button',{name:'今すぐ視聴 →'}));expect(callbacks.onWatchLive).toHaveBeenCalledWith('live')
  fireEvent.click(screen.getByRole('button',{name:'応援・投げ銭'}));expect(callbacks.onTip).toHaveBeenCalledWith('live')
  fireEvent.click(screen.getByRole('button',{name:'プロフィール・フォロー'}));expect(callbacks.onOpenPerformer).toHaveBeenCalledWith('live')
 })
 it('shows public registration dates after upcoming and activity, excluding unknown and future dates',async()=>{
  const now=Date.now();fake.home.mockResolvedValueOnce({...home,performers:[...home.performers,{...p('new-older'),created_at:new Date(now-86400000).toISOString()},{...p('new-latest'),created_at:new Date(now-1000).toISOString()},{...p('unknown'),created_at:''},{...p('future'),created_at:new Date(now+86400000).toISOString()}],ranking:{...home.ranking,ids:[...home.ranking.ids,'new-older','new-latest','unknown','future']}})
  const callbacks=props();show(callbacks)
  const latest=await screen.findByRole('region',{name:'新しく登録したパフォーマー'})
  expect(within(latest).getAllByRole('listitem').map(e=>e.querySelector('strong')!.textContent)).toEqual(['new-latest','new-older'])
  const labels=[...document.querySelectorAll('.pl-cinema-section')].map(e=>e.getAttribute('aria-label'))
  expect(labels.indexOf('まもなく出演')).toBeLessThan(labels.indexOf('注目のパフォーマー'))
  expect(labels.indexOf('注目のパフォーマー')).toBeLessThan(labels.indexOf('新しく登録したパフォーマー'))
  fireEvent.click(screen.getByRole('button',{name:'すべてのパフォーマーを見る'}));expect(callbacks.onOpenSearch).toHaveBeenCalled()
 })
 it('masks stale LIVE flags everywhere, preserving the scheduled reservation',async()=>{
  fake.sessions.mockResolvedValue([]);show();await screen.findByRole('button',{name:'LIVEを予約'})
  expect(screen.queryByRole('button',{name:'今すぐ視聴 →'})).toBeNull()
  expect(document.querySelectorAll('.pl-cinema-card em')).toHaveLength(0)
 })
 it('does not let a late poll overwrite a newly completed reservation',async()=>{
  show();await screen.findByRole('button',{name:'LIVEを予約'})
  const oldRead=deferred<string[]>();fake.reservations.mockReturnValueOnce(oldRead.promise)
  act(()=>window.dispatchEvent(new Event('online')))
  fireEvent.click(screen.getByRole('button',{name:'LIVEを予約'}))
  await waitFor(()=>expect(screen.getAllByRole('button',{name:'予約済み ✓'})).toHaveLength(2))
  await act(async()=>oldRead.resolve([]))
  expect(screen.getAllByRole('button',{name:'予約済み ✓'})).toHaveLength(2)
 })
 it('does not reuse an old account reservation completion after account switch',async()=>{
  const cb=props();const view=show(cb);await screen.findByRole('button',{name:'LIVEを予約'})
  const oldWrite=deferred<void>();fake.reserve.mockReturnValueOnce(oldWrite.promise)
  fireEvent.click(screen.getByRole('button',{name:'LIVEを予約'}))
  fake.user='fan-b';view.rerender(<FanHomeScreen {...cb}/>);await waitFor(()=>expect(fake.reservations).toHaveBeenCalledWith('fan-b'))
  await act(async()=>oldWrite.resolve())
  expect(screen.queryAllByRole('button',{name:'予約済み ✓'})).toHaveLength(0)
  expect(screen.getByRole('button',{name:'LIVEを予約'})).toBeTruthy()
 })
 it('keeps guest reservation writes blocked',async()=>{
  fake.user=null;show();await screen.findByRole('button',{name:'LIVEを予約'})
  fireEvent.click(screen.getByRole('button',{name:'LIVEを予約'}))
  expect(screen.getByRole('alert').textContent).toContain('ログイン')
  expect(fake.reserve).not.toHaveBeenCalled()
 })
})
