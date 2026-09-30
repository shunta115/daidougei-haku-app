import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('keeps the MAP experience column inside the parent padding box', () => {
  const css = readFileSync(new URL('../src/platform/experience.css', import.meta.url), 'utf8')
  const page = css.slice(css.indexOf('.pl-map-schedule {'), css.indexOf('.pl-google-map {'))
  const map = css.slice(css.indexOf('.pl-google-map {'), css.indexOf('.pl-google-map iframe'))
  expect(page).toContain('grid-template-columns: minmax(0, 1fr)')
  expect(page).toContain('width: 100%')
  expect(page).toContain('max-width: 100%')
  expect(page).toContain('min-width: 0')
  expect(page).not.toContain('overflow-x: clip')
  expect(page).not.toContain('78vw')
  expect(map).toContain('width: 100%')
  expect(map).toContain('min-width: 0')
  expect(map).toContain('box-sizing: border-box')
})

it('makes the MAP canvas the hero on phones and caps it on larger screens', () => {
  const css = readFileSync(new URL('../src/platform/experience.css', import.meta.url), 'utf8')
  expect(css).toContain('height: clamp(520px, 65dvh, 720px)')
  expect(css).toContain('max-height: calc(100dvh - 13.5rem - env(safe-area-inset-bottom, 0px))')
  expect(css).toContain('.pl-google-marker--live')
  expect(css).toContain('.pl-google-marker--venue')
  expect(css).toContain('.pl-map-stage__sheet')
})
