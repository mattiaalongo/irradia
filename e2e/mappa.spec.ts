import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { DEBOUNCE_MS, ETICHETTE, avvio, campo, orologioFermo, sincronizza } from './helpers'

// Prova minima della mappa (fase 5). Le prove complete le scrive il tester.

const mappa = (page: Page) => page.getByRole('group', { name: /^Mappa: clicca o tocca/ })

/** Clic a (dx, dy) pixel dal centro della mappa. */
async function clicca(page: Page, dx: number, dy: number): Promise<void> {
  const box = (await mappa(page).boundingBox())!
  await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy)
}

const numero = async (page: Page, etichetta: string) =>
  Number((await campo(page, etichetta).inputValue()).replace(',', '.'))

test.describe('schermo largo', () => {
  test('un clic sulla mappa cambia i campi', async ({ page, pvgis, tiles }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await expect(mappa(page)).toBeVisible()
    await expect.poll(() => tiles.count).toBeGreaterThan(0)

    await clicca(page, 60, -40)
    await expect(campo(page, ETICHETTE.lon)).not.toHaveValue('12,4964')
    const lat = await numero(page, ETICHETTE.lat)
    const lon = await numero(page, ETICHETTE.lon)
    expect(lat).toBeGreaterThan(34)
    expect(lat).toBeLessThan(72)
    expect(lon).toBeGreaterThan(12.5) // a destra del centro (12,5° E)
  })

  test('tre clic entro 0,8 s fanno una sola richiesta a PVGIS', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const prima = pvgis.count

    await clicca(page, -40, 0)
    await page.clock.runFor(200)
    await clicca(page, 0, 0)
    await page.clock.runFor(200)
    await clicca(page, 40, 0)
    await page.clock.runFor(DEBOUNCE_MS - 1)
    await sincronizza(page)
    expect(pvgis.count).toBe(prima)
    await page.clock.runFor(1)
    await expect.poll(() => pvgis.count).toBe(prima + 1)
  })
})

test('Tab raggiunge la mappa e i suoi pulsanti prima dei campi; le frecce non cambiano la posizione', async ({ page, pvgis }) => {
  await orologioFermo(page)
  await avvio(page, pvgis)
  await expect(mappa(page)).toBeVisible()
  await page.locator('body').click({ position: { x: 1, y: 1 } })
  await page.keyboard.press('Tab')
  await expect(mappa(page)).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Equal')
  await page.clock.runFor(DEBOUNCE_MS)
  await sincronizza(page)
  await expect(campo(page, ETICHETTE.lat)).toHaveValue('41,9028')
  await expect(campo(page, ETICHETTE.lon)).toHaveValue('12,4964')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Ingrandisci' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Riduci' })).toBeFocused()
})

test.describe('telefono', () => {
  test.use({ viewport: { width: 390, height: 800 } })

  test('la mappa è chiusa e si apre con il pulsante', async ({ page, pvgis, tiles }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const pulsante = page.getByRole('button', { name: 'Scegli sulla mappa' })
    await expect(pulsante).toHaveAttribute('aria-expanded', 'false')
    await expect(mappa(page)).toBeHidden()
    expect(tiles.count).toBe(0)

    await pulsante.click()
    await expect(page.getByRole('button', { name: 'Chiudi la mappa' })).toHaveAttribute('aria-expanded', 'true')
    // React mostra il contenuto caricato in differita dopo un timer (≤ 300 ms): con l'orologio
    // fermo va fatto avanzare, come in `avvio`.
    await expect
      .poll(async () => {
        await page.clock.runFor(300)
        return mappa(page).isVisible()
      })
      .toBe(true)
    await expect.poll(() => tiles.count).toBeGreaterThan(0)
  })
})
