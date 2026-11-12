import { describe, expect, it } from 'vitest'
import { PvgisError, type PvgisErrorKind } from '../engine/pvgisTmy'
import { describeTmyError } from './errorMessage'

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
