/**
 * Conversione della richiesta ricevuta dal server di Vite (sviluppo e anteprima) in una
 * `Request` standard per l'intermediario (`pvgisProxy.ts`).
 *
 * Funzione pura, solo API web standard: si prova senza avviare un server. La usa il plugin
 * `irradia-pvgis-proxy` di `vite.config.ts`; in produzione la `Request` arriva già pronta
 * dall'hosting (`worker.ts`).
 */

import { isPvgisProxyPath } from './pvgisProxy.ts'

/**
 * Base fissa dell'indirizzo: Node dà solo percorso e query (`req.url`, "request-target" in
 * forma "origin-form", RFC 9112 §3.2.1), l'host non conta per l'intermediario.
 */
const DEV_ORIGIN = 'http://localhost'

/**
 * `Request` per l'intermediario, oppure `undefined` se la richiesta non gli spetta (il server
 * di Vite prosegue con le sue regole). Non lancia mai eccezioni.
 *
 * `rawUrl` è accettato solo se inizia con un "/" seguito da un carattere che non sia "/" né
 * "\" (o se è "/" da solo). Motivo: `new URL("//evil.invalid/api/pvgis/…", base)` legge
 * "evil.invalid" come host e "/api/pvgis/…" come percorso, e per gli indirizzi http anche "\"
 * vale come "/" (WHATWG URL Standard, "special authority ignore slashes state"): il percorso
 * valutato non sarebbe quello ricevuto. Per sicurezza si controlla anche che l'origine
 * risultante sia ancora quella fissa.
 *
 * Metodi diversi da GET e HEAD diventano POST: l'intermediario risponde 405 in ogni caso, e
 * alcuni metodi (CONNECT, TRACE) non sono ammessi da `new Request` (WHATWG Fetch, "method").
 */
export function devProxyRequest(rawUrl: string | undefined, method: string | undefined, signal: AbortSignal): Request | undefined {
  if (rawUrl === undefined || !/^\/(?![/\\])/.test(rawUrl)) return undefined
  try {
    const url = new URL(rawUrl, DEV_ORIGIN)
    if (url.origin !== DEV_ORIGIN || !isPvgisProxyPath(url.pathname)) return undefined
    const safeMethod = method === 'GET' || method === 'HEAD' ? method : 'POST'
    return new Request(url, { method: safeMethod, signal })
  } catch {
    return undefined
  }
}
