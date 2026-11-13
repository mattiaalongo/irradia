/**
 * Hook React che fornisce l'anno tipo di PVGIS per la posizione indicata.
 *
 * Dipende SOLO da latitudine e longitudine: i parametri dei pannelli non entrano qui,
 * quindi modificarli non può mai provocare un download.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchPvgisTmy, type Tmy } from '../engine/pvgisTmy'
import { PVGIS_BASE_URL, TMY_DEBOUNCE_MS } from './config'
import { createTmyLoader, tmyKey, type TmyLoader } from './tmyLoader'

/** Memoria condivisa da tutta la pagina. */
const defaultLoader = createTmyLoader((latitude, longitude, signal) =>
  fetchPvgisTmy(latitude, longitude, { baseUrl: PVGIS_BASE_URL, signal }),
)

export type TmyState =
  | { status: 'ready'; tmy: Tmy }
  /**
   * `previousTmy`: dati dell'ultima posizione caricata, da mostrare attenuati nell'attesa.
   * `retrying`: l'attesa è un nuovo tentativo chiesto con `retry()` (#21).
   */
  | { status: 'loading'; previousTmy: Tmy | null; retrying: boolean }
  | { status: 'error'; error: Error; previousTmy: Tmy | null }

/** Esito dell'ultimo download concluso. */
interface Completed {
  key: string
  tmy: Tmy | null
  error: Error | null
}

export function useTmy(
  latitude: number,
  longitude: number,
  loader: TmyLoader = defaultLoader,
): TmyState & { retry: () => void } {
  const key = tmyKey(latitude, longitude)
  const [completed, setCompleted] = useState<Completed | null>(null)
  /** Numero di nuovi tentativi chiesti: cambiandolo l'effetto riparte. */
  const [attempt, setAttempt] = useState(0)
  /**
   * Posizione per cui è stato chiesto un nuovo tentativo, dal clic su "Riprova" alla fine del download:
   * nessuna attesa e nessun doppio clic. Legata alla chiave, così un tentativo non vale per un'altra
   * posizione. Il ref serve al controllo del doppio clic prima che React ridisegni.
   */
  const retrying = useRef<string | null>(null)
  const [retryKey, setRetryKey] = useState<string | null>(null)
  const cached = loader.peek(latitude, longitude)
  const failed = completed?.key === key && completed.error !== null

  /**
   * Rifà subito il download della posizione che ha fallito (azione esplicita: niente attesa di
   * 0,8 s). Ignorato se non c'è un errore da riprovare o un nuovo tentativo è già in corso, così il
   * doppio clic non raddoppia la richiesta. Un download fallito è già stato dimenticato dalla
   * memoria (`tmyLoader`), quindi parte una richiesta nuova. Nessun tentativo automatico.
   */
  const retry = useCallback(() => {
    if (!failed || retrying.current === key) return
    retrying.current = key
    setRetryKey(key)
    // Via l'errore: lo stato torna "in caricamento" finché non arriva l'esito.
    setCompleted((prev) => (prev ? { ...prev, error: null } : prev))
    setAttempt((n) => n + 1)
  }, [failed, key])

  useEffect(() => {
    // Già in memoria: nessuna attesa e nessuna richiesta.
    if (cached) return
    // Un tentativo rimasto in sospeso per un'altra posizione non vale più.
    if (retrying.current !== null && retrying.current !== key) {
      retrying.current = null
      setRetryKey(null)
    }
    const controller = new AbortController()
    const run = () => {
      loader.get(latitude, longitude, controller.signal).then(
        (tmy) => {
          if (retrying.current === key) retrying.current = null
          setRetryKey(null)
          setCompleted({ key, tmy, error: null })
        },
        (err: unknown) => {
          // Annullata perché la posizione è cambiata: non è un errore da mostrare.
          if (controller.signal.aborted) return
          if (retrying.current === key) retrying.current = null
          setRetryKey(null)
          const error = err instanceof Error ? err : new Error(String(err))
          setCompleted((prev) => ({ key, tmy: prev?.tmy ?? null, error }))
        },
      )
    }
    // Nuovo tentativo chiesto dall'utente: subito. Altrimenti si attende l'ultima modifica.
    let timer: ReturnType<typeof setTimeout> | undefined
    if (retrying.current === key) run()
    else timer = setTimeout(run, TMY_DEBOUNCE_MS)
    // Eseguito quando la posizione cambia (o la pagina si chiude): ferma l'attesa
    // e annulla il download in corso, ormai inutile.
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
    // `attempt` fa ripartire l'effetto per lo stesso punto dopo un errore.
  }, [key, latitude, longitude, cached, loader, attempt])

  if (cached) return { status: 'ready', tmy: cached, retry }
  const previousTmy = completed?.tmy ?? null
  if (failed && completed?.error) return { status: 'error', error: completed.error, previousTmy, retry }
  return { status: 'loading', previousTmy, retrying: retryKey === key, retry }
}
