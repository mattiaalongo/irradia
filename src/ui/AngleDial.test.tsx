import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AngleDial from './AngleDial'
import { dialPoint } from './dialGeometry'

const r1 = (n: number) => Math.round(n * 10) / 10
const render = (kind: 'tilt' | 'azimuth', value: number) =>
  renderToStaticMarkup(
    <AngleDial kind={kind} label={kind === 'tilt' ? 'Inclinazione' : 'Orientamento (azimut da Nord)'} value={value} onChange={() => {}} />,
  )

describe('AngleDial', () => {
  it('ha uno slider nativo con nome, limiti e testo del valore; il disegno è nascosto ai lettori di schermo', () => {
    const html = render('azimuth', 180)
    expect(html).toContain('<input class="dial-input" type="range"')
    expect(html).toContain('aria-label="Orientamento (azimut da Nord) (slider)"')
    expect(html).toContain('min="0"')
    expect(html).toContain('max="359"')
    expect(html).toContain('aria-valuetext="180°, Sud"')
    expect(html).toMatch(/<svg class="dial-svg"[^>]*aria-hidden="true"/)
  })

  it('inclinazione: limiti 0-90 e testi "piatti" / "verticali"', () => {
    expect(render('tilt', 0)).toContain('aria-valuetext="0°, piatti"')
    expect(render('tilt', 90)).toContain('aria-valuetext="90°, verticali"')
    expect(render('tilt', 35)).toContain('aria-valuetext="35°"')
    expect(render('tilt', 35)).toContain('max="90"')
  })

  it('collega il campo numerico con la stessa etichetta e lo stesso valore', () => {
    const html = render('tilt', 35)
    expect(html).toContain('>Inclinazione</label>')
    expect(html).toContain('value="35"')
  })

  it('mostra le lettere N, E, S, O e i numeri della scala', () => {
    const az = render('azimuth', 180)
    for (const l of ['>N<', '>E<', '>S<', '>O<', '>45<', '>135<', '>225<', '>315<']) expect(az).toContain(l)
    const tilt = render('tilt', 35)
    for (const l of ['>0°<', '>30°<', '>60°<', '>90°<']) expect(tilt).toContain(l)
  })

  it('posa il cursore nel punto del valore (da dialGeometry)', () => {
    const p = dialPoint('azimuth', 180, 100, 100, 64) // Sud: in basso
    expect(render('azimuth', 180)).toContain(`translate(${r1(p.x)} ${r1(p.y)})`)
    const t = dialPoint('tilt', 90, 24, 176, 128) // 90°: in alto
    expect(render('tilt', 90)).toContain(`translate(${r1(t.x)} ${r1(t.y)})`)
  })

  it('a 0° non disegna l\'arco del cursore', () => {
    expect(render('tilt', 0)).not.toContain('dial-sweep')
    expect(render('tilt', 1)).toContain('dial-sweep')
  })
})
