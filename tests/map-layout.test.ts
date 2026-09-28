import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('constrains the Google Maps container to the MAP layout column', () => {
  const css = readFileSync(new URL('../src/platform/experience.css', import.meta.url), 'utf8')
  const map = css.slice(css.indexOf('.pl-google-map {'), css.indexOf('.pl-google-map iframe'))
  const canvas = css.slice(css.indexOf('.pl-google-map iframe'), css.indexOf('.pl-google-map__loading'))
  const page = css.slice(css.indexOf('.pl-map-schedule {'), css.indexOf('.pl-google-map {'))
  expect(page).toContain('width: 100%')
  expect(page).toContain('max-width: 100%')
  expect(page).toContain('min-width: 0')
  expect(map).toContain('width: 100%')
  expect(map).toContain('max-width: 100%')
  expect(map).toContain('min-width: 0')
  expect(map).toContain('margin-inline: auto')
  expect(map).toContain('box-sizing: border-box')
  expect(canvas).toContain('width: 100%')
  expect(canvas).toContain('max-width: 100%')
  expect(canvas).toContain('min-width: 0')
  expect(canvas).toContain('box-sizing: border-box')
})
