import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import PanelPreview from './PanelPreview'
import { PREVIEW_VARIANTS as VARIANTS } from './panelPreviewVariants'
import { projectPanel } from './panelProjection'

const render = (tilt: number, az: number) => renderToStaticMarkup(<PanelPreview tiltDeg={tilt} azimuthDeg={az} />)

describe('PanelPreview', () => {
  it('è solo un disegno: aria-hidden, senza animazioni né testi oltre a lettere e angolo', () => {
    const html = render(35, 180)
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/)
    expect(html).not.toMatch(/<animate|<style|filter=|<title/)
    expect(html).toContain('>35°<')
    for (const l of ['>N<', '>E<', '>S<', '>O<']) expect(html).toContain(l)
  })

  it('data-face dice quale faccia si vede, coerente con projectPanel', () => {
    for (const [tilt, az] of [[35, 180], [35, 0], [60, 270], [10, 90], [90, 0], [0, 180]] as const) {
      const front = projectPanel(tilt, az, { yawDeg: 20 }).front
      expect(render(tilt, az)).toContain(`data-face="${front ? 'front' : 'back'}"`)
    }
    expect(render(35, 180)).toContain('data-face="front"')
    expect(render(35, 0)).toContain('data-face="back"')
  })

  it('faccia: con le celle (griglia 6 × 10 = 5 + 9 linee) o con il retro tratteggiato', () => {
    const front = render(35, 180)
    expect(front.match(/class="pp-cell-line"/g)).toHaveLength(14)
    expect(front).not.toContain('pp-hatched')
    const back = render(35, 0)
    expect(back).not.toContain('pp-cell-line')
    expect(back).toContain('pp-hatched')
  })

  it('disegna 4 sostegni e le lettere prima del pannello', () => {
    const html = render(35, 180)
    expect(html.match(/class="pp-post"/g)).toHaveLength(4)
    expect(html.indexOf('class="pp-letter"')).toBeLessThan(html.indexOf('class="pp-cells"'))
  })

  it('le lettere dei punti cardinali stanno fuori dal disco di terreno, per ogni orientamento', () => {
    // Il disco è un poligono: la lettera a R + 0,7 m non può mai cadere dentro.
    const m = projectPanel(35, 180, { ox: 272, oy: 172, scale: 67, groundRadiusM: 2 })
    for (const az of [0, 90, 180, 270]) {
      const p = m.groundPoint(az, 2.7)
      const q = m.groundPoint(az, 2)
      expect(Math.hypot(p.x - 272, p.y - 172)).toBeGreaterThan(Math.hypot(q.x - 272, q.y - 172))
    }
  })

  it('il riquadro di profilo mostra l\'inclinazione immediata', () => {
    expect(render(0, 180)).toContain('>0°<')
    expect(render(90, 180)).toContain('>90°<')
  })
})

describe('PanelPreview, variante "b" (aspetto «Giornata di sole»)', () => {
  const renderB = (tilt: number, az: number) =>
    renderToStaticMarkup(<PanelPreview tiltDeg={tilt} azimuthDeg={az} variant="b" />)

  it('parametri del prototipo: elevazione 40°, yaw 20°, osservatore a 10 m', () => {
    expect(VARIANTS.b.scene).toMatchObject({ elevationDeg: 40, yawDeg: 20, distanceM: 10 })
    expect(VARIANTS.a.scene.distanceM).toBeUndefined()
  })

  it('solo disegno: aria-hidden, lettere N E S O, niente riquadro di profilo né sole', () => {
    const html = renderB(35, 180)
    expect(html).toMatch(/^<div class="panel-preview panel-preview-b"><svg viewBox="0 0 640 392" aria-hidden="true"/)
    expect(html).not.toMatch(/<animate|<style|filter=|<title|pp-side-/)
    expect(html).not.toContain('>35°<')
    for (const l of ['>N<', '>E<', '>S<', '>O<']) expect(html).toContain(l)
  })

  it('data-face coerente con la proiezione in prospettiva', () => {
    for (const [tilt, az] of [[35, 180], [35, 0], [60, 270], [10, 90], [90, 0], [0, 180]] as const) {
      const front = projectPanel(tilt, az, VARIANTS.b.scene).front
      expect(renderB(tilt, az)).toContain(`data-face="${front ? 'front' : 'back'}"`)
    }
  })

  it('lettere sempre dentro il riquadro, per ogni posa', () => {
    for (let tilt = 0; tilt <= 90; tilt += 15) {
      for (let az = 0; az < 360; az += 15) {
        const html = renderB(tilt, az)
        for (const m of html.matchAll(/class="pp-letter" x="([-\d.]+)" y="([-\d.]+)"/g)) {
          expect(Number(m[1])).toBeGreaterThanOrEqual(12)
          expect(Number(m[1])).toBeLessThanOrEqual(628)
          expect(Number(m[2])).toBeGreaterThanOrEqual(14)
          expect(Number(m[2])).toBeLessThanOrEqual(378)
        }
        expect(html).not.toContain('NaN')
      }
    }
  })
})
