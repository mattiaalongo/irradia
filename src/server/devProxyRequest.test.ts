import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { devProxyRequest } from './devProxyRequest.ts'

const TMY = '/api/pvgis/v5_3/tmy?lat=41.9&lon=12.5&usehorizon=1&outputformat=json'
const signal = new AbortController().signal

describe('devProxyRequest', () => {
  it('percorso dell\'intermediario → Request con lo stesso percorso e la stessa query, su host fisso', () => {
    const request = devProxyRequest(TMY, 'GET', signal)
    expect(request?.url).toBe(`http://localhost${TMY}`)
    expect(request?.method).toBe('GET')
    expect(devProxyRequest(TMY, 'HEAD', signal)?.method).toBe('HEAD')
  })

  it('altri metodi (anche quelli vietati da new Request) → POST, che l\'intermediario rifiuta con 405', () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS', 'CONNECT', 'TRACE', 'TRACK', 'get', undefined]) {
      expect(devProxyRequest(TMY, method, signal)?.method, String(method)).toBe('POST')
    }
  })

  it('percorsi che non spettano all\'intermediario → undefined (prosegue Vite)', () => {
    for (const raw of ['/', '/index.html', '/api/pvgis', '/api/other', '/assets/x.js']) {
      expect(devProxyRequest(raw, 'GET', signal), raw).toBeUndefined()
    }
  })

  it('"//host/…" e "/\\host/…" non cambiano host: undefined, mai una Request verso un altro percorso', () => {
    for (const raw of [
      `//evil.invalid${TMY}`,
      `//user@evil.invalid${TMY}`,
      `//user:pw@evil.invalid${TMY}`,
      `/\\evil.invalid${TMY}`,
      `\\\\evil.invalid${TMY}`,
      `///evil.invalid${TMY}`,
      `http://evil.invalid${TMY}`,
      `evil.invalid${TMY}`,
      `*`,
      '',
      undefined,
    ]) {
      expect(devProxyRequest(raw, 'GET', signal), String(raw)).toBeUndefined()
    }
  })

  it('il segnale della richiesta di Node arriva alla Request', () => {
    const abort = new AbortController()
    const request = devProxyRequest(TMY, 'GET', abort.signal)
    abort.abort()
    expect(request?.signal.aborted).toBe(true)
  })

  it('proprietà: mai eccezioni; se c\'è una Request, l\'host è localhost e percorso e query sono quelli ricevuti', () => {
    const raw = fc.oneof(
      fc.string({ maxLength: 60 }),
      fc.webPath().map((p) => `/api/pvgis/${p}`),
      fc.tuple(fc.constantFrom('/', '//', '/\\', '\\\\', ''), fc.string({ maxLength: 20 }), fc.constant(TMY)).map((parts) => parts.join('')),
    )
    fc.assert(
      fc.property(raw, fc.constantFrom('GET', 'HEAD', 'POST', 'CONNECT'), (r, m) => {
        const request = devProxyRequest(r, m, signal)
        if (request === undefined) return
        const url = new URL(request.url)
        expect(url.host).toBe('localhost')
        expect(url.pathname.startsWith('/api/pvgis/')).toBe(true)
        expect(r.startsWith('/api/pvgis/')).toBe(true)
      }),
      { numRuns: 1000 },
    )
  })
})
