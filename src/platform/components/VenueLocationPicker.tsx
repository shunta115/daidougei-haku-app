import { useEffect, useRef, useState } from 'react'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { AppearanceLocation } from '../lib/appearanceLocation'
import './venue-location-picker.css'

type Point = { lat: number; lng: number }
export default function VenueLocationPicker({ initial, onConfirm, onCancel }: {
  initial: AppearanceLocation | null; onConfirm: (point: Point) => void; onCancel: () => void
}) {
  const node = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<Point | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const choose = useRef((_: Point) => {})
  choose.current = point => { setSelected(point); setConfirmed(false) }
  useEffect(() => {
    if (!node.current) return
    const map = L.map(node.current, { scrollWheelZoom: false }).setView(initial ? [initial.lat, initial.lng] : [36, 138], initial ? 15 : 5)
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
    }).addTo(map)
    tiles.on('tileload', () => setLoaded(true))
    tiles.on('tileerror', () => setFailed(true))
    let pin: L.CircleMarker | null = null
    const selectPoint = (point: Point) => {
      point = L.latLng(point.lat, point.lng).wrap()
      if (pin) pin.setLatLng(point)
      else pin = L.circleMarker(point, { radius: 10, color: '#074cff', fillOpacity: .6 }).addTo(map)
      choose.current({ lat: Number(point.lat.toFixed(6)), lng: Number(point.lng.toFixed(6)) })
    }
    map.on('click', event => selectPoint(event.latlng))
    const center = () => selectPoint(map.getCenter())
    node.current.addEventListener('haku:select-center', center)
    const element = node.current
    return () => { element.removeEventListener('haku:select-center', center); map.remove() }
  }, [])
  return <section className="pl-venue-picker" aria-label="会場の位置を地図で確認">
    <p>地図を動かし、実際の出演地点をタップしてください。地図の矢印キー操作も利用できます。</p>
    {initial?.precision === 'approximate' ? <p>最初の表示は概略位置です：{initial.label}</p> : null}
    <div ref={node} className="pl-venue-picker__map" />
    {!loaded || failed ? <p role="status">{failed ? '地図を読み込めません。位置を設定せずに予定登録を続けることもできます。' : '地図を読み込んでいます。'}</p> : null}
    <button type="button" className="pl-btn pl-btn--ghost" onClick={() => node.current?.dispatchEvent(new Event('haku:select-center'))}>地図中央を選ぶ</button>
    {selected ? <p>選択位置：{selected.lat}, {selected.lng}</p> : null}
    <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />地図上で出演地点を確認しました</label>
    <div className="pl-appearance-actions"><button type="button" className="pl-btn" disabled={!selected || !confirmed || !loaded || failed} onClick={() => selected && onConfirm(selected)}>この位置を使う</button><button type="button" className="pl-btn pl-btn--ghost" onClick={onCancel}>閉じる</button></div>
  </section>
}
