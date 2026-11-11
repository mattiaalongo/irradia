import { FIXTURE_BODIES, expect, test } from './fixtures'
import { avvio, orologioFermo } from './helpers'

// Issue #26: sezione richiudibile "Come è calcolata la stima" sotto la nota delle fonti.

const sommario = (page: import('@playwright/test').Page) => page.getByText('Come è calcolata la stima', { exact: true })
const sezione = (page: import('@playwright/test').Page) => page.locator('details.method')
const CONTENUTO = 'Il numero mostrato è l\'energia che l\'impianto consegna'

test('chiusa per default, contenuto nascosto', async ({ page, pvgis }) => {
  await orologioFermo(page)
  await avvio(page, pvgis)
  await expect(sommario(page)).toBeVisible()
  expect(await sezione(page).evaluate((d: HTMLDetailsElement) => d.open)).toBe(false)
  await expect(page.getByText(CONTENUTO)).toBeHidden()
})

test('da tastiera: Tab fino al sommario, Invio apre, Invio chiude', async ({ page, pvgis }) => {
  await orologioFermo(page)
  await avvio(page, pvgis)
  const s = page.locator('details.method > summary')
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab')
    if (await s.evaluate((n) => n === document.activeElement)) break
  }
  await expect(s).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByText(CONTENUTO)).toBeVisible()
  await expect(page.getByText('Le ombre di montagne e colline: nelle ore')).toBeVisible()
  await expect(page.locator('details.method a')).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(page.getByText(CONTENUTO)).toBeHidden()
})

test('use_horizon false: variante senza ombre del terreno', async ({ page, pvgis }) => {
  const j = JSON.parse(FIXTURE_BODIES.roma)
  j.inputs.meteo_data.use_horizon = false
  pvgis.body(JSON.stringify(j))
  await orologioFermo(page)
  await avvio(page, pvgis)
  await sommario(page).click()
  await expect(sezione(page).getByText('per questo punto PVGIS non ha applicato il profilo del terreno')).toBeVisible()
  await expect(sezione(page).getByText('Le ombre di montagne e colline: nelle ore')).toHaveCount(0)
})

test('390 px: nessuno scorrimento orizzontale e ultima riga non sotto la barra fissa', async ({ page, pvgis }) => {
  await page.setViewportSize({ width: 390, height: 700 })
  await orologioFermo(page)
  await avvio(page, pvgis)
  await sommario(page).click()
  const m = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  expect(m[0]).toBeLessThanOrEqual(m[1])

  const ultima = sezione(page).locator('.method-body p').last()
  await ultima.scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect(ultima).toBeInViewport({ ratio: 1 })
  const b = await page.getByTestId('sticky-total').boundingBox()
  const r = await ultima.boundingBox()
  expect(r!.y + r!.height, 'ultima riga sopra la barra').toBeLessThanOrEqual(b!.y)
})
