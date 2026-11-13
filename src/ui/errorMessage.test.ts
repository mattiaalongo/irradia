import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { PvgisError, type PvgisErrorKind } from '../engine/pvgisTmy'
import { DETAIL_ELLIPSIS, DETAIL_MAX_CHARS, describeTmyError, truncateDetail } from './errorMessage'

const GENERIC = 'Dati non disponibili per questa posizione.'
// Testo approvato dal PO il 12/11/2026 (#21), alla lettera.
const TEMPORARY =
  'I dati non sono disponibili in questo momento: può essere un problema temporaneo del servizio o della connessione a Internet. Riprova tra qualche secondo.'

describe('describeTmyError', () => {
  it('mare: testo approvato, breve, nessun dettaglio tecnico', () => {
    const t = describeTmyError(new PvgisError('HTTP 400: Location over the sea', { kind: 'seaLocation', status: 400 }))
    expect(t.message).toBe('Per il punto scelto non ci sono dati: risulta in mare. Scegli un punto sulla terraferma.')
    expect(t.short).toBe('Punto in mare')
    expect(t.detail).toBeUndefined()
  })

  it('fuori zona: testo approvato, breve, nessun dettaglio tecnico', () => {
    const t = describeTmyError(new PvgisError('HTTP 400: out of the spatial coverage', { kind: 'outsideCoverage', status: 400 }))
    expect(t.message).toBe('Per il punto scelto non ci sono dati: è fuori dalla zona coperta. Scegli un altro punto.')
    expect(t.short).toBe('Fuori zona coperta')
    expect(t.detail).toBeUndefined()
  })

  it('i casi riconosciuti non mostrano "HTTP 400" né l\'inglese di PVGIS', () => {
    for (const kind of ['seaLocation', 'outsideCoverage'] as const) {
      const t = describeTmyError(new PvgisError('HTTP 400: Location over the sea', { kind, status: 400 }))
      expect(JSON.stringify(t)).not.toMatch(/HTTP|400|Location|over the sea/)
    }
  })

  it.each<PvgisErrorKind>(['unavailable', 'network'])(
    '%s: testo approvato "riprova", breve, retry, nessun dettaglio tecnico',
    (kind) => {
      const t = describeTmyError(new PvgisError('PVGIS non raggiungibile ora (HTTP 502, risposta non JSON)', { kind, status: 502 }))
      expect(t).toEqual({ message: TEMPORARY, short: 'Dati non disponibili ora', retry: true })
    },
  )

  it('testi riconosciuti: niente "HTTP", "JSON" né "PVGIS"; retry solo per unavailable e network', () => {
    const kinds: PvgisErrorKind[] = ['seaLocation', 'outsideCoverage', 'rejected', 'unavailable', 'notJson', 'network', 'invalidData']
    for (const kind of kinds) {
      const t = describeTmyError(new PvgisError('HTTP 502 JSON PVGIS', { kind, status: 502 }))
      expect(t.retry === true, kind).toBe(kind === 'unavailable' || kind === 'network')
      if (t.detail === undefined) expect(JSON.stringify(t), kind).not.toMatch(/HTTP|JSON|PVGIS|502/)
    }
  })

  it.each<PvgisErrorKind>(['rejected', 'notJson', 'invalidData'])(
    '%s: testo generico con il dettaglio tecnico, barra invariata',
    (kind) => {
      const t = describeTmyError(new PvgisError('dettaglio tecnico', { kind }))
      expect(t).toEqual({ message: GENERIC, detail: 'dettaglio tecnico' })
    },
  )

  it('errori che non sono PvgisError: generico con il messaggio', () => {
    expect(describeTmyError(new TypeError('boom'))).toEqual({ message: GENERIC, detail: 'boom' })
    expect(describeTmyError('testo')).toEqual({ message: GENERIC, detail: 'testo' })
  })
})

// Limite del dettaglio: decisione del PO del 13/11/2026 (#47).
describe('truncateDetail / limite del dettaglio', () => {
  it('limite di 300 e puntini U+2026 (un solo carattere)', () => {
    expect(DETAIL_MAX_CHARS).toBe(300)
    expect(DETAIL_ELLIPSIS).toBe('\u2026')
    expect(DETAIL_ELLIPSIS).toHaveLength(1)
  })

  it('299 e 300 caratteri: invariati', () => {
    for (const n of [0, 1, 299, 300]) expect(truncateDetail('a'.repeat(n))).toBe('a'.repeat(n))
  })

  it('301 caratteri: 300 + "…"', () => {
    expect(truncateDetail('a'.repeat(301))).toBe('a'.repeat(300) + '\u2026')
  })

  it('5 MB: 301 caratteri, nel percorso completo di describeTmyError', () => {
    const t = describeTmyError(new PvgisError('x'.repeat(5_000_000), { kind: 'rejected', status: 500 }))
    expect(t.message).toBe(GENERIC)
    expect(t.detail).toBe('x'.repeat(300) + '\u2026')
    expect(describeTmyError(new TypeError('y'.repeat(5_000_000))).detail).toHaveLength(301)
    expect(describeTmyError('z'.repeat(5_000_000)).detail).toHaveLength(301)
  })

  it('emoji a cavallo del confine: non spezza la coppia surrogata', () => {
    // '😀' = U+1F600 = \uD83D\uDE00: occupa le unità 300 e 301 (indici 299 e 300).
    const text = 'a'.repeat(299) + '😀' + 'b'
    const out = truncateDetail(text)
    expect(out).toBe('a'.repeat(299) + '\u2026')
    expect(out).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
  })

  it('emoji che finisce esattamente al confine: resta intera', () => {
    const text = 'a'.repeat(298) + '😀' + 'b' // emoji agli indici 298-299
    expect(truncateDetail(text)).toBe('a'.repeat(298) + '😀' + '\u2026')
  })

  it('emoji che inizia al confine: esclusa per intero', () => {
    const text = 'a'.repeat(300) + '😀'
    expect(truncateDetail(text)).toBe('a'.repeat(300) + '\u2026')
  })

  it('testo esattamente di 300 unità che termina con una emoji: invariato', () => {
    const text = 'a'.repeat(298) + '😀'
    expect(truncateDetail(text)).toBe(text)
  })

  it('casi riconosciuti: ancora nessun dettaglio', () => {
    const t = describeTmyError(new PvgisError('x'.repeat(1000), { kind: 'seaLocation', status: 400 }))
    expect(t.detail).toBeUndefined()
  })

  it('proprietà: lunghezza ≤ 301, prefisso dell\'originale, "…" solo se troncato, coppie integre', () => {
    // Testi con caratteri astrali frequenti e lunghezze attorno al limite: un riempitivo di
    // 260-310 unità seguito da 0-40 pezzi misti (gli array casuali da soli restano corti).
    const unit = fc.oneof(fc.constant('a'), fc.constant('😀'), fc.constant('\u2026'), fc.string({ unit: 'grapheme', maxLength: 1 }))
    const text = fc
      .tuple(fc.integer({ min: 260, max: 310 }), fc.array(unit, { maxLength: 40 }))
      .map(([n, a]) => 'a'.repeat(n) + a.join(''))
    let truncated = 0
    let intact = 0
    fc.assert(
      fc.property(text, (s) => {
        const out = truncateDetail(s)
        expect(out.length).toBeLessThanOrEqual(DETAIL_MAX_CHARS + 1)
        if (s.length <= DETAIL_MAX_CHARS) {
          intact++
          expect(out).toBe(s)
        } else {
          truncated++
          expect(out.endsWith(DETAIL_ELLIPSIS)).toBe(true)
          const kept = out.slice(0, -1)
          expect(s.startsWith(kept)).toBe(true)
          expect(kept.length).toBeGreaterThanOrEqual(DETAIL_MAX_CHARS - 1)
          // Nessuna metà alta senza la sua metà bassa alla fine del testo tenuto.
          expect(/[\uD800-\uDBFF]$/.test(kept)).toBe(false)
        }
      }),
      { numRuns: 500 },
    )
    // I generatori devono esercitare entrambi i rami, altrimenti la proprietà non prova nulla.
    expect(truncated).toBeGreaterThan(20)
    expect(intact).toBeGreaterThan(20)
  })
})
