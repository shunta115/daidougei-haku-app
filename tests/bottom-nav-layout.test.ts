import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

describe('bottom navigation layout', () => {
  it('keeps the floating fan navigation centered on desktop', () => {
    const css = read('src/platform/experience.css')
    const desktopRule = css.match(/@media \(min-width: 768px\) \{\s*\.pl-nav--fan \{([\s\S]*?)\}\s*\}/)?.[1]

    expect(desktopRule).toBeDefined()
    expect(desktopRule).toContain('left: 50%')
    expect(desktopRule).toContain('right: auto')
    expect(desktopRule).toContain('width: min(620px, calc(100% - 48px))')
    expect(desktopRule).toContain('transform: translateX(-50%)')
  })

  it('keeps equal-width navigation columns and iPhone safe-area spacing', () => {
    const platformCss = read('src/platform/platform.css')
    const experienceCss = read('src/platform/experience.css')

    expect(platformCss).toContain('grid-auto-columns: 1fr')
    expect(experienceCss).toContain('bottom: calc(8px + env(safe-area-inset-bottom))')
  })
})
