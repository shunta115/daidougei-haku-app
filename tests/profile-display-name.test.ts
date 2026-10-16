import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizeDisplayName } from '../src/platform/lib/displayName'

describe('public display name changes', () => {
  it('normalizes valid names and rejects empty, excessive, and control-character input', () => {
    expect(normalizeDisplayName('  新しい名前  ')).toBe('新しい名前')
    expect(() => normalizeDisplayName('   ')).toThrow(/入力/)
    expect(() => normalizeDisplayName('名'.repeat(81))).toThrow(/80/)
    expect(() => normalizeDisplayName('bad\nname')).toThrow(/使用できない/)
  })

  it('derives the production API target from the authenticated session, never request input', () => {
    const api = readFileSync('api/profile/_displayName.ts', 'utf8')
    expect(api).toMatch(/requireAuthUser\(req, res\)/)
    expect(api).toMatch(/\.eq\('id', user\.id\)/)
    expect(api).not.toMatch(/req\.body\?\.(userId|id)/)
    expect(api).toMatch(/\['fan', 'performer'\]\.includes\(profile\.role\)/)
    expect(api).toMatch(/update\(\{ stage_name: displayName \}\)/)
    expect(api).toMatch(/update\(\{ display_name: previousName \}\)/)
    const vercel = readFileSync('vercel.json', 'utf8')
    expect(vercel).toMatch(/\/api\/profile\/display-name/)
    expect(vercel).toMatch(/\/api\/stripe\/tip\?action=display-name/)
  })
})
