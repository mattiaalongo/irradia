/**
 * Mappa della posizione con caricamento differito e comportamento per schermo.
 *
 * - Schermo largo (≥ 820 px): la mappa è sempre visibile.
 * - Telefono (< 820 px): chiusa dietro il pulsante "Scegli sulla mappa"; una mappa aperta
 *   cattura il dito e impedirebbe di scorrere la pagina (decisione del PO, issue #24).
 * Leaflet viene scaricato solo alla prima volta che la mappa è mostrata. Una volta aperta resta
 * montata (nascosta con `hidden`): riaprendo si ritrova lo stesso zoom, senza nuovi download.
 */

import { Suspense, lazy, useId, useState, useSyncExternalStore } from 'react'
import type { MapPickerProps } from './MapPicker'
import ErrorBoundary, { ReloadFallback } from './ErrorBoundary'
import { MAP_ERROR_TEXT } from './errorBoundaryText'

const MapPicker = lazy(() => import('./MapPicker'))

/** Stessa soglia di `index.css` (@media (min-width: 820px)). */
const WIDE_QUERY = '(min-width: 820px)'

function subscribe(cb: () => void) {
  const mq = matchMedia(WIDE_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const isWide = () => matchMedia(WIDE_QUERY).matches

export default function LocationMap(props: MapPickerProps) {
  const wide = useSyncExternalStore(subscribe, isWide, () => true)
  const [opened, setOpened] = useState(false)
  const [everOpened, setEverOpened] = useState(false)
  const panelId = useId()

  const shown = wide || opened
  const mounted = wide || everOpened

  return (
    <div className="location-map">
      {!wide && (
        <button
          type="button"
          className="map-toggle"
          aria-expanded={opened}
          aria-controls={panelId}
          onClick={() => {
            setOpened(!opened)
            setEverOpened(true)
          }}
        >
          {opened ? 'Chiudi la mappa' : 'Scegli sulla mappa'}
        </button>
      )}
      <div id={panelId} className="map-panel" hidden={!shown}>
        {mounted && (
          // Se il file della mappa non si carica, il messaggio occupa lo stesso riquadro (issue #38).
          <ErrorBoundary fallback={<ReloadFallback className="map map-error" text={MAP_ERROR_TEXT} />}>
            <Suspense fallback={<div className="map map-loading" role="status">Carico la mappa…</div>}>
              <MapPicker {...props} />
            </Suspense>
          </ErrorBoundary>
        )}
      </div>
    </div>
  )
}
