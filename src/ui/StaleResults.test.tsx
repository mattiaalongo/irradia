import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import StaleResults, { STALE_LABEL } from './StaleResults'

describe('StaleResults', () => {
  it('con dati aggiornati non mostra etichetta né classe "non aggiornato"', () => {
    const html = renderToStaticMarkup(<StaleResults stale={false}><p>contenuto</p></StaleResults>)
    expect(html).not.toContain(STALE_LABEL)
    expect(html).not.toContain('is-stale')
    expect(html).toContain('<p>contenuto</p>')
  })

  it('con dati non aggiornati mostra l\'etichetta esatta prima del contenuto', () => {
    const html = renderToStaticMarkup(<StaleResults stale><p>contenuto</p></StaleResults>)
    expect(STALE_LABEL).toBe('Valori della posizione precedente')
    expect(html).toContain('is-stale')
    expect(html.indexOf(STALE_LABEL)).toBeGreaterThan(-1)
    expect(html.indexOf(STALE_LABEL)).toBeLessThan(html.indexOf('contenuto'))
  })

  it('non aggiunge role né aria-live (nessun annuncio a ogni passo di slider)', () => {
    const html = renderToStaticMarkup(<StaleResults stale><p>x</p></StaleResults>)
    expect(html).not.toMatch(/role=|aria-live/)
  })
})
