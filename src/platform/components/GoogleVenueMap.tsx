import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Crosshair, LocateFixed, MapPin } from 'lucide-react'
import type { EventSlotRow, EventVenueRow } from '../lib/api'
import type { Performer } from '../lib/types'

type Coordinates = { lat: number; lng: number; accuracy?: number }

type Props = {
  venues: EventVenueRow[]
  slots: EventSlotRow[]
  performers: Performer[]
  selectedDate: string
  selectedVenueId: string | null
  onSelectVenue: (id: string) => void
  onLocationChange: (location: Coordinates | null) => void
}

type LocationState = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable'

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

export function GoogleVenueMap({ venues, slots, performers, selectedDate, selectedVenueId, onSelectVenue, onLocationChange }: Props) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? ''
  const containerRef = useRef<HTMLDivElement>(null)
  const [googleApi, setGoogleApi] = useState<any>(null)
  const [map, setMap] = useState<any>(null)
  const [mapError, setMapError] = useState(false)
  const [locationState, setLocationState] = useState<LocationState>('idle')
  const [location, setLocation] = useState<Coordinates | null>(null)
  const performerById = useMemo(() => new Map(performers.map((performer) => [performer.id, performer])), [performers])
  const center = location ?? venues.find((venue) => venue.lat != null && venue.lng != null) ?? EVENT_CENTER

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationState('unavailable')
      return
    }
    setLocationState('requesting')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const next = { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy }
        setLocation(next)
        setLocationState('granted')
        onLocationChange(next)
      },
      (error) => {
        setLocationState(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable')
        setLocation(null)
        onLocationChange(null)
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  }, [onLocationChange])

  useEffect(() => { requestLocation() }, [requestLocation])

  useEffect(() => {
    if (!apiKey || !containerRef.current) return
    let active = true
    void loadGoogleMaps(apiKey)
      .then((api) => {
        if (!active || !containerRef.current) return
        setGoogleApi(api)
        setMap(new api.maps.Map(containerRef.current, {
          center: EVENT_CENTER,
          zoom: 15,
          clickableIcons: false,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          cameraControl: false,
          styles: MAP_STYLE,
        }))
      })
      .catch(() => { if (active) setMapError(true) })
    return () => { active = false }
  }, [apiKey])

  useEffect(() => {
    if (!map || !googleApi || !location) return
    map.panTo(location)
    map.setZoom(16)
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
    const datedSlots = slots.filter((slot) => String(slot.date).slice(0, 10) === selectedDate)
    venues.forEach((venue) => {
      if (venue.lat == null || venue.lng == null) return
      const slot = datedSlots.find((item) => item.venue_id === venue.id)
      const performer = slot?.performer_id ? performerById.get(slot.performer_id) : null
      const overlay = new googleApi.maps.OverlayView()
      let element: HTMLButtonElement | null = null
      overlay.onAdd = () => {
        element = document.createElement('button')
        element.type = 'button'
        element.className = `pl-google-marker${performer?.is_live ? ' pl-google-marker--live' : ''}${selectedVenueId === venue.id ? ' pl-google-marker--active' : ''}`
        element.setAttribute('aria-label', `${venue.name_ja}を表示`)
        if (performer?.photo_url) {
          const image = document.createElement('img')
          image.src = performer.photo_url
          image.alt = ''
          element.appendChild(image)
        } else {
          const badge = document.createElement('b')
          badge.textContent = 'STAGE'
          element.appendChild(badge)
        }
        const label = document.createElement('span')
        label.textContent = venue.name_ja
        element.appendChild(label)
        element.addEventListener('click', () => onSelectVenue(venue.id))
        overlay.getPanes()?.overlayMouseTarget.appendChild(element)
      }
      overlay.draw = () => {
        if (!element) return
        const point = overlay.getProjection()?.fromLatLngToDivPixel(new googleApi.maps.LatLng(venue.lat, venue.lng))
        if (!point) return
        element.style.left = `${point.x}px`
        element.style.top = `${point.y}px`
      }
      overlay.onRemove = () => { element?.remove(); element = null }
      overlay.setMap(map)
      overlays.push(overlay)
    })
    return () => overlays.forEach((overlay) => overlay.setMap(null))
  }, [googleApi, map, onSelectVenue, performerById, selectedDate, selectedVenueId, slots, venues])

  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${center.lat},${center.lng}`)}`
  const showFallback = !apiKey || mapError

  return (
    <section className="pl-google-map" aria-label="Google Maps会場マップ">
      {showFallback ? <div className="pl-google-map__setup"><MapPin size={28} /><strong>Google Maps</strong><span>地図をアプリ内に表示するには、Google Maps APIの設定が必要です。</span><a href={mapsHref} target="_blank" rel="noopener noreferrer">Google Mapsで会場を見る</a></div> : <div ref={containerRef} className="pl-google-map__canvas" />}
      {locationState !== 'granted' ? (
        <div className="pl-google-map__permission">
          <LocateFixed size={20} />
          <span>{locationState === 'requesting' ? '現在地を確認しています…' : '現在地を許可すると、近くの大道芸を見つけられます。'}</span>
          {locationState !== 'requesting' ? <button type="button" onClick={requestLocation}><Crosshair size={16} /> 現在地を許可</button> : null}
        </div>
      ) : map ? <button type="button" className="pl-google-map__recenter" onClick={() => map.panTo(location)} aria-label="現在地を中央に戻す"><LocateFixed size={19} /></button> : null}
      {showFallback ? <div className="pl-google-map__fallback"><MapPin size={14} /> Google Maps</div> : null}
    </section>
  )
}
