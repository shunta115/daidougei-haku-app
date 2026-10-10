import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('official navigator safety', () => {
  it('limits writes to administrators while allowing only enabled public rows', () => {
    const sql = read('supabase/migrations/20261010_official_navigators.sql')
    expect(sql).toContain('show_on_home = true')
    expect(sql).toContain('public.is_admin()')
    expect(sql).toContain("e.status = 'published'")
    expect(sql).toContain('using (public.is_admin())')
    expect(sql).toContain('with check (public.is_admin())')
    expect(sql).toContain('revoke insert, update, delete on public.event_official_navigators from anon')
    expect(sql).toContain('references public.performers(id) on delete restrict')
  })

  it('uses Asia/Tokyo to select the daily navigator', () => {
    const api = read('src/platform/lib/api.ts')
    expect(api).toContain("timeZone: 'Asia/Tokyo'")
    expect(api).toContain(".eq('event_date', todayJst)")
  })

  it('reuses the existing live and profile routes without changing payment permissions', () => {
    const home = read('src/platform/screens/FanHomeScreen.tsx')
    expect(home).toContain("navigator.live_status === 'live'")
    expect(home).toContain('onWatch(performer.id)')
    expect(home).toContain('onOpen(performer.id)')
    expect(home).toContain('pl-navigator__cheer')
    expect(home).toContain('応援する')
    expect(home).not.toContain('投げ銭は準備中')
  })
})
