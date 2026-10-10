// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { RefreshButton } from '../src/platform/components/RefreshButton'
import { initialGuestScreen, reloadPreservingNavigation, savedNavigationSnapshot, type NavigationSnapshot } from '../src/platform/PlatformApp'

const routes: Array<{ label: string; url: string; snapshot: NavigationSnapshot }> = [
  { label: 'home', url: '/', snapshot: { screen: 'fan-home', performerId: null, merchProductId: null, eventSlug: null } },
  { label: 'event', url: '/events/award-winning-performers-2026?day=10#schedule', snapshot: { screen: 'event-detail', performerId: null, merchProductId: null, eventSlug: 'award-winning-performers-2026' } },
  { label: 'map', url: '/events/award-winning-performers-2026?day=10#map', snapshot: { screen: 'map-schedule', performerId: null, merchProductId: null, eventSlug: 'award-winning-performers-2026' } },
  { label: 'performers', url: '/live?view=performers', snapshot: { screen: 'search', performerId: null, merchProductId: null, eventSlug: null } },
  { label: 'performer', url: '/performer/performer-123?from=event', snapshot: { screen: 'profile', performerId: 'performer-123', merchProductId: null, eventSlug: null } },
  { label: 'vote', url: '/events/award-winning-performers-2026/vote#candidates', snapshot: { screen: 'event-vote', performerId: null, merchProductId: null, eventSlug: 'award-winning-performers-2026' } },
  { label: 'notifications', url: '/live?view=notifications', snapshot: { screen: 'notifications', performerId: null, merchProductId: null, eventSlug: null } },
  { label: 'my page', url: '/live?view=mypage', snapshot: { screen: 'performer-home', performerId: null, merchProductId: null, eventSlug: null } },
]

beforeEach(() => window.history.replaceState({}, '', '/'))

it.each(routes)('keeps pathname, query, and hash while restoring $label', ({ url, snapshot }) => {
  window.history.replaceState({}, '', url)
  const before = window.location.href
  const reload = vi.fn()
  reloadPreservingNavigation(snapshot, reload)
  expect(reload).toHaveBeenCalledTimes(1)
  expect(window.location.href).toBe(before)
  expect(savedNavigationSnapshot()).toEqual(snapshot)
  expect(initialGuestScreen()).toBe(snapshot.screen)
})

it('prevents parent navigation and invokes only the supplied refresh action', () => {
  const refresh = vi.fn()
  const parent = vi.fn()
  render(<div onClick={parent}><RefreshButton onRefresh={refresh} /></div>)
  fireEvent.click(screen.getByRole('button', { name: '最新情報に更新' }))
  expect(refresh).toHaveBeenCalledTimes(1)
  expect(parent).not.toHaveBeenCalled()
})

for (const query of ['?merch=1', '?merchProduct=product-2']) {
  it(`prioritizes explicit ${query} over a saved home screen`, () => {
    window.history.replaceState({ hakuSnapshot: routes[0].snapshot }, '', '/live' + query)
    expect(initialGuestScreen()).toBe(query.includes('merchProduct') ? 'merch-detail' : 'merch-list')
  })
}

it('does not interpret arbitrary merch values as list links', () => {
  window.history.replaceState({ hakuSnapshot: routes[6].snapshot }, '', '/live?merch=invalid')
  expect(initialGuestScreen()).toBe('notifications')
})
