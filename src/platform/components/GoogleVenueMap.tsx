import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Crosshair, LocateFixed, MapPin } from 'lucide-react'
import type { EventVenueRow } from '../lib/api'
import type { MapCoordinates } from '../lib/mapLocation'
import type { Performer } from '../lib/types'

type Props = {
  venues: EventVenueRow[]
  livePerformers: Performer[]
  selectedPerformerId: string | null
  selectedVenueId: string | null
  onSelectPerformer: (id: string) => void
  onSelectVenue: (id: string) => void
  onLocationChange: (location: MapCoordinates | null) => void
}

type LocationState = 'requesting' | 'granted' | 'denied' | 'unavailable'
type MapState = 'loading' | 'ready' | 'missing-key' | 'error'

declare global {
  interface Window {
    google?: any
    __daidougeiGoogleMaps?: Promise<any>
  }
}

const EVENT_CENTER = { lat: 35.7508, lng: 139.6375 }
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

function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps) return Promise.resolve(window.google)
  if (window.__daidougeiGoogleMaps) return window.__daidougeiGoogleMaps
  window.__daidougeiGoogleMaps = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-daido-google-maps]')
    const script = existing ?? document.createElement('script')
    const done = () => window.google?.maps ? resolve(window.google) : reject(new Error('Google Maps could not start'))
    script.addEventListener('load', done, { once: true })
    script.addEventListener('error', () => reject(new Error('Google Maps could not load')), { once: true })
    if (!existing) {
      script.dataset.daidoGoogleMaps = 'true'
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async`
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
  })
  return window.__daidougeiGoogleMaps
}

export function GoogleVenueMap({
  venues,
  livePerformers,
  selectedPerformerId,
  selectedVenueId,
  onSelectPerformer,
  onSelectVenue,
  onLocationChange,
}: Props) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? ''
  const containerRef = useRef<HTMLDivElement>(null)
  const watchIdRef = useRef<number | null>(null)
  const autoCenteredRef = useRef(false)
  const userMovedMapRef = useRef(false)
  const [googleApi, setGoogleApi] = useState<any>(null)
  const [map, setMap] = useState<any>(null)
  const [mapState, setMapState] = useState<MapState>(apiKey ? 'loading' : 'missing-key')
  const [locationState, setLocationState] = useState<LocationState>('requesting')
  const [location, setLocation] = useState<MapCoordinates | null>(null)
  const centerSeed = useMemo(
    () => venues.find((venue) => venue.lat != null && venue.lng != null) ?? EVENT_CENTER,
    [venues],
  )

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
    void loadGoogleMaps(apiKey)
      .then((api) => {
        if (!active || !containerRef.current) return
        const nextMap = new api.maps.Map(containerRef.current, {
          center: centerSeed,
          zoom: 15,
          clickableIcons: false,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          cameraControl: false,
          styles: MAP_STYLE,
        })
        nextMap.addListener('dragstart', () => { userMovedMapRef.current = true })
        setGoogleApi(api)
        setMap(nextMap)
        setMapState('ready')
      })
      .catch(() => { if (active) setMapState('error') })
    return () => { active = false }
  }, [apiKey, centerSeed])

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
      title: '現在地',
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
  }, [googleApi, location, map])

  useEffect(() => {
    if (!map || !googleApi) return
    const overlays: any[] = []
    const addOverlay = (input: {
      position: { lat: number; lng: number }
      label: string
      image?: string | null
      live?: boolean
      active?: boolean
      onClick: () => void
    }) => {
      const overlay = new googleApi.maps.OverlayView()
      let element: HTMLButtonElement | null = null
      overlay.onAdd = () => {
        element = document.createElement('button')
        element.type = 'button'
        element.className = `pl-google-marker${input.live ? ' pl-google-marker--live' : ''}${input.active ? ' pl-google-marker--active' : ''}`
        element.setAttribute('aria-label', `${input.label}${input.live ? 'のLIVEを表示' : 'を表示'}`)
        const portrait = input.image ? document.createElement('img') : document.createElement('b')
        if (portrait instanceof HTMLImageElement) {
          portrait.src = input.image ?? ''
          portrait.alt = ''
        } else {
          portrait.textContent = input.label.slice(0, 2)
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
        label: venue.name_ja,
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
    return () => overlays.forEach((overlay) => overlay.setMap(null))
  }, [googleApi, livePerformers, map, onSelectPerformer, onSelectVenue, selectedPerformerId, selectedVenueId, venues])

  const recenter = () => {
    if (!map || !location) return
    userMovedMapRef.current = false
    map.panTo(location)
    map.setZoom(16)
  }
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${EVENT_CENTER.lat},${EVENT_CENTER.lng}`

  return (
    <section className="pl-google-map" aria-label="Google Maps会場マップ">
      <div ref={containerRef} className="pl-google-map__canvas" />
      {mapState === 'loading' ? <div className="pl-google-map__loading" aria-label="地図を読み込み中"><span /><span /><span /></div> : null}
      {mapState === 'missing-key' || mapState === 'error' ? (
        <div className="pl-google-map__error" role="status">
          <MapPin size={20} />
          <span>{mapState === 'missing-key' ? '地図の公開設定が未完了です。' : '地図を読み込めませんでした。'}</span>
          <a href={mapsHref} target="_blank" rel="noopener noreferrer">Google Mapsを開く</a>
        </div>
      ) : null}
      {locationState !== 'granted' ? (
        <div className="pl-google-map__permission">
          <LocateFixed size={20} />
          <span>{locationState === 'requesting' ? '現在地を確認しています…' : locationState === 'denied' ? '位置情報がOFFです。許可すると近くのLIVEが分かります。' : '現在地を取得できませんでした。'}</span>
          {locationState !== 'requesting' ? <button type="button" onClick={requestLocation}><Crosshair size={16} /> 再取得</button> : null}
        </div>
      ) : map ? (
        <button type="button" className="pl-google-map__recenter" onClick={recenter} aria-label="現在地へ戻る">
          <LocateFixed size={19} />
        </button>
      ) : null}
    </section>
  )
}
