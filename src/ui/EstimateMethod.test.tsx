import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import EstimateMethod from './EstimateMethod'

const render = (usesHorizon: boolean) =>
  renderToStaticMarkup(<EstimateMethod usesHorizon={usesHorizon} yearMin={2007} yearMax={2021} />)

describe('EstimateMethod', () => {
  it('è un <details> chiuso per default con il sommario atteso', () => {
    const html = render(true)
    expect(html).toMatch(/^<details class="method">/)
    expect(html).not.toMatch(/<details[^>]* open/)
    expect(html).toContain('<summary>Come è calcolata la stima</summary>')
  })

  it('mostra gli anni passati e le etichette in grassetto', () => {
    const html = render(true)
    expect(html).toContain('tra il 2007 e il 2021')
    for (const l of ['Cosa è compreso', 'Cosa non è compreso', 'Perché può differire dal sito PVGIS']) {
      expect(html).toContain(`<strong>${l}</strong>`)
    }
  })

  it('variante con le ombre del terreno', () => {
    const html = render(true)
    expect(html).toContain('Le ombre di montagne e colline')
    expect(html).toContain('ostacoli vicini')
  })

  it('variante senza le ombre del terreno', () => {
    const html = render(false)
    expect(html).not.toContain('Le ombre di montagne e colline')
    expect(html).toContain('non ha applicato il profilo del terreno')
  })

  it('nessun link e nessun <h3>', () => {
    for (const v of [true, false]) {
      const html = render(v)
      expect(html).not.toContain('<a ')
      expect(html).not.toContain('<h3')
    }
  })
})
