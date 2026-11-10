/**
 * Mappa per scegliere la posizione (OpenStreetMap + Leaflet usato direttamente, senza react-leaflet).
 *
 * Componente CONTROLLATO: la posizione vive in `App.tsx` (`latitude`, `longitude`); la mappa la
 * mostra con un marcatore e la cambia solo con un clic/tocco o trascinando il marcatore (al
 * rilascio). Spostare o ingrandire la mappa non cambia nulla. Un punto fuori area non cambia nulla
 * e mostra un messaggio (`pointFromMap`).
 *
 * Questo file è caricato in modo differito (`React.lazy` in `LocationMap.tsx`): Leaflet e il suo
 * CSS finiscono in un file a parte, scaricato solo quando la mappa viene mostrata.
 */

import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './map.css' // dopo il CSS di Leaflet: vedi il commento in map.css
import { useEffect, useRef, useState } from 'react'
import {
  MAP_INITIAL_CENTER,
  MAP_INITIAL_ZOOM,
  MAP_MAX_ZOOM,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
} from './config'
import {
  AREA_MAX_LAT,
  AREA_MAX_LON,
  AREA_MIN_LAT,
  AREA_MIN_LON,
  OUTSIDE_AREA_MESSAGE,
  isInArea,
  pointFromMap,
} from './mapArea'

export interface MapPickerProps {
  latitude: number
  longitude: number
  /** Le due coordinate insieme: un solo aggiornamento dello stato, quindi un solo download. */
  onChange: (latitude: number, longitude: number) => void
}

export const MAP_LABEL =
  'Mappa: clicca o tocca per scegliere la posizione; le coordinate si possono anche scrivere nei campi qui sotto'

const AREA_BOUNDS = L.latLngBounds([AREA_MIN_LAT, AREA_MIN_LON], [AREA_MAX_LAT, AREA_MAX_LON])

/**
 * Marcatore disegnato in SVG (non l'icona PNG predefinita di Leaflet: con Vite i suoi percorsi si
 * rompono e servirebbero richieste di rete in più). Colori in `index.css` (`.map-pin`).
 */
const PIN_ICON = L.divIcon({
  className: 'map-pin',
  html:
    '<svg viewBox="0 0 28 38" width="28" height="38" aria-hidden="true" focusable="false">' +
    '<path d="M14 36C14 36 2 22.5 2 14a12 12 0 0 1 24 0c0 8.500-12 22-12 22z" class="map-pin-body"/>' +
    '<circle cx="14" cy="14" r="4.500" class="map-pin-dot"/></svg>',
  iconSize: [28, 38],
  iconAnchor: [14, 37],
})

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export default function MapPicker({ latitude, longitude, onChange }: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  // Valori più recenti per i gestori di Leaflet, creati una sola volta.
  const latest = useRef({ latitude, longitude, onChange })
  useEffect(() => {
    latest.current = { latitude, longitude, onChange }
  })

  // Il messaggio vale solo finché la posizione resta quella in cui è comparso: appena cambia
  // (clic valido, campi, slider) sparisce da solo, senza timer né effetti.
  const [notice, setNotice] = useState<{ lat: number; lon: number } | null>(null)
  const showNotice = notice !== null && notice.lat === latitude && notice.lon === longitude

  // Creazione della mappa (una volta). map.remove() allo smontaggio: StrictMode monta due volte.
  useEffect(() => {
    const container = containerRef.current!
    const map = L.map(container, {
      center: [MAP_INITIAL_CENTER.lat, MAP_INITIAL_CENTER.lon],
      zoom: MAP_INITIAL_ZOOM,
      maxZoom: MAP_MAX_ZOOM,
      maxBounds: AREA_BOUNDS,
      maxBoundsViscosity: 1,
      zoomControl: false,
      attributionControl: false,
      // Il doppio clic produrrebbe due "clic" (due spostamenti della posizione) oltre allo zoom.
      doubleClickZoom: false,
      // La rotella ingrandisce solo a mappa attiva (vedi sotto): non blocca lo scorrimento della pagina.
      scrollWheelZoom: false,
    })
    mapRef.current = map

    L.tileLayer(OSM_TILE_URL, { maxZoom: MAP_MAX_ZOOM, attribution: OSM_ATTRIBUTION }).addTo(map)
    L.control
      .zoom({ position: 'topleft', zoomInTitle: 'Ingrandisci', zoomOutTitle: 'Riduci' })
      .addTo(map)
    // Attribuzione OSM obbligatoria; tolto solo il prefisso "Leaflet" con la bandierina.
    L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map)

    map.on('focus', () => map.scrollWheelZoom.enable())
    map.on('blur', () => map.scrollWheelZoom.disable())

    map.on('click', (e: L.LeafletMouseEvent) => {
      const p = pointFromMap(e.latlng.lat, e.latlng.lng)
      if (p.ok) latest.current.onChange(p.lat, p.lon)
      else setNotice({ lat: latest.current.latitude, lon: latest.current.longitude })
    })

    // Il minZoom segue la dimensione: a questo livello l'area riempie la vista e non si vede il resto.
    const fit = () => {
      const { x, y } = map.getSize()
      if (x === 0 || y === 0) return // nascosta: si rifà quando compare
      map.setMinZoom(Math.min(map.getBoundsZoom(AREA_BOUNDS, true), MAP_MAX_ZOOM))
    }
    // Contenitore nascosto e poi mostrato (telefono), rotazione, ridimensionamento.
    const observer = new ResizeObserver(() => {
      map.invalidateSize()
      fit()
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [])

  // Dai campi alla mappa: il marcatore segue la posizione se è valida; la vista si sposta
  // solo se il marcatore ne esce. Valori non validi (NaN, fuori area) vengono ignorati.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isInArea(latitude, longitude)) return
    const at = L.latLng(latitude, longitude)
    let marker = markerRef.current
    if (!marker) {
      // `keyboard: false`: il marcatore non si può spostare con la tastiera, un'inutile sosta del Tab.
      marker = L.marker(at, { icon: PIN_ICON, draggable: true, keyboard: false, alt: '' }).addTo(map)
      marker.on('dragend', () => {
        const m = marker!.getLatLng()
        const p = pointFromMap(m.lat, m.lng)
        if (p.ok) {
          latest.current.onChange(p.lat, p.lon)
        } else {
          const { latitude: lat, longitude: lon } = latest.current
          marker!.setLatLng([lat, lon]) // torna dov'era
          setNotice({ lat, lon })
        }
      })
      markerRef.current = marker
    } else {
      marker.setLatLng(at)
    }
    if (!map.getBounds().contains(at)) map.panInside(at, { padding: [40, 40], animate: !prefersReducedMotion() })
  }, [latitude, longitude])

  return (
    <div className="map-picker">
      <div ref={containerRef} className="map" role="group" aria-label={MAP_LABEL} />
      <p className="map-notice" role="status">
        {showNotice ? OUTSIDE_AREA_MESSAGE : ''}
      </p>
    </div>
  )
}
