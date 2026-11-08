import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { cardinalDirection, formatNumber } from './format'

describe('formatNumber (proprietà)', () => {
  it('formato italiano: migliaia con "." sempre (anche a 4 cifre), decimali con ",", e il valore torna entro l\'arrotondamento', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1e12, noNaN: true }), fc.integer({ min: 0, max: 6 }), (x, d) => {
        const s = formatNumber(x, d)
        const forma = d === 0 ? /^\d{1,3}(\.\d{3})*$/ : new RegExp(`^\\d{1,3}(\\.\\d{3})*,\\d{${d}}$`)
        expect(s).toMatch(forma)
        const indietro = Number(s.split('.').join('').replace(',', '.'))
        expect(Math.abs(indietro - x)).toBeLessThanOrEqual(0.5 * 10 ** -d + x * 1e-12)
      }),
      { numRuns: 300 },
    )
  })

  it('i numeri a 4 cifre hanno il separatore ("6.498"), non "6498"', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1000, max: 9999 }), (n) => {
        expect(formatNumber(n)).toMatch(/^\d\.\d{3}$/)
      }),
      { numRuns: 100 },
    )
  })

  it('l\'ordine dei valori è conservato dal testo (a parità di decimali): se a ≤ b il testo non diventa più grande', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1e9, noNaN: true }), fc.double({ min: 0, max: 1e9, noNaN: true }), (a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a]
        const num = (s: string) => Number(s.split('.').join('').replace(',', '.'))
        expect(num(formatNumber(lo, 2))).toBeLessThanOrEqual(num(formatNumber(hi, 2)))
      }),
      { numRuns: 200 },
    )
  })
})

describe('cardinalDirection (proprietà)', () => {
  it('per qualunque azimut finito (anche negativo o > 360) dà uno degli 8 punti cardinali', () => {
    const PUNTI = ['Nord', 'Nord-Est', 'Est', 'Sud-Est', 'Sud', 'Sud-Ovest', 'Ovest', 'Nord-Ovest']
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), (az) => {
        expect(PUNTI).toContain(cardinalDirection(az))
      }),
      { numRuns: 300 },
    )
  })

  it('è periodica di 360°: azimut e azimut + 360 danno lo stesso punto (fuori dai confini dei settori)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 359 }), fc.integer({ min: -5, max: 5 }), (az, giri) => {
        expect(cardinalDirection(az + 360 * giri)).toBe(cardinalDirection(az))
      }),
      { numRuns: 200 },
    )
  })
})
