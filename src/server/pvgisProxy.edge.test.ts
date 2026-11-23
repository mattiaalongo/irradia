import { describe, expect, it } from 'vitest'
import romaRaw from '../engine/__fixtures__/pvgis-tmy-roma.json'
import { handlePvgisProxy, PVGIS_PROXY_MAX_BYTES, PVGIS_PROXY_TMY_PATH, type PvgisProxyDeps } from './pvgisProxy'

// Casi limite aggiuntivi del tester (L2/L3): interpretazione dei numeri, intestazioni inoltrate,
// BOM, charset, 3xx, 529, 500, Host alterato. Nessuna rete; coordinate di città (Roma 41,9 N 12,5 E).

const ORIGIN = 'http://localhost:5173'
const BASE = 'usehorizon=1&outputformat=json'

function run(url: string, reply: () => Response, init?: RequestInit, extra: Partial<PvgisProxyDeps> = {}) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetch = (async (input: RequestInfo | URL, i?: RequestInit) => {
    calls.push({ url: String(input), init: i })
    return reply()
  }) as typeof globalThis.fetch
  const deps: PvgisProxyDeps = { fetch, userAgent: 'ua-test', timeoutMs: 1000, maxBytes: PVGIS_PROXY_MAX_BYTES, ...extra }
  return handlePvgisProxy(new Request(url, init), deps).then((response) => ({ response, calls }))
}
const ok = () => new Response(JSON.stringify(romaRaw), { headers: { 'Content-Type': 'application/json' } })
const tmy = (q: string) => `${ORIGIN}${PVGIS_PROXY_TMY_PATH}?${q}`

describe('numeri ai bordi', () => {
  it.each([
    ['041.9', '12.5', 'lat=41.9&lon=12.5'],
    ['41.9', '012.5', 'lat=41.9&lon=12.5'],
    ['41.90', '12.50', 'lat=41.9&lon=12.5'],
    ['41.9', '-0', 'lon=0'],
    ['41.9', '-0.0', 'lon=0'],
    ['41.9', '-25', 'lon=-25'],
    ['72', '45', 'lat=72&lon=45'],
  ])('lat=%s lon=%s accettati, indirizzo verso PVGIS canonico', async (lat, lon, expected) => {
    const { response, calls } = await run(tmy(`lat=${lat}&lon=${lon}&${BASE}`), ok)
    expect(response.status).toBe(200)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain(expected)
    expect(calls[0].url.startsWith('https://re.jrc.ec.europa.eu/api/v5_3/tmy?')).toBe(true)
  })

  it.each(['1e1', '+41.9', '4.19e1', '41.90000', '٤١.٩', '41.9%00', '41.9%0A', '%2B41.9', '0041.9', '0x29'])('lat=%s rifiutata', async (lat) => {
    const { response, calls } = await run(tmy(`lat=${lat}&lon=12.5&${BASE}`), ok)
    expect(response.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('nome di parametro con codifica percentuale equivale al nome normale; "+" nel valore è uno spazio → 400', async () => {
    expect((await run(tmy(`%6Cat=41.9&lon=12.5&${BASE}`), ok)).response.status).toBe(200)
    expect((await run(tmy(`lat=41.9+&lon=12.5&${BASE}`), ok)).response.status).toBe(400)
  })

  it('iniezione: separatori e frammenti nei valori non arrivano a PVGIS', async () => {
    for (const lat of ['41.9%26angle=1', '41.9%23', '41.9%3Fx', '41.9/../..', '41.9@evil.invalid', '%2F%2Fevil.invalid']) {
      const { response, calls } = await run(tmy(`lat=${lat}&lon=12.5&${BASE}`), ok)
      expect(response.status, lat).toBe(400)
      expect(calls).toHaveLength(0)
    }
  })
})

describe('SSRF e intestazioni', () => {
  it('host, @ e URL assoluti: PVGIS viene sempre contattato solo su re.jrc.ec.europa.eu', async () => {
    const urls = [
      `http://evil.invalid${PVGIS_PROXY_TMY_PATH}?lat=41.9&lon=12.5&${BASE}`,
    ]
    for (const url of urls) {
      const { calls } = await run(url, ok, { headers: { Host: 'evil.invalid' } })
      for (const c of calls) expect(new URL(c.url).host).toBe('re.jrc.ec.europa.eu')
    }
  })

  it('cookie, Authorization, X-Forwarded-For, Referer, Origin non arrivano a PVGIS; solo User-Agent e Accept', async () => {
    const { calls } = await run(tmy(`lat=41.9&lon=12.5&${BASE}`), ok, {
      headers: { Cookie: 'a=b', Authorization: 'Bearer x', 'X-Forwarded-For': '1.2.3.4', Referer: 'http://x.invalid/', Origin: 'http://x.invalid', 'User-Agent': 'Mozilla/5.0 Chrome' },
    })
    const headers = new Headers(calls[0].init?.headers)
    expect([...headers.keys()].sort()).toEqual(['accept', 'user-agent'])
    expect(headers.get('user-agent')).toBe('ua-test')
    expect(calls[0].init?.body).toBeUndefined()
  })
})

describe('risposte di PVGIS', () => {
  const body = JSON.stringify(romaRaw)
  it('JSON con BOM iniziale (UTF-8) → 502 (documentato: PVGIS non lo invia)', async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(body)])
    const { response } = await run(tmy(`lat=41.9&lon=12.5&${BASE}`), () => new Response(bytes, { headers: { 'Content-Type': 'application/json' } }))
    expect(response.status).toBe(502)
  })
  it.each(['application/json; charset=utf-8', 'APPLICATION/JSON;charset=UTF-8', ' application/json '])('Content-Type %j accettato', async (ct) => {
    const { response } = await run(tmy(`lat=41.9&lon=12.5&${BASE}`), () => new Response(body, { headers: { 'Content-Type': ct } }))
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/json')
  })
  it.each(['text/html', 'application/json-seq', 'application/jsonx', 'application/ld+json', ''])('Content-Type %j con corpo JSON → 502', async (ct) => {
    const { response } = await run(tmy(`lat=41.9&lon=12.5&${BASE}`), () => new Response(body, { headers: ct ? { 'Content-Type': ct } : {} }))
    expect(response.status).toBe(ct === '' ? 502 : 502)
  })
  it.each([301, 302, 307, 308, 500, 501, 505, 529, 429, 502, 503, 504])('status %i senza JSON → nessun corpo', async (status) => {
    const { response } = await run(tmy(`lat=41.9&lon=12.5&${BASE}`), () => new Response('x', { status, headers: { Location: 'http://evil.invalid/' } }))
    expect(await response.text()).toBe('')
    expect(response.headers.get('Location')).toBeNull()
    expect([429, 529].includes(status) ? 503 : 502).toBe(response.status)
  })
  it('4xx con JSON enorme (> 16 kB) → 502; con charset → inoltrato', async () => {
    const big = JSON.stringify({ message: 'x'.repeat(20000) })
    expect((await run(tmy(`lat=41.9&lon=12.5&${BASE}`), () => new Response(big, { status: 400, headers: { 'Content-Type': 'application/json' } }))).response.status).toBe(502)
    const small = JSON.stringify({ message: 'Location over the sea. Please move your location to land' })
    const { response } = await run(tmy(`lat=41.9&lon=12.5&${BASE}`), () => new Response(small, { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }))
    expect(response.status).toBe(400)
    expect(await response.text()).toBe(small)
  })
  it('Content-Length falso (più piccolo del vero) non permette di superare il limite', async () => {
    const big = new Uint8Array(2000).fill(0x20)
    big[1999] = 0x7d
    big[0] = 0x7b
    const { response } = await run(
      tmy(`lat=41.9&lon=12.5&${BASE}`),
      () => new Response(big, { headers: { 'Content-Type': 'application/json', 'Content-Length': '10' } }),
      undefined,
      { maxBytes: 1000 },
    )
    expect(response.status).toBe(502)
  })
})
