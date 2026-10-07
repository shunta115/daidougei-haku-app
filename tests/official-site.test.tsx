// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { OfficialSite } from '../src/official/OfficialSite'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('shows the official event, program and HAKU routes', () => {
  render(<OfficialSite />)
  expect(screen.getByRole('heading', { name: /DAIDOGEI HAKU/ })).toBeTruthy()
  expect(screen.getByText('2026.10.10 - 10.12')).toBeTruthy()
  expect(screen.getByRole('link', { name: /プログラムはこちら/ }).getAttribute('href')).toBe('/events/award-winning-performers-2026')
  expect(screen.getByRole('link', { name: /HAKUを開く/ }).getAttribute('href')).toBe('/')
})

it('opens and closes flyer images in an accessible dialog', () => {
  render(<OfficialSite />)
  fireEvent.click(screen.getByRole('button', { name: 'AWP 2026 受賞者たち 表面を拡大表示' }))
  expect(screen.getByRole('dialog', { name: 'AWP 2026 受賞者たち 表面' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})
