// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GoogleVenueMap } from '../src/platform/components/GoogleVenueMap'

const baseProps = {
  venues: [],
  livePerformers: [],
  selectedPerformerId: null,
  selectedVenueId: null,
  onSelectPerformer: vi.fn(),
  onSelectVenue: vi.fn(),
}

afterEach(() => {
  cleanup()
  delete window.google
  delete window.__daidougeiGoogleMaps
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

it('keeps the map usable after location permission is denied', async () => {
  const getCurrentPosition = vi.fn((_success: PositionCallback, error: PositionErrorCallback) => {
    queueMicrotask(() => error({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }))
  })
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } })

  render(<GoogleVenueMap {...baseProps} onLocationChange={vi.fn()} />)
  const retry = await screen.findByRole('button', { name: /再取得/ })
  expect(screen.getByRole('link', { name: 'Google Mapsを開く' })).toBeTruthy()
  fireEvent.click(retry)
  expect(getCurrentPosition).toHaveBeenCalledTimes(2)
})

it('keeps current coordinates in memory and reports them to the map screen', async () => {
  const onLocationChange = vi.fn()
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (success: PositionCallback) => queueMicrotask(() => success({
        coords: { latitude: 35.75, longitude: 139.63, accuracy: 24 },
      } as GeolocationPosition)),
    },
  })

  render(<GoogleVenueMap {...baseProps} onLocationChange={onLocationChange} />)
  await waitFor(() => expect(onLocationChange).toHaveBeenCalledWith({ lat: 35.75, lng: 139.63, accuracy: 24 }))
  expect(screen.queryByRole('button', { name: /現在地を許可/ })).toBeNull()
})

it('starts in roadmap and switches Google Maps to hybrid without replacing map overlays', async () => {
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'local-test-key')
  const setMapTypeId = vi.fn()
  const mapOptions: Record<string, unknown>[] = []

  class FakeMap {
    setMapTypeId = setMapTypeId
    panTo = vi.fn()
    setZoom = vi.fn()
    addListener = vi.fn()
    constructor(_element: Element, options: Record<string, unknown>) {
      mapOptions.push(options)
    }
  }
  class FakeOverlay {
    setMap = vi.fn()
    getPanes = vi.fn(() => ({ overlayMouseTarget: document.createElement('div') }))
    getProjection = vi.fn()
  }
  class FakeShape { setMap = vi.fn() }

  window.google = {
    maps: {
      Map: FakeMap,
      Marker: FakeShape,
      Circle: FakeShape,
      OverlayView: FakeOverlay,
      SymbolPath: { CIRCLE: 'circle' },
      LatLng: class {},
    },
  }
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn(),
    },
  })

  render(<GoogleVenueMap {...baseProps} onLocationChange={vi.fn()} />)
  const roadmap = await screen.findByRole('button', { name: '地図' })
  const hybrid = screen.getByRole('button', { name: '航空写真' })

  expect(mapOptions[0]?.mapTypeId).toBe('roadmap')
  expect(roadmap.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(hybrid)
  await waitFor(() => expect(setMapTypeId).toHaveBeenLastCalledWith('hybrid'))
  expect(hybrid.getAttribute('aria-pressed')).toBe('true')
  expect(mapOptions).toHaveLength(1)
})
