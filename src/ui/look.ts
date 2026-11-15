/**
 * Aspetto della pagina (issue #56, parte 2; decisioni del PO del 14/11/2026):
 * - "a" = «Strumento» (predefinito), "b" = «Giornata di sole».
 * - La scelta si ricorda in `localStorage`, UNA sola chiave (`LOOK_STORAGE_KEY`), valori "a"/"b".
 * - Se la memoria del browser non è disponibile (finestra privata, dati del sito bloccati: la lettura
 *   o la scrittura lanciano) o contiene un valore sconosciuto, vale A, senza errori in console.
 * - L'aspetto si applica come attributo `data-look` su `<html>`: così anche la barriera d'errore,
 *   che sta fuori da `<App>`, prende i colori dell'aspetto scelto. Le regole CSS di B hanno tutte il
 *   prefisso `[data-look='b']`.
 *
 * TypeScript puro: nessuna dipendenza da React; il DOM e la memoria arrivano come parametri.
 */

export type Look = 'a' | 'b'

export const DEFAULT_LOOK: Look = 'a'

/** Testi dell'interruttore (decisione del PO del 14/11/2026, issue #56). Unico punto in cui sono scritti. */
export const LOOK_SWITCH_LEGEND = 'Aspetto della pagina'
export const LOOK_LABELS: Readonly<Record<Look, string>> = { a: 'Strumento', b: 'Giornata di sole' }

/** Unica chiave salvata sul dispositivo dell'utente (citata nel piè di pagina sulla privacy). */
export const LOOK_STORAGE_KEY = 'irradia.look'

/** Le sole parti di `Storage` che servono: si possono sostituire nei test. */
export type LookStorage = Pick<Storage, 'getItem' | 'setItem'>

/** true se il valore è un aspetto conosciuto. */
export function isLook(value: unknown): value is Look {
  return value === 'a' || value === 'b'
}

/**
 * `window.localStorage`, oppure null se il browser lo nega: in alcuni casi (dati del sito bloccati)
 * anche il solo accesso alla proprietà lancia `SecurityError`.
 */
export function browserStorage(): LookStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Aspetto salvato; A se manca, se è sconosciuto o se la lettura lancia. */
export function readStoredLook(storage: LookStorage | null): Look {
  if (!storage) return DEFAULT_LOOK
  try {
    const value = storage.getItem(LOOK_STORAGE_KEY)
    return isLook(value) ? value : DEFAULT_LOOK
  } catch {
    return DEFAULT_LOOK
  }
}

/**
 * Salva l'aspetto. Restituisce false se non è stato possibile (memoria piena o bloccata): la pagina
 * cambia aspetto lo stesso, semplicemente alla visita successiva tornerà A. Nessun errore mostrato.
 */
export function storeLook(storage: LookStorage | null, look: Look): boolean {
  if (!storage) return false
  try {
    storage.setItem(LOOK_STORAGE_KEY, look)
    return true
  } catch {
    return false
  }
}

/** Imposta `data-look` sull'elemento radice (in pratica `document.documentElement`, cioè `<html>`). */
export function applyLook(root: Pick<Element, 'setAttribute'>, look: Look): void {
  root.setAttribute('data-look', look)
}
