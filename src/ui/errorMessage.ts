import { PvgisError, type PvgisErrorKind } from '../engine/pvgisTmy'

/** Testo per l'utente di un errore nel caricamento dell'anno tipo. */
export interface TmyErrorText {
  /** Frase per l'avviso completo (`role="alert"` nei risultati). */
  message: string
  /** Dettaglio tecnico da accodare, solo per gli errori non riconosciuti. */
  detail?: string
  /**
   * Testo corto per la barra fissa del telefono. Presente SOLO per gli errori riconosciuti: negli
   * altri casi la barra mantiene i suoi testi ("Dati non disponibili" / "Dati non aggiornati (errore)").
   */
  short?: string
}

const GENERIC = 'Dati non disponibili per questa posizione.'

/**
 * Sceglie il testo italiano per un errore. Lo `switch` su `kind` è esaustivo: aggiungendo un tipo
 * nel motore senza dargli un testo qui, la build (tsc) fallisce per il controllo `never`.
 * Per mare e fuori zona non si mostra né "HTTP 400" né l'inglese di PVGIS: l'utente deve solo
 * sapere cosa fare (scegliere un altro punto). Gli altri casi restano com'erano.
 */
export function describeTmyError(err: unknown): TmyErrorText {
  const detail = err instanceof Error ? err.message : String(err)
  if (!(err instanceof PvgisError)) return { message: GENERIC, detail }
  const kind: PvgisErrorKind = err.kind
  switch (kind) {
    case 'seaLocation':
      return {
        message: 'Il punto scelto risulta in mare e PVGIS non ha dati per il mare. Scegli un punto sulla terraferma.',
        short: 'Punto in mare',
      }
    case 'outsideCoverage':
      return {
        message: 'PVGIS non ha dati per questo punto: è fuori dalla zona coperta. Scegli un altro punto.',
        short: 'Fuori zona PVGIS',
      }
    case 'rejected':
    case 'notJson':
    case 'network':
    case 'invalidData':
      return { message: GENERIC, detail }
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}
