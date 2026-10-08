import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Crosshair, LocateFixed, Map as MapIcon, MapPin, Satellite } from 'lucide-react'
import type { EventVenueRow } from '../lib/api'
import type { MapCoordinates } from '../lib/mapLocation'
import type { Performer } from '../lib/types'
import { venueMapLabel } from '../lib/venueDisplay'
import { mapsLocale, type Lang } from '../../i18n'
import { useLang } from '../../i18n/LangProvider'

type Props = {
  venues: EventVenueRow[]
  livePerformers: Performer[]
  sharedPerformers?: Performer[]
  selectedPerformerId: string | null
  selectedVenueId: string | null
  onSelectPerformer: (id: string) => void
  onSelectVenue: (id: string) => void
  onLocationChange: (location: MapCoordinates | null) => void
  venueFocusNonce?: number
  venueMarkerLabel?: string
}

type LocationState = 'requesting' | 'granted' | 'denied' | 'unavailable'
type MapState = 'loading' | 'ready' | 'missing-key' | 'error'
type MapDisplayMode = 'roadmap' | 'hybrid'

declare global {
  interface Window {
    google?: any
    __daidougeiGoogleMaps?: Promise<any>
  }
}

const WORLD_CENTER = { lat: 20, lng: 0 }
const MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#d7e3ea' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#263b48' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f4f8fa' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#cbded8' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#f8fbfc' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#bfd1dc' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#c7d4dc' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#8bbbd3' }] },
]

function loadGoogleMaps(apiKey: string, lang: Lang) {
  const { language, region } = mapsLocale(lang)
  const tag = `${language}:${region}`
  const existing = document.querySelector<HTMLScriptElement>('script[data-daido-google-maps]')
  if (existing && existing.dataset.mapsLocale !== tag) {
    return Promise.reject(new Error('Google Maps locale mismatch'))
  }
  if (window.google?.maps) return Promise.resolve(window.google)
  if (window.__daidougeiGoogleMaps) return window.__daidougeiGoogleMaps

  window.__daidougeiGoogleMaps = new Promise((resolve, reject) => {
    const callback = `__daidougeiMapsReady_${language.replace('-', '_')}`
    ;(window as unknown as Window & { [key: string]: unknown })[callback] = () => {
      if (window.google?.maps) resolve(window.google)
      else reject(new Error('Google Maps could not start'))
    }
    const script = document.createElement('script')
    script.dataset.daidoGoogleMaps = 'true'
    script.dataset.mapsLocale = tag
    script.async = true
    script.defer = true
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&language=${encodeURIComponent(language)}&region=${encodeURIComponent(region)}&callback=${callback}`
    script.addEventListener('error', () => reject(new Error('Google Maps could not load')), { once: true })
    document.head.appendChild(script)
  })
  return window.__daidougeiGoogleMaps
}

export function GoogleVenueMap({
  venues,
  livePerformers,
  sharedPerformers = [],
  selectedPerformerId,
  selectedVenueId,
  onSelectPerformer,
  onSelectVenue,
  onLocationChange,
  venueFocusNonce,
  venueMarkerLabel,
}: Props) {
  const { t, lang } = useLang()
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? ''
  const containerRef = useRef<HTMLDivElement>(null)
  const watchIdRef = useRef<number | null>(null)
  const autoCenteredRef = useRef(false)
  const userMovedMapRef = useRef(false)
  const [googleApi, setGoogleApi] = useState<any>(null)
  const [map, setMap] = useState<any>(null)
  const [mapState, setMapState] = useState<MapState>(apiKey ? 'loading' : 'missing-key')
  const [displayMode, setDisplayMode] = useState<MapDisplayMode>('roadmap')
  const [locationState, setLocationState] = useState<LocationState>('requesting')
  const [location, setLocation] = useState<MapCoordinates | null>(null)
  const [areaDirty, setAreaDirty] = useState(false)
  const [areaCount, setAreaCount] = useState<number | null>(null)
  const hasVenueSeed = venues.some((venue) => venue.lat != null && venue.lng != null)
  const centerSeed = useMemo(
    () => venues.find((venue) => venue.lat != null && venue.lng != null) ?? WORLD_CENTER,
    [venues],
  )
  const centerSeedRef = useRef(centerSeed)
  const hasVenueSeedRef = useRef(hasVenueSeed)
  centerSeedRef.current = centerSeed
  hasVenueSeedRef.current = hasVenueSeed

  const acceptPosition = useCallback((position: GeolocationPosition) => {
    const next = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
    }
    setLocation(next)
    setLocationState('granted')
    onLocationChange(next)
  }, [onLocationChange])

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationState('unavailable')
      return
    }
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current)
    setLocationState('requesting')
    const denied = (error: GeolocationPositionError) => {
      setLocationState(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable')
      setLocation(null)
      onLocationChange(null)
    }
    if (typeof navigator.geolocation.watchPosition === 'function') {
      watchIdRef.current = navigator.geolocation.watchPosition(
        acceptPosition,
        denied,
        { enableHighAccuracy: true, timeout: 12_000, maximumAge: 10_000 },
      )
    } else {
      navigator.geolocation.getCurrentPosition(
        acceptPosition,
        denied,
        { enableHighAccuracy: true, timeout: 12_000, maximumAge: 10_000 },
      )
    }
  }, [acceptPosition, onLocationChange])

  useEffect(() => {
    requestLocation()
    return () => {
      if (watchIdRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [requestLocation])

  useEffect(() => {
    if (!apiKey || !containerRef.current) return
    let active = true
    setMapState('loading')
    const slowTimer = window.setTimeout(() => {
      if (active) setMapState('error')
    }, 8_000)
    void loadGoogleMaps(apiKey, lang)
      .then((api) => {
        if (!active || !containerRef.current) return
        window.clearTimeout(slowTimer)
        const nextMap = new api.maps.Map(containerRef.current, {
          center: centerSeedRef.current,
          zoom: hasVenueSeedRef.current ? 13 : 2,
          mapTypeId: 'roadmap',
          clickableIcons: false,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          zoomControl: true,
          cameraControl: false,
          styles: MAP_STYLE,
        })
        nextMap.addListener('dragstart', () => { userMovedMapRef.current = true })
        nextMap.addListener('dragend', () => setAreaDirty(true))
        nextMap.addListener('zoom_changed', () => { if (userMovedMapRef.current) setAreaDirty(true) })
        setGoogleApi(api)
        setMap(nextMap)
        setMapState('ready')
      })
      .catch(() => { window.clearTimeout(slowTimer); if (active) setMapState('error') })
    return () => { active = false; window.clearTimeout(slowTimer) }
  }, [apiKey, lang])

  useEffect(() => {
    if (!map || !containerRef.current) return
    const node = containerRef.current
    const refresh = () => {
      try { window.google?.maps?.event?.trigger(map, 'resize') } catch { /* keep current view */ }
    }
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(refresh) : null
    observer?.observe(node)
    refresh()
    return () => observer?.disconnect()
  }, [map])

  useEffect(() => {
    if (!map) return
    map.setMapTypeId(displayMode)
  }, [displayMode, map])

  useEffect(() => {
    if (!map || !googleApi || !location) return
    if (!autoCenteredRef.current && !userMovedMapRef.current) {
      map.panTo(location)
      map.setZoom(16)
      autoCenteredRef.current = true
    }
    const dot = new googleApi.maps.Marker({
      map,
      position: location,
      zIndex: 1000,
      icon: {
        path: googleApi.maps.SymbolPath.CIRCLE,
        fillColor: '#2388ff',
        fillOpacity: 1,
        scale: 8,
        strokeColor: '#ffffff',
        strokeWeight: 3,
      },
      title: t('mapsHere'),
    })
    const accuracy = new googleApi.maps.Circle({
      map,
      center: location,
      radius: Math.max(20, location.accuracy ?? 40),
      fillColor: '#2388ff',
      fillOpacity: .12,
      strokeColor: '#2388ff',
      strokeOpacity: .38,
      strokeWeight: 1,
    })
    return () => { dot.setMap(null); accuracy.setMap(null) }
  }, [googleApi, location, map, t])

  useEffect(() => {
    if (!map || !googleApi) return
    const overlays: any[] = []
    const addOverlay = (input: {
      position: { lat: number; lng: number }
      label: string
      badge?: string
      image?: string | null
      live?: boolean
      performer?: boolean
      active?: boolean
      onClick: () => void
    }) => {
      const overlay = new googleApi.maps.OverlayView()
      let element: HTMLButtonElement | null = null
      overlay.onAdd = () => {
        element = document.createElement('button')
        element.type = 'button'
        element.className = `pl-google-marker${input.live ? ' pl-google-marker--live' : input.performer ? ' pl-google-marker--performer' : ' pl-google-marker--venue'}${input.active ? ' pl-google-marker--active' : ''}`
        element.setAttribute('aria-label', input.live ? t('mapsShowLive', { name: input.label }) : t('mapsShowPlace', { name: input.label }))
        const portrait = input.image ? document.createElement('img') : document.createElement('b')
        if (portrait instanceof HTMLImageElement) {
          portrait.src = input.image ?? ''
          portrait.alt = ''
        } else {
          portrait.textContent = (input.badge || input.label).slice(0, 4)
        }
        element.appendChild(portrait)
        if (input.live) {
          const badge = document.createElement('i')
          badge.textContent = 'LIVE'
          element.appendChild(badge)
        }
        const label = document.createElement('span')
        label.textContent = input.label
        element.appendChild(label)
        element.addEventListener('click', input.onClick)
        overlay.getPanes()?.overlayMouseTarget.appendChild(element)
      }
      overlay.draw = () => {
        if (!element) return
        const point = overlay.getProjection()?.fromLatLngToDivPixel(
          new googleApi.maps.LatLng(input.position.lat, input.position.lng),
        )
        if (!point) return
        element.style.left = `${point.x}px`
        element.style.top = `${point.y}px`
      }
      overlay.onRemove = () => { element?.remove(); element = null }
      overlay.setMap(map)
      overlays.push(overlay)
    }

    venues.forEach((venue) => {
      if (venue.lat == null || venue.lng == null) return
      addOverlay({
        position: { lat: venue.lat, lng: venue.lng },
        label: venueMapLabel(venue),
        badge: venueMarkerLabel,
        active: selectedVenueId === venue.id,
        onClick: () => onSelectVenue(venue.id),
      })
    })
    livePerformers.forEach((performer) => {
      if (performer.lat == null || performer.lng == null) return
      addOverlay({
        position: { lat: performer.lat, lng: performer.lng },
        label: performer.stage_name,
        image: performer.photo_url,
        live: true,
        active: selectedPerformerId === performer.id,
        onClick: () => onSelectPerformer(performer.id),
      })
    })
    sharedPerformers.forEach((performer) => {
      if (performer.lat == null || performer.lng == null) return
      addOverlay({
        position: { lat: performer.lat, lng: performer.lng },
        label: performer.stage_name,
        image: performer.photo_url,
        performer: true,
        active: selectedPerformerId === performer.id,
        onClick: () => onSelectPerformer(performer.id),
      })
    })
    return () => overlays.forEach((overlay) => overlay.setMap(null))
  }, [googleApi, livePerformers, map, onSelectPerformer, onSelectVenue, selectedPerformerId, selectedVenueId, sharedPerformers, t, venueMarkerLabel, venues])

  useEffect(() => {
    if (!map || !selectedVenueId) return
    const venue = venues.find((item) => item.id === selectedVenueId)
    if (venue?.lat == null || venue.lng == null) return
    userMovedMapRef.current = true
    const focus = () => {
      map.panTo({ lat: venue.lat, lng: venue.lng })
      map.setZoom(16)
      try { window.google?.maps?.event?.trigger(map, 'resize') } catch { /* keep current view */ }
    }
    const timer = window.setTimeout(focus, 280)
    return () => window.clearTimeout(timer)
  }, [map, selectedVenueId, venueFocusNonce, venues])

  const recenter = () => {
    if (!map || !location) return
    userMovedMapRef.current = false
    map.panTo(location)
    map.setZoom(16)
    setAreaDirty(false)
  }
  const searchVisibleArea = () => {
    if (!map || !googleApi) return
    const bounds = map.getBounds?.()
    if (!bounds) return
    const points = [
      ...venues.filter((item) => item.lat != null && item.lng != null).map((item) => ({ lat: item.lat!, lng: item.lng! })),
      ...livePerformers.filter((item) => item.lat != null && item.lng != null).map((item) => ({ lat: item.lat!, lng: item.lng! })),
      ...sharedPerformers.filter((item) => item.lat != null && item.lng != null).map((item) => ({ lat: item.lat!, lng: item.lng! })),
    ]
    setAreaCount(points.filter((point) => bounds.contains(new googleApi.maps.LatLng(point.lat, point.lng))).length)
    setAreaDirty(false)
  }
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${centerSeed.lat},${centerSeed.lng}`

  return (
    <section id="haku-venue-map" className="pl-google-map" aria-label={t('mapsAria')}>
      <div ref={containerRef} className="pl-google-map__canvas" />
      {mapState === 'ready' ? (
        <div className="pl-google-map__type" role="group" aria-label={t('mapsMode')}>
          <button
            type="button"
            aria-pressed={displayMode === 'roadmap'}
            data-active={displayMode === 'roadmap'}
            onClick={() => setDisplayMode('roadmap')}
          >
            <MapIcon size={14} /> {t('mapsRoad')}
          </button>
          <button
            type="button"
            aria-pressed={displayMode === 'hybrid'}
            data-active={displayMode === 'hybrid'}
            onClick={() => setDisplayMode('hybrid')}
          >
            <Satellite size={14} /> {t('mapsSatellite')}
          </button>
        </div>
      ) : null}
      {mapState === 'ready' && areaDirty ? <button type="button" className="pl-google-map__search-area" onClick={searchVisibleArea}>{t('mapSearchArea')}</button> : null}
      {mapState === 'ready' && areaCount !== null && !areaDirty ? <span className="pl-google-map__area-count" role="status">{t('mapAreaCount', { n: areaCount })}</span> : null}
      {mapState === 'loading' ? <div className="pl-google-map__loading" aria-label={t('mapsLoading')}><span /><span /><span /></div> : null}
      {mapState === 'missing-key' || mapState === 'error' ? (
        <div className="pl-google-map__error" role="status">
          <MapPin size={20} />
          <span>{mapState === 'missing-key' ? t('mapsMissing') : t('mapsSlow')}</span>
          <a href={mapsHref} target="_blank" rel="noopener noreferrer">{t('mapsOpen')}</a>
        </div>
      ) : null}
      {locationState !== 'granted' ? (
        <div className="pl-google-map__permission">
          <LocateFixed size={20} />
          <span>{locationState === 'requesting' ? t('mapsLocating') : locationState === 'denied' ? t('mapsDenied') : t('mapsUnavailable')}</span>
          {locationState !== 'requesting' ? <button type="button" onClick={requestLocation}><Crosshair size={16} /> {t('mapsRetry')}</button> : null}
        </div>
      ) : map ? (
        <button type="button" className="pl-google-map__recenter" onClick={recenter} aria-label={t('mapsRecenter')}>
          <LocateFixed size={19} />
        </button>
      ) : null}
    </section>
  )
}
