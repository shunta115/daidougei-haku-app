import { describe, expect, it, vi } from 'vitest'
import { readLiveOrientationMode, resolveLiveOrientation, writeLiveOrientationMode } from '../src/platform/lib/liveOrientationPreference'

describe('device-local LIVE orientation', () => {
  it('starts portrait, persists a choice and restores it on the next visit', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    }
    expect(readLiveOrientationMode(storage)).toBe('portrait')
    writeLiveOrientationMode(storage, 'landscape')
    expect(readLiveOrientationMode(storage)).toBe('landscape')
    writeLiveOrientationMode(storage, 'auto')
    expect(readLiveOrientationMode(storage)).toBe('auto')
  })

  it('ignores corrupt or unavailable storage', () => {
    expect(readLiveOrientationMode({ getItem: () => 'invalid' })).toBe('portrait')
    expect(readLiveOrientationMode({ getItem: () => { throw new Error('blocked') } })).toBe('portrait')
    expect(() => writeLiveOrientationMode({ setItem: vi.fn(() => { throw new Error('blocked') }) }, 'auto')).not.toThrow()
  })

  it('changes with device rotation only when auto is selected', () => {
    expect(resolveLiveOrientation('portrait', 'landscape')).toBe('portrait')
    expect(resolveLiveOrientation('landscape', 'portrait')).toBe('landscape')
    expect(resolveLiveOrientation('auto', 'portrait')).toBe('portrait')
    expect(resolveLiveOrientation('auto', 'landscape')).toBe('landscape')
  })
})
