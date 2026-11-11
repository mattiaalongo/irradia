import { useDeferredValue, useMemo, useState } from 'react'
import type { Tmy } from './engine/pvgisTmy'
import { DEFAULT_SYSTEM_LOSS_PCT, simulateYear, type PvSystem, type YearResult } from './engine/simulate'
import AnnualTotal from './ui/AnnualTotal'
import LocationMap from './ui/LocationMap'
import MonthlyChart from './ui/MonthlyChart'
import NumberSlider from './ui/NumberSlider'
import SiteFooter from './ui/SiteFooter'
import StickyTotal, { type StickyTotalState } from './ui/StickyTotal'
import { describeTmyError } from './ui/errorMessage'
import { cardinalDirection, formatNumber } from './ui/format'
import { AREA_MAX_LAT, AREA_MAX_LON, AREA_MIN_LAT, AREA_MIN_LON } from './ui/mapArea'
import { shadingNote } from './ui/sourceNote'
import { useTmy } from './ui/useTmy'

/** Simula l'anno; restituisce un messaggio invece di bloccare la pagina se il motore rifiuta i parametri. */
function runSimulation(tmy: Tmy | null, system: PvSystem): { year: YearResult } | { error: string } | null {
  if (!tmy) return null
  try {
    return { year: simulateYear(tmy, system) }
  } catch (err) {
    return { error: (err as Error).message }
  }
}

export default function App() {
  // Posizione: è l'UNICO ingresso del download dei dati PVGIS (vedi useTmy).
  const [latitude, setLatitude] = useState(41.9028) // Roma centro, come le fixture dei test
  const [longitude, setLongitude] = useState(12.4964)

  // Impianto: entra solo nel calcolo locale, non provoca mai download.
  const [tiltDeg, setTiltDeg] = useState(35)
  const [azimuthDeg, setAzimuthDeg] = useState(180)
  const [panelCount, setPanelCount] = useState(10)
  const [panelPowerWp, setPanelPowerWp] = useState(430)
  const [systemLossPct, setSystemLossPct] = useState(DEFAULT_SYSTEM_LOSS_PCT)

  const tmyState = useTmy(latitude, longitude)
  const tmy = tmyState.status === 'ready' ? tmyState.tmy : tmyState.previousTmy

  const system = useMemo<PvSystem>(
    () => ({ tiltDeg, azimuthDeg, panelCount, panelPowerWp, systemLossPct }),
    [tiltDeg, azimuthDeg, panelCount, panelPowerWp, systemLossPct],
  )
  // Il calcolo (~15 ms) può restare un attimo indietro rispetto allo slider, che così resta fluido.
  const deferredSystem = useDeferredValue(system)
  const simulation = useMemo(() => runSimulation(tmy, deferredSystem), [tmy, deferredSystem])

  const stale = tmyState.status !== 'ready'

  const errorText = tmyState.status === 'error' ? describeTmyError(tmyState.error) : null

  let sticky: StickyTotalState
  if (simulation && 'year' in simulation) sticky = { kind: 'ready', annualKwh: simulation.year.annualKwh, updating: tmyState.status === 'loading', failed: tmyState.status === 'error', shortError: errorText?.short }
  else if (tmyState.status === 'loading') sticky = { kind: 'loading' }
  else sticky = { kind: 'error', shortError: errorText?.short }

  return (
    <main>
      <header>
        <h1>Irradia</h1>
        <p className="subtitle">Stima della produzione di un impianto fotovoltaico</p>
      </header>

      <div className="layout">
        <section className="params" aria-label="Parametri">
          <fieldset>
            <legend>Posizione</legend>
            {/* Una sola chiamata: le due coordinate cambiano insieme, quindi un solo download. */}
            <LocationMap
              latitude={latitude}
              longitude={longitude}
              onChange={(lat, lon) => {
                setLatitude(lat)
                setLongitude(lon)
              }}
            />
            <NumberSlider label="Latitudine (Nord)" unit="°" value={latitude} onChange={setLatitude}
              min={AREA_MIN_LAT} max={AREA_MAX_LAT} step={0.0001} decimals={4} />
            <NumberSlider label="Longitudine (Est)" unit="°" value={longitude} onChange={setLongitude}
              min={AREA_MIN_LON} max={AREA_MAX_LON} step={0.0001} decimals={4} />
          </fieldset>

          <fieldset>
            <legend>Pannelli</legend>
            <NumberSlider label="Inclinazione" unit="°" value={tiltDeg} onChange={setTiltDeg}
              min={0} max={90} step={1} hint={(v) => (v === 0 ? 'Piatti' : v === 90 ? 'Verticali' : '0° = piatti, 90° = verticali')} />
            <NumberSlider label="Orientamento (azimut da Nord)" unit="°" value={azimuthDeg} onChange={setAzimuthDeg}
              min={0} max={359} step={1} hint={(v) => `Verso ${cardinalDirection(v)} · 90° = Est, 180° = Sud, 270° = Ovest`} />
            <NumberSlider label="Numero di pannelli" value={panelCount} onChange={setPanelCount}
              min={1} max={50} step={1} />
            <NumberSlider label="Potenza di un pannello" unit="Wp" value={panelPowerWp} onChange={setPanelPowerWp}
              min={100} max={700} step={5} />
            <NumberSlider label="Perdite di sistema" unit="%" value={systemLossPct} onChange={setSystemLossPct}
              min={0} max={30} step={0.5} decimals={1} hint={() => 'Inverter, cavi, sporcizia… PVGIS suggerisce 14 %'} />
          </fieldset>
        </section>

        <section className="results" aria-label="Risultati" aria-busy={tmyState.status === 'loading'}>
          {tmyState.status === 'loading' && <p className="status">Scarico l'anno tipo da PVGIS…</p>}
          {errorText && (
            <p className="status error" role="alert">
              {errorText.message}
              {errorText.detail ? ` ${errorText.detail}` : ''}
              {tmy ? ' I valori mostrati sono quelli della posizione precedente.' : ''}
            </p>
          )}

          {simulation && 'error' in simulation && <p className="status error">{simulation.error}</p>}

          {simulation && 'year' in simulation && tmy && (
            <div className={stale ? 'stale' : undefined}>
              <AnnualTotal
                annualKwh={simulation.year.annualKwh}
                peakPowerKwp={simulation.year.peakPowerKwp}
                panelCount={panelCount}
                panelPowerWp={panelPowerWp}
              />

              <h2>Produzione mese per mese (kWh)</h2>
              <MonthlyChart monthlyKwh={simulation.year.monthlyKwh} />

              <p className="source">
                Dati: anno meteorologico tipo PVGIS (JRC, Commissione Europea), {tmy.radiationDb} e {tmy.meteoDb},
                mesi scelti tra il {tmy.yearMin} e il {tmy.yearMax}; punto {formatNumber(tmy.latitude, 4)}° N,{' '}
                {formatNumber(tmy.longitude, 4)}° E, {formatNumber(tmy.elevationM)} m s.l.m.
                {shadingNote(tmy.usesHorizon)}
              </p>
            </div>
          )}
        </section>
      </div>

      <SiteFooter />

      <StickyTotal state={sticky} />
    </main>
  )
}
