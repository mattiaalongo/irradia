/**
 * Parametro numerico con campo di testo e slider collegati allo stesso valore.
 *
 * Il campo accetta testo provvisorio (es. vuoto o "41," mentre si scrive): il valore
 * viene passato all'app solo quando è un numero valido nell'intervallo, altrimenti
 * resta quello precedente e compare un messaggio. Si accetta sia "," sia "." come
 * separatore decimale.
 */

import { useId, useState } from 'react'
import { parseDecimal, validationMessage } from './parseInput'

export interface NumberSliderProps {
  label: string
  /** Unità mostrata accanto al campo (es. "°", "Wp", "%"). */
  unit?: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step: number
  /** Cifre decimali mostrate nel campo. */
  decimals?: number
  /** Testo d'aiuto calcolato dal valore (es. il punto cardinale dell'orientamento). */
  hint?: (value: number) => string
}

export default function NumberSlider({ label, unit, value, onChange, min, max, step, decimals = 0, hint }: NumberSliderProps) {
  const id = useId()
  // `null` = il campo mostra il valore attuale; una stringa = l'utente sta scrivendo.
  const [draft, setDraft] = useState<string | null>(null)
  const integer = Number.isInteger(step) && decimals === 0
  const error = draft === null ? null : validationMessage(draft, min, max, integer)

  return (
    <div className="param">
      <label htmlFor={id}>{label}</label>
      <div className="param-row">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={`${label} (slider)`}
          onChange={(e) => {
            setDraft(null)
            onChange(e.target.valueAsNumber)
          }}
        />
        <span className="param-field">
          <input
            id={id}
            type="text"
            inputMode="decimal"
            value={draft ?? value.toFixed(decimals).replace('.', ',')}
            aria-invalid={error !== null}
            onChange={(e) => {
              const text = e.target.value
              setDraft(text)
              if (validationMessage(text, min, max, integer) === null) onChange(parseDecimal(text)!)
            }}
            onBlur={() => setDraft(null)}
          />
          {/* Sempre presente (anche vuota) perché tutti i campi restino allineati. */}
          <span className="param-unit">{unit}</span>
        </span>
      </div>
      {error ? (
        <p className="param-error" role="alert">{error}</p>
      ) : (
        hint && <p className="param-hint">{hint(value)}</p>
      )}
    </div>
  )
}
