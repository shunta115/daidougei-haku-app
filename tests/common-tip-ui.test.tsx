// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ get: vi.fn(), headers: vi.fn(), user: null as null | {id:string} }))
vi.mock('../src/platform/lib/api', () => ({ getPerformer: mocks.get }))
vi.mock('../src/platform/lib/auth', () => ({ useAuth: () => ({ user: mocks.user }) }))
vi.mock('../src/platform/lib/supabase', () => ({ supabaseAuthHeaders: mocks.headers }))
vi.mock('../src/platform/lib/track', () => ({ trackProductEvent: vi.fn() }))
vi.mock('../src/i18n/LangProvider', () => ({ useLang: () => ({ lang:'ja', t: (key:string) => key }) }))
import { TipScreen } from '../src/platform/screens/TipScreen'
afterEach(() => { cleanup(); vi.unstubAllGlobals(); mocks.user=null; vi.clearAllMocks() })
const props = { onBack:vi.fn(), onDone:vi.fn() }
it.each(['HARIBOW','PAUL','Other A','Other B'])('accepts anonymous and authenticated checkout for %s with the selected recipient', async performerId => {
  mocks.get.mockResolvedValue({id:performerId,is_approved:true})
  mocks.headers.mockResolvedValue({})
  const fetch = vi.fn(async () => ({ok:false,json:async()=>({code:'checkout_failed'})}))
  vi.stubGlobal('fetch',fetch)
  for (const user of [null,{id:'fan'}]) {
    mocks.user=user
    const view=render(<TipScreen {...props} performerId={performerId}/>);
    const button=view.container.querySelector('.pl-btn--tip') as HTMLButtonElement
    await waitFor(()=>expect(button.disabled).toBe(false))
    fireEvent.click(button)
    await waitFor(()=>expect(fetch).toHaveBeenCalled())
    const body=JSON.parse(fetch.mock.calls.at(-1)![1].body)
    expect(body.performerId).toBe(performerId)
    expect(body.fanId).toBe(user?.id)
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/)
    cleanup(); fetch.mockClear()
  }
})
it('blocks rapid duplicate clicks before authentication headers resolve and keeps the retry id', async () => {
  mocks.get.mockResolvedValue({id:'a',is_approved:true})
  let release!: (value: object)=>void
  mocks.headers.mockImplementation(()=>new Promise(resolve=>{release=resolve}))
  const fetch=vi.fn(async()=>({ok:false,json:async()=>({code:'checkout_failed'})}))
  vi.stubGlobal('fetch',fetch)
  const view=render(<TipScreen {...props} performerId="a"/>);
  const button=view.container.querySelector('.pl-btn--tip') as HTMLButtonElement
  await waitFor(()=>expect(button.disabled).toBe(false))
  act(()=>{button.click();button.click()})
  expect(mocks.headers).toHaveBeenCalledTimes(1)
  await act(async()=>release({}))
  await waitFor(()=>expect(button.disabled).toBe(false))
  const first=JSON.parse(fetch.mock.calls[0][1].body).requestId
  mocks.headers.mockResolvedValue({})
  fireEvent.click(button)
  await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2))
  expect(JSON.parse(fetch.mock.calls[1][1].body).requestId).toBe(first)
})
it('ignores a previous performer response after navigating to another performer', async()=>{
  let resolveA!: (value:object)=>void
  mocks.get.mockImplementation((id:string)=>id==='a'?new Promise(resolve=>{resolveA=resolve}):Promise.resolve({id:'b',stage_name:'B',is_approved:true}))
  const view=render(<TipScreen {...props} performerId="a"/>);
  view.rerender(<TipScreen {...props} performerId="b"/>);
  await waitFor(()=>expect(view.container.textContent).toContain('tipTo'))
  await act(async()=>resolveA({id:'a',stage_name:'A',is_approved:false}))
  expect((view.container.querySelector('.pl-btn--tip') as HTMLButtonElement).disabled).toBe(false)
})
