import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'

// Prova minima di collaudo della configurazione (sarà sostituita dalle prove vere).
// PVGIS è sostituito da una risposta salvata (Roma): nessuna rete.
const tmyRoma = readFileSync(
  'src/engine/__fixtures__/pvgis-tmy-roma.json',
  'utf-8',
)

test('mostra il totale annuo con PVGIS simulato', async ({ page }) => {
  await page.route('**/api/pvgis/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: tmyRoma }),
  )
  await page.goto('/')
  await expect(page.getByText(/kWh/).first()).toBeVisible({ timeout: 15_000 })
})
