// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GoogleVenueMap } from '../src/platform/components/GoogleVenueMap'

const baseProps = {
  venues: [],
  slots: [],
  performers: [],
  selectedDate: '2026-10-10',
  selectedVenueId: null,
  onSelectVenue: vi.fn(),
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('keeps the map usable after location permission is denied', async () => {
  const getCurrentPosition = vi.fn((_success: PositionCallback, error: PositionErrorCallback) => {
    error({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 })
  })
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } })

  render(<GoogleVenueMap {...baseProps} onLocationChange={vi.fn()} />)
  const retry = await screen.findByRole('button', { name: /現在地を許可/ })
  expect(screen.getByRole('link', { name: 'Google Mapsで会場を見る' })).toBeTruthy()
  fireEvent.click(retry)
  expect(getCurrentPosition).toHaveBeenCalledTimes(2)
})

it('keeps current coordinates in memory and reports them to the map screen', async () => {
  const onLocationChange = vi.fn()
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (success: PositionCallback) => success({
        coords: { latitude: 35.75, longitude: 139.63, accuracy: 24 },
      } as GeolocationPosition),
    },
  })

  render(<GoogleVenueMap {...baseProps} onLocationChange={onLocationChange} />)
  await waitFor(() => expect(onLocationChange).toHaveBeenCalledWith({ lat: 35.75, lng: 139.63, accuracy: 24 }))
  expect(screen.queryByRole('button', { name: /現在地を許可/ })).toBeNull()
})
