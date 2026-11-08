import { readFileSync } from 'node:fs'
import { parsePvgisTmy } from '../src/engine/pvgisTmy'
import { simulateYear } from '../src/engine/simulate'
import { MONTH_NAMES, formatNumber } from '../src/ui/format'
import { expect, test } from './fixtures'
import { ETICHETTE, MILANO, campo, impostaPosizione, totale } from './helpers'

test('Roma all\'avvio mostra il totale annuo e il grafico', async ({ page, pvgis }) => {
  await page.goto('/')
  // Valori predefiniti: 10 × 430 Wp = 4,30 kWp.
  await expect(totale(page)).toContainText('kWh')
  await expect(totale(page)).toContainText('Impianto da 4,30 kWp (10 × 430 Wp)')
  await expect(page.getByRole('img', { name: /^Gennaio: .* kWh$/ })).toBeVisible()
  expect(pvgis.count).toBe(1)
  expect(pvgis.requests[0].url).toBe('/api/pvgis/v5_3/tmy?lat=41.9028&lon=12.4964&outputformat=json')
})

test.describe('Milano, 20 × 430 Wp, 35°, Sud, perdite 0', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(totale(page)).toContainText('kWh')
    await campo(page, ETICHETTE.pannelli).fill('20')
    await campo(page, ETICHETTE.potenza).fill('430')
    await campo(page, ETICHETTE.inclinazione).fill('35')
    await campo(page, ETICHETTE.azimut).fill('180')
    await campo(page, ETICHETTE.perdite).fill('0')
    await impostaPosizione(page, MILANO.lat, MILANO.lon)
  })

  test('totale annuo 14.122 kWh e 8,60 kWp (valore di non regressione del motore)', async ({ page }) => {
    await expect(totale(page)).toContainText('14.122 kWh')
    await expect(totale(page)).toContainText('Impianto da 8,60 kWp (20 × 430 Wp)')
  })

  test('i 12 valori della tabella sono quelli del motore', async ({ page }) => {
    const tmy = parsePvgisTmy(JSON.parse(readFileSync('src/engine/__fixtures__/pvgis-tmy-milano.json', 'utf-8')))
    const year = simulateYear(tmy, {
      tiltDeg: 35, azimuthDeg: 180, panelCount: 20, panelPowerWp: 430, systemLossPct: 0,
    })
    await expect(totale(page)).toContainText(`${formatNumber(year.annualKwh)} kWh`)

    await page.getByText('Tabella dei valori mensili').click()
    const righe = page.getByRole('row')
    // Intestazione + 12 mesi.
    await expect(righe).toHaveCount(13)
    for (let m = 0; m < 12; m++) {
      const riga = righe.nth(m + 1)
      await expect(riga.getByRole('rowheader')).toHaveText(MONTH_NAMES[m])
      await expect(riga.getByRole('cell')).toHaveText(formatNumber(year.monthlyKwh[m]))
    }
  })
})
