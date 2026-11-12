import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  faimanModuleTemperature,
  HULD_CSI_PVGIS5,
  huldDcPower,
  huldRelativeEfficiency,
  martinRuizBeamFactor,
} from './pvModule'

describe('pvModule (proprietà)', () => {
  it('rendimento Huld finito e ≥ 0 per irradianza 0 o ≥ 1 mW/m² e qualunque temperatura realistica', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(0), fc.double({ min: 1e-3, max: 1500, noNaN: true })),
        fc.double({ min: -60, max: 120, noNaN: true }),
        (g, t) => {
          const eta = huldRelativeEfficiency(g, t)
          expect(Number.isFinite(eta) && eta >= 0).toBe(true)
          expect(Number.isFinite(huldDcPower(1000, g, t))).toBe(true)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('il fattore di riflessione del vetro resta in [0, 1] per angoli di incidenza in [0, 180]', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 180, noNaN: true }), (aoi) => {
        const f = martinRuizBeamFactor(aoi)
        expect(f).toBeGreaterThanOrEqual(0)
        expect(f).toBeLessThanOrEqual(1)
      }),
      { numRuns: 200 },
    )
  })

  it('la temperatura Faiman è finita e non scende sotto quella dell\'aria con irradianza ≥ 0', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -60, max: 60, noNaN: true }),
        fc.double({ min: 0, max: 1500, noNaN: true }),
        fc.double({ min: 0, max: 60, noNaN: true }),
        (ta, g, ws) => {
          const tm = faimanModuleTemperature(ta, g, ws)
          expect(Number.isFinite(tm)).toBe(true)
          expect(tm).toBeGreaterThanOrEqual(ta)
        },
      ),
      { numRuns: 200 },
    )
  })

  // Issue #19 (prima un `it.fails`): con irradianza denormale (es. 5e-324) G/1000 va a 0 per underflow,
  // ln 0 = −∞ e con cella a 25 °C (T′ = 0) il termine T′·(k4·lnG + k5·lnG²) dava 0 × ∞ = NaN.
  it('irradianza denormale con cella a 25 °C: rendimento 0, non NaN (issue #19)', () => {
    expect(huldRelativeEfficiency(5e-324, 25)).toBe(0)
    expect(huldRelativeEfficiency(Number.MIN_VALUE, 25)).toBe(0)
    expect(huldDcPower(1000, 5e-324, 25)).toBe(0)
  })

  it('rendimento Huld finito e ≥ 0 per G in [5e-324, 1e4] W/m² e T in [−50, 100] °C (issue #19)', () => {
    // Metà dei casi fra i denormali e i numeri piccolissimi, dove stava il difetto.
    const g = fc.oneof(
      fc.double({ min: Number.MIN_VALUE, max: 1e-300, noNaN: true }),
      fc.double({ min: Number.MIN_VALUE, max: 1e4, noNaN: true }),
    )
    fc.assert(
      fc.property(g, fc.double({ min: -50, max: 100, noNaN: true }), (gi, t) => {
        const eta = huldRelativeEfficiency(gi, t)
        expect(Number.isFinite(eta) && eta >= 0).toBe(true)
        expect(Number.isFinite(huldDcPower(1000, gi, t))).toBe(true)
      }),
      { numRuns: 1000 },
    )
  })

  // Formula di `huldRelativeEfficiency` com'era prima dell'issue #19, copiata qui: la correzione
  // deve lasciare il risultato identico bit per bit (Object.is) ovunque G/1000 non va a 0.
  function huldBefore19(g: number, tm: number, k = HULD_CSI_PVGIS5): number {
    if (!(g > 0)) return 0
    const lnG = Math.log(g / 1000)
    const t = tm - 25
    const eta = 1 + k[0] * lnG + k[1] * lnG ** 2 + t * (k[2] + k[3] * lnG + k[4] * lnG ** 2) + k[5] * t ** 2
    return Math.max(0, eta)
  }

  it('per G in [1e-300, 1500] W/m² il risultato è identico (Object.is) alla formula prima del #19', () => {
    const g = fc.oneof(
      fc.double({ min: 1e-300, max: 1e-3, noNaN: true }),
      fc.double({ min: 1e-300, max: 1500, noNaN: true }),
      fc.constantFrom(1e-300, 1e-3, 1, 200, 800, 1000, 1500),
    )
    fc.assert(
      fc.property(g, fc.double({ min: -50, max: 100, noNaN: true }), (gi, t) => {
        expect(Object.is(huldRelativeEfficiency(gi, t), huldBefore19(gi, t))).toBe(true)
      }),
      { numRuns: 1000 },
    )
  })

  it('huldDcPower rifiuta una potenza nominale non finita (issue #19)', () => {
    for (const p of [Infinity, Number.NaN, -Infinity]) {
      expect(() => huldDcPower(p, 800, 25)).toThrow(RangeError)
    }
    expect(huldDcPower(Number.MAX_VALUE, 0, 25)).toBe(0)
  })
})
