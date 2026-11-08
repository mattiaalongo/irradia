/**
 * Hook React che fornisce l'anno tipo di PVGIS per la posizione indicata.
 *
 * Dipende SOLO da latitudine e longitudine: i parametri dei pannelli non entrano qui,
 * quindi modificarli non può mai provocare un download.
 */

import { useEffect, useState } from 'react'
import { fetchPvgisTmy, type Tmy } from '../engine/pvgisTmy'
import { PVGIS_BASE_URL, TMY_DEBOUNCE_MS } from './config'
import { createTmyLoader, tmyKey, type TmyLoader } from './tmyLoader'

/** Memoria condivisa da tutta la pagina. */
const defaultLoader = createTmyLoader((latitude, longitude, signal) =>
  fetchPvgisTmy(latitude, longitude, { baseUrl: PVGIS_BASE_URL, signal }),
)

export type TmyState =
  | { status: 'ready'; tmy: Tmy }
  /** `previousTmy`: dati dell'ultima posizione caricata, da mostrare attenuati nell'attesa. */
  | { status: 'loading'; previousTmy: Tmy | null }
  | { status: 'error'; error: Error; previousTmy: Tmy | null }

/** Esito dell'ultimo download concluso. */
interface Completed {
  key: string
  tmy: Tmy | null
  error: Error | null
}

export function useTmy(latitude: number, longitude: number, loader: TmyLoader = defaultLoader): TmyState {
  const key = tmyKey(latitude, longitude)
  const [completed, setCompleted] = useState<Completed | null>(null)
  const cached = loader.peek(latitude, longitude)

  useEffect(() => {
    // Già in memoria: nessuna attesa e nessuna richiesta.
    if (cached) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      loader.get(latitude, longitude, controller.signal).then(
        (tmy) => setCompleted({ key, tmy, error: null }),
        (err: unknown) => {
          // Annullata perché la posizione è cambiata: non è un errore da mostrare.
          if (controller.signal.aborted) return
          const error = err instanceof Error ? err : new Error(String(err))
          setCompleted((prev) => ({ key, tmy: prev?.tmy ?? null, error }))
        },
      )
    }, TMY_DEBOUNCE_MS)
    // Eseguito quando la posizione cambia (o la pagina si chiude): ferma l'attesa
    // e annulla il download in corso, ormai inutile.
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [key, latitude, longitude, cached, loader])

  if (cached) return { status: 'ready', tmy: cached }
  const previousTmy = completed?.tmy ?? null
  if (completed?.key === key && completed.error) return { status: 'error', error: completed.error, previousTmy }
  return { status: 'loading', previousTmy }
}
