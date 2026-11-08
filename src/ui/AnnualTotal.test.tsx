import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AnnualTotal, { ANNUAL_NOTE } from './AnnualTotal'

const html = renderToStaticMarkup(
  <AnnualTotal annualKwh={6498} peakPowerKwp={4.3} panelCount={10} panelPowerWp={430} />,
)

describe('AnnualTotal', () => {
  it('mostra il totale con il separatore delle migliaia', () => {
    expect(html).toContain('6.498')
  })

  it('mostra la nota sull\'anno tipo accanto al totale', () => {
    expect(html).toContain('anno tipo')
    expect(html).toContain('2005')
    expect(html).toContain('media di tutti gli anni')
    expect(html).toContain(ANNUAL_NOTE)
  })

  it('collega la nota al totale con aria-describedby', () => {
    const describedBy = /aria-describedby="([^"]+)"/.exec(html)?.[1]
    expect(describedBy).toBeTruthy()
    expect(html).toMatch(new RegExp(`id="${describedBy}"[^>]*>${ANNUAL_NOTE}`))
  })

  it('non contiene cifre specifiche di una città', () => {
    expect(ANNUAL_NOTE).not.toMatch(/Milano|\d+\s?%/)
  })
})
