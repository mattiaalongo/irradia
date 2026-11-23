/**
 * Intermediario fra il browser e PVGIS (fase 6).
 *
 * PVGIS non invia intestazioni CORS (verificato il 7/11/2026, CLAUDE.md): il browser non può
 * leggerne le risposte e deve chiedere i dati alla stessa origine dell'app. Questo modulo è
 * quell'intermediario, scritto solo con `Request`, `Response` e `fetch` standard (WHATWG Fetch)
 * perché giri identico ovunque: nel server di sviluppo e di anteprima di Vite (`vite.config.ts`)
 * e nella funzione dell'hosting (`server/worker.ts`). Niente DOM, React, Node né `src/ui`
 * (regola di ESLint e `tsconfig.server.json`).
 *
 * Non è un proxy aperto: accetta **una sola** richiesta, l'anno tipo (`tmy`) per un punto
 * dell'area di lavoro, con esattamente i parametri che invia il motore (`pvgisTmyUrl`), e
 * ricostruisce l'indirizzo verso PVGIS da zero: nulla di ciò che manda il browser (altri
 * parametri, intestazioni, cookie, IP) arriva a PVGIS.
 *
 * Le risposte d'errore seguono ciò che il motore sa classificare (`engine/pvgisTmy.ts`):
 * - 502/503/504 **senza corpo** → `unavailable` (pulsante "Riprova" nell'interfaccia);
 * - 4xx con corpo JSON `{"message": …}` → `seaLocation`/`outsideCoverage` se la frase è di
 *   PVGIS, altrimenti `rejected`.
 * Nessun registro (log): l'intermediario non conserva coordinate né indirizzi IP.
 */

import { PVGIS_API_VERSION, pvgisTmyUrl } from '../engine/pvgisTmy'
import { AREA_MAX_LAT, AREA_MAX_LON, AREA_MIN_LAT, AREA_MIN_LON } from '../shared/area'

/**
 * Indirizzo di base dell'API PVGIS. Fonte: JRC, "PVGIS API — non-interactive service"
 * (https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/getting-started-pvgis/api-non-interactive-service_en).
 */
export const PVGIS_API_BASE_URL = 'https://re.jrc.ec.europa.eu/api'

/** Prefisso dei percorsi gestiti dall'intermediario (lo stesso di `ui/config.ts`, `PVGIS_BASE_URL`). */
export const PVGIS_PROXY_PREFIX = '/api/pvgis/'

/** L'unico percorso accettato: anno tipo della versione API per cui è scritto il motore. */
export const PVGIS_PROXY_TMY_PATH = `${PVGIS_PROXY_PREFIX}${PVGIS_API_VERSION}/tmy`

/**
 * User-Agent con cui l'intermediario si presenta a PVGIS. Il firewall di PVGIS rifiuta lo
 * User-Agent di un browser con una pagina HTML "Request Rejected" **e codice 200** (verificato
 * l'8/11/2026 sul PC del proprietario): l'intermediario non inoltra mai quello del browser.
 * Entrambi i valori sono accettati dal firewall (verificato dal Technical Leader il 23/11/2026).
 * In produzione il nome porta l'indirizzo del progetto, come si usa per i client automatici,
 * così il JRC sa chi contattare.
 */
export const PVGIS_PROXY_USER_AGENT_DEV = 'irradia-dev-proxy'
export const PVGIS_PROXY_USER_AGENT_PRODUCTION = 'irradia-proxy (+https://github.com/mattiaalongo/irradia)'

/**
 * Tempo massimo per la risposta completa di PVGIS, in millisecondi (produzione). Misurato il
 * 23/11/2026 dal Technical Leader: l'anno tipo di Roma arriva in 4-5 s; 25 s lasciano un margine
 * di circa 5 volte per i momenti di carico, restando sotto i 30 s oltre cui un utente rinuncia.
 */
export const PVGIS_PROXY_TIMEOUT_MS = 25_000

/**
 * Dimensione massima della risposta di PVGIS (200), in byte. Misurato il 23/11/2026: l'anno
 * tipo di Roma pesa ~1,27 MB non compresso; 5 MB lasciano un margine di circa 4 volte e
 * impediscono che una risposta anomala riempia la memoria della funzione.
 */
export const PVGIS_PROXY_MAX_BYTES = 5 * 1024 * 1024

/**
 * Dimensione massima di una risposta di errore 4xx inoltrata, in byte. I messaggi veri di
 * PVGIS stanno sotto i 100 caratteri (fixture `pvgis-error-*.json`, ~80 byte; CLAUDE.md, #47).
 */
export const PVGIS_PROXY_MAX_ERROR_BYTES = 16 * 1024

/**
 * Codici con cui PVGIS dice "troppe richieste, riprova": 429 (oltre 30 richieste/s per IP)
 * e 529 (servizio sovraccarico). Fonte: JRC, "PVGIS API — non-interactive service" (indirizzo
 * sopra), verificato dal Technical Leader il 23/11/2026. Diventano 503 (RFC 9110 §15.6.4):
 * problema temporaneo, il motore li classifica `unavailable`.
 */
const PVGIS_BUSY_STATUSES: readonly number[] = [429, 529]

/** Forma accettata per latitudine e longitudine: al massimo 3 cifre intere e 4 decimali (≈ 11 m). */
const COORD_PATTERN = /^-?\d{1,3}(\.\d{1,4})?$/

/** Parametri richiesti, con il valore fisso dove c'è (`null` = numero da controllare). */
const EXPECTED_PARAMS: Readonly<Record<string, string | null>> = {
  lat: null,
  lon: null,
  usehorizon: '1',
  outputformat: 'json',
}

/** Dipendenze dell'intermediario: si passano dall'esterno per provarlo senza rete. */
export interface PvgisProxyDeps {
  /** `fetch` verso PVGIS (nei test una finta). */
  fetch: typeof fetch
  /** User-Agent da presentare a PVGIS (vedi `PVGIS_PROXY_USER_AGENT_*`). */
  userAgent: string
  /** Tempo massimo per la risposta completa di PVGIS, in ms. */
  timeoutMs: number
  /** Dimensione massima della risposta 200 di PVGIS, in byte. */
  maxBytes: number
}

/** Vero se il percorso spetta all'intermediario (stesso criterio in Vite e nella funzione). */
export function isPvgisProxyPath(pathname: string): boolean {
  return pathname.startsWith(PVGIS_PROXY_PREFIX)
}

/**
 * Intestazioni di ogni risposta. Nessuna intestazione CORS: l'intermediario serve solo la
 * stessa origine dell'app. `nosniff`: il browser non deve interpretare il corpo come altro
 * (es. HTML). `no-store`: la memoria dei download è già nell'app (`ui/tmyLoader.ts`) e un
 * errore temporaneo non deve restare in una cache.
 */
function baseHeaders(withJson: boolean): Headers {
  const headers = new Headers({
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  })
  if (withJson) headers.set('Content-Type', 'application/json')
  return headers
}

/** Risposta senza corpo (502, 503, 504: il motore la classifica `unavailable`). */
function emptyResponse(status: number): Response {
  return new Response(null, { status, headers: baseHeaders(false) })
}

/** Risposta JSON; con HEAD le stesse intestazioni ma nessun corpo. */
function jsonResponse(status: number, body: Uint8Array<ArrayBuffer> | string, isHead: boolean, extra?: Record<string, string>): Response {
  const headers = baseHeaders(true)
  for (const [name, value] of Object.entries(extra ?? {})) headers.set(name, value)
  return new Response(isHead ? null : body, { status, headers })
}

/** Errore della richiesta del browser, con il motivo nel campo `message` (come fa PVGIS). */
function errorResponse(status: number, message: string, isHead: boolean, extra?: Record<string, string>): Response {
  return jsonResponse(status, JSON.stringify({ message }), isHead, extra)
}

/** Coordinata valida: forma di `COORD_PATTERN` e dentro [min, max]; altrimenti `undefined`. */
function parseCoord(text: string, min: number, max: number): number | undefined {
  if (!COORD_PATTERN.test(text)) return undefined
  const value = Number(text)
  return value >= min && value <= max ? value : undefined
}

/**
 * Controlla i parametri: esattamente quelli di `EXPECTED_PARAMS`, una volta sola ciascuno.
 * Restituisce le coordinate o il motivo del rifiuto.
 */
function parseQuery(params: URLSearchParams): { lat: number; lon: number } | { error: string } {
  const seen = new Set<string>()
  for (const [name, value] of params) {
    if (!Object.hasOwn(EXPECTED_PARAMS, name)) return { error: 'Parametro non previsto.' }
    if (seen.has(name)) return { error: 'Parametro ripetuto.' }
    seen.add(name)
    const fixed = EXPECTED_PARAMS[name]
    if (fixed !== null && value !== fixed) return { error: 'Valore di un parametro non previsto.' }
  }
  if (seen.size !== Object.keys(EXPECTED_PARAMS).length) return { error: 'Parametro mancante.' }
  const lat = parseCoord(params.get('lat') ?? '', AREA_MIN_LAT, AREA_MAX_LAT)
  const lon = parseCoord(params.get('lon') ?? '', AREA_MIN_LON, AREA_MAX_LON)
  if (lat === undefined || lon === undefined) return { error: 'Coordinate non valide o fuori dall\'area coperta.' }
  return { lat, lon }
}

/** Tipo del corpo: solo la parte prima di ";" (es. "application/json;charset=utf-8"). */
function isJsonContentType(response: Response): boolean {
  const value = response.headers.get('Content-Type') ?? ''
  return value.split(';')[0].trim().toLowerCase() === 'application/json'
}

/** Esito della lettura limitata del corpo. */
type ReadResult = { ok: true; bytes: Uint8Array<ArrayBuffer> } | { ok: false }

/**
 * Legge il corpo un pezzo alla volta contando i byte e si ferma appena supera `limit`, così
 * una risposta enorme non viene mai tenuta tutta in memoria. Controlla prima `Content-Length`,
 * se c'è: un valore oltre il limite basta per rifiutare senza leggere. (Con una risposta
 * compressa `Content-Length` è la misura compressa, quindi minore: il conteggio resta il
 * controllo vero.) Gli errori di rete durante la lettura passano a chi chiama.
 */
async function readLimited(response: Response, limit: number): Promise<ReadResult> {
  const declared = response.headers.get('Content-Length')
  if (declared !== null && Number(declared) > limit) {
    await response.body?.cancel().catch(() => {})
    return { ok: false }
  }
  if (response.body === null) return { ok: true, bytes: new Uint8Array(0) }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel().catch(() => {})
      return { ok: false }
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { ok: true, bytes }
}

/**
 * Vero se il primo carattere che non è uno spazio è "{" (oggetto JSON). Spazi di JSON:
 * spazio, tab, a capo, ritorno carrello (RFC 8259 §2). Basta a scartare la pagina HTML del
 * firewall e le risposte vuote senza il costo di `JSON.parse` sul server: il controllo
 * completo lo fa il motore nel browser (`parsePvgisTmy`).
 */
function startsWithJsonObject(bytes: Uint8Array): boolean {
  for (const byte of bytes) {
    if (byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d) continue
    return byte === 0x7b // "{"
  }
  return false
}

/**
 * Gestisce una richiesta del browser per l'anno tipo di PVGIS. Regole, nell'ordine:
 * 1. metodo GET o HEAD, altrimenti 405 (con `Allow`, RFC 9110 §15.5.6);
 * 2. percorso esattamente `PVGIS_PROXY_TMY_PATH`, altrimenti 404;
 * 3. parametri esattamente `lat`, `lon`, `usehorizon=1`, `outputformat=json`, coordinate nella
 *    forma di `COORD_PATTERN` e nell'area di lavoro, altrimenti 400 con `{"message": …}`;
 * 4. richiesta a PVGIS con l'indirizzo ricostruito da `pvgisTmyUrl` e solo `User-Agent` e
 *    `Accept`; tempo scaduto → 504, errore di rete → 502 (senza corpo);
 * 5. PVGIS 429/529 → 503, altri 5xx → 502, 4xx JSON (≤ 16 kB) inoltrato, altro 4xx → 502;
 * 6. 200 inoltrato solo se è JSON (`Content-Type` e primo carattere "{") e non supera
 *    `maxBytes`; altrimenti 502 (es. pagina HTML del firewall con codice 200).
 * Una HEAD segue le stesse regole (anche la richiesta a PVGIS) ma non ha corpo.
 */
export async function handlePvgisProxy(request: Request, deps: PvgisProxyDeps): Promise<Response> {
  const isHead = request.method === 'HEAD'
  if (request.method !== 'GET' && !isHead) {
    return errorResponse(405, 'Metodo non consentito.', false, { Allow: 'GET, HEAD' })
  }

  const url = new URL(request.url)
  if (url.pathname !== PVGIS_PROXY_TMY_PATH) return errorResponse(404, 'Indirizzo non previsto.', isHead)

  const query = parseQuery(url.searchParams)
  if ('error' in query) return errorResponse(400, query.error, isHead)

  // Indirizzo ricostruito dai soli numeri validati, con la stessa funzione del motore: una sola
  // fonte per forma e ordine dei parametri.
  const upstreamUrl = pvgisTmyUrl(PVGIS_API_BASE_URL, query.lat, query.lon)

  // Un solo segnale per il tempo massimo e per l'abbandono del browser (es. l'utente ha già
  // cambiato posizione): in entrambi i casi la richiesta a PVGIS si interrompe e non pesa sul
  // suo limite di richieste. Il tempo vale per tutta la risposta, lettura del corpo compresa.
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, deps.timeoutMs)
  const onClientAbort = () => controller.abort()
  if (request.signal.aborted) controller.abort()
  else request.signal.addEventListener('abort', onClientAbort)

  try {
    let upstream: Response
    try {
      upstream = await deps.fetch(upstreamUrl, {
        method: 'GET',
        headers: { 'User-Agent': deps.userAgent, Accept: 'application/json' },
        signal: controller.signal,
        // Nessun reindirizzamento seguito: la risposta deve venire da PVGIS. Un 3xx diventa 502.
        redirect: 'manual',
      })
    } catch {
      return emptyResponse(timedOut ? 504 : 502)
    }

    const status = upstream.status
    if (status === 200 || (status >= 400 && status < 500 && !PVGIS_BUSY_STATUSES.includes(status))) {
      if (!isJsonContentType(upstream)) {
        await upstream.body?.cancel().catch(() => {})
        return emptyResponse(502)
      }
      let read: ReadResult
      try {
        read = await readLimited(upstream, status === 200 ? deps.maxBytes : PVGIS_PROXY_MAX_ERROR_BYTES)
      } catch {
        return emptyResponse(timedOut ? 504 : 502)
      }
      if (!read.ok || !startsWithJsonObject(read.bytes)) return emptyResponse(502)
      return jsonResponse(status, read.bytes, isHead)
    }

    await upstream.body?.cancel().catch(() => {})
    return emptyResponse(PVGIS_BUSY_STATUSES.includes(status) ? 503 : 502)
  } finally {
    clearTimeout(timer)
    request.signal.removeEventListener('abort', onClientAbort)
  }
}
