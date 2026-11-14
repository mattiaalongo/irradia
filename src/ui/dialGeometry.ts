/**
 * Geometria dei due quadranti (inclinazione e orientamento dei pannelli): logica pura, senza React
 * né DOM, usata dai componenti dell'interfaccia (issue #56).
 *
 * Convenzioni:
 * - angoli in gradi (come il motore);
 * - coordinate dello schermo/SVG: x verso destra, **y verso il basso**;
 * - orientamento = azimut da Nord in senso orario (0 = N, 90 = E, 180 = S, 270 = O), la stessa
 *   convenzione del motore e dei campi numerici: nessuna conversione.
 */
import { cardinalDirection } from './format'

export type DialKind = 'tilt' | 'azimuth'

/** Limiti dell'inclinazione (gradi): 0 = pannelli piatti, 90 = verticali. Uguali allo slider. */
export const TILT_MIN = 0
export const TILT_MAX = 90
/** Limiti dell'orientamento (gradi da Nord): 359 perché 360 coincide con 0. Uguali allo slider. */
export const AZIMUTH_MIN = 0
export const AZIMUTH_MAX = 359

/**
 * Zona morta attorno al centro, in frazione del raggio: vicino al centro l'angolo cambia
 * moltissimo per spostamenti minimi (e al centro esatto non è definito), quindi il valore resta
 * quello precedente. 15 % è una scelta di usabilità (prototipo approvato), non una costante fisica.
 */
export const DIAL_DEAD_ZONE = 0.15

/** Gradi → radianti (definizione: π rad = 180°). */
const RAD = Math.PI / 180

export interface DialPoint {
  readonly x: number
  readonly y: number
}

/**
 * Punto del quadrante che corrisponde a un valore.
 *
 * - Inclinazione β: quarto di cerchio in alto a destra con il centro in basso a sinistra;
 *   0° a "ore 3", 90° a "ore 12". Coordinate polari con angolo misurato dall'asse x in senso
 *   antiorario; la y va sottratta perché sullo schermo cresce verso il basso:
 *   (cx + r·cos β, cy − r·sin β).
 * - Orientamento α: bussola con il Nord in alto, angolo da Nord in senso orario:
 *   (cx + r·sin α, cy − r·cos α) → 0° in alto, 90° a destra, 180° in basso, 270° a sinistra.
 */
export function dialPoint(kind: DialKind, valueDeg: number, cx: number, cy: number, r: number): DialPoint {
  const a = valueDeg * RAD
  return kind === 'tilt'
    ? { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) }
    : { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) }
}

/**
 * Valore (intero) indicato da un punto del quadrante, per il trascinamento col puntatore.
 * Inverso di `dialPoint` sugli interi.
 *
 * - Entro `DIAL_DEAD_ZONE`·r dal centro restituisce `previousValue` (angolo instabile o indefinito).
 * - Inclinazione: θ = atan2(cy − y, x − cx) ∈ [−180°, 180°] (inverso di `dialPoint`).
 *   0..90 → round(θ); in alto a sinistra (90 < θ ≤ 180) → 90; in basso a destra (−90 ≤ θ < 0) → 0;
 *   nel quadrante opposto (−180 ≤ θ < −90) l'estremo più vicino al valore precedente
 *   (previous ≥ 45 → 90, altrimenti 0), così attraversando quella zona non si salta da un estremo
 *   all'altro. θ = −180 (solo con −0) è lo stesso punto di θ = 180: vale 90.
 * - Orientamento: (round(atan2(x − cx, cy − y)) + 360) mod 360, con 360 → 0.
 *
 * Per ingressi finiti il risultato non è mai NaN (atan2(0, 0) = 0 e atan2 accetta anche ±∞
 * prodotti da differenze troppo grandi). `previousValue` è restituito così com'è.
 */
export function dialValueFromPoint(
  kind: DialKind,
  x: number,
  y: number,
  cx: number,
  cy: number,
  r: number,
  previousValue: number,
): number {
  const dx = x - cx
  const up = cy - y // verso l'alto positivo (lo schermo ha y verso il basso)
  if (Math.hypot(dx, up) < DIAL_DEAD_ZONE * r) return previousValue

  if (kind === 'tilt') {
    const theta = Math.atan2(up, dx) / RAD
    // "+ 0" trasforma un eventuale −0 (da atan2(−0, x > 0)) in 0.
    if (theta >= 0 && theta <= 90) return Math.round(theta) + 0
    if (theta > 90 || theta === -180) return TILT_MAX
    if (theta >= -90) return TILT_MIN
    return previousValue >= 45 ? TILT_MAX : TILT_MIN
  }

  const az = Math.round(Math.atan2(dx, up) / RAD) // −180..180
  return (az + 360) % 360
}

/** Passo grande (PageUp/PageDown), in gradi, uguale per i due quadranti. */
const PAGE_STEP = 10

/**
 * Nuovo valore dopo un tasto, oppure `null` se il tasto non riguarda il quadrante (così il
 * componente non blocca il comportamento predefinito del browser).
 * Tasti come lo slider WAI-ARIA (APG "Slider Pattern"): frecce ±1, PageUp/PageDown ±10,
 * Home/End minimo/massimo.
 * - Inclinazione: risultato limitato a [0, 90].
 * - Orientamento: gira (359 + 1 = 0, 0 − 1 = 359, 355 + 10 = 5), tranne Home (0) ed End (359).
 * Si attende un `value` intero dentro i limiti (come lo stato dell'app); non lo arrotonda.
 */
export function dialKeyValue(kind: DialKind, key: string, value: number): number | null {
  const min = kind === 'tilt' ? TILT_MIN : AZIMUTH_MIN
  const max = kind === 'tilt' ? TILT_MAX : AZIMUTH_MAX
  let delta: number
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      delta = 1
      break
    case 'ArrowLeft':
    case 'ArrowDown':
      delta = -1
      break
    case 'PageUp':
      delta = PAGE_STEP
      break
    case 'PageDown':
      delta = -PAGE_STEP
      break
    case 'Home':
      return min
    case 'End':
      return max
    default:
      return null
  }
  const next = value + delta
  if (kind === 'tilt') return Math.min(TILT_MAX, Math.max(TILT_MIN, next))
  return (((next % 360) + 360) % 360) + 0
}

/**
 * Testo per i lettori di schermo (`aria-valuetext`), testi approvati dal PO:
 * inclinazione «35°», «0°, piatti», «90°, verticali»; orientamento «180°, Sud».
 * Il valore è atteso intero (come lo stato dell'app).
 */
export function dialValueText(kind: DialKind, value: number): string {
  if (kind === 'tilt') {
    if (value === TILT_MIN) return `${value}°, piatti`
    if (value === TILT_MAX) return `${value}°, verticali`
    return `${value}°`
  }
  return `${value}°, ${cardinalDirection(value)}`
}
