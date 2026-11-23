import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { pvgisTmyUrl } from '../engine/pvgisTmy'
import { AREA_MAX_LAT, AREA_MAX_LON, AREA_MIN_LAT, AREA_MIN_LON } from '../shared/area'
import { handlePvgisProxy, PVGIS_PROXY_TMY_PATH } from './pvgisProxy'

// Proprietà dell'intermediario (seme fisso in src/test/fastCheckSetup.ts): qualunque richiesta
// arrivi dal browser, o non parte nessuna richiesta verso PVGIS, oppure ne parte una sola,
// verso l'unico indirizzo ammesso e con coordinate valide. Nessuna rete: `fetch` finta.

/** Indirizzo ammesso verso PVGIS: numeri con al massimo 4 decimali, parametri in quest'ordine. */
const UPSTREAM_PATTERN =
  /^https:\/\/re\.jrc\.ec\.europa\.eu\/api\/v5_3\/tmy\?lat=(-?\d{1,3}(?:\.\d{1,4})?)&lon=(-?\d{1,3}(?:\.\d{1,4})?)&usehorizon=1&outputformat=json$/

/** Esegue l'intermediario e restituisce gli indirizzi chiesti a PVGIS. */
async function upstreamUrls(request: Request): Promise<string[]> {
  const urls: string[] = []
  const fetch = (async (input: RequestInfo | URL) => {
    urls.push(String(input))
    return new Response('{}', { headers: { 'Content-Type': 'application/json' } })
  }) as typeof globalThis.fetch
  await handlePvgisProxy(request, { fetch, userAgent: 'irradia-test', timeoutMs: 1000, maxBytes: 1000 })
  return urls
}

/** Controlla l'invariante su una lista di indirizzi chiesti a PVGIS. */
function expectOnlyValidUpstream(urls: string[]): void {
  expect(urls.length).toBeLessThanOrEqual(1)
  for (const url of urls) {
    const match = UPSTREAM_PATTERN.exec(url)
    expect(match, url).not.toBeNull()
    const lat = Number(match![1])
    const lon = Number(match![2])
    expect(lat >= AREA_MIN_LAT && lat <= AREA_MAX_LAT, url).toBe(true)
    expect(lon >= AREA_MIN_LON && lon <= AREA_MAX_LON, url).toBe(true)
  }
}

/** Testo di una coordinata: a volte valido, a volte no. */
const coordText = fc.oneof(
  fc.double({ min: -200, max: 200, noNaN: true }).map(String),
  fc.integer({ min: -1_800_000, max: 1_800_000 }).map((n) => (n / 10_000).toString()),
  fc.integer({ min: -1_800_000, max: 1_800_000 }).map((n) => (n / 10_000).toFixed(4)),
  fc.string({ maxLength: 12 }),
  fc.constantFrom('', '41.9', '12.5', '1e1', 'NaN', '-0', '34', '72', '-25', '45', '41.90001', '%34%31'),
)

/** Nome di un parametro: quelli previsti, varianti e nomi qualunque. */
const paramName = fc.oneof(
  fc.constantFrom('lat', 'lon', 'usehorizon', 'outputformat', 'LAT', 'angle', 'aspect', 'url', ''),
  fc.string({ maxLength: 8 }),
)

/** Una query: a volte quella giusta, a volte rimescolata o con parametri in più. */
const query = fc.oneof(
  fc.tuple(coordText, coordText).map(([lat, lon]) => {
    const p = new URLSearchParams({ lat, lon, usehorizon: '1', outputformat: 'json' })
    return p.toString()
  }),
  fc.array(fc.tuple(paramName, fc.oneof(coordText, fc.constantFrom('1', '0', 'json', 'csv'))), { maxLength: 6 }).map((pairs) =>
    new URLSearchParams(pairs).toString(),
  ),
  fc.string({ maxLength: 40 }),
)

/** Un percorso: quello giusto, varianti vicine e percorsi qualunque. */
const path = fc.oneof(
  fc.constant(PVGIS_PROXY_TMY_PATH),
  fc.constantFrom('/api/pvgis/v5_3/tmy/', '/api/pvgis/v5_2/tmy', '/api/pvgis/v5_3/PVcalc', '/api/pvgis/../pvgis/v5_3/tmy', '/'),
  fc.webPath(),
)

const method = fc.constantFrom('GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS')

describe('handlePvgisProxy (proprietà)', () => {
  it('per qualunque percorso, query e metodo: nessuna richiesta, oppure una sola verso l\'indirizzo ammesso', async () => {
    await fc.assert(
      fc.asyncProperty(path, query, method, async (p, q, m) => {
        let request: Request
        try {
          request = new Request(`http://localhost${p}?${q}`, { method: m })
        } catch {
          return // indirizzo che nemmeno il browser saprebbe costruire
        }
        expectOnlyValidUpstream(await upstreamUrls(request))
      }),
      { numRuns: 500 },
    )
  })

  it('ogni posizione dell\'area arrotondata a 4 decimali (come fa l\'app) passa, con lo stesso indirizzo del motore', async () => {
    const coord = (min: number, max: number) => fc.integer({ min: min * 10_000, max: max * 10_000 }).map((n) => n / 10_000)
    await fc.assert(
      fc.asyncProperty(coord(AREA_MIN_LAT, AREA_MAX_LAT), coord(AREA_MIN_LON, AREA_MAX_LON), async (lat, lon) => {
        const urls = await upstreamUrls(new Request(`http://localhost${pvgisTmyUrl('/api/pvgis', lat, lon)}`))
        expect(urls).toEqual([pvgisTmyUrl('https://re.jrc.ec.europa.eu/api', lat + 0, lon + 0)])
        expectOnlyValidUpstream(urls)
      }),
      { numRuns: 500 },
    )
  })
})
