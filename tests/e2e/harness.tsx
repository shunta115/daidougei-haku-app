import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LangProvider } from '../../src/i18n/LangProvider'
import { PerformerAppearanceManager } from '../../src/platform/screens/PerformerAppearanceManager'
import { MapScheduleScreen } from '../../src/platform/screens/MapScheduleScreen'
import { PerformerPublicScreen } from '../../src/platform/screens/PerformerPublicScreen'
import { performer } from './fixture-api'
import '../../src/index.css'
import '../../src/platform/platform.css'
import '../../src/platform/experience.css'

// Offline Maps adapter: exercise the real GoogleVenueMap overlay DOM, with no paid API calls.
class MapFixture {
  node: HTMLElement
  constructor(node: HTMLElement) { this.node = node }
  addListener() { return { remove() {} } }
  setMapTypeId() {} setCenter() {} panTo() {} setZoom() {} fitBounds() {}
  getZoom() { return 14 }
  getBounds() { return { contains: () => true } }
}
class OverlayFixture {
  map: MapFixture | null = null
  onAdd = () => {}; onRemove = () => {}; draw = () => {}
  setMap(map: MapFixture | null) { this.map = map; if (map) { this.onAdd(); this.draw() } else this.onRemove() }
  getPanes() { return { overlayMouseTarget: this.map!.node } }
  getProjection() { return { fromLatLngToDivPixel: () => ({ x: 150, y: 150 }) } }
}
class DecorationFixture { setMap() {} }
;(window as any).google = { maps: { Map: MapFixture, OverlayView: OverlayFixture,
  LatLng: class { constructor(public lat: number, public lng: number) {} },
  Marker: DecorationFixture, Circle: DecorationFixture,
  SymbolPath: { CIRCLE: 0 }, event: { trigger() {} } } }
function App() {
  const [view, setView] = useState('editor')
  return <LangProvider><nav>{['editor', 'schedule', 'map', 'profile'].map(v => <button key={v} onClick={() => setView(v)}>{v}</button>)}</nav>
    {view === 'editor' ? <PerformerAppearanceManager /> : view === 'profile' ? <PerformerPublicScreen performerId={performer.id} onBack={() => setView('schedule')} onTip={() => {}} onWatchLive={() => {}} /> : <MapScheduleScreen initialView={view as 'map' | 'schedule'} onOpenPerformer={() => setView('profile')} onWatchLive={() => {}} />}
  </LangProvider>
}
createRoot(document.getElementById('root')!).render(<App />)
