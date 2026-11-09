/**
 * Area di lavoro dell'app (Italia/Europa) e conversione del punto cliccato sulla mappa
 * in coordinate da usare per il calcolo.
 *
 * TypeScript puro: nessuna dipendenza da Leaflet, React o DOM, così si testa senza browser.
 * Convenzioni del progetto: gradi, latitudine + a Nord, longitudine + a Est.
 */

import { formatNumber } from './format'
import { roundCoord } from './tmyLoader'

/**
 * Limiti dell'area di lavoro, in gradi (limiti inclusi). Unica fonte per gli slider di
 * `App.tsx` e per la mappa. Motivo (CLAUDE.md): l'area del progetto è Italia/Europa;
 * 34-72° N va da Creta/Cipro a Capo Nord, −25-45° E dalle Azzorre/Islanda al Caucaso.
 * Sono numeri interi: arrotondando a 4 decimali (`roundCoord`) un punto interno resta interno.
 */
export const AREA_MIN_LAT = 34
export const AREA_MAX_LAT = 72
export const AREA_MIN_LON = -25
export const AREA_MAX_LON = 45

/** Un punto in gradi. */
export interface LatLon {
  lat: number
  lon: number
}

/** Esito di `pointFromMap`. */
export type MapPointResult =
  | { ok: true; lat: number; lon: number }
  | { ok: false; reason: 'outside' }

/** Numero con il segno meno tipografico (U+2212), come nei testi dell'app. */
function formatDeg(x: number): string {
  return formatNumber(x).replace('-', '−')
}

/** Messaggio per un clic sulla mappa fuori dall'area coperta. */
export const OUTSIDE_AREA_MESSAGE =
  `Punto fuori dall'area coperta (latitudine ${formatDeg(AREA_MIN_LAT)}-${formatDeg(AREA_MAX_LAT)}°, ` +
  `longitudine ${formatDeg(AREA_MIN_LON)}-${formatDeg(AREA_MAX_LON)}°).`

/** Vero se il punto è nell'area di lavoro (limiti inclusi). Falso per NaN e ±Infinity. */
export function isInArea(lat: number, lon: number): boolean {
  // I confronti con NaN sono sempre falsi; ±Infinity cade fuori dai limiti finiti.
  return lat >= AREA_MIN_LAT && lat <= AREA_MAX_LAT && lon >= AREA_MIN_LON && lon <= AREA_MAX_LON
}

/**
 * Punto dell'area più vicino, limitando ciascuna coordinata al suo intervallo.
 * Non fa il "giro del mondo" sulla longitudine (372 → 45, non 12): per i clic sulla mappa
 * si usa `pointFromMap`, che normalizza. ±Infinity va al limite; NaN resta NaN (non è
 * una posizione: chi chiama deve evitarlo, ad es. con `isInArea`).
 */
export function clampToArea(lat: number, lon: number): LatLon {
  return {
    lat: Math.min(AREA_MAX_LAT, Math.max(AREA_MIN_LAT, lat)),
    lon: Math.min(AREA_MAX_LON, Math.max(AREA_MIN_LON, lon)),
  }
}

/**
 * Longitudine riportata in [−180, 180). Leaflet, se si trascina la mappa oltre l'antimeridiano,
 * restituisce longitudini "srotolate" (es. 372 per 12° E): stesso punto, numero diverso.
 * Non finita → NaN.
 */
export function normalizeLongitude(lon: number): number {
  if (!Number.isFinite(lon)) return Number.NaN
  if (lon >= -180 && lon < 180) return lon // nessun calcolo: nessun errore di arrotondamento
  return ((((lon + 180) % 360) + 360) % 360) - 180
}

/**
 * Punto cliccato sulla mappa → coordinate per il calcolo, arrotondate a 4 decimali (≈ 11 m)
 * con la stessa `roundCoord` della memoria dei download.
 *
 * Ordine: normalizza la longitudine, **arrotonda, poi controlla l'area**. Motivo: il controllo
 * va fatto sul valore che l'app userà davvero (quello mostrato nei campi e usato per PVGIS).
 * Così 33,99996 diventa 34,0000 ed è accettato: è a ~5 m dal confine, sotto la precisione di
 * un clic; i campi a 4 decimali non potrebbero comunque mostrare la differenza. Con l'ordine
 * opposto il verdetto dipenderebbe da cifre che poi si buttano via. In entrambi i casi il
 * risultato accettato è nell'area, perché i limiti sono interi (arrotondati restano uguali).
 */
export function pointFromMap(lat: number, lon: number): MapPointResult {
  const rLat = roundCoord(lat)
  const rLon = roundCoord(normalizeLongitude(lon))
  if (!isInArea(rLat, rLon)) return { ok: false, reason: 'outside' }
  // `+ 0` trasforma un eventuale −0 in 0 (es. −0,00001 arrotondato).
  return { ok: true, lat: rLat + 0, lon: rLon + 0 }
}
