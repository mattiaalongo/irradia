import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { DEFAULT_ALBEDO, extraterrestrialIrradiance, planeOfArrayIrradiance } from './irradiance'
import { simulateHour } from './simulate'
import { solarPosition } from './solarPosition'

// Proprietà di simulateHour e della trasposizione sul piano (planeOfArrayIrradiance).
// Il meteo è casuale ma ammissibile (valori ≥ 0, intervalli fisici larghi): non deve servire
// che sia "coerente" (es. GHI = DNI·cos z + DHI), il motore deve restare finito e non negativo comunque.

const date = fc.date({ min: new Date('2005-01-01T00:00:00Z'), max: new Date('2023-12-31T23:59:59Z'), noInvalidDate: true })
const lat = fc.double({ min: -90, max: 90, noNaN: true })
const lon = fc.double({ min: -180, max: 180, noNaN: true })

/**
 * Irradianza: 0 oppure ≥ 1 mW/m². Gli intervalli continui di fast-check generano anche numeri
 * denormali (es. 5e-324) che nessun dato reale ha (PVGIS arrotonda a 2 decimali): con quelli
 * `huldRelativeEfficiency` dà NaN, vedi pvModule.property.test.ts (difetto segnalato).
 */
const irr = (max: number) => fc.oneof(fc.constant(0), fc.double({ min: 1e-3, max, noNaN: true }))

const weather = fc.record({
  time: date,
  ghiWm2: irr(1500),
  dniWm2: irr(1200),
  dhiWm2: irr(800),
  airTemperatureC: fc.double({ min: -60, max: 60, noNaN: true }),
  windSpeedMs: fc.double({ min: 0, max: 60, noNaN: true }),
})

const system = fc.record({
  tiltDeg: fc.double({ min: 0, max: 90, noNaN: true }),
  azimuthDeg: fc.double({ min: 0, max: 360, maxExcluded: true, noNaN: true }),
  panelCount: fc.integer({ min: 0, max: 50 }),
  panelPowerWp: fc.oneof(fc.constant(0), fc.double({ min: 1e-3, max: 700, noNaN: true })),
  systemLossPct: fc.double({ min: 0, max: 100, maxExcluded: true, noNaN: true }),
})

const okNum = (x: number) => Number.isFinite(x) && x >= 0

describe('simulateHour (proprietà)', () => {
  it('componenti e potenze sono finite e ≥ 0 per qualunque meteo ammissibile', () => {
    fc.assert(
      fc.property(weather, lat, lon, system, (w, la, lo, sys) => {
        const r = simulateHour(w, la, lo, sys)
        for (const [nome, v] of Object.entries(r)) {
          if (nome === 'moduleTemperatureC') expect(Number.isFinite(v), nome).toBe(true)
          else expect(okNum(v), `${nome} = ${v}`).toBe(true)
        }
        expect(r.poaGlobalWm2).toBeCloseTo(r.poaBeamWm2 + r.poaDiffuseWm2 + r.poaReflectedWm2, 9)
        expect(r.acPowerW).toBeLessThanOrEqual(r.dcPowerW)
      }),
      { numRuns: 200 },
    )
  })

  it('con il sole sotto l\'orizzonte la diretta è 0', () => {
    fc.assert(
      fc.property(
        weather,
        lat,
        lon,
        system,
        (w, la, lo, sys) => {
          // Stesso zenit usato dal motore (`solarPosition` sull'istante delle irradianze).
          fc.pre(solarPosition(w.time, la, lo).zenith > 90)
          const r = simulateHour(w, la, lo, sys)
          expect(r.poaBeamWm2).toBe(0)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('senza luce (GHI = DNI = DHI = 0) la produzione è 0', () => {
    fc.assert(
      fc.property(weather, lat, lon, system, (w, la, lo, sys) => {
        const r = simulateHour({ ...w, ghiWm2: 0, dniWm2: 0, dhiWm2: 0 }, la, lo, sys)
        expect(r.acPowerW).toBe(0)
        expect(r.poaGlobalWm2).toBe(0)
      }),
      { numRuns: 100 },
    )
  })
})

describe('planeOfArrayIrradiance (proprietà)', () => {
  const poaInput = fc.record({
    dniWm2: irr(1200),
    dhiWm2: irr(800),
    ghiWm2: irr(1500),
    sunZenithDeg: fc.double({ min: 0, max: 180, noNaN: true }),
    sunAzimuthDeg: fc.double({ min: 0, max: 360, maxExcluded: true, noNaN: true }),
    extraterrestrialWm2: fc.double({ min: 1300, max: 1420, noNaN: true }),
    tiltDeg: fc.double({ min: 0, max: 90, noNaN: true }),
    panelAzimuthDeg: fc.double({ min: 0, max: 360, maxExcluded: true, noNaN: true }),
    albedo: fc.double({ min: 0, max: 1, noNaN: true }),
  })

  it('tre componenti, globale e angolo di incidenza sono finiti; componenti ≥ 0', () => {
    fc.assert(
      fc.property(poaInput, (inp) => {
        const r = planeOfArrayIrradiance(inp)
        for (const v of [r.beamWm2, r.diffuseWm2, r.reflectedWm2, r.globalWm2]) expect(okNum(v)).toBe(true)
        expect(r.aoiDeg).toBeGreaterThanOrEqual(0)
        expect(r.aoiDeg).toBeLessThanOrEqual(180)
        expect(r.globalWm2).toBeCloseTo(r.beamWm2 + r.diffuseWm2 + r.reflectedWm2, 9)
      }),
      { numRuns: 300 },
    )
  })

  it('sole sotto l\'orizzonte (zenit > 90°) → diretta 0', () => {
    fc.assert(
      fc.property(poaInput, fc.double({ min: 90.0001, max: 180, noNaN: true }), (inp, z) => {
        expect(planeOfArrayIrradiance({ ...inp, sunZenithDeg: z }).beamWm2).toBe(0)
      }),
      { numRuns: 200 },
    )
  })

  it('la riflessa non dipende dal sole e vale GHI · albedo · (1 − cos β)/2', () => {
    fc.assert(
      fc.property(poaInput, (inp) => {
        const r = planeOfArrayIrradiance(inp)
        const atteso = inp.ghiWm2 * (inp.albedo ?? DEFAULT_ALBEDO) * ((1 - Math.cos((inp.tiltDeg * Math.PI) / 180)) / 2)
        expect(r.reflectedWm2).toBeCloseTo(atteso, 9)
      }),
      { numRuns: 200 },
    )
  })

  it('l\'irradianza extraterrestre resta in 1300-1420 W/m² per qualunque data valida', () => {
    fc.assert(
      fc.property(fc.date({ min: new Date('1900-01-01'), max: new Date('2100-12-31'), noInvalidDate: true }), (d) => {
        const g = extraterrestrialIrradiance(d)
        expect(g).toBeGreaterThan(1300)
        expect(g).toBeLessThan(1420)
      }),
      { numRuns: 200 },
    )
  })
})
