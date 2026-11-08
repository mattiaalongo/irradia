/**
 * Lettura e controllo dei numeri digitati dall'utente.
 */

import { formatNumber } from './format'

/** Converte il testo di un campo in numero, accettando la virgola decimale. `null` se non è un numero. */
export function parseDecimal(text: string): number | null {
  const t = text.trim().replace(',', '.')
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null
  return Number(t)
}

/** Testo dell'errore per un valore digitato, oppure `null` se è accettabile. */
export function validationMessage(text: string, min: number, max: number, integer: boolean): string | null {
  const n = parseDecimal(text)
  if (n === null) return 'Inserisci un numero'
  if (n < min || n > max) return `Il valore deve essere tra ${formatNumber(min)} e ${formatNumber(max)}`
  if (integer && !Number.isInteger(n)) return 'Inserisci un numero intero'
  return null
}
