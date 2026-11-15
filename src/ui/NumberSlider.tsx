/**
 * Parametro numerico con campo di testo (`NumberField`) e slider collegati allo stesso valore.
 * Usato per numero di pannelli, potenza e perdite; latitudine e longitudine usano solo il campo
 * e l'inclinazione/orientamento i comandi circolari (`AngleDial`).
 */

import type { CSSProperties } from 'react'
import NumberField, { type NumberFieldProps } from './NumberField'

const TICKS = Array.from({ length: 11 }, (_, i) => i)

export type NumberSliderProps = Omit<NumberFieldProps, 'layout' | 'children'>

export default function NumberSlider(props: NumberSliderProps) {
  const { label, value, onChange, min, max, step } = props
  // Quota già percorsa (0-100 %): solo l'aspetto B la usa, per colorare la parte piena della barra.
  const pct = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0
  return (
    <div className="sl">
      <NumberField {...props} layout="inline">
        <div className="rng" style={{ '--pct': `${pct}%` } as CSSProperties}>
          {/* Tacche decorative (11, come una scala graduata): niente per le tecnologie assistive. */}
          <div className="ticks" aria-hidden="true">
            {TICKS.map((i) => <i key={i} />)}
          </div>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            aria-label={`${label} (slider)`}
            onChange={(e) => onChange(e.target.valueAsNumber)}
          />
        </div>
      </NumberField>
    </div>
  )
}
