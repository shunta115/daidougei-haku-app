// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { JSDOM } from 'jsdom'
import { LangProvider, LanguageToggle, useLang } from '../src/i18n/LangProvider'
import { displayStageName } from '../src/platform/lib/stageLabel'

function CurrentLabel() {
  const { t } = useLang()
  return <p>{t('eventListTitle')}</p>
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('language switching and public stage labels', () => {
  it('changes only the language while preserving pathname, query and hash', () => {
    const storage = new JSDOM('', { url: 'http://localhost' }).window.localStorage
    vi.stubGlobal('localStorage', storage)
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage })
    window.history.replaceState({}, '', '/events/award-winning-performers-2026?release=test#event-schedule')
    window.localStorage.setItem('daidougei-lang', 'ja')
    render(<LangProvider><LanguageToggle /><CurrentLabel /></LangProvider>)
    fireEvent.click(screen.getByRole('button', { name: '日本語' }))
    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(window.location.pathname).toBe('/events/award-winning-performers-2026')
    expect(window.location.search).toBe('?release=test')
    expect(window.location.hash).toBe('#event-schedule')
    expect(screen.getByText('Into the roar of the street.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    fireEvent.click(screen.getByRole('button', { name: '繁體中文' }))
    expect(window.location.pathname).toBe('/events/award-winning-performers-2026')
    expect(window.location.search).toBe('?release=test')
    expect(window.location.hash).toBe('#event-schedule')

    fireEvent.click(screen.getByRole('button', { name: '繁體中文' }))
    fireEvent.click(screen.getByRole('button', { name: '日本語' }))
    expect(window.location.pathname).toBe('/events/award-winning-performers-2026')
    expect(window.location.search).toBe('?release=test')
    expect(window.location.hash).toBe('#event-schedule')
  })

  it('uses full-width stage numbers only for presentation', () => {
    expect(displayStageName('ステージ1')).toBe('ステージ１')
    expect(displayStageName('ステージ2 / 東口')).toBe('ステージ２ / 東口')
    expect(displayStageName('stage1')).toBe('stage1')
  })
})
