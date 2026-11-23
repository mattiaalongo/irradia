import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { PREVIEW_VARIANTS } from './panelPreviewVariants'
import { projectPanel, type PanelProjection } from './panelProjection'

// Prove del tester sulla correzione #61: distanze limite della prospettiva e invarianza del valore predefinito (10 m).
const B = PREVIEW_VARIANTS.b.scene
const tutti = (p: PanelProjection) =>
  [...p.panel, ...p.footprint, ...p.groundOutline, ...p.grid.flat(), ...p.posts.flat(), ...p.facing].every(
    (q) => Number.isFinite(q.x) && Number.isFinite(q.y),
  )
const prova = (d: number): boolean | 'range' => {
  try {
    return tutti(projectPanel(35, 180, { ...B, distanceM: d }))
  } catch (e) {
    expect(e).toBeInstanceOf(RangeError)
    return 'range'
  }
}

describe('#61 casi limite della distanza', () => {
  it.each([Number.MIN_VALUE, 1e-310, 2.2250738585072014e-308, 1e-300, 1e-9, 1e-3, 1, 10, 1e3, 1e100, 1e300, 1e308, Number.MAX_VALUE])(
    'D=%s: finito oppure RangeError',
    (d) => {
      const r = prova(d)
      expect(r === true || r === 'range').toBe(true)
    },
  )
  it.each([0, -1, NaN, Infinity, -Infinity, -Number.MAX_VALUE])('D=%s: RangeError', (d) => {
    expect(() => projectPanel(35, 180, { ...B, distanceM: d })).toThrow(RangeError)
  })
  it('D molto grande tende alla vista ortografica; D = 10 m resta finito', () => {
    expect(tutti(projectPanel(35, 180, { ...B, distanceM: 10 }))).toBe(true)
    const o = projectPanel(35, 180, { ...B, distanceM: 1e15 })
    const r = projectPanel(35, 180, { ...B, distanceM: undefined })
    o.panel.forEach((q, i) => {
      expect(q.x).toBeCloseTo(r.panel[i].x, 3)
      expect(q.y).toBeCloseTo(r.panel[i].y, 3)
    })
  })
  it('proprietà: D fra 1e-300 e MAX_VALUE, qualsiasi posa: mai NaN', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 90, noNaN: true }),
        fc.double({ min: 0, max: 359, noNaN: true }),
        fc.double({ min: 1e-300, max: Number.MAX_VALUE, noNaN: true }),
        fc.double({ min: 0, max: 90, noNaN: true }),
        (t, a, d, el) => {
          try {
            expect(tutti(projectPanel(t, a, { ...B, distanceM: d, elevationDeg: el }))).toBe(true)
          } catch (e) {
            expect(e).toBeInstanceOf(RangeError)
          }
        },
      ),
      { numRuns: 1500 },
    )
  })
})
