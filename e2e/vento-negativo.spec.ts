import { parsePvgisTmy } from '../src/engine/pvgisTmy'
import { simulateYear } from '../src/engine/simulate'
import { formatNumber } from '../src/ui/format'
import { FIXTURE_BODIES, expect, test } from './fixtures'
import { DEBOUNCE_MS, ETICHETTE, avvio, campo, impostaPosizione, orologioFermo, totale } from './helpers'

// Issue #28: PVGIS a volte dà un vento negativo vicino ai cambi di mese. Dentro la finestra di
// 8 ore il parser lo porta a 0 (Livorno); fuori resta un errore visibile.

const LIVORNO = { lat: '43,5485', lon: '10,3106' }

test('Livorno (vento negativo il 1/8 alle 6-7 UTC): risultato mostrato, nessun errore', async ({ page, pvgis }) => {
  await orologioFermo(page)
  await avvio(page, pvgis)
  await campo(page, ETICHETTE.pannelli).fill('20')
  await campo(page, ETICHETTE.potenza).fill('430')
  await campo(page, ETICHETTE.inclinazione).fill('35')
  await campo(page, ETICHETTE.azimut).fill('180')
  await campo(page, ETICHETTE.perdite).fill('0')
  await impostaPosizione(page, LIVORNO.lat, LIVORNO.lon)
  await page.clock.runFor(DEBOUNCE_MS)

  const attesa = simulateYear(parsePvgisTmy(JSON.parse(FIXTURE_BODIES.livorno)), {
    tiltDeg: 35, azimuthDeg: 180, panelCount: 20, panelPowerWp: 430, systemLossPct: 0,
  })
  await expect(totale(page)).toContainText(`${formatNumber(attesa.annualKwh)} kWh`)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('NaN')
  await expect(page.locator('body')).not.toContainText('Dati non disponibili')
  expect(pvgis.requests.at(-1)?.url).toContain('lat=43.5485&lon=10.3106')
})

test('vento negativo FUORI dalla finestra: avviso chiaro, pagina intatta e risultato precedente visibile', async ({ page, pvgis }) => {
  const j = JSON.parse(FIXTURE_BODIES.livorno)
  j.outputs.tmy_hourly[100].WS10m = -0.3 // 5/1 alle 4 UTC: lontano da ogni cambio di mese
  await orologioFermo(page)
  await avvio(page, pvgis)
  const prima = await totale(page).innerText()
  pvgis.body(JSON.stringify(j))
  await impostaPosizione(page, LIVORNO.lat, LIVORNO.lon)
  await page.clock.runFor(DEBOUNCE_MS)

  const avviso = page.getByRole('alert')
  await expect(avviso).toContainText('Dati non disponibili per questa posizione')
  await expect(avviso).toContainText('WS10m')
  await expect(avviso).toContainText('negativo')
  await expect(page.locator('body')).not.toContainText('NaN')
  expect(await totale(page).innerText()).toBe(prima)
  await expect(campo(page, ETICHETTE.pannelli)).toBeEditable()
})
