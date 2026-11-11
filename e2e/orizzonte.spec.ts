import { FIXTURE_BODIES, expect, test } from './fixtures'
import { avvio, orologioFermo, totale } from './helpers'
import { parsePvgisTmy } from '../src/engine/pvgisTmy'
import { simulateYear } from '../src/engine/simulate'

// Issue #25: la nota sotto i risultati dice se PVGIS ha applicato le ombre del terreno
// (`use_horizon`). Se PVGIS risponde `false` il calcolo prosegue con il testo di riserva.

const CON = 'Considera le ombre di montagne e colline (profilo del terreno di PVGIS), non quelle di edifici e alberi vicini.'
const SENZA = 'Non considera le ombre di montagne, colline, edifici e alberi'

test('use_horizon true: nota normale', async ({ page, pvgis }) => {
  await orologioFermo(page)
  await avvio(page, pvgis)
  await expect(totale(page)).toContainText('kWh')
  await expect(page.getByText(CON, { exact: false })).toBeVisible()
  await expect(page.getByText(SENZA, { exact: false })).toHaveCount(0)
})

test('use_horizon false: nota di riserva e il calcolo prosegue', async ({ page, pvgis }) => {
  const j = JSON.parse(FIXTURE_BODIES.roma)
  j.inputs.meteo_data.use_horizon = false
  pvgis.body(JSON.stringify(j))
  await orologioFermo(page)
  await avvio(page, pvgis)
  await expect(totale(page)).toContainText('kWh')
  await expect(page.getByText(SENZA, { exact: false })).toBeVisible()
  await expect(page.getByText('profilo del terreno di PVGIS')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  const attesa = simulateYear(parsePvgisTmy(j), { tiltDeg: 35, azimuthDeg: 180, panelCount: 10, panelPowerWp: 430, systemLossPct: 14 })
  expect(attesa.annualKwh).toBeGreaterThan(0)
  await expect(page.locator('body')).not.toContainText('NaN')
})
