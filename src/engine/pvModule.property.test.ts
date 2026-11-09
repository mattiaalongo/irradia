import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { faimanModuleTemperature, huldDcPower, huldRelativeEfficiency, martinRuizBeamFactor } from './pvModule'

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

  // Difetto noto (segnalato dal tester, gravità bassa, non raggiungibile con dati PVGIS reali):
  // con irradianza denormale positiva (es. 5e-324) G/1000 vale 0, quindi ln(G/1000) = -Infinity e
  // il termine T′·(k4·lnG + k5·lnG²) con T′ = 0 (cella a 25 °C) dà 0 × ∞ = NaN; Math.max(0, NaN) = NaN.
  // `it.fails` passa finché il difetto c'è; quando sarà corretto va trasformata in prova normale.
  it.fails('irradianza denormale con cella a 25 °C dovrebbe dare un rendimento finito (oggi NaN)', () => {
    expect(Number.isNaN(huldRelativeEfficiency(5e-324, 25))).toBe(false)
  })
})
