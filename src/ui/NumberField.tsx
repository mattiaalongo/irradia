/**
 * Campo numerico con etichetta, unità e testo d'aiuto o d'errore (senza slider).
 *
 * Il campo accetta testo provvisorio (es. vuoto o "41," mentre si scrive): il valore viene passato
 * all'app solo quando è un numero valido nell'intervallo, altrimenti resta quello precedente e
 * compare un messaggio. Si accetta sia "," sia "." come separatore decimale (`parseInput.ts`).
 *
 * Se il valore cambia per un'altra via (slider, comando circolare) mentre il campo contiene una
 * bozza, la bozza viene scartata: il campo mostra il valore vero. Una bozza valida che l'app ha
 * appena accettato (il valore torna uguale a quello emesso dal campo) invece si conserva, così
 * scrivendo "12," la virgola non sparisce.
 *
 * `children` (es. lo slider) sta fra il campo e il messaggio.
 */

import { useId, useState, type ReactNode } from 'react'
import { parseDecimal, validationMessage } from './parseInput'

export interface NumberFieldProps {
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
  /** `inline`: etichetta a sinistra e campo a destra sulla stessa riga (parametri con slider). */
  layout?: 'stacked' | 'inline'
  children?: ReactNode
}

export default function NumberField({
  label, unit, value, onChange, min, max, step, decimals = 0, hint, layout = 'stacked', children,
}: NumberFieldProps) {
  const id = useId()
  // `null` = il campo mostra il valore attuale; una stringa = l'utente sta scrivendo.
  const [draft, setDraft] = useState<string | null>(null)
  const [emitted, setEmitted] = useState<number | null>(null)
  const [seen, setSeen] = useState(value)
  // Valore cambiato dall'esterno: la bozza non vale più (si regola lo stato durante il disegno).
  if (value !== seen) {
    setSeen(value)
    if (value !== emitted && draft !== null) setDraft(null)
  }
  const integer = Number.isInteger(step) && decimals === 0
  const error = draft === null ? null : validationMessage(draft, min, max, integer)

  return (
    <div className={layout === 'inline' ? 'fld fld-inline' : 'fld'}>
      <label htmlFor={id}>{label}</label>
      <div className="num">
        <input
          id={id}
          type="text"
          inputMode={integer ? 'numeric' : 'decimal'}
          autoComplete="off"
          value={draft ?? value.toFixed(decimals).replace('.', ',')}
          aria-invalid={error !== null}
          onChange={(e) => {
            const text = e.target.value
            setDraft(text)
            if (validationMessage(text, min, max, integer) === null) {
              const n = parseDecimal(text)!
              setEmitted(n)
              onChange(n)
            }
          }}
          onBlur={() => setDraft(null)}
        />
        {/* Sempre presente (anche vuota) perché tutti i campi restino allineati. */}
        <span className="u">{unit}</span>
      </div>
      {children}
      {error ? (
        <p className="help param-error" role="alert">{error}</p>
      ) : (
        hint && <p className="help param-hint">{hint(value)}</p>
      )}
    </div>
  )
}
