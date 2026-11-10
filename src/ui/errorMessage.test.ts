import { describe, expect, it } from 'vitest'
import { PvgisError, type PvgisErrorKind } from '../engine/pvgisTmy'
import { describeTmyError } from './errorMessage'

const GENERIC = 'Dati non disponibili per questa posizione.'

describe('describeTmyError', () => {
  it('mare: testo approvato, breve, nessun dettaglio tecnico', () => {
    const t = describeTmyError(new PvgisError('HTTP 400: Location over the sea', { kind: 'seaLocation', status: 400 }))
    expect(t.message).toBe('Il punto scelto risulta in mare e PVGIS non ha dati per il mare. Scegli un punto sulla terraferma.')
    expect(t.short).toBe('Punto in mare')
    expect(t.detail).toBeUndefined()
  })

  it('fuori zona: testo approvato, breve, nessun dettaglio tecnico', () => {
    const t = describeTmyError(new PvgisError('HTTP 400: out of the spatial coverage', { kind: 'outsideCoverage', status: 400 }))
    expect(t.message).toBe('PVGIS non ha dati per questo punto: è fuori dalla zona coperta. Scegli un altro punto.')
    expect(t.short).toBe('Fuori zona PVGIS')
    expect(t.detail).toBeUndefined()
  })

  it('i casi riconosciuti non mostrano "HTTP 400" né l\'inglese di PVGIS', () => {
    for (const kind of ['seaLocation', 'outsideCoverage'] as const) {
      const t = describeTmyError(new PvgisError('HTTP 400: Location over the sea', { kind, status: 400 }))
      expect(JSON.stringify(t)).not.toMatch(/HTTP|400|Location|over the sea/)
    }
  })

  it.each<PvgisErrorKind>(['rejected', 'notJson', 'network', 'invalidData'])(
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
