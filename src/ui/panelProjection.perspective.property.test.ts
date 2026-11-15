import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { PREVIEW_VARIANTS } from './panelPreviewVariants'
import { projectPanel, type PanelProjection, type Point2 } from './panelProjection'

// Prove del tester (#56 parte 2): la vista in PROSPETTIVA dell'anteprima B non deve mai produrre
// NaN/Infinity, per qualunque posa raggiungibile dall'interfaccia e oltre.

function allPoints(p: PanelProjection): Point2[] {
  return [...p.panel, ...p.footprint, ...p.groundOutline, ...p.grid.flat(), ...p.posts.flat(), ...p.facing]
}
const finite = (p: PanelProjection) => allPoints(p).every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))

describe('projectPanel in prospettiva (proprietà)', () => {
  const B = PREVIEW_VARIANTS.b.scene

  it('scena B: nessun NaN/Infinity per OGNI inclinazione 0-90 (interi) e OGNI azimut 0-359 (interi)', () => {
    // Le due grandezze dell'interfaccia sono intere (slider/comando): si prova l'intero spazio, 91 × 360.
    for (let t = 0; t <= 90; t++) {
      for (let a = 0; a < 360; a++) {
        const p = projectPanel(t, a, B)
        expect(finite(p), `t=${t} a=${a}`).toBe(true)
        expect(typeof p.front).toBe('boolean')
      }
    }
  })

  it('scena B con valori reali (decimali), azimut negativi o enormi: tutto finito', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 90, noNaN: true }),
        fc.oneof(fc.double({ min: -720, max: 720, noNaN: true }), fc.double({ noNaN: true, noDefaultInfinity: true })),
        (t, a) => {
          expect(finite(projectPanel(t, a, B))).toBe(true)
        },
      ),
      { numRuns: 500 },
    )
  })

  it('distanza qualsiasi: o RangeError, o tutti i punti finiti (mai NaN in silenzio)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 90, noNaN: true }),
        fc.double({ min: 0, max: 360, noNaN: true }),
        fc.double({ noNaN: true, min: -1e300, max: 1e300 }), // include 0, negativi, denormali, molto grandi (oltre 1e300: vedi it.fails sotto)
        fc.double({ min: -90, max: 90, noNaN: true }),
        (t, a, d, el) => {
          let p: PanelProjection
          try {
            p = projectPanel(t, a, { ...B, distanceM: d, elevationDeg: el })
          } catch (e) {
            expect(e).toBeInstanceOf(RangeError)
            return
          }
          expect(finite(p), `d=${d} el=${el}`).toBe(true)
        },
      ),
      { numRuns: 800 },
    )
  })

  // DIFETTO NOTO (bassa gravità, non raggiungibile dall'interfaccia: l'anteprima B usa distanza 10):
  // con una distanza finita ma enorme scale·distanza va in overflow → Infinity·0 = NaN, senza RangeError.
  // Da segnalare all'SWD (issue da aprire); quando sarà corretto, togliere `.fails`.
  it.fails('distanza finita enorme (1,8e306): né NaN né Infinity (oppure RangeError)', () => {
    const p = projectPanel(0, 0, { ...B, distanceM: 1.797693134862316e306, elevationDeg: 0 })
    expect(finite(p)).toBe(true)
  })

  it('distanza non valida: RangeError sempre (0, negativa, NaN, ±Infinity)', () => {
    for (const d of [0, -0, -1, -1e-300, NaN, Infinity, -Infinity]) {
      expect(() => projectPanel(35, 180, { distanceM: d }), String(d)).toThrow(RangeError)
    }
  })

  it('senza distanza il risultato è identico a distanza assente (nessuna regressione)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 90, noNaN: true }), fc.double({ min: 0, max: 360, noNaN: true }), (t, a) => {
        const { groundPoint: g1, ...r1 } = projectPanel(t, a, { distanceM: undefined })
        const { groundPoint: g2, ...r2 } = projectPanel(t, a)
        expect(r1).toEqual(r2)
        expect(g1(10, 1)).toEqual(g2(10, 1))
      }),
      { numRuns: 100 },
    )
  })

  it('distanza molto grande tende all\'ortografica', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 90, noNaN: true }), fc.double({ min: 0, max: 360, noNaN: true }), (t, a) => {
        const o = projectPanel(t, a, { ...B, distanceM: undefined })
        const p = projectPanel(t, a, { ...B, distanceM: 1e7 })
        o.panel.forEach((q, k) => {
          expect(Math.abs(q.x - p.panel[k].x)).toBeLessThan(0.01)
          expect(Math.abs(q.y - p.panel[k].y)).toBeLessThan(0.01)
        })
      }),
      { numRuns: 100 },
    )
  })
})
