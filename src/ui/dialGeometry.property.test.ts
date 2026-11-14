import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  AZIMUTH_MAX,
  AZIMUTH_MIN,
  TILT_MAX,
  TILT_MIN,
  dialKeyValue,
  dialPoint,
  dialValueFromPoint,
  type DialKind,
} from './dialGeometry'

describe('dialGeometry (proprietà)', () => {
  // Quadranti realistici in coordinate SVG: centro entro ±1000, raggio 10-500 unità.
  const center = fc.double({ min: -1000, max: 1000, noNaN: true })
  const radius = fc.double({ min: 10, max: 500, noNaN: true })
  const kind = fc.constantFrom<DialKind>('tilt', 'azimuth')
  const anyFinite = fc.double({ noNaN: true, noDefaultInfinity: true })
  const limits = (k: DialKind) => (k === 'tilt' ? [TILT_MIN, TILT_MAX] : [AZIMUTH_MIN, AZIMUTH_MAX])

  it('andata e ritorno valore → punto → valore per ogni intero', () => {
    fc.assert(
      fc.property(center, center, radius, (cx, cy, r) => {
        for (let v = TILT_MIN; v <= TILT_MAX; v++) {
          const p = dialPoint('tilt', v, cx, cy, r)
          expect(dialValueFromPoint('tilt', p.x, p.y, cx, cy, r, 45)).toBe(v)
        }
        for (let v = AZIMUTH_MIN; v <= AZIMUTH_MAX; v++) {
          const p = dialPoint('azimuth', v, cx, cy, r)
          expect(dialValueFromPoint('azimuth', p.x, p.y, cx, cy, r, 0)).toBe(v)
        }
      }),
      { numRuns: 100 },
    )
  })

  it('sempre un intero nei limiti, mai NaN né −0, per qualsiasi ingresso finito', () => {
    fc.assert(
      fc.property(kind, anyFinite, anyFinite, anyFinite, anyFinite, anyFinite, (k, x, y, cx, cy, r) => {
        const [min, max] = limits(k)
        // Precedente valido: così il risultato deve essere valido anche nella zona morta.
        const v = dialValueFromPoint(k, x, y, cx, cy, r, min)
        expect(Number.isNaN(v)).toBe(false)
        expect(Number.isInteger(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(min)
        expect(v).toBeLessThanOrEqual(max)
        expect(Object.is(v, -0)).toBe(false)
      }),
      { numRuns: 1000 },
    )
  })

  it('inclinazione non decrescente con l\'angolo dentro il quadrante', () => {
    fc.assert(
      fc.property(
        center, center, radius,
        fc.double({ min: 0, max: 90, noNaN: true }),
        fc.double({ min: 0, max: 90, noNaN: true }),
        // Distanza dal centro oltre la zona morta (15 %): 0,2-1,5 raggi.
        fc.double({ min: 0.2, max: 1.5, noNaN: true }),
        (cx, cy, r, a, b, k) => {
          const [lo, hi] = a <= b ? [a, b] : [b, a]
          const p1 = dialPoint('tilt', lo, cx, cy, k * r)
          const p2 = dialPoint('tilt', hi, cx, cy, k * r)
          expect(dialValueFromPoint('tilt', p1.x, p1.y, cx, cy, r, 0)).toBeLessThanOrEqual(
            dialValueFromPoint('tilt', p2.x, p2.y, cx, cy, r, 0),
          )
        },
      ),
      { numRuns: 500 },
    )
  })

  it('ruotare il punto di k° sposta l\'orientamento di k mod 360 (±1)', () => {
    fc.assert(
      fc.property(
        center, center, radius,
        fc.double({ min: 0, max: 360, noNaN: true }),
        fc.integer({ min: -720, max: 720 }),
        fc.double({ min: 0.2, max: 1.5, noNaN: true }),
        (cx, cy, r, a, k, dist) => {
          const p1 = dialPoint('azimuth', a, cx, cy, dist * r)
          const p2 = dialPoint('azimuth', a + k, cx, cy, dist * r)
          const v1 = dialValueFromPoint('azimuth', p1.x, p1.y, cx, cy, r, 0)
          const v2 = dialValueFromPoint('azimuth', p2.x, p2.y, cx, cy, r, 0)
          // Differenza circolare fra lo spostamento ottenuto e k, ridotta a [−180, 180).
          const diff = ((((v2 - v1 - k) % 360) + 540) % 360) - 180
          // ±1: i due arrotondamenti all'intero possono cadere da parti opposte.
          expect(Math.abs(diff)).toBeLessThanOrEqual(1)
        },
      ),
      { numRuns: 500 },
    )
  })

  const navKey = fc.constantFrom('ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End')

  it('tasti: il risultato resta un intero nei limiti', () => {
    fc.assert(
      fc.property(kind, navKey, fc.integer({ min: 0, max: 359 }), (k, key, raw) => {
        const [min, max] = limits(k)
        const value = Math.min(raw, max)
        const next = dialKeyValue(k, key, value)
        expect(next).not.toBeNull()
        expect(Number.isInteger(next)).toBe(true)
        expect(next).toBeGreaterThanOrEqual(min)
        expect(next).toBeLessThanOrEqual(max)
      }),
      { numRuns: 500 },
    )
  })

  it('orientamento: N passi avanti e N indietro tornano al punto di partenza (chiusura del giro)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 359 }),
        fc.array(fc.constantFrom('ArrowRight', 'PageUp'), { maxLength: 80 }),
        (start, keys) => {
          let v = start
          for (const key of keys) v = dialKeyValue('azimuth', key, v) as number
          // Gli opposti nell'ordine inverso.
          for (const key of [...keys].reverse()) v = dialKeyValue('azimuth', key === 'ArrowRight' ? 'ArrowLeft' : 'PageDown', v) as number
          expect(v).toBe(start)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('orientamento: 360 frecce avanti fanno un giro completo', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 359 }), (start) => {
        let v = start
        for (let i = 0; i < 360; i++) v = dialKeyValue('azimuth', 'ArrowRight', v) as number
        expect(v).toBe(start)
      }),
      { numRuns: 50 },
    )
  })

  it('inclinazione: ripetere un tasto si ferma al limite', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 90 }), fc.constantFrom('ArrowUp', 'PageUp', 'ArrowDown', 'PageDown'), (start, key) => {
        let v = start
        for (let i = 0; i < 100; i++) v = dialKeyValue('tilt', key, v) as number
        expect(v).toBe(key === 'ArrowUp' || key === 'PageUp' ? TILT_MAX : TILT_MIN)
      }),
      { numRuns: 100 },
    )
  })
})
