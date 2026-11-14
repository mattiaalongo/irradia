import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { projectPanel, type PanelProjection, type Point2 } from './panelProjection'

/** Tutti i punti di una proiezione, per controllarli in blocco. */
function allPoints(p: PanelProjection): Point2[] {
  return [
    ...p.panel,
    ...p.footprint,
    ...p.groundOutline,
    ...p.grid.flat(),
    ...p.posts.flat(),
    ...p.facing,
  ]
}

describe('projectPanel (proprietà)', () => {
  const tilt = fc.double({ min: 0, max: 90, noNaN: true })
  // Azimut qualsiasi finito, compresi valori enormi e negativi.
  const azimuth = fc.oneof(
    fc.double({ min: -720, max: 720, noNaN: true }),
    fc.double({ noNaN: true, noDefaultInfinity: true }),
  )
  const yaw = fc.double({ min: -180, max: 180, noNaN: true })

  it('mai NaN né infinito per inclinazione 0-90 e azimut finito qualsiasi', () => {
    fc.assert(
      fc.property(tilt, azimuth, yaw, (t, a, y) => {
        const p = projectPanel(t, a, { yawDeg: y })
        for (const q of allPoints(p)) {
          expect(Number.isFinite(q.x)).toBe(true)
          expect(Number.isFinite(q.y)).toBe(true)
        }
        expect(typeof p.front).toBe('boolean')
      }),
      { numRuns: 500 },
    )
  })

  it('α e α + 360 danno lo stesso disegno', () => {
    fc.assert(
      fc.property(tilt, fc.double({ min: -720, max: 720, noNaN: true }), (t, a) => {
        const p1 = allPoints(projectPanel(t, a))
        const p2 = allPoints(projectPanel(t, a + 360))
        p1.forEach((q, k) => {
          // 1e-9 unità SVG: (a + 360) mod 360 può differire da a mod 360 nell'ultima cifra binaria.
          expect(Math.abs(q.x - p2[k].x)).toBeLessThan(1e-9)
          expect(Math.abs(q.y - p2[k].y)).toBeLessThan(1e-9)
        })
        expect(projectPanel(t, a).front).toBe(projectPanel(t, a + 360).front)
      }),
      { numRuns: 300 },
    )
  })

  it('il pannello è un parallelogramma (lati opposti uguali sullo schermo)', () => {
    // La proiezione ortografica è affine: un rettangolo diventa un parallelogramma.
    fc.assert(
      fc.property(tilt, azimuth, yaw, (t, a, y) => {
        const [bl, br, tr, tl] = projectPanel(t, a, { yawDeg: y }).panel
        expect(br.x - bl.x).toBeCloseTo(tr.x - tl.x, 9)
        expect(br.y - bl.y).toBeCloseTo(tr.y - tl.y, 9)
      }),
      { numRuns: 300 },
    )
  })

  it('il bordo basso del pannello sta a `clearance` dal terreno: sostegni bassi lunghi s·0,25·cos ε', () => {
    // I primi due sostegni (bordo basso) vanno da z = 0,25 a z = 0: lunghezza verticale 60·0,25·cos 26°.
    const expected = 60 * 0.25 * Math.cos((26 * Math.PI) / 180)
    fc.assert(
      fc.property(tilt, azimuth, (t, a) => {
        const p = projectPanel(t, a)
        for (const post of p.posts.slice(0, 2)) {
          expect(post[0].x).toBeCloseTo(post[1].x, 9)
          expect(post[1].y - post[0].y).toBeCloseTo(expected, 9)
        }
      }),
      { numRuns: 300 },
    )
  })

  it('simmetria Est/Ovest con yaw 0 su angoli qualsiasi', () => {
    fc.assert(
      fc.property(tilt, fc.double({ min: 0, max: 360, noNaN: true }), (t, a) => {
        const p = projectPanel(t, a, { yawDeg: 0 })
        const q = projectPanel(t, 360 - a, { yawDeg: 0 })
        const mirrored = [q.panel[1], q.panel[0], q.panel[3], q.panel[2]]
        p.panel.forEach((pt, k) => {
          expect(pt.x).toBeCloseTo(-mirrored[k].x, 9)
          expect(pt.y).toBeCloseTo(mirrored[k].y, 9)
        })
      }),
      { numRuns: 300 },
    )
  })
})
