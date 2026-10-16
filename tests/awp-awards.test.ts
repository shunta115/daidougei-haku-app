import { describe, expect, it } from 'vitest'
import { AWP_AWARDS_SOURCE, officialAwpAwards } from '../src/platform/lib/awpAwards'

describe('official AWP awards', () => {
  it('uses the official announcement and resolves known display-name aliases', () => {
    expect(AWP_AWARDS_SOURCE).toBe('https://prtimes.jp/main/html/rd/p/000000125.000016503.html')
    expect(officialAwpAwards('MUTSUKIN')).toContain('全国芸王グランプリ 千葉大会 優勝')
    expect(officialAwpAwards('MUTSUKIN（ムツキン）')).toEqual(officialAwpAwards('MUTSUKIN'))
    expect(officialAwpAwards('エンジョイJoy')).toHaveLength(3)
    expect(officialAwpAwards('公式発表にない名前')).toEqual([])
  })
})
