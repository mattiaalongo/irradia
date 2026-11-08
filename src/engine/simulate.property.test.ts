import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import milanoRaw from './__fixtures__/pvgis-tmy-milano.json'
import romaRaw from './__fixtures__/pvgis-tmy-roma.json'
import { parsePvgisTmy } from './pvgisTmy'
import { DEFAULT_SYSTEM_LOSS_PCT, simulateYear, type PvSystem } from './simulate'

// Prove "a proprietà" (fast-check) su simulateYear. Il seme è fisso (src/test/fastCheckSetup.ts):
// stessi casi a ogni esecuzione. Ogni simulazione dura ~15 ms: pochi casi per proprietà.
// Un errore si riproduce con `FC_SEED=<seme> npm test`.

const CITIES = [
  { name: 'Roma', tmy: parsePvgisTmy(romaRaw) },
  { name: 'Milano', tmy: parsePvgisTmy(milanoRaw) },
]

const TIMEOUT_MS = 30_000

const tilt = fc.double({ min: 0, max: 90, noNaN: true })
const azimuth = fc.double({ min: 0, max: 360, maxExcluded: true, noNaN: true })
const losses = fc.double({ min: 0, max: 100, maxExcluded: true, noNaN: true })

const systemArb = fc.record({
  tiltDeg: tilt,
  azimuthDeg: azimuth,
  panelCount: fc.integer({ min: 0, max: 50 }),
  // 0 oppure ≥ 1 mWp: con valori denormali (es. 5e-324) i prodotti vanno a zero per underflow e le
  // relazioni relative perdono senso (verificato: non è un difetto del motore, nessun pannello è così).
  panelPowerWp: fc.oneof(fc.constant(0), fc.double({ min: 1e-3, max: 700, noNaN: true })),
  systemLossPct: losses,
})

/** Negativi veri: `-0` è uguale a 0 per il motore e quindi valido. */
const negative = fc.double({ max: 0, noNaN: true }).filter((x) => x < 0)

// Si genera il NOME della città (non l'oggetto): un controesempio resta leggibile invece di stampare 8760 ore.
const cityArb = fc.constantFrom('Roma', 'Milano')
const tmyOf = (name: string) => CITIES.find((c) => c.name === name)!.tmy

/** Differenza relativa (assoluta se entrambi sono ~0). */
function relDiff(a: number, b: number): number {
  const scale = Math.max(Math.abs(a), Math.abs(b))
  return scale === 0 ? 0 : Math.abs(a - b) / scale
}

describe('simulateYear (proprietà)', () => {
  it('ore, mesi e anno sono finiti e ≥ 0; la somma oraria/1000 è l\'annuo (rel 1e-9)', () => {
    fc.assert(
      fc.property(cityArb, systemArb, (city, system) => {
        const tmy = tmyOf(city)
        const r = simulateYear(tmy, system)
        expect(r.hourlyAcPowerW).toHaveLength(8760)
        expect(r.monthlyKwh).toHaveLength(12)
        for (const w of r.hourlyAcPowerW) expect(Number.isFinite(w) && w >= 0).toBe(true)
        for (const k of r.monthlyKwh) expect(Number.isFinite(k) && k >= 0).toBe(true)
        expect(Number.isFinite(r.annualKwh) && r.annualKwh >= 0).toBe(true)
        expect(Number.isFinite(r.annualPoaKwhM2) && r.annualPoaKwhM2 >= 0).toBe(true)
        const sommaOraria = r.hourlyAcPowerW.reduce((a, b) => a + b, 0) / 1000
        expect(relDiff(sommaOraria, r.annualKwh)).toBeLessThan(1e-9)
        expect(relDiff(r.monthlyKwh.reduce((a, b) => a + b, 0), r.annualKwh)).toBeLessThan(1e-9)
      }),
      { numRuns: 25 },
    )
  }, TIMEOUT_MS)

  it('la resa annua non supera 2000 kWh/kWp (limite fisico per Roma e Milano)', () => {
    // Watt di picco ≥ 1: con valori minuscoli il rapporto E/kWp perde significato (denormali).
    fc.assert(
      fc.property(
        cityArb,
        fc.record({
          tiltDeg: tilt,
          azimuthDeg: azimuth,
          panelCount: fc.integer({ min: 1, max: 50 }),
          panelPowerWp: fc.double({ min: 1, max: 700, noNaN: true }),
          systemLossPct: losses,
        }),
        (city, system) => {
        const tmy = tmyOf(city)
          const r = simulateYear(tmy, system)
          expect(r.annualKwh / r.peakPowerKwp).toBeLessThanOrEqual(2000)
        },
      ),
      { numRuns: 25 },
    )
  }, TIMEOUT_MS)

  it('raddoppiando i pannelli raddoppia tutto (ore, mesi, anno; rel 1e-12)', () => {
    fc.assert(
      fc.property(cityArb, systemArb, (city, system) => {
        const tmy = tmyOf(city)
        const n = Math.min(system.panelCount, 25)
        const uno = simulateYear(tmy, { ...system, panelCount: n })
        const due = simulateYear(tmy, { ...system, panelCount: 2 * n })
        expect(relDiff(2 * uno.annualKwh, due.annualKwh)).toBeLessThan(1e-12)
        expect(relDiff(2 * uno.peakPowerKwp, due.peakPowerKwp)).toBeLessThan(1e-12)
        uno.monthlyKwh.forEach((k, i) => expect(relDiff(2 * k, due.monthlyKwh[i])).toBeLessThan(1e-12))
        // La luce sul piano non dipende dal numero di pannelli.
        expect(uno.annualPoaKwhM2).toBe(due.annualPoaKwhM2)
        uno.hourlyAcPowerW.forEach((w, i) => expect(relDiff(2 * w, due.hourlyAcPowerW[i])).toBeLessThan(1e-12))
      }),
      { numRuns: 15 },
    )
  }, TIMEOUT_MS)

  it('con perdite L: E(L) = E(0) · (1 − L/100) (rel 1e-12)', () => {
    fc.assert(
      fc.property(cityArb, systemArb, (city, system) => {
        const tmy = tmyOf(city)
        const e0 = simulateYear(tmy, { ...system, systemLossPct: 0 })
        const eL = simulateYear(tmy, system)
        const f = 1 - system.systemLossPct / 100
        expect(relDiff(e0.annualKwh * f, eL.annualKwh)).toBeLessThan(1e-12)
        e0.monthlyKwh.forEach((k, i) => expect(relDiff(k * f, eL.monthlyKwh[i])).toBeLessThan(1e-12))
      }),
      { numRuns: 15 },
    )
  }, TIMEOUT_MS)

  it('perdite omesse = perdite predefinite (14 %)', () => {
    const base = { tiltDeg: 30, azimuthDeg: 200, panelCount: 7, panelPowerWp: 400 }
    const a = simulateYear(CITIES[0].tmy, base)
    const b = simulateYear(CITIES[0].tmy, { ...base, systemLossPct: DEFAULT_SYSTEM_LOSS_PCT })
    expect(a.annualKwh).toBe(b.annualKwh)
  })

  it('con pannelli piatti (inclinazione 0) l\'azimut è indifferente (rel 1e-9)', () => {
    fc.assert(
      fc.property(cityArb, systemArb, azimuth, (city, system, altroAzimut) => {
        const tmy = tmyOf(city)
        const a = simulateYear(tmy, { ...system, tiltDeg: 0 })
        const b = simulateYear(tmy, { ...system, tiltDeg: 0, azimuthDeg: altroAzimut })
        expect(relDiff(a.annualKwh, b.annualKwh)).toBeLessThan(1e-9)
        a.monthlyKwh.forEach((k, i) => expect(relDiff(k, b.monthlyKwh[i])).toBeLessThan(1e-9))
      }),
      { numRuns: 10 },
    )
  }, TIMEOUT_MS)

  describe('parametri non validi → RangeError', () => {
    const base: PvSystem = { tiltDeg: 35, azimuthDeg: 180, panelCount: 10, panelPowerWp: 430, systemLossPct: 14 }
    const tmy = CITIES[0].tmy
    const fuori = (campo: keyof PvSystem, valori: fc.Arbitrary<number>) =>
      fc.assert(
        fc.property(valori, (v) => {
          expect(() => simulateYear(tmy, { ...base, [campo]: v })).toThrow(RangeError)
        }),
        { numRuns: 100 },
      )

    it('inclinazione fuori da [0, 90] o NaN', () =>
      fuori('tiltDeg', fc.oneof(
        negative,
        fc.double({ min: 90, minExcluded: true, noNaN: true }),
        fc.constant(Number.NaN),
      )))
    it('azimut fuori da [0, 360) o NaN', () =>
      fuori('azimuthDeg', fc.oneof(
        negative,
        fc.double({ min: 360, noNaN: true }),
        fc.constant(Number.NaN),
      )))
    it('numero di pannelli negativo, non intero o NaN', () =>
      fuori('panelCount', fc.oneof(
        fc.integer({ max: -1 }),
        fc.double({ min: 0, max: 50, noNaN: true }).filter((x) => !Number.isInteger(x)),
        fc.constantFrom(Number.NaN, Infinity, -Infinity),
      )))
    it('potenza negativa o NaN', () =>
      fuori('panelPowerWp', fc.oneof(negative, fc.constant(Number.NaN))))
    it('perdite fuori da [0, 100) o NaN', () =>
      fuori('systemLossPct', fc.oneof(
        negative,
        fc.double({ min: 100, noNaN: true }),
        fc.constant(Number.NaN),
      )))
  })

  // Difetto noto (segnalato dal tester, gravità bassa): `validateSystem` non ha un limite superiore
  // per la potenza, quindi Infinity è accettata e produce NaN (Infinity × 0 di notte). Dall'interfaccia
  // non è raggiungibile (max 700 Wp). `it.fails` passa finché il difetto c'è; quando il motore rifiuterà
  // Infinity con RangeError la prova fallirà e va trasformata in una prova normale.
  it.fails('potenza infinita dovrebbe dare RangeError (oggi produce NaN)', () => {
    const r = simulateYear(CITIES[0].tmy, { tiltDeg: 30, azimuthDeg: 180, panelCount: 10, panelPowerWp: Infinity })
    expect(Number.isNaN(r.annualKwh)).toBe(false)
  })
})
