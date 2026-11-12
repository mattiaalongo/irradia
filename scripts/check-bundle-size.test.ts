import { describe, it, expect } from 'vitest'
import { gzipSync } from 'node:zlib'
import {
  INITIAL_JS_LIMIT_KB,
  checkLimit,
  describeResult,
  findInitialScripts,
  findStylesheets,
  formatKb,
  gzipBytes,
} from './check-bundle-size.ts'

describe('findInitialScripts', () => {
  it('trova solo lo script iniziale', () => {
    const html = `<head><link rel="stylesheet" href="/assets/index-a.css">
      <script type="module" crossorigin src="/assets/index-a.js"></script></head>`
    expect(findInitialScripts(html)).toEqual(['/assets/index-a.js'])
  })

  it('include i modulepreload', () => {
    const html = `<script type="module" src="/assets/index-a.js"></script>
      <link rel="modulepreload" crossorigin href="/assets/vendor-b.js">`
    expect(findInitialScripts(html)).toEqual(['/assets/index-a.js', '/assets/vendor-b.js'])
  })

  it('accetta ordine degli attributi, apici e maiuscole diversi', () => {
    const html = `<SCRIPT src='/a.js' crossorigin TYPE=module></SCRIPT>
      <link href=/b.js rel=modulepreload>
      <link href="/c.js" crossorigin rel="preload modulepreload">`
    expect(findInitialScripts(html)).toEqual(['/a.js', '/b.js', '/c.js'])
  })

  it('ignora script non-module, script senza src, stili e preload di altro tipo', () => {
    const html = `<script src="/classic.js"></script><script type="module">inline()</script>
      <link rel="stylesheet" href="/s.css"><link rel="preload" href="/f.woff2">`
    expect(findInitialScripts(html)).toEqual([])
  })

  it('senza script restituisce una lista vuota (il main lo tratta come errore)', () => {
    expect(findInitialScripts('<html><body></body></html>')).toEqual([])
  })

  it('non ripete lo stesso file', () => {
    const html = `<script type="module" src="/a.js"></script><link rel="modulepreload" href="/a.js">`
    expect(findInitialScripts(html)).toEqual(['/a.js'])
  })
})

describe('findStylesheets', () => {
  it('trova i fogli di stile', () => {
    expect(findStylesheets('<link rel="stylesheet" crossorigin href="/assets/i.css">')).toEqual(['/assets/i.css'])
  })
})

describe('gzipBytes', () => {
  it('coincide con la lunghezza di zlib.gzipSync (livello 6 predefinito)', () => {
    const data = Buffer.from('irradia '.repeat(5000))
    expect(gzipBytes(data)).toBe(gzipSync(data).length)
  })
})

describe('checkLimit', () => {
  it('esattamente al limite va bene', () => {
    expect(checkLimit(82_000, 82).ok).toBe(true)
  })
  it('un byte sopra il limite fallisce', () => {
    const r = checkLimit(82_001, 82)
    expect(r.ok).toBe(false)
    expect(r.marginKb).toBeCloseTo(-0.001, 6)
  })
  it('sotto il limite dà il margine', () => {
    expect(checkLimit(80_000, 82)).toEqual({ ok: true, kb: 80, marginKb: 2 })
  })
})

describe('messaggi', () => {
  it('formatta all\'italiana con 2 decimali', () => {
    expect(formatKb(80)).toBe('80,00')
    expect(formatKb(0.4)).toBe('0,40')
  })
  it('esito OK', () => {
    expect(describeResult(80_000, ['/assets/index-x.js'], 82)).toEqual({
      ok: true,
      message: 'JS iniziale: 80,00 kB gzip (index-x.js), limite 82 kB: OK, margine 2,00 kB',
    })
  })
  it('esito sopra il limite', () => {
    const r = describeResult(82_400, ['/assets/index-x.js'], 82)
    expect(r.ok).toBe(false)
    expect(r.message).toBe(
      "JS iniziale: 82,40 kB gzip supera il limite di 82 kB di 0,40 kB. Riduci il codice caricato all'avvio oppure chiedi al PO di alzare il limite (scripts/check-bundle-size.ts).",
    )
  })
  it('il limite è un numero positivo', () => {
    expect(INITIAL_JS_LIMIT_KB).toBeGreaterThan(0)
  })
})
