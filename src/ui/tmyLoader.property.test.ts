import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { roundCoord, tmyKey } from './tmyLoader'

describe('roundCoord e tmyKey (proprietà)', () => {
  const lat = fc.double({ min: -90, max: 90, noNaN: true })
  const lon = fc.double({ min: -180, max: 180, noNaN: true })

  it('roundCoord è idempotente e sposta la coordinata di al più mezzo passo (0,00005°)', () => {
    fc.assert(
      fc.property(lat, (x) => {
        const r = roundCoord(x)
        expect(roundCoord(r)).toBe(r)
        expect(Math.abs(r - x)).toBeLessThanOrEqual(0.00005 + 1e-9)
      }),
      { numRuns: 200 },
    )
  })

  it('la chiave ha sempre il formato "lat,lon" con 4 decimali e non contiene "-0"', () => {
    fc.assert(
      fc.property(lat, lon, (a, b) => {
        const k = tmyKey(a, b)
        expect(k).toMatch(/^-?\d+\.\d{4},-?\d+\.\d{4}$/)
        expect(k).not.toMatch(/-0\.0000/)
      }),
      { numRuns: 200 },
    )
  })

  it('due posizioni hanno la stessa chiave se e solo se arrotondate sono uguali', () => {
    fc.assert(
      fc.property(lat, lon, fc.double({ min: -0.0002, max: 0.0002, noNaN: true }), fc.double({ min: -0.0002, max: 0.0002, noNaN: true }), (a, b, da, db) => {
        const stessa = tmyKey(a, b) === tmyKey(a + da, b + db)
        const uguali = roundCoord(a) === roundCoord(a + da) && roundCoord(b) === roundCoord(b + db)
        expect(stessa).toBe(uguali)
      }),
      { numRuns: 200 },
    )
  })

  it('la chiave è invertibile: rileggendola si ottengono le coordinate arrotondate', () => {
    fc.assert(
      fc.property(lat, lon, (a, b) => {
        const [ka, kb] = tmyKey(a, b).split(',').map(Number)
        expect(ka).toBe(roundCoord(a) + 0) // `+ 0` normalizza -0
        expect(kb).toBe(roundCoord(b) + 0)
      }),
      { numRuns: 200 },
    )
  })
})
