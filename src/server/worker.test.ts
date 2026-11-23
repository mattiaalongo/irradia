import { afterEach, describe, expect, it, vi } from 'vitest'
import worker, { type WorkerEnv } from './worker'

// Nessuna rete: `fetch` globale e file statici (`ASSETS`) sono finti.

const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/tmy?lat=41.9&lon=12.5&usehorizon=1&outputformat=json'

function fakeEnv(): { env: WorkerEnv; assetRequests: Request[] } {
  const assetRequests: Request[] = []
  const env: WorkerEnv = {
    ASSETS: {
      fetch: async (request) => {
        assetRequests.push(request)
        return new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } })
      },
    },
  }
  return { env, assetRequests }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('worker', () => {
  it('/api/pvgis/... → intermediario, con lo User-Agent di produzione; nessun file statico', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      return new Response('{"ok":1}', { headers: { 'Content-Type': 'application/json' } })
    })
    const { env, assetRequests } = fakeEnv()
    const response = await worker.fetch(
      new Request('https://irradia.invalid/api/pvgis/v5_3/tmy?lat=41.9&lon=12.5&usehorizon=1&outputformat=json'),
      env,
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('{"ok":1}')
    expect(calls.map((c) => c.url)).toEqual([PVGIS_URL])
    expect(new Headers(calls[0].init?.headers).get('User-Agent')).toBe(
      'irradia-proxy (+https://github.com/mattiaalongo/irradia)',
    )
    expect(assetRequests).toHaveLength(0)
  })

  it('percorso non previsto sotto /api/pvgis/ → 404 dell\'intermediario, non la pagina dell\'app', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const { env, assetRequests } = fakeEnv()
    const response = await worker.fetch(new Request('https://irradia.invalid/api/pvgis/v5_3/PVcalc?lat=41.9'), env)
    expect(response.status).toBe(404)
    expect(fetch).not.toHaveBeenCalled()
    expect(assetRequests).toHaveLength(0)
  })

  it('tutto il resto → file statici (ASSETS), stessa richiesta, nessuna chiamata a PVGIS', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    for (const path of ['/', '/index.html', '/assets/index-abc.js', '/api/pvgis', '/api/other']) {
      const { env, assetRequests } = fakeEnv()
      const request = new Request(`https://irradia.invalid${path}`)
      const response = await worker.fetch(request, env)
      expect(response.headers.get('Content-Type'), path).toBe('text/html')
      expect(assetRequests, path).toEqual([request])
    }
    expect(fetch).not.toHaveBeenCalled()
  })
})
