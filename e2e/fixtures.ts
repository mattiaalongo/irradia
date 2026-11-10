import { readFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { test as base, expect, type Route } from '@playwright/test'

// Fixture comuni delle prove nel browser.
//
// 1. `pvgis`: PVGIS è sempre simulato con le risposte reali salvate in
//    src/engine/__fixtures__/ (Roma e Milano). Nessuna prova usa la rete vera.
// 2. Protezione: ogni richiesta non simulata verso /api/pvgis o verso un host non
//    locale viene bloccata e fa fallire la prova.
// 3. Tessere della mappa: `tiles` simula tile.openstreetmap.org con una PNG grigia fissa e conta
//    le richieste. Ogni altro host esterno resta bloccato (punto 2).
// 4. Console: console.error ed eccezioni della pagina fanno fallire la prova, salvo
//    quelle dichiarate esplicitamente con `consoleGuard.allow(...)`.

const FIXTURE_DIR = 'src/engine/__fixtures__'
const BODIES = {
  roma: readFileSync(`${FIXTURE_DIR}/pvgis-tmy-roma.json`, 'utf-8'),
  milano: readFileSync(`${FIXTURE_DIR}/pvgis-tmy-milano.json`, 'utf-8'),
  livorno: readFileSync(`${FIXTURE_DIR}/pvgis-tmy-livorno.json`, 'utf-8'),
}
/** Punti di cui abbiamo la risposta salvata (coordinate del file README dei fixture). */
const CITIES = [
  { name: 'roma', lat: 41.9028, lon: 12.4964 },
  { name: 'milano', lat: 45.4642, lon: 9.19 },
  { name: 'livorno', lat: 43.5485, lon: 10.3106 }, // vento negativo nelle ore 5094-5095 (issue #28)
] as const

export interface PvgisRequest {
  url: string
  lat: number
  lon: number
}

export type PvgisHandler = (route: Route, request: PvgisRequest) => Promise<void> | void

/** Risposta salvata della città più vicina alla posizione chiesta. */
function nearestBody(lat: number, lon: number): string {
  const d = (c: (typeof CITIES)[number]) => (c.lat - lat) ** 2 + (c.lon - lon) ** 2
  const best = [...CITIES].sort((a, b) => d(a) - d(b))[0]
  return BODIES[best.name]
}

/** Testo JSON dei fixture, per costruire varianti nelle prove (es. un vento negativo fuori finestra). */
export const FIXTURE_BODIES: Readonly<Record<string, string>> = BODIES

const defaultHandler: PvgisHandler = (route, { lat, lon }) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: nearestBody(lat, lon) })

export class PvgisMock {
  /** Richieste ricevute, nell'ordine. */
  readonly requests: PvgisRequest[] = []
  handler: PvgisHandler = defaultHandler

  get count(): number {
    return this.requests.length
  }

  /** Dalla prossima richiesta in poi risponde con `handler`. */
  use(handler: PvgisHandler): void {
    this.handler = handler
  }
  useDefault(): void {
    this.handler = defaultHandler
  }

  /** Risponde sempre con il testo JSON dato (es. un TMY derivato da un fixture e modificato). */
  body(json: string): void {
    this.use((route) => route.fulfill({ status: 200, contentType: 'application/json', body: json }))
  }

  /** Errore HTTP con il corpo JSON `{ message }` come fa PVGIS (es. posizione in mare). */
  fail(status: number, message: string): void {
    this.use((route) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ message }) }),
    )
  }
  /** Pagina HTML con codice 200, come il firewall di PVGIS ("Request Rejected"). */
  firewallHtml(): void {
    this.use((route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html><body><h1>Request Rejected</h1></body></html>',
      }),
    )
  }
  /** Rete assente. */
  offline(): void {
    this.use((route) => route.abort('internetdisconnected'))
  }
  /** Risposta 200 con JSON troncato. */
  malformedJson(): void {
    this.use((route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"inputs": {"loc' }))
  }
  /** Le richieste restano in sospeso finché non si chiama `release()`; poi ricevono la risposta di default. */
  hold(): { release: () => void } {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    this.use(async (route, req) => {
      await gate
      await defaultHandler(route, req)
    })
    return { release }
  }
}

/** CRC-32 dei chunk PNG. */
function crc32(buf: Buffer): number {
  let c = ~0
  for (const byte of buf) {
    c ^= byte
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return ~c >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const out = Buffer.alloc(body.length + 8)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), body.length + 4)
  return out
}

/** PNG 256×256 grigio chiaro, generata qui: nessun file binario nel repository. */
function makeTilePng(): Buffer {
  const size = 256
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 2, 0, 0, 0], 8) // 8 bit, RGB, nessuna interlacciatura
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, 0xd8)]) // filtro 0 + pixel grigi
  const raw = Buffer.concat(Array.from({ length: size }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}
const TILE_PNG = makeTilePng()

export class TileMock {
  /** Percorsi delle tessere richieste (es. "/5/17/11.png"). */
  readonly requests: string[] = []
  get count(): number {
    return this.requests.length
  }
}

export class ConsoleGuard {
  readonly errors: string[] = []
  private allowed: RegExp[] = []
  /** Dichiara attesi gli errori di console che corrispondono (es. errori HTTP provocati apposta). */
  allow(pattern: RegExp): void {
    this.allowed.push(pattern)
  }
  unexpected(): string[] {
    return this.errors.filter((e) => !this.allowed.some((re) => re.test(e)))
  }
}

export const test = base.extend<{ pvgis: PvgisMock; tiles: TileMock; consoleGuard: ConsoleGuard }>({
  pvgis: [
    async ({ page }, use) => {
      const mock = new PvgisMock()
      const violations: string[] = []

      // Registrata PER PRIMA: Playwright dà la precedenza alle regole registrate dopo,
      // quindi questa vede solo ciò che la regola di PVGIS (sotto) non cattura.
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url())
        const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
        if (local && !url.pathname.startsWith('/api/pvgis')) return route.continue()
        violations.push(
          local
            ? `richiesta PVGIS non simulata: ${url.pathname}${url.search}`
            : `richiesta di rete esterna: ${url.origin}${url.pathname}`,
        )
        return route.abort('blockedbyclient')
      })

      await page.route('**/api/pvgis/**', async (route) => {
        const url = new URL(route.request().url())
        const request: PvgisRequest = {
          url: url.pathname + url.search,
          lat: Number(url.searchParams.get('lat')),
          lon: Number(url.searchParams.get('lon')),
        }
        mock.requests.push(request)
        await mock.handler(route, request)
      })

      await use(mock)
      expect(violations, 'richieste di rete non simulate').toEqual([])
    },
    { auto: true },
  ],

  // Dipende da `pvgis` perché la sua regola va registrata DOPO quella che blocca gli host esterni
  // (le regole registrate dopo hanno la precedenza).
  tiles: [
    async ({ page, pvgis }, use) => {
      void pvgis
      const mock = new TileMock()
      await page.route('https://tile.openstreetmap.org/**', async (route) => {
        mock.requests.push(new URL(route.request().url()).pathname)
        await route.fulfill({ status: 200, contentType: 'image/png', body: TILE_PNG })
      })
      await use(mock)
    },
    { auto: true },
  ],

  consoleGuard: [
    async ({ page }, use) => {
      const guard = new ConsoleGuard()
      page.on('console', (msg) => {
        if (msg.type() === 'error') guard.errors.push(`console.error: ${msg.text()}`)
      })
      page.on('pageerror', (err) => guard.errors.push(`pageerror: ${err.message}`))
      await use(guard)
      expect(guard.unexpected(), 'errori di console non dichiarati').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
