import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import tmyRaw from '../engine/__fixtures__/pvgis-tmy-roma.json'
import { parsePvgisTmy } from '../engine/pvgisTmy'
import { simulateYear } from '../engine/simulate'
import MonthlyChart from './MonthlyChart'

// Si disegna il grafico come testo HTML (react-dom/server), senza browser,
// con i kWh mensili calcolati dall'anno tipo reale di Roma centro, 1 kWp a Sud 35°.
const { monthlyKwh } = simulateYear(parsePvgisTmy(tmyRaw), {
  tiltDeg: 35,
  azimuthDeg: 180,
  panelCount: 4,
  panelPowerWp: 250,
})
const html = renderToStaticMarkup(<MonthlyChart monthlyKwh={monthlyKwh} />)

/**
 * Altezza della barra di un mese, letta dal percorso SVG
 * ("M x,base V inizio-angolo A r,r 0 0 1 x,cima …": la cima è la fine del primo arco).
 */
function barHeight(month: number): number {
  const group = new RegExp(
    `data-month="${month}"[\\s\\S]*?d="M[\\d.]+,([\\d.]+) V[\\d.]+ A[\\d.]+,[\\d.]+ 0 0 1 [\\d.]+,([\\d.]+)`,
  ).exec(html)
  if (!group) throw new Error(`barra del mese ${month} non trovata`)
  return Number(group[1]) - Number(group[2])
}

describe('MonthlyChart', () => {
  it('disegna 12 barre, una per mese, con nome e valore accessibili', () => {
    expect(html.match(/data-month="/g)).toHaveLength(12)
    expect(html).toContain(`aria-label="Gennaio: `)
    expect(html).toContain(`aria-label="Dicembre: `)
  })

  it('le altezze rispettano i valori: a Roma luglio produce più di dicembre', () => {
    expect(monthlyKwh[6]).toBeGreaterThan(monthlyKwh[11])
    expect(barHeight(7)).toBeGreaterThan(barHeight(12))
    // Proporzionalità: rapporto delle altezze = rapporto dei kWh (entro l'arrotondamento SVG).
    expect(barHeight(7) / barHeight(12)).toBeCloseTo(monthlyKwh[6] / monthlyKwh[11], 2)
  })

  it('scrive il valore solo sul mese massimo e minimo, e tutti i valori nella tabella', () => {
    expect(html.match(/class="chart-value"/g)).toHaveLength(2)
    const body = html.split('<tbody>')[1]
    expect(body.match(/<tr>/g)).toHaveLength(12)
  })
})
