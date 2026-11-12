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
  /**
   * Vero se il problema è probabilmente temporaneo e riprovare la stessa posizione ha senso
   * (servizio o connessione non raggiungibili). L'interfaccia può offrire un pulsante "Riprova".
   */
  retry?: boolean
}

const GENERIC = 'Dati non disponibili per questa posizione.'

/** Servizio o connessione non raggiungibili: stesso testo, l'utente non può distinguerli (#21). */
const TEMPORARY: TmyErrorText = {
  message:
    'I dati non sono disponibili in questo momento: può essere un problema temporaneo del servizio o della connessione a Internet. Riprova tra qualche secondo.',
  short: 'Dati non disponibili ora',
  retry: true,
}

/**
 * Sceglie il testo italiano per un errore. Lo `switch` su `kind` è esaustivo: aggiungendo un tipo
 * nel motore senza dargli un testo qui, la build (tsc) fallisce per il controllo `never`.
 * Per mare, fuori zona, servizio non raggiungibile e rete non si mostra né il codice HTTP né
 * l'inglese di PVGIS, e PVGIS non viene nominato (decisione del PO del 12/11/2026): l'utente deve
 * solo sapere cosa fare (scegliere un altro punto o riprovare). Testi approvati dal PO
 * (#11, #21). Gli altri casi mostrano il testo generico con il dettaglio tecnico.
 */
export function describeTmyError(err: unknown): TmyErrorText {
  const detail = err instanceof Error ? err.message : String(err)
  if (!(err instanceof PvgisError)) return { message: GENERIC, detail }
  const kind: PvgisErrorKind = err.kind
  switch (kind) {
    case 'seaLocation':
      return {
        message: 'Per il punto scelto non ci sono dati: risulta in mare. Scegli un punto sulla terraferma.',
        short: 'Punto in mare',
      }
    case 'outsideCoverage':
      return {
        message: 'Per il punto scelto non ci sono dati: è fuori dalla zona coperta. Scegli un altro punto.',
        short: 'Fuori zona coperta',
      }
    case 'unavailable':
    case 'network':
      return { ...TEMPORARY }
    case 'rejected':
    case 'notJson':
    case 'invalidData':
      return { message: GENERIC, detail }
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}
