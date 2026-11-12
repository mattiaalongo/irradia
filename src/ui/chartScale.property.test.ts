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

  // Issue #19 (prima un `it.fails`): con un massimo denormale (es. 5e-324) il passo valeva 0 e
  // `Array.from({ length: Infinity })` lanciava RangeError; vicino a 1e308 le tacche diventavano Infinity.
  it('per ogni massimo in [MIN_VALUE, MAX_VALUE] e 1-12 tacche: tacche finite e crescenti, mai eccezioni', () => {
    const extreme = fc.oneof(
      fc.double({ min: Number.MIN_VALUE, max: Number.MAX_VALUE, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: Number.MIN_VALUE, max: 1e-300, noNaN: true }),
      fc.double({ min: 1e300, max: Number.MAX_VALUE, noNaN: true, noDefaultInfinity: true }),
      fc.constantFrom(Number.MIN_VALUE, 5e-324, 1e-320, 1e-308, 1e307, 1e308, Number.MAX_VALUE),
    )
    fc.assert(
      fc.property(extreme, maxTicks, (max, n) => {
        const s = niceScale(max, n)
        expect(s.ticks[0]).toBe(0)
        for (const t of s.ticks) expect(Number.isFinite(t)).toBe(true)
        for (let i = 1; i < s.ticks.length; i++) expect(s.ticks[i]).toBeGreaterThan(s.ticks[i - 1])
        expect(s.ticks[s.ticks.length - 1]).toBe(s.top)
        // Stessa tolleranza 1e-9 del codice (vedi la prima proprietà).
        expect(s.top).toBeGreaterThanOrEqual(max * (1 - 1e-9))
        expect(s.step > 0 && Number.isFinite(s.step)).toBe(true)
      }),
      { numRuns: 1000 },
    )
  })

  it('valori estremi noti: denormale → scala 0-1, massimo rappresentabile → un solo intervallo', () => {
    expect(niceScale(5e-324)).toEqual({ top: 1, step: 1, ticks: [0, 1] })
    expect(niceScale(Number.MAX_VALUE)).toEqual({
      top: Number.MAX_VALUE,
      step: Number.MAX_VALUE,
      ticks: [0, Number.MAX_VALUE],
    })
  })

  // `niceScale` com'era prima dell'issue #19, copiata qui: in [1e-6, 1e12] l'uscita deve restare identica.
  function niceScaleBefore19(maxValue: number, maxTicks = 5) {
    if (!(maxValue > 0) || !Number.isFinite(maxValue)) return { top: 1, step: 1, ticks: [0, 1] }
    const raw = maxValue / maxTicks
    const magnitude = 10 ** Math.floor(Math.log10(raw))
    const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude
    const intervals = Math.ceil(maxValue / step - 1e-9)
    const ticks = Array.from({ length: intervals + 1 }, (_, i) => Number((i * step).toPrecision(12)))
    return { top: ticks[ticks.length - 1], step, ticks }
  }

  it('in [1e-6, 1e12] l\'uscita è identica all\'implementazione prima del #19 (elenco fisso + casuali)', () => {
    const fixed = [
      1e-6, 3.7e-6, 0.001, 0.0123, 0.5, 1, 2.5, 7, 9.99, 10, 42, 99.9, 100, 123.4, 487.2, 650, 999,
      1000, 1000.0000001, 1234.5, 6498, 11077, 14122, 99999, 1e6, 3.3e7, 1e9, 7.77e10, 1e12,
    ]
    for (const max of fixed) {
      for (let n = 1; n <= 12; n++) expect(niceScale(max, n)).toEqual(niceScaleBefore19(max, n))
    }
    fc.assert(
      fc.property(fc.double({ min: 1e-6, max: 1e12, noNaN: true }), maxTicks, (max, n) => {
        expect(niceScale(max, n)).toEqual(niceScaleBefore19(max, n))
      }),
      { numRuns: 1000 },
    )
  })
})
