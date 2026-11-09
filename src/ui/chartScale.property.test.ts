import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { niceScale } from './chartScale'

describe('niceScale (proprietà)', () => {
  const maxTicks = fc.integer({ min: 1, max: 12 })

  it('per massimi positivi: parte da 0, tacche crescenti e "tonde", la cima copre il massimo', () => {
    fc.assert(
      fc.property(fc.double({ min: 1e-6, max: 1e12, noNaN: true }), maxTicks, (max, n) => {
        const s = niceScale(max, n)
        expect(s.ticks[0]).toBe(0)
        expect(s.ticks[s.ticks.length - 1]).toBe(s.top)
        // La tolleranza 1e-9 è nel codice (arrotondamenti): la cima può stare appena sotto il massimo.
        expect(s.top).toBeGreaterThanOrEqual(max * (1 - 1e-9))
        for (let i = 1; i < s.ticks.length; i++) expect(s.ticks[i]).toBeGreaterThan(s.ticks[i - 1])
        // Al più n intervalli.
        expect(s.ticks.length - 1).toBeLessThanOrEqual(n)
        // Il passo è {1, 2, 2,5, 5, 10} × 10^k.
        const mant = s.step / 10 ** Math.floor(Math.log10(s.step))
        expect([1, 2, 2.5, 5, 10].some((m) => Math.abs(m - mant) < 1e-9)).toBe(true)
      }),
      { numRuns: 200 },
    )
  })

  it('la cima non è mai più di un passo sopra il massimo', () => {
    fc.assert(
      fc.property(fc.double({ min: 1e-6, max: 1e12, noNaN: true }), (max) => {
        const s = niceScale(max)
        expect(s.top - max).toBeLessThan(s.step * (1 + 1e-9))
      }),
      { numRuns: 200 },
    )
  })

  it('massimi non positivi, NaN o infiniti → scala di riserva 0-1, mai NaN', () => {
    fc.assert(
      fc.property(fc.oneof(fc.double({ max: 0 }), fc.constantFrom(Number.NaN, Infinity, -Infinity)), (max) => {
        expect(niceScale(max)).toEqual({ top: 1, step: 1, ticks: [0, 1] })
      }),
      { numRuns: 100 },
    )
  })

  // Difetto noto (segnalato dal tester, gravità bassa, non raggiungibile dall'interfaccia: i kWh
  // mensili sono 0 oppure ≥ ~1e-3): con un massimo denormale (es. 5e-324) `10 ** floor(log10(raw))`
  // vale 0, il passo è 0 e `Array.from({ length: Infinity })` lancia RangeError; con ~1e308 le
  // tacche diventano Infinity. `it.fails` passa finché il difetto c'è.
  it.fails('anche con valori estremi (denormali, ~1e308) tutte le tacche dovrebbero essere finite', () => {
    fc.assert(
      fc.property(fc.double({ min: Number.MIN_VALUE, max: Number.MAX_VALUE, noNaN: true }), (max) => {
        const s = niceScale(max)
        for (const t of s.ticks) expect(Number.isFinite(t)).toBe(true)
      }),
      { numRuns: 200 },
    )
  })
})
