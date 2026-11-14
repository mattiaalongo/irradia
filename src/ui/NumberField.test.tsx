import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import NumberField from './NumberField'
import NumberSlider from './NumberSlider'

describe('NumberField', () => {
  const base = { label: 'Latitudine (Nord)', unit: '°', value: 41.9028, onChange: () => {}, min: 34, max: 72, step: 0.0001, decimals: 4 }

  it('collega etichetta e campo, mostra il valore con la virgola e l\'unità', () => {
    const html = renderToStaticMarkup(<NumberField {...base} />)
    const id = /<label for="([^"]+)"/.exec(html)![1]
    expect(html).toContain(`id="${id}"`)
    expect(html).toContain('value="41,9028"')
    expect(html).toContain('<span class="u">°</span>')
    expect(html).not.toContain('type="range"')
  })

  it('mostra l\'aiuto calcolato dal valore e non ha avvisi con un valore valido', () => {
    const html = renderToStaticMarkup(<NumberField {...base} hint={(v) => `valore ${v}`} />)
    expect(html).toContain('valore 41.9028')
    expect(html).not.toContain('role="alert"')
    expect(html).toContain('aria-invalid="false"')
  })

  it('con layout "inline" usa la riga etichetta | campo', () => {
    expect(renderToStaticMarkup(<NumberField {...base} layout="inline" />)).toContain('class="fld fld-inline"')
  })
})

describe('NumberSlider', () => {
  it('è un campo più uno slider nativo chiamato "<etichetta> (slider)" con i limiti giusti', () => {
    const html = renderToStaticMarkup(
      <NumberSlider label="Numero di pannelli" value={10} onChange={() => {}} min={1} max={50} step={1} />,
    )
    expect(html).toContain('type="range"')
    expect(html).toContain('aria-label="Numero di pannelli (slider)"')
    expect(html).toContain('min="1"')
    expect(html).toContain('max="50"')
    expect(html).toContain('value="10"')
    expect(html.match(/<i>/g)).toHaveLength(11) // tacche decorative
  })
})
