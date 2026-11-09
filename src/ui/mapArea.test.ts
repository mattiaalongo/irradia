import { describe, expect, it } from 'vitest'
import {
  AREA_MAX_LAT, AREA_MAX_LON, AREA_MIN_LAT, AREA_MIN_LON, OUTSIDE_AREA_MESSAGE,
  clampToArea, isInArea, normalizeLongitude, pointFromMap,
} from './mapArea'

// Valori di riferimento: i limiti dell'area decisi in CLAUDE.md (lat 34-72, lon −25-45)
// e le coordinate di Roma centro dei fixture PVGIS (41,9028 N, 12,4964 E).

describe('limiti dell\'area', () => {
  it('sono quelli decisi per il progetto (Italia/Europa)', () => {
    expect([AREA_MIN_LAT, AREA_MAX_LAT, AREA_MIN_LON, AREA_MAX_LON]).toEqual([34, 72, -25, 45])
  })
})

describe('isInArea', () => {
  it('include i limiti e i punti interni', () => {
    expect(isInArea(34, -25)).toBe(true)
    expect(isInArea(72, 45)).toBe(true)
    expect(isInArea(34, 45)).toBe(true)
    expect(isInArea(72, -25)).toBe(true)
    expect(isInArea(41.9028, 12.4964)).toBe(true)
  })

  it('esclude i punti appena fuori', () => {
    expect(isInArea(33.9999, 0)).toBe(false)
    expect(isInArea(72.0001, 0)).toBe(false)
    expect(isInArea(50, -25.0001)).toBe(false)
    expect(isInArea(50, 45.0001)).toBe(false)
  })

  it('è falso per NaN e infiniti', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(isInArea(bad, 10)).toBe(false)
      expect(isInArea(50, bad)).toBe(false)
    }
  })
})

describe('clampToArea', () => {
  it('lascia invariati i punti in area', () => {
    expect(clampToArea(41.9028, 12.4964)).toEqual({ lat: 41.9028, lon: 12.4964 })
    expect(clampToArea(34, -25)).toEqual({ lat: 34, lon: -25 })
  })

  it('porta ogni coordinata al limite più vicino', () => {
    expect(clampToArea(10, 100)).toEqual({ lat: 34, lon: 45 })
    expect(clampToArea(80, -60)).toEqual({ lat: 72, lon: -25 })
    expect(clampToArea(Infinity, -Infinity)).toEqual({ lat: 72, lon: -25 })
  })

  it('non fa il giro del mondo sulla longitudine (lo fa pointFromMap)', () => {
    expect(clampToArea(50, 372).lon).toBe(45)
  })

  it('NaN resta NaN (non è una posizione)', () => {
    expect(clampToArea(Number.NaN, 10).lat).toBeNaN()
  })
})

describe('normalizeLongitude', () => {
  it('riporta le longitudini srotolate di Leaflet in [−180, 180)', () => {
    expect(normalizeLongitude(372)).toBe(12)
    expect(normalizeLongitude(-348)).toBe(12)
    expect(normalizeLongitude(732.5)).toBe(12.5)
    expect(normalizeLongitude(180)).toBe(-180)
    expect(normalizeLongitude(12.4964)).toBe(12.4964)
  })

  it('non finita → NaN', () => {
    expect(normalizeLongitude(Infinity)).toBeNaN()
    expect(normalizeLongitude(Number.NaN)).toBeNaN()
  })
})

describe('pointFromMap', () => {
  it('arrotonda a 4 decimali un punto in area', () => {
    expect(pointFromMap(41.902849, 12.496351)).toEqual({ ok: true, lat: 41.9028, lon: 12.4964 })
  })

  it('normalizza la longitudine prima del controllo (372 → 12)', () => {
    expect(pointFromMap(45, 372)).toEqual({ ok: true, lat: 45, lon: 12 })
    expect(pointFromMap(45, 372 + 360)).toEqual({ ok: true, lat: 45, lon: 12 })
  })

  it('accetta i limiti esatti', () => {
    expect(pointFromMap(34, -25)).toEqual({ ok: true, lat: 34, lon: -25 })
    expect(pointFromMap(72, 45)).toEqual({ ok: true, lat: 72, lon: 45 })
  })

  it('arrotonda prima di controllare: a meno di mezzo passo dal confine il punto va sul confine', () => {
    expect(pointFromMap(33.99996, 10)).toEqual({ ok: true, lat: 34, lon: 10 })
    expect(pointFromMap(72.00004, 45.00004)).toEqual({ ok: true, lat: 72, lon: 45 })
    expect(pointFromMap(50, -25.00004)).toEqual({ ok: true, lat: 50, lon: -25 })
  })

  it('rifiuta i punti fuori area anche dopo l\'arrotondamento', () => {
    expect(pointFromMap(33.99994, 10)).toEqual({ ok: false, reason: 'outside' })
    expect(pointFromMap(72.0001, 10)).toEqual({ ok: false, reason: 'outside' })
    expect(pointFromMap(50, 45.0001)).toEqual({ ok: false, reason: 'outside' })
    expect(pointFromMap(40.7128, -74.006)).toEqual({ ok: false, reason: 'outside' }) // New York
  })

  it('rifiuta NaN e infiniti', () => {
    expect(pointFromMap(Number.NaN, 10)).toEqual({ ok: false, reason: 'outside' })
    expect(pointFromMap(50, Infinity)).toEqual({ ok: false, reason: 'outside' })
  })

  it('non restituisce −0', () => {
    const r = pointFromMap(50, -0.00001)
    expect(r.ok && Object.is(r.lon, 0)).toBe(true)
  })
})

describe('OUTSIDE_AREA_MESSAGE', () => {
  it('è il testo concordato, con il segno meno tipografico', () => {
    expect(OUTSIDE_AREA_MESSAGE).toBe(
      'Punto fuori dall\'area coperta (latitudine 34-72°, longitudine −25-45°).',
    )
  })
})
