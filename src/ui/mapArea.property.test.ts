import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { clampToArea, isInArea, normalizeLongitude, pointFromMap } from './mapArea'

describe('mapArea (proprietà)', () => {
  // Coordinate qualsiasi, anche fuori dal globo e infinite (NaN escluso: clampToArea lo propaga
  // per scelta documentata).
  const anyCoord = fc.double({ noNaN: true })
  // Punti come quelli che Leaflet può restituire: latitudine valida, longitudine srotolata.
  const mapLat = fc.double({ min: -90, max: 90, noNaN: true })
  const mapLon = fc.double({ min: -1080, max: 1080, noNaN: true })
  // Punti vicino all'area, dove cadono i casi interessanti (bordi).
  const nearLat = fc.double({ min: 33.9, max: 72.1, noNaN: true })
  const nearLon = fc.double({ min: -25.1, max: 45.1, noNaN: true })

  it('clampToArea dà sempre un punto in area ed è idempotente', () => {
    fc.assert(
      fc.property(anyCoord, anyCoord, (lat, lon) => {
        const c = clampToArea(lat, lon)
        expect(isInArea(c.lat, c.lon)).toBe(true)
        expect(clampToArea(c.lat, c.lon)).toEqual(c)
      }),
      { numRuns: 300 },
    )
  })

  it('clampToArea lascia invariati i punti in area', () => {
    fc.assert(
      fc.property(nearLat, nearLon, (lat, lon) => {
        fc.pre(isInArea(lat, lon))
        expect(clampToArea(lat, lon)).toEqual({ lat, lon })
      }),
      { numRuns: 300 },
    )
  })

  it('pointFromMap ok ⇒ punto in area, a non più di 0,00005° dall\'input normalizzato', () => {
    fc.assert(
      fc.property(fc.oneof(nearLat, mapLat), fc.oneof(nearLon, mapLon), (lat, lon) => {
        const r = pointFromMap(lat, lon)
        if (!r.ok) return
        expect(isInArea(r.lat, r.lon)).toBe(true)
        // 1e-9: margine per gli arrotondamenti in virgola mobile di roundCoord.
        expect(Math.abs(r.lat - lat)).toBeLessThanOrEqual(0.00005 + 1e-9)
        expect(Math.abs(r.lon - normalizeLongitude(lon))).toBeLessThanOrEqual(0.00005 + 1e-9)
      }),
      { numRuns: 500 },
    )
  })

  it('pointFromMap accetta ogni punto già in area (nessun falso rifiuto)', () => {
    fc.assert(
      fc.property(nearLat, nearLon, (lat, lon) => {
        fc.pre(isInArea(lat, lon))
        expect(pointFromMap(lat, lon).ok).toBe(true)
      }),
      { numRuns: 300 },
    )
  })

  it('normalizeLongitude: risultato in [−180, 180) e stesso punto del globo', () => {
    fc.assert(
      fc.property(mapLon, (lon) => {
        const n = normalizeLongitude(lon)
        expect(n).toBeGreaterThanOrEqual(-180)
        expect(n).toBeLessThan(180)
        const turns = (lon - n) / 360
        expect(Math.abs(turns - Math.round(turns))).toBeLessThan(1e-9)
      }),
      { numRuns: 300 },
    )
  })
})
