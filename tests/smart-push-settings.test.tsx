// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const mock=vi.hoisted(()=>({ensure:vi.fn(),get:vi.fn(),save:vi.fn()}))
vi.mock('../src/platform/lib/api',()=>({ensurePushSubscription:mock.ensure}))
vi.mock('../src/platform/lib/smartPush',()=>({getSmartPushPreference:mock.get,saveSmartPushPreference:mock.save}))
import { SmartPushSettings } from '../src/platform/components/SmartPushSettings'
beforeEach(()=>{
 vi.clearAllMocks();mock.get.mockResolvedValue({appearance_push_enabled:false,live_push_enabled:false,push_all_enabled:true,push_timezone:'UTC',push_start_hour:9,push_end_hour:21,push_daily_limit:2,push_weekly_limit:8});mock.ensure.mockResolvedValue(undefined);mock.save.mockResolvedValue(undefined)
 Object.defineProperty(navigator,'userAgent',{configurable:true,value:'Android Chrome'})
 Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{}})
 vi.stubGlobal('PushManager',class{});vi.stubGlobal('Notification',{permission:'default'});vi.stubGlobal('matchMedia',()=>({matches:false}))
})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('does not request OS permission on mount and shows independent default-OFF consent',async()=>{
 render(<SmartPushSettings userId="fan" />);const live=await screen.findByRole('checkbox',{name:'フォロー中パフォーマーのLIVE開始'});expect((live as HTMLInputElement).checked).toBe(false);expect(mock.ensure).not.toHaveBeenCalled()
})
it('requests permission only after explicit LIVE consent and saves just that category',async()=>{
 render(<SmartPushSettings userId="fan" />);fireEvent.click(await screen.findByRole('checkbox',{name:'フォロー中パフォーマーのLIVE開始'}));await waitFor(()=>expect(mock.save).toHaveBeenCalledWith('fan',expect.objectContaining({live_push_enabled:true})));expect(mock.ensure).toHaveBeenCalledWith('fan');expect(mock.save.mock.calls[0][1]).not.toHaveProperty('appearance_push_enabled')
})
it('atomically disables all existing Push categories through the master switch',async()=>{
 render(<SmartPushSettings userId="fan" />);fireEvent.click(await screen.findByRole('checkbox',{name:'プッシュ通知を許可する（OFFで全停止）'}));await waitFor(()=>expect(mock.save).toHaveBeenCalledWith('fan',expect.objectContaining({push_all_enabled:false,live_push_enabled:false,appearance_push_enabled:false})));expect(mock.ensure).not.toHaveBeenCalled()
})
it('guides iPhone installation before allowing OS permission',async()=>{
 Object.defineProperty(navigator,'userAgent',{configurable:true,value:'iPhone Safari'})
 render(<SmartPushSettings userId="fan" />);expect((await screen.findByRole('checkbox',{name:'フォロー中パフォーマーのLIVE開始'}) as HTMLInputElement).disabled).toBe(true);expect(screen.getByRole('img',{name:'Safariの共有ボタンからホーム画面に追加し、HAKUアイコンを開く手順'})).toBeTruthy();expect(mock.ensure).not.toHaveBeenCalled()
})
it('shows a recoverable error and does not save consent if permission is denied',async()=>{
 mock.ensure.mockRejectedValue(new Error('push_denied'));render(<SmartPushSettings userId="fan" />);fireEvent.click(await screen.findByRole('checkbox',{name:'フォロー中パフォーマーのLIVE開始'}));await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('通知が拒否'));expect(mock.save).not.toHaveBeenCalled()
})
