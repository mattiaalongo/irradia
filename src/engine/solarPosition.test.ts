import { describe, expect, it } from 'vitest'
import { atmosphericRefraction, julianDay, solarPosition } from './solarPosition'

describe('julianDay', () => {
  it("vale 2451545,0 all'epoca J2000.0 (1/1/2000 12:00 UTC)", () => {
    expect(julianDay(new Date('2000-01-01T12:00:00Z'))).toBe(2_451_545)
  })
})

describe('solarPosition — esempio di riferimento NREL SPA', () => {
  // Fonte: Reda & Andreas, "Solar Position Algorithm for Solar Radiation Applications",
  // NREL/TP-560-34302 (2008), tabella A5.
  // 17/10/2003 12:30:30 ora locale (UTC−7), Golden (Colorado).
  // L'SPA è più preciso del NOAA (±0,0003°) e include rifrazione a 820 hPa / 11 °C:
  // ci aspettiamo quindi differenze di qualche millesimo di grado.
  const p = solarPosition(new Date('2003-10-17T19:30:30Z'), 39.742476, -105.1786)

  it('angolo zenitale apparente ≈ 50,11162°', () => {
    expect(90 - p.apparentElevation).toBeCloseTo(50.11162, 1)
    expect(Math.abs(90 - p.apparentElevation - 50.11162)).toBeLessThan(0.02)
  })

  it('azimut ≈ 194,34024°', () => {
    expect(Math.abs(p.azimuth - 194.34024)).toBeLessThan(0.02)
  })

  it('declinazione ≈ −9,31434°', () => {
    expect(Math.abs(p.declination - -9.31434)).toBeLessThan(0.01)
  })

  it('equazione del tempo ≈ 14,64 minuti', () => {
    expect(Math.abs(p.equationOfTime - 14.641503)).toBeLessThan(0.1)
  })
})

describe('solarPosition — declinazione a solstizi ed equinozi 2025', () => {
  // Istanti astronomici (USNO). Obliquità dell'eclittica nel 2025 ≈ 23,436°.
  it('solstizio di giugno (21/6 02:42 UTC): ≈ +23,44°', () => {
    const d = solarPosition(new Date('2025-06-21T02:42:00Z'), 0, 0).declination
    expect(Math.abs(d - 23.436)).toBeLessThan(0.01)
  })

  it('solstizio di dicembre (21/12 15:03 UTC): ≈ −23,44°', () => {
    const d = solarPosition(new Date('2025-12-21T15:03:00Z'), 0, 0).declination
    expect(Math.abs(d - -23.436)).toBeLessThan(0.01)
  })

  it('equinozio di marzo (20/3 09:01 UTC): ≈ 0°', () => {
    const d = solarPosition(new Date('2025-03-20T09:01:00Z'), 0, 0).declination
    expect(Math.abs(d)).toBeLessThan(0.01)
  })
})

describe('solarPosition — equazione del tempo, valori estremi annuali', () => {
  it('massimo ≈ +16,4 min intorno al 3 novembre', () => {
    const eot = solarPosition(new Date('2025-11-03T12:00:00Z'), 0, 0).equationOfTime
    expect(Math.abs(eot - 16.4)).toBeLessThan(0.2)
  })

  it('minimo ≈ −14,2 min intorno all’11 febbraio', () => {
    const eot = solarPosition(new Date('2025-02-11T12:00:00Z'), 0, 0).equationOfTime
    expect(Math.abs(eot - -14.2)).toBeLessThan(0.2)
  })
})

/** Istante del mezzogiorno solare vero (due iterazioni bastano a convergere). */
function solarNoon(dayUtcMidnight: string, latitude: number, longitude: number): Date {
  const base = new Date(dayUtcMidnight).getTime()
  let t = base + (720 - 4 * longitude) * 60_000
  for (let i = 0; i < 2; i++) {
    const eot = solarPosition(new Date(t), latitude, longitude).equationOfTime
    t = base + (720 - 4 * longitude - eot) * 60_000
  }
  return new Date(t)
}

describe('solarPosition — geometria del mezzogiorno solare', () => {
  it('a Roma il sole è esattamente a Sud, con elevazione = 90° − lat + decl', () => {
    const lat = 41.9028
    const lon = 12.4964
    const p = solarPosition(solarNoon('2025-06-21T00:00:00Z', lat, lon), lat, lon)
    expect(Math.abs(p.hourAngle)).toBeLessThan(0.01)
    expect(Math.abs(p.azimuth - 180)).toBeLessThan(0.05)
    expect(Math.abs(p.elevation - (90 - lat + p.declination))).toBeLessThan(0.01)
  })

  it('nell’emisfero Sud (Sydney) il sole a mezzogiorno è a Nord', () => {
    const lat = -33.8688
    const lon = 151.2093
    const p = solarPosition(solarNoon('2025-06-21T00:00:00Z', lat, lon), lat, lon)
    const azFromNorth = Math.min(p.azimuth, 360 - p.azimuth)
    expect(azFromNorth).toBeLessThan(0.05)
  })

  it('il sole sorge a Est (azimut < 180°) e tramonta a Ovest (azimut > 180°)', () => {
    const lat = 45.4642 // Milano
    const lon = 9.19
    // Al solstizio la declinazione è quasi ferma, quindi mattino e pomeriggio sono simmetrici.
    // (All'equinozio cambia di ~0,4°/giorno: in 8 ore ~0,13° di asimmetria reale.)
    const noon = solarNoon('2025-06-21T00:00:00Z', lat, lon).getTime()
    const morning = solarPosition(new Date(noon - 4 * 3_600_000), lat, lon)
    const afternoon = solarPosition(new Date(noon + 4 * 3_600_000), lat, lon)
    expect(morning.azimuth).toBeLessThan(180)
    expect(afternoon.azimuth).toBeGreaterThan(180)
    // Simmetria rispetto al mezzogiorno solare
    expect(Math.abs(morning.elevation - afternoon.elevation)).toBeLessThan(0.1)
    expect(Math.abs(morning.azimuth + afternoon.azimuth - 360)).toBeLessThan(0.1)
  })

  it('a mezzanotte solare il sole è sotto l’orizzonte', () => {
    const lat = 41.9028
    const lon = 12.4964
    const midnight = new Date(solarNoon('2025-06-21T00:00:00Z', lat, lon).getTime() + 12 * 3_600_000)
    expect(solarPosition(midnight, lat, lon).elevation).toBeLessThan(0)
  })
})

describe('atmosphericRefraction', () => {
  it("all'orizzonte vale circa 0,48° (≈ 29′, formula NOAA)", () => {
    expect(Math.abs(atmosphericRefraction(0) - 1735 / 3600)).toBeLessThan(1e-9)
  })

  it('è nulla con il sole quasi allo zenit', () => {
    expect(atmosphericRefraction(89)).toBe(0)
  })

  it('diminuisce al crescere dell’elevazione', () => {
    expect(atmosphericRefraction(10)).toBeGreaterThan(atmosphericRefraction(30))
    expect(atmosphericRefraction(30)).toBeGreaterThan(atmosphericRefraction(60))
  })
})

describe('solarPosition — validazione degli input', () => {
  const now = new Date('2025-01-01T12:00:00Z')
  it('rifiuta latitudini fuori intervallo', () => {
    expect(() => solarPosition(now, 91, 0)).toThrow(RangeError)
  })
  it('rifiuta longitudini fuori intervallo', () => {
    expect(() => solarPosition(now, 0, 181)).toThrow(RangeError)
  })
  it('rifiuta date non valide', () => {
    expect(() => solarPosition(new Date('non-una-data'), 0, 0)).toThrow(RangeError)
  })
  it('accetta i poli senza produrre NaN', () => {
    const p = solarPosition(now, 90, 0)
    expect(Number.isNaN(p.azimuth)).toBe(false)
    expect(Number.isNaN(p.elevation)).toBe(false)
  })
})
