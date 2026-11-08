/**
 * Formattazione dei valori per l'utente (italiano).
 */

export const MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
] as const

export const MONTH_ABBR = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'] as const

/**
 * Numero in formato italiano (separatore delle migliaia "." e decimale ",").
 * `useGrouping: 'always'`: per default l'italiano non separa i numeri di 4 cifre
 * ("6498" ma "11.077"); qui si separano sempre, per coerenza tra valori vicini.
 */
export function formatNumber(x: number, decimals = 0): string {
  return x.toLocaleString('it-IT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: 'always',
  })
}

const CARDINALS = ['Nord', 'Nord-Est', 'Est', 'Sud-Est', 'Sud', 'Sud-Ovest', 'Ovest', 'Nord-Ovest'] as const

/**
 * Punto cardinale più vicino a un azimut (gradi da Nord in senso orario, convenzione del motore).
 * Settori di 45° centrati sulle direzioni: es. 158-202° → "Sud".
 */
export function cardinalDirection(azimuthDeg: number): string {
  const normalized = ((azimuthDeg % 360) + 360) % 360
  return CARDINALS[Math.round(normalized / 45) % 8]
}
