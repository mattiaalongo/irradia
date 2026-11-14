/**
 * Parametro numerico con campo di testo (`NumberField`) e slider collegati allo stesso valore.
 * Usato per numero di pannelli, potenza e perdite; latitudine e longitudine usano solo il campo
 * e l'inclinazione/orientamento i comandi circolari (`AngleDial`).
 */

import NumberField, { type NumberFieldProps } from './NumberField'

const TICKS = Array.from({ length: 11 }, (_, i) => i)

export type NumberSliderProps = Omit<NumberFieldProps, 'layout' | 'children'>

export default function NumberSlider(props: NumberSliderProps) {
  const { label, value, onChange, min, max, step } = props
  return (
    <div className="sl">
      <NumberField {...props} layout="inline">
        <div className="rng">
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
