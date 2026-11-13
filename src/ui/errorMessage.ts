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

/**
 * Lunghezza massima del dettaglio tecnico mostrato nell'avviso, in unità UTF-16 (`String.length`).
 * Decisione del PO del 13/11/2026 (#47): un `message` enorme (la prova e2e ne usa uno da 5 MB)
 * finiva per intero nell'avviso `role="alert"` e bloccava la pagina per alcuni secondi. I messaggi
 * veri di PVGIS sono sotto i 100 caratteri, quindi con 300 nulla di utile si perde.
 */
export const DETAIL_MAX_CHARS = 300

/** Carattere aggiunto quando il dettaglio è stato accorciato (U+2026, puntini di sospensione). */
export const DETAIL_ELLIPSIS = '\u2026'

/**
 * Accorcia il dettaglio a `DETAIL_MAX_CHARS` unità seguite da "…" se è più lungo. Non taglia mai a
 * metà una coppia surrogata (emoji e altri caratteri fuori dal piano base): in quel caso si ferma
 * un'unità prima. Lavora sulle unità UTF-16 e non su `Array.from`, che su 5 MB creerebbe un array
 * di milioni di elementi solo per buttarlo.
 */
export function truncateDetail(text: string): string {
  if (text.length <= DETAIL_MAX_CHARS) return text
  let end = DETAIL_MAX_CHARS
  const last = text.charCodeAt(end - 1)
  // 0xD800-0xDBFF = prima metà di una coppia surrogata (Unicode, cap. 3.9, UTF-16).
  if (last >= 0xd800 && last <= 0xdbff) end -= 1
  return text.slice(0, end) + DETAIL_ELLIPSIS
}

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
 * (#11, #21). Gli altri casi mostrano il testo generico con il dettaglio tecnico, accorciato a
 * `DETAIL_MAX_CHARS` (#47); il messaggio italiano resta intero.
 */
export function describeTmyError(err: unknown): TmyErrorText {
  const detail = truncateDetail(err instanceof Error ? err.message : String(err))
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
