import { useId } from 'react'
import { formatNumber } from './format'

/** Nota sul confronto con il sito PVGIS: l'anno tipo non è la media di tutti gli anni. */
export const ANNUAL_NOTE =
  'Stima su un anno tipo, composto da mesi reali scelti tra il 2005 e il 2023. ' +
  'Il sito PVGIS mostra invece la media di tutti gli anni: le due cifre possono differire di qualche punto percentuale.'

interface Props {
  annualKwh: number
  peakPowerKwp: number
  panelCount: number
  panelPowerWp: number
}

/** Totale annuo con la nota che ne spiega il significato, collegata per le tecnologie assistive. */
export default function AnnualTotal({ annualKwh, peakPowerKwp, panelCount, panelPowerWp }: Props) {
  const id = useId()
  const labelId = `${id}-label`
  const noteId = `${id}-note`
  return (
    // Il gruppo ha nome (l'etichetta) e descrizione (la nota): letta una sola volta, non a ogni lettura del numero.
    <div role="group" aria-labelledby={labelId} aria-describedby={noteId}>
      {/* Targa dello strumento: il totale in chiaro su fondo scuro. */}
      <div className="readout">
        <p className="hero-label" id={labelId}>Produzione stimata in un anno</p>
        <p className="hero">
          {formatNumber(annualKwh)} <span className="hero-unit">kWh</span>
        </p>
        <p className="hero-detail">
          Impianto da {formatNumber(peakPowerKwp, 2)} kWp ({panelCount} × {panelPowerWp} Wp)
        </p>
      </div>
      <p className="hero-note" id={noteId}>{ANNUAL_NOTE}</p>
    </div>
  )
}
