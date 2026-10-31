// @vitest-environment jsdom
import { act,cleanup,render,screen,waitFor } from '@testing-library/react'
import { afterEach,expect,it,vi } from 'vitest'
import { YouTubeLivePlayer } from '../src/platform/components/YouTubeLivePlayer'
afterEach(()=>{cleanup();delete window.YT;vi.useRealTimers()})
it('keeps a safe external escape available before API load and rejects a stored malicious URL',()=>{
 render(<YouTubeLivePlayer videoId="abcdefghijk" canonicalUrl="javascript:alert(1)" />)
 expect(screen.getByRole('link').getAttribute('href')).toBe('https://www.youtube.com/watch?v=abcdefghijk')
 expect(screen.getByRole('link').getAttribute('rel')).toContain('noopener')
})
it('shows failure within a bounded timeout when the API never loads',()=>{
 vi.useFakeTimers();render(<YouTubeLivePlayer videoId="abcdefghijk" canonicalUrl="" />)
 act(()=>vi.advanceTimersByTime(12_001));expect(screen.getByRole('alert').textContent).toContain('公式画面')
})
it('preserves a React mount across video changes, reports autoplay denial, and ignores stale callbacks',async()=>{
 const events:any[]=[],destroy=vi.fn(),onState=vi.fn()
 window.YT={Player:class{constructor(_node:any,options:any){events.push(options.events)}destroy=destroy} as any,PlayerState:{ENDED:0,PLAYING:1,PAUSED:2,BUFFERING:3,CUED:5}}
 const view=render(<YouTubeLivePlayer videoId="abcdefghijk" canonicalUrl="" onStateChange={onState} />)
 await waitFor(()=>expect(events.length).toBe(1))
 act(()=>events[0].onAutoplayBlocked());expect(screen.getByRole('alert').textContent).toContain('再生ボタン')
 view.rerender(<YouTubeLivePlayer videoId="zyxwvutsrqp" canonicalUrl="" onStateChange={onState} />)
 await waitFor(()=>expect(events.length).toBe(2));expect(destroy).toHaveBeenCalledOnce()
 act(()=>events[0].onError({data:150}));expect(screen.queryByRole('alert')).toBeNull()
 act(()=>events[1].onStateChange({data:3}));expect(onState).toHaveBeenLastCalledWith('buffering')
 act(()=>events[1].onError({data:150}));expect(screen.getByRole('alert').textContent).toContain('埋め込み')
})
