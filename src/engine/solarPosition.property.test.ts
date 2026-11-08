import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { solarPosition } from './solarPosition'

describe('solarPosition (proprietà)', () => {
  const date = fc.date({ min: new Date('1900-01-01T00:00:00Z'), max: new Date('2100-12-31T23:59:59Z'), noInvalidDate: true })
  const lat = fc.double({ min: -90, max: 90, noNaN: true })
  const lon = fc.double({ min: -180, max: 180, noNaN: true })

  it('zenit in [0, 180], azimut in [0, 360), tutto finito (anche ai poli e a ±180° di longitudine)', () => {
    fc.assert(
      fc.property(date, lat, lon, (d, la, lo) => {
        const p = solarPosition(d, la, lo)
        for (const v of Object.values(p)) expect(Number.isFinite(v)).toBe(true)
        expect(p.zenith).toBeGreaterThanOrEqual(0)
        expect(p.zenith).toBeLessThanOrEqual(180)
        expect(p.azimuth).toBeGreaterThanOrEqual(0)
        expect(p.azimuth).toBeLessThan(360)
        expect(p.elevation + p.zenith).toBeCloseTo(90, 9)
      }),
      { numRuns: 200 },
    )
  })

  it('i poli e il meridiano ±180° non danno NaN (casi limite fissi su tutto l\'anno)', () => {
    fc.assert(
      fc.property(date, fc.constantFrom(-90, 90, 0), fc.constantFrom(-180, 180, 0), (d, la, lo) => {
        const p = solarPosition(d, la, lo)
        expect(Number.isFinite(p.zenith) && Number.isFinite(p.azimuth)).toBe(true)
      }),
      { numRuns: 200 },
    )
  })

  it('rifiuta con RangeError coordinate fuori intervallo o data non valida', () => {
    fc.assert(
      fc.property(
        date,
        fc.oneof(fc.double({ min: 90, minExcluded: true, noNaN: true }), fc.double({ max: -90, maxExcluded: true, noNaN: true })),
        (d, la) => {
          expect(() => solarPosition(d, la, 0)).toThrow(RangeError)
        },
      ),
      { numRuns: 100 },
    )
    expect(() => solarPosition(new Date(Number.NaN), 0, 0)).toThrow(RangeError)
    expect(() => solarPosition(new Date(), 0, Number.NaN)).toThrow(RangeError)
  })
})
