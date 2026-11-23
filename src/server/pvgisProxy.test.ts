import { afterEach, describe, expect, it, vi } from 'vitest'
import romaRaw from '../engine/__fixtures__/pvgis-tmy-roma.json'
import seaErrorRaw from '../engine/__fixtures__/pvgis-error-sea.json'
import coverageErrorRaw from '../engine/__fixtures__/pvgis-error-coverage.json'
import { fetchPvgisTmy, PvgisError, pvgisTmyUrl, TMY_HOURS } from '../engine/pvgisTmy'
import {
  handlePvgisProxy,
  isPvgisProxyPath,
  PVGIS_API_BASE_URL,
  PVGIS_PROXY_MAX_BYTES,
  PVGIS_PROXY_MAX_ERROR_BYTES,
  PVGIS_PROXY_TIMEOUT_MS,
  PVGIS_PROXY_TMY_PATH,
  PVGIS_PROXY_USER_AGENT_DEV,
  PVGIS_PROXY_USER_AGENT_PRODUCTION,
  type PvgisProxyDeps,
} from './pvgisProxy'

// Nessuna rete: PVGIS è sempre una `fetch` finta che registra le chiamate.
// Coordinate dei test: centri di città (Roma 41,9 N 12,5 E), come chiede CLAUDE.md.

const ORIGIN = 'http://localhost:5173'
const ROMA_QUERY = 'lat=41.9&lon=12.5&usehorizon=1&outputformat=json'
const ROMA_UPSTREAM = 'https://re.jrc.ec.europa.eu/api/v5_3/tmy?lat=41.9&lon=12.5&usehorizon=1&outputformat=json'

interface Call {
  url: string
  init: RequestInit | undefined
}

/** `fetch` finta: registra le chiamate e risponde con `reply`. */
function fakeFetch(reply: (call: Call) => Response | Promise<Response>): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init }
    calls.push(call)
    return reply(call)
  }) as typeof globalThis.fetch
  return { fetch, calls }
}

/** Solo la `fetch` finta di `fakeFetch`, quando le chiamate non servono. */
const upstreamReply = (reply: (call: Call) => Response | Promise<Response>): typeof fetch => fakeFetch(reply).fetch

/** `fetch` finta che non risponde mai: si ferma solo quando il segnale viene annullato. */
function hangingFetch(): { fetch: typeof fetch; calls: Call[] } {
  return fakeFetch(
    (call) =>
      new Promise<Response>((_, reject) => {
        const signal = call.init?.signal
        const fail = () => reject(new DOMException('aborted', 'AbortError'))
        if (signal?.aborted) fail() // come la `fetch` vera: un segnale già annullato rifiuta subito
        else signal?.addEventListener('abort', fail)
      }),
  )
}

function jsonReply(body: unknown, status = 200, contentType = 'application/json'): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': contentType },
  })
}

function deps(fetch: typeof globalThis.fetch, extra: Partial<PvgisProxyDeps> = {}): PvgisProxyDeps {
  return { fetch, userAgent: 'irradia-test', timeoutMs: 1000, maxBytes: PVGIS_PROXY_MAX_BYTES, ...extra }
}

function request(pathAndQuery: string, init?: RequestInit): Request {
  return new Request(ORIGIN + pathAndQuery, init)
}

const tmyRequest = (query = ROMA_QUERY, init?: RequestInit) => request(`${PVGIS_PROXY_TMY_PATH}?${query}`, init)

/** Controlla le intestazioni comuni a tutte le risposte e l'assenza di CORS. */
function expectSafeHeaders(response: Response): void {
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  for (const name of response.headers.keys()) expect(name.startsWith('access-control-'), name).toBe(false)
}

/** Risposta senza corpo (502/503/504), come la vuole il motore per `unavailable`. */
async function expectEmpty(response: Response, status: number): Promise<void> {
  expect(response.status).toBe(status)
  expect(await response.text()).toBe('')
  expect(response.headers.get('Content-Type')).toBeNull()
  expectSafeHeaders(response)
}

/** Risposta di errore dell'intermediario: JSON con `message`. */
async function expectJsonError(response: Response, status: number): Promise<string> {
  expect(response.status).toBe(status)
  expect(response.headers.get('Content-Type')).toBe('application/json')
  expectSafeHeaders(response)
  const body = (await response.json()) as { message?: unknown }
  expect(typeof body.message).toBe('string')
  return body.message as string
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('costanti', () => {
  it('percorso, indirizzo di PVGIS e User-Agent accettati dal firewall (verificati il 23/11/2026)', () => {
    expect(PVGIS_PROXY_TMY_PATH).toBe('/api/pvgis/v5_3/tmy')
    expect(PVGIS_API_BASE_URL).toBe('https://re.jrc.ec.europa.eu/api')
    expect(PVGIS_PROXY_USER_AGENT_DEV).toBe('irradia-dev-proxy')
    expect(PVGIS_PROXY_USER_AGENT_PRODUCTION).toBe('irradia-proxy (+https://github.com/mattiaalongo/irradia)')
    expect(PVGIS_PROXY_TIMEOUT_MS).toBe(25_000)
    expect(PVGIS_PROXY_MAX_BYTES).toBe(5 * 1024 * 1024)
    expect(PVGIS_PROXY_MAX_ERROR_BYTES).toBe(16 * 1024)
  })

  it('isPvgisProxyPath: solo i percorsi sotto /api/pvgis/', () => {
    expect(isPvgisProxyPath('/api/pvgis/v5_3/tmy')).toBe(true)
    expect(isPvgisProxyPath('/api/pvgis/qualunque')).toBe(true)
    for (const path of ['/', '/index.html', '/api/pvgis', '/api/pvgisx/v5_3/tmy', '/api/other']) {
      expect(isPvgisProxyPath(path), path).toBe(false)
    }
  })
})

describe('metodo', () => {
  it('POST, PUT, DELETE, PATCH, OPTIONS → 405 con Allow, nessuna richiesta a PVGIS', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
      const { fetch, calls } = fakeFetch(() => jsonReply(romaRaw))
      const response = await handlePvgisProxy(tmyRequest(ROMA_QUERY, { method }), deps(fetch))
      await expectJsonError(response, 405)
      expect(response.headers.get('Allow')).toBe('GET, HEAD')
      expect(calls, method).toHaveLength(0)
    }
  })
})

describe('percorso', () => {
  it('ogni percorso diverso da /api/pvgis/v5_3/tmy → 404, nessuna richiesta a PVGIS', async () => {
    const paths = [
      '/api/pvgis/v5_3/tmy/',
      '/api/pvgis/v5_3/TMY',
      '/api/pvgis/v5_2/tmy',
      '/api/pvgis/v5_3/PVcalc',
      '/api/pvgis/v5_3/seriescalc',
      '/api/pvgis/v5_3/tmy/../seriescalc',
      '/api/pvgis//v5_3/tmy',
      '/api/pvgis/v5_3%2Ftmy',
      '/api/pvgis/v5_3/tmy%20',
      '/api/pvgis/',
      '/api/pvgis/https://example.invalid/',
    ]
    for (const path of paths) {
      const { fetch, calls } = fakeFetch(() => jsonReply(romaRaw))
      await expectJsonError(await handlePvgisProxy(request(`${path}?${ROMA_QUERY}`), deps(fetch)), 404)
      expect(calls, path).toHaveLength(0)
    }
  })
})

describe('parametri', () => {
  async function rejected(query: string): Promise<number> {
    const { fetch, calls } = fakeFetch(() => jsonReply(romaRaw))
    await expectJsonError(await handlePvgisProxy(tmyRequest(query), deps(fetch)), 400)
    return calls.length
  }

  it('parametro mancante, in più, ripetuto o con valore diverso → 400 con {"message"}, nessuna richiesta', async () => {
    const queries = [
      '',
      'lat=41.9&lon=12.5&usehorizon=1',
      'lat=41.9&lon=12.5&outputformat=json',
      'lon=12.5&usehorizon=1&outputformat=json',
      `${ROMA_QUERY}&angle=35`,
      `${ROMA_QUERY}&lat=41.9`,
      `${ROMA_QUERY}&`.concat('=x'),
      'lat=41.9&lon=12.5&usehorizon=0&outputformat=json',
      'lat=41.9&lon=12.5&usehorizon=1&outputformat=csv',
      'lat=41.9&lon=12.5&usehorizon=1&outputformat=JSON',
      'lat=41.9&lon=12.5&usehorizon=01&outputformat=json',
      'LAT=41.9&lon=12.5&usehorizon=1&outputformat=json',
    ]
    for (const query of queries) expect(await rejected(query), query).toBe(0)
  })

  it('coordinate in forma non ammessa → 400', async () => {
    const bad = ['', '41.90001', '1e1', '+41.9', ' 41.9', '41.9 ', '41.', '.5', '41,9', 'NaN', 'Infinity', '0x2A', '4192', '--41', '41.9.1']
    for (const value of bad) {
      expect(await rejected(`lat=${encodeURIComponent(value)}&lon=12.5&usehorizon=1&outputformat=json`), `lat=${value}`).toBe(0)
      expect(await rejected(`lat=41.9&lon=${encodeURIComponent(value)}&usehorizon=1&outputformat=json`), `lon=${value}`).toBe(0)
    }
  })

  it('coordinate fuori dall\'area di lavoro (34-72 N, −25-45 E) → 400; i limiti sono inclusi', async () => {
    for (const [lat, lon] of [['33.9999', '12.5'], ['72.0001', '12.5'], ['41.9', '-25.0001'], ['41.9', '45.0001'], ['-41.9', '12.5']]) {
      expect(await rejected(`lat=${lat}&lon=${lon}&usehorizon=1&outputformat=json`), `${lat},${lon}`).toBe(0)
    }
    for (const [lat, lon] of [['34', '-25'], ['72', '45'], ['34.0000', '-25.0000']]) {
      const { fetch, calls } = fakeFetch(() => jsonReply(romaRaw))
      const response = await handlePvgisProxy(tmyRequest(`lat=${lat}&lon=${lon}&usehorizon=1&outputformat=json`), deps(fetch))
      expect(response.status, `${lat},${lon}`).toBe(200)
      expect(calls).toHaveLength(1)
    }
  })

  it('i parametri possono arrivare in qualunque ordine e con la codifica percentuale', async () => {
    const { fetch, calls } = fakeFetch(() => jsonReply(romaRaw))
    const response = await handlePvgisProxy(tmyRequest('outputformat=json&usehorizon=1&lon=12%2E5&lat=41.9'), deps(fetch))
    expect(response.status).toBe(200)
    expect(calls.map((c) => c.url)).toEqual([ROMA_UPSTREAM])
  })

  it('l\'indirizzo prodotto dal motore (pvgisTmyUrl con "/api/pvgis") è accettato', async () => {
    const { fetch, calls } = fakeFetch(() => jsonReply(romaRaw))
    const response = await handlePvgisProxy(request(pvgisTmyUrl('/api/pvgis', 41.9, 12.5)), deps(fetch))
    expect(response.status).toBe(200)
    expect(calls.map((c) => c.url)).toEqual([ROMA_UPSTREAM])
  })

  it('HEAD rifiutata: stesso stato, nessun corpo', async () => {
    const { fetch } = fakeFetch(() => jsonReply(romaRaw))
    const response = await handlePvgisProxy(tmyRequest('lat=1', { method: 'HEAD' }), deps(fetch))
    expect(response.status).toBe(400)
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect(await response.text()).toBe('')
  })
})

describe('richiesta a PVGIS', () => {
  it('indirizzo ricostruito, metodo GET, solo User-Agent e Accept, nessun reindirizzamento', async () => {
    const { fetch, calls } = fakeFetch(() => jsonReply(romaRaw))
    const browserRequest = tmyRequest('lat=041.9000&lon=12.50&usehorizon=1&outputformat=json', {
      headers: {
        'User-Agent': 'Mozilla/5.0 Chrome/130',
        Cookie: 'session=abc',
        Referer: 'http://localhost:5173/',
        'Accept-Language': 'it-IT',
        'X-Forwarded-For': '203.0.113.7',
        Authorization: 'Bearer x',
      },
    })
    await handlePvgisProxy(browserRequest, deps(fetch, { userAgent: PVGIS_PROXY_USER_AGENT_DEV }))
    expect(calls).toHaveLength(1)
    const [{ url, init }] = calls
    expect(url).toBe(ROMA_UPSTREAM)
    expect(init?.method).toBe('GET')
    expect(init?.redirect).toBe('manual')
    expect(init?.body).toBeUndefined()
    const headers = new Headers(init?.headers)
    expect([...headers.keys()].sort()).toEqual(['accept', 'user-agent'])
    expect(headers.get('User-Agent')).toBe('irradia-dev-proxy')
    expect(headers.get('Accept')).toBe('application/json')
  })

  it('HEAD: chiede a PVGIS con GET (stesse regole) e risponde senza corpo', async () => {
    const { fetch, calls } = fakeFetch(() => jsonReply(romaRaw))
    const response = await handlePvgisProxy(tmyRequest(ROMA_QUERY, { method: 'HEAD' }), deps(fetch))
    expect(calls[0].init?.method).toBe('GET')
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expectSafeHeaders(response)
    expect(await response.text()).toBe('')
  })

  it('tempo scaduto in attesa della risposta → 504 senza corpo', async () => {
    const { fetch } = hangingFetch()
    await expectEmpty(await handlePvgisProxy(tmyRequest(), deps(fetch, { timeoutMs: 5 })), 504)
  })

  it('tempo scaduto durante la lettura del corpo → 504 senza corpo', async () => {
    const { fetch } = fakeFetch((call) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"inputs":'))
          call.init?.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')))
        },
      })
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    await expectEmpty(await handlePvgisProxy(tmyRequest(), deps(fetch, { timeoutMs: 5 })), 504)
  })

  it('errore di rete → 502 senza corpo', async () => {
    const { fetch } = fakeFetch(() => Promise.reject(new TypeError('fetch failed')))
    await expectEmpty(await handlePvgisProxy(tmyRequest(), deps(fetch)), 502)
  })

  it('errore di rete durante la lettura del corpo → 502 senza corpo', async () => {
    const { fetch } = fakeFetch(() => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"inputs":'))
          controller.error(new TypeError('connessione chiusa'))
        },
      })
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    await expectEmpty(await handlePvgisProxy(tmyRequest(), deps(fetch)), 502)
  })

  it('il browser abbandona la richiesta → la richiesta a PVGIS viene interrotta', async () => {
    const { fetch, calls } = hangingFetch()
    const abort = new AbortController()
    const pending = handlePvgisProxy(tmyRequest(ROMA_QUERY, { signal: abort.signal }), deps(fetch, { timeoutMs: 60_000 }))
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    abort.abort()
    const response = await pending
    expect(calls[0].init?.signal?.aborted).toBe(true)
    expect(response.status).toBe(502)
  })

  it('richiesta già abbandonata all\'arrivo → nessuna attesa, la richiesta a PVGIS parte già annullata', async () => {
    const { fetch, calls } = hangingFetch()
    const abort = new AbortController()
    abort.abort()
    const response = await handlePvgisProxy(tmyRequest(ROMA_QUERY, { signal: abort.signal }), deps(fetch, { timeoutMs: 60_000 }))
    expect(response.status).toBe(502)
    expect(calls).toHaveLength(1)
    expect(calls[0].init?.signal?.aborted).toBe(true)
  })
})

describe('risposte di PVGIS', () => {
  it('429 (troppe richieste) e 529 (sovraccarico) → 503 senza corpo', async () => {
    for (const status of [429, 529]) {
      const { fetch } = fakeFetch(() => jsonReply({ message: 'Too many requests' }, status))
      await expectEmpty(await handlePvgisProxy(tmyRequest(), deps(fetch)), 503)
    }
  })

  it('altri 5xx (con o senza JSON) → 502 senza corpo', async () => {
    for (const status of [500, 501, 502, 503, 504, 505, 599]) {
      const { fetch } = fakeFetch(() => jsonReply({ message: 'Server error' }, status))
      await expectEmpty(await handlePvgisProxy(tmyRequest(), deps(fetch)), 502)
    }
  })

  it('3xx, 1xx-2xx diversi da 200 → 502 senza corpo', async () => {
    for (const status of [201, 204, 206, 301, 302, 304, 307]) {
      const { fetch } = fakeFetch(() =>
        new Response(status === 204 || status === 304 ? null : '{}', {
          status,
          headers: { 'Content-Type': 'application/json', Location: 'https://example.invalid/' },
        }),
      )
      await expectEmpty(await handlePvgisProxy(tmyRequest(), deps(fetch)), 502)
    }
  })

  it('4xx con JSON (mare, fuori copertura) → inoltrata così com\'è', async () => {
    for (const fixture of [seaErrorRaw, coverageErrorRaw]) {
      const text = JSON.stringify(fixture)
      const { fetch } = fakeFetch(() => jsonReply(text, 400, 'application/json;charset=utf-8'))
      const response = await handlePvgisProxy(tmyRequest(), deps(fetch))
      expect(response.status).toBe(400)
      expect(response.headers.get('Content-Type')).toBe('application/json')
      expectSafeHeaders(response)
      expect(await response.text()).toBe(text)
    }
  })

  it('4xx con JSON più grande di 16 kB → 502; esattamente 16 kB → inoltrata', async () => {
    const make = (size: number) => `{"message":"${'x'.repeat(size - 14)}"}`
    expect(make(PVGIS_PROXY_MAX_ERROR_BYTES)).toHaveLength(PVGIS_PROXY_MAX_ERROR_BYTES)
    const big = fakeFetch(() => jsonReply(make(PVGIS_PROXY_MAX_ERROR_BYTES + 1), 400))
    await expectEmpty(await handlePvgisProxy(tmyRequest(), deps(big.fetch)), 502)
    const exact = fakeFetch(() => jsonReply(make(PVGIS_PROXY_MAX_ERROR_BYTES), 400))
    expect((await handlePvgisProxy(tmyRequest(), deps(exact.fetch))).status).toBe(400)
  })

  it('4xx senza JSON (HTML, testo, JSON che non è un oggetto) → 502', async () => {
    for (const [body, contentType] of [
      ['<html>Not Found</html>', 'text/html'],
      ['Bad request', 'text/plain'],
      ['[1]', 'application/json'],
      ['', 'application/json'],
    ]) {
      const { fetch } = fakeFetch(() => jsonReply(body, 404, contentType))
      await expectEmpty(await handlePvgisProxy(tmyRequest(), deps(fetch)), 502)
    }
  })

  it('200 JSON → inoltrata con gli stessi byte e solo le intestazioni sicure', async () => {
    const text = JSON.stringify(romaRaw)
    const { fetch } = fakeFetch(
      () =>
        new Response(text, {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            'Set-Cookie': 'pvgis=1',
            'Access-Control-Allow-Origin': '*',
            Server: 'pvgis',
          },
        }),
    )
    const response = await handlePvgisProxy(tmyRequest(), deps(fetch))
    expect(response.status).toBe(200)
    expect([...response.headers.keys()].sort()).toEqual(['cache-control', 'content-type', 'x-content-type-options'])
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expectSafeHeaders(response)
    expect(await response.text()).toBe(text)
  })

  it('200 con spazi prima di "{" → accettata', async () => {
    const { fetch } = fakeFetch(() => jsonReply(' \t\r\n{"a":1}'))
    expect((await handlePvgisProxy(tmyRequest(), deps(fetch))).status).toBe(200)
  })

  it('200 non JSON (pagina HTML del firewall, testo, vuota, array) → 502 senza corpo', async () => {
    const firewall = '<html><head><title>Request Rejected</title></head><body>The requested URL was rejected.</body></html>'
    for (const [body, contentType] of [
      [firewall, 'text/html'],
      [firewall, 'application/json'],
      ['{"a":1}', 'text/html'],
      ['{"a":1}', 'text/json'],
      ['{"a":1}', ''],
      ['', 'application/json'],
      ['   ', 'application/json'],
      ['[]', 'application/json'],
      ['﻿{"a":1}', 'application/json'],
    ]) {
      const { fetch } = fakeFetch(() => jsonReply(body, 200, contentType))
      await expectEmpty(await handlePvgisProxy(tmyRequest(), deps(fetch)), 502)
    }
  })

  it('200 più grande di maxBytes (contato in streaming) → 502; esattamente maxBytes → accettata', async () => {
    const maxBytes = 1000
    const body = (size: number) => `{"x":"${'a'.repeat(size - 8)}"}`
    expect(body(maxBytes)).toHaveLength(maxBytes)
    // Corpo diviso in pezzi da 100 byte e senza Content-Length: conta solo il contatore.
    const chunked = (text: string) => {
      const bytes = new TextEncoder().encode(text)
      let sent = 0
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (sent >= bytes.length) return controller.close()
          controller.enqueue(bytes.slice(sent, sent + 100))
          sent += 100
        },
      })
      return { stream, sentBytes: () => sent }
    }
    const tooBig = chunked(body(maxBytes + 1))
    const big = fakeFetch(() => new Response(tooBig.stream, { headers: { 'Content-Type': 'application/json' } }))
    await expectEmpty(await handlePvgisProxy(tmyRequest(), deps(big.fetch, { maxBytes })), 502)

    const exact = chunked(body(maxBytes))
    const ok = fakeFetch(() => new Response(exact.stream, { headers: { 'Content-Type': 'application/json' } }))
    const response = await handlePvgisProxy(tmyRequest(), deps(ok.fetch, { maxBytes }))
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(body(maxBytes))
  })

  it('Content-Length oltre maxBytes → 502 senza leggere il corpo', async () => {
    let pulled = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++
        controller.enqueue(new TextEncoder().encode('{'))
      },
    })
    const { fetch } = fakeFetch(
      () => new Response(stream, { headers: { 'Content-Type': 'application/json', 'Content-Length': '1001' } }),
    )
    await expectEmpty(await handlePvgisProxy(tmyRequest(), deps(fetch, { maxBytes: 1000 })), 502)
    // ReadableStream chiama `pull` una volta da sé per riempire la coda: nessuna lettura oltre.
    expect(pulled).toBeLessThanOrEqual(1)
  })
})

describe('nessun registro', () => {
  it('nessuna scrittura sulla console, qualunque sia l\'esito', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m))
    const replies: (() => Response | Promise<Response>)[] = [
      () => jsonReply(romaRaw),
      () => jsonReply(seaErrorRaw, 400),
      () => jsonReply('x', 500, 'text/plain'),
      () => Promise.reject(new TypeError('fetch failed')),
    ]
    for (const reply of replies) await handlePvgisProxy(tmyRequest(), deps(fakeFetch(reply).fetch))
    await handlePvgisProxy(tmyRequest('lat=1'), deps(fakeFetch(() => jsonReply(romaRaw)).fetch))
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })
})

describe('con il motore (fetchPvgisTmy dietro l\'intermediario)', () => {
  /** `fetch` del browser: passa la richiesta del motore all'intermediario, con PVGIS finto. */
  function browserFetch(upstream: typeof fetch, extra: Partial<PvgisProxyDeps> = {}): typeof fetch {
    const proxyDeps = deps(upstream, extra)
    return (async (input: RequestInfo | URL, init?: RequestInit) =>
      handlePvgisProxy(new Request(new URL(String(input), ORIGIN), init), proxyDeps)) as typeof fetch
  }

  async function kindOf(fetch: typeof globalThis.fetch, lat = 41.9, lon = 12.5): Promise<string> {
    try {
      await fetchPvgisTmy(lat, lon, { baseUrl: '/api/pvgis', fetch })
    } catch (err) {
      expect(err).toBeInstanceOf(PvgisError)
      return (err as PvgisError).kind
    }
    return 'ok'
  }

  it('Roma: l\'anno tipo arriva intero al motore', async () => {
    const tmy = await fetchPvgisTmy(41.9, 12.5, { baseUrl: '/api/pvgis', fetch: browserFetch(upstreamReply(() => jsonReply(romaRaw))) })
    expect(tmy.hours).toHaveLength(TMY_HOURS)
  })

  it('mare e fuori copertura (risposte vere di PVGIS) → seaLocation e outsideCoverage', async () => {
    expect(await kindOf(browserFetch(upstreamReply(() => jsonReply(seaErrorRaw, 400))))).toBe('seaLocation')
    expect(await kindOf(browserFetch(upstreamReply(() => jsonReply(coverageErrorRaw, 400))))).toBe('outsideCoverage')
  })

  it('502, 503 e 504 dell\'intermediario → unavailable (il motore mostra "Riprova")', async () => {
    const cases: [string, typeof fetch][] = [
      ['rete', browserFetch(upstreamReply(() => Promise.reject(new TypeError('fetch failed'))))],
      ['tempo', browserFetch(hangingFetch().fetch, { timeoutMs: 5 })],
      ['429', browserFetch(upstreamReply(() => jsonReply({ message: 'busy' }, 429)))],
      ['529', browserFetch(upstreamReply(() => jsonReply({ message: 'busy' }, 529)))],
      ['500', browserFetch(upstreamReply(() => jsonReply({ message: 'error' }, 500)))],
      ['firewall', browserFetch(upstreamReply(() => jsonReply('<html>Request Rejected</html>', 200, 'text/html')))],
      ['troppo grande', browserFetch(upstreamReply(() => jsonReply(romaRaw)), { maxBytes: 1000 })],
    ]
    for (const [name, fetch] of cases) expect(await kindOf(fetch), name).toBe('unavailable')
  })

  it('coordinate fuori area (non inviate dall\'app) → 400 dell\'intermediario → rejected', async () => {
    expect(await kindOf(browserFetch(upstreamReply(() => jsonReply(romaRaw))), 30, 12.5)).toBe('rejected')
  })
})
