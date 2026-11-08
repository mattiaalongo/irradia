/**
 * Scaricamento dell'anno tipo (TMY) con memoria: ogni posizione si scarica una volta sola
 * per tutta la durata della pagina.
 *
 * TypeScript puro (niente React), così si testa senza browser.
 */

import type { Tmy } from '../engine/pvgisTmy'

/** Funzione che scarica davvero i dati (in produzione `fetchPvgisTmy`, nei test una finta). */
export type LoadTmy = (latitude: number, longitude: number, signal?: AbortSignal) => Promise<Tmy>

/** Cifre decimali delle coordinate: 4 decimali ≈ 11 m, molto meno della griglia di PVGIS. */
const COORD_DECIMALS = 4

/** Arrotonda una coordinata alla precisione usata per le richieste e per la memoria. */
export function roundCoord(x: number): number {
  const f = 10 ** COORD_DECIMALS
  return Math.round(x * f) / f
}

/** Chiave della memoria per una posizione (es. "41.9028,12.4964"). */
export function tmyKey(latitude: number, longitude: number): string {
  return `${roundCoord(latitude).toFixed(COORD_DECIMALS)},${roundCoord(longitude).toFixed(COORD_DECIMALS)}`
}

export interface TmyLoader {
  /** Dati già scaricati per questa posizione, oppure `undefined`. Non avvia download. */
  peek(latitude: number, longitude: number): Tmy | undefined
  /**
   * Dati per questa posizione: dalla memoria se ci sono (o se il download è già in corso),
   * altrimenti li scarica. Se il download fallisce o viene annullato, la posizione viene
   * dimenticata e la prossima chiamata riprova.
   */
  get(latitude: number, longitude: number, signal?: AbortSignal): Promise<Tmy>
}

interface Entry {
  /** Si salva la richiesta in corso, non solo il risultato: due richieste uguali ravvicinate ne fanno una. */
  promise: Promise<Tmy>
  signal?: AbortSignal
  value?: Tmy
}

export function createTmyLoader(load: LoadTmy): TmyLoader {
  const cache = new Map<string, Entry>()

  return {
    peek(latitude, longitude) {
      return cache.get(tmyKey(latitude, longitude))?.value
    },

    get(latitude, longitude, signal) {
      const key = tmyKey(latitude, longitude)
      const existing = cache.get(key)
      // Una richiesta annullata non va riusata, anche se la sua rimozione dalla memoria
      // (che avviene in modo asincrono) non è ancora avvenuta.
      if (existing && !existing.signal?.aborted) return existing.promise

      const entry: Entry = {
        promise: load(roundCoord(latitude), roundCoord(longitude), signal),
        signal,
      }
      cache.set(key, entry)
      entry.promise.then(
        (tmy) => {
          entry.value = tmy
        },
        () => {
          // Si rimuove solo se nel frattempo non è stata sostituita da una richiesta nuova.
          if (cache.get(key) === entry) cache.delete(key)
        },
      )
      return entry.promise
    },
  }
}
