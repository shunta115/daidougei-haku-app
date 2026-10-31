// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const wire = vi.hoisted(()=>({read:vi.fn(),handlers:null as any,unsubscribe:vi.fn()}))
vi.mock('../src/platform/lib/api',()=>({listLiveComments:(...args:unknown[])=>wire.read(...args),subscribeLiveComments:(_p:string,_s:string,h:any)=>{wire.handlers=h;return wire.unsubscribe}}))
import { useLiveComments } from '../src/platform/lib/useLiveComments'
import { useLiveCommentScroll } from '../src/platform/lib/useLiveCommentScroll'
const row=(id:string)=>({id,live_session_id:'session',performer_id:'p',user_id:'u',display_name:'QA',body:id,created_at:''})
beforeEach(()=>{vi.useFakeTimers();wire.read.mockReset().mockResolvedValue([]);wire.unsubscribe.mockReset()})
afterEach(()=>{cleanup();vi.useRealTimers()})
it('does not replace a realtime insert with a stale initial snapshot; recovers missing events on reconnect',async()=>{
 let resolve:(rows:any[])=>void=()=>{}
 wire.read.mockImplementationOnce(()=>new Promise(done=>{resolve=done}))
 const view=renderHook(()=>useLiveComments('p','session',true))
 act(()=>wire.handlers.onInsert(row('new')))
 await act(async()=>resolve([]))
 expect(view.result.current.comments.map(c=>c.id)).toEqual(['new'])
 wire.read.mockResolvedValue([row('new'),row('missed')])
 await act(async()=>wire.handlers.onReady())
 expect(view.result.current.comments.map(c=>c.id)).toEqual(['new','missed'])
})
it('ignores delayed snapshots and events from a previous session and cleans resources',async()=>{
 let resolve:(rows:any[])=>void=()=>{}
 wire.read.mockImplementationOnce(()=>new Promise(done=>{resolve=done}))
 const view=renderHook(({session})=>useLiveComments('p',session,true),{initialProps:{session:'old'}})
 const old=wire.handlers
 view.rerender({session:'new'})
 await act(async()=>{resolve([row('old')]);old.onInsert(row('stale'))})
 expect(view.result.current.comments).toEqual([])
 view.unmount();expect(wire.unsubscribe).toHaveBeenCalledTimes(2);expect(vi.getTimerCount()).toBe(0)
})
it('detects new comments after the 80-row cap without forcing a scrolled-up reader to the bottom',()=>{
 const hook=renderHook(({id})=>useLiveCommentScroll(80,id,'session'),{initialProps:{id:'80'}})
 const node=document.createElement('div');Object.defineProperty(node,'scrollHeight',{value:500});Object.defineProperty(node,'clientHeight',{value:100});node.scrollTo=vi.fn()
 ;(hook.result.current.listRef as any).current=node
 act(()=>hook.result.current.onScroll())
 hook.rerender({id:'81'})
 expect(hook.result.current.hasNewComments).toBe(true);expect(node.scrollTo).not.toHaveBeenCalled()
 act(()=>hook.result.current.scrollToLatest('auto'));expect(node.scrollTo).toHaveBeenCalledWith({top:500,behavior:'auto'})
})

it('reconciles healthy Realtime only once a minute while disconnect and foreground recover immediately',async()=>{
 const view=renderHook(()=>useLiveComments('p','session',true))
 await act(async()=>{})
 await act(async()=>wire.handlers.onReady())
 const initial=wire.read.mock.calls.length
 await act(async()=>{await vi.advanceTimersByTimeAsync(57_000)})
 expect(wire.read).toHaveBeenCalledTimes(initial)
 await act(async()=>{await vi.advanceTimersByTimeAsync(3000)})
 expect(wire.read).toHaveBeenCalledTimes(initial+1)
 wire.read.mockResolvedValue([row('recovered')])
 await act(async()=>wire.handlers.onConnectionChange(false))
 expect(view.result.current.comments[0].id).toBe('recovered')
 await act(async()=>{await vi.advanceTimersByTimeAsync(3000)})
 expect(wire.read).toHaveBeenCalledTimes(initial+3)
 await act(async()=>window.dispatchEvent(new Event('online')))
 expect(wire.read).toHaveBeenCalledTimes(initial+4)
 view.unmount();expect(vi.getTimerCount()).toBe(0)
})
