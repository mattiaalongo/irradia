import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { DEBOUNCE_MS, MILANO, avvio, impostaPosizione, orologioFermo, sincronizza, totale } from './helpers'

// Interruttore dell'aspetto della pagina (#56 parte 2): A «Strumento» (predefinito) / B «Giornata di sole».
// Prove essenziali dello sviluppatore; il tester le amplierà.

const radioA = (page: Page) => page.getByRole('radio', { name: 'Strumento', exact: true })
const radioB = (page: Page) => page.getByRole('radio', { name: 'Giornata di sole', exact: true })
const aspetto = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-look'))
const memoria = (page: Page) => page.evaluate(() => localStorage.getItem('irradia.look'))
const numeroTotale = (page: Page) => totale(page).locator('.hero').textContent()
const risultati = (page: Page) => page.getByRole('region', { name: 'Risultati' })

/** Ricarica la pagina e fa avanzare l'orologio finché il nuovo download (la memoria in RAM si svuota) è finito. */
async function ricarica(page: Page, pvgis: { count: number }): Promise<void> {
  const prima = pvgis.count
  await page.reload()
  await expect(radioA(page)).toBeAttached()
  await expect
    .poll(async () => {
      await page.clock.runFor(DEBOUNCE_MS)
      return pvgis.count
    })
    .toBe(prima + 1)
  await expect(totale(page)).toContainText('kWh')
}

test('gruppo nell\'intestazione: legenda, due radio, A selezionato per default', async ({ page, pvgis }) => {
  await orologioFermo(page)
  await avvio(page, pvgis)
  const gruppo = page.locator('main > header').getByRole('group', { name: 'Aspetto della pagina' })
  await expect(gruppo.getByRole('radio')).toHaveCount(2)
  await expect(radioA(page)).toBeChecked()
  await expect(radioB(page)).not.toBeChecked()
  expect(await aspetto(page)).toBe('a')
  expect(await memoria(page)).toBeNull()
})

test('cambio da tastiera: nessuna richiesta a PVGIS, totale identico, focus sul radio, scelta salvata', async ({ page, pvgis }) => {
  await orologioFermo(page)
  await avvio(page, pvgis)
  const prima = pvgis.count
  const totalePrima = await numeroTotale(page)

  await radioA(page).focus()
  await page.keyboard.press('ArrowRight')
  await expect(radioB(page)).toBeChecked()
  await expect(radioB(page)).toBeFocused()
  expect(await aspetto(page)).toBe('b')
  expect(await memoria(page)).toBe('b')
  await page.clock.runFor(DEBOUNCE_MS * 3)
  await sincronizza(page)
  expect(pvgis.count).toBe(prima)
  expect(await numeroTotale(page)).toBe(totalePrima)

  // E indietro.
  await page.keyboard.press('ArrowLeft')
  await expect(radioA(page)).toBeChecked()
  await expect(radioA(page)).toBeFocused()
  expect(await aspetto(page)).toBe('a')
  expect(await memoria(page)).toBe('a')
  await page.clock.runFor(DEBOUNCE_MS * 3)
  await sincronizza(page)
  expect(pvgis.count).toBe(prima)
  expect(await numeroTotale(page)).toBe(totalePrima)
})

test('la scelta resta dopo il ricaricamento', async ({ page, pvgis }) => {
  await orologioFermo(page)
  await avvio(page, pvgis)
  await radioB(page).check()
  await ricarica(page, pvgis)
  await expect(radioB(page)).toBeChecked()
  expect(await aspetto(page)).toBe('b')
  // Tornando ad A anche A resta.
  await radioA(page).check()
  await ricarica(page, pvgis)
  await expect(radioA(page)).toBeChecked()
  expect(await aspetto(page)).toBe('a')
})

test('valore sconosciuto in memoria: A, senza errori', async ({ page, pvgis }) => {
  await page.addInitScript(() => localStorage.setItem('irradia.look', 'giornata'))
  await orologioFermo(page)
  await avvio(page, pvgis)
  await expect(radioA(page)).toBeChecked()
  expect(await aspetto(page)).toBe('a')
})

test('memoria del browser che lancia in lettura e scrittura: A, il cambio funziona lo stesso, nessun errore', async ({ page, pvgis }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('negato', 'SecurityError')
      },
    })
  })
  await orologioFermo(page)
  await avvio(page, pvgis)
  await expect(radioA(page)).toBeChecked()
  await radioB(page).check()
  await expect(radioB(page)).toBeChecked()
  expect(await aspetto(page)).toBe('b')
})

test('la mappa non viene ricreata al cambio di aspetto (schermo largo)', async ({ page, pvgis }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await orologioFermo(page)
  await avvio(page, pvgis)
  const contenitore = page.locator('.leaflet-container')
  await expect(contenitore).toBeVisible()
  // Segno sul nodo DOM della mappa: se Leaflet fosse ricreato, il nodo sarebbe un altro.
  await contenitore.evaluate((el) => ((el as HTMLElement & { probe?: number }).probe = 42))
  for (const radio of [radioB, radioA, radioB]) {
    await radio(page).check()
    await expect(page.locator('.leaflet-container')).toHaveCount(1)
    expect(await page.locator('.leaflet-container').evaluate((el) => (el as HTMLElement & { probe?: number }).probe)).toBe(42)
  }
})

test('telefono: la mappa aperta resta aperta e montata dopo il cambio', async ({ page, pvgis }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await orologioFermo(page)
  await avvio(page, pvgis)
  await page.getByRole('button', { name: 'Scegli sulla mappa' }).click()
  await expect
    .poll(async () => {
      await page.clock.runFor(100)
      return page.locator('.leaflet-container').count()
    })
    .toBe(1)
  await page.locator('.leaflet-container').evaluate((el) => ((el as HTMLElement & { probe?: number }).probe = 7))
  await radioB(page).check()
  await expect(page.getByRole('button', { name: 'Chiudi la mappa' })).toHaveAttribute('aria-expanded', 'true')
  expect(await page.locator('.leaflet-container').evaluate((el) => (el as HTMLElement & { probe?: number }).probe)).toBe(7)
})

test('B: ordine della pagina e due cornici «non aggiornato» con la stessa etichetta', async ({ page, pvgis }) => {
  await orologioFermo(page)
  await avvio(page, pvgis)
  await radioB(page).check()
  // Ordine nel DOM: intestazione → Risultati (con il totale) → Pannelli → Parametri → grafico → piè di pagina.
  const ordine = await page.evaluate(() => {
    const pos = (sel: string) => {
      const all = [...document.querySelectorAll('body *')]
      return all.indexOf(document.querySelector(sel)!)
    }
    return [
      pos('header'),
      pos('section.results [role="group"]'),
      pos('fieldset.scene-dials'),
      pos('#params-title'),
      pos('.chartsheet'),
      pos('footer'),
    ]
  })
  expect(ordine.every((p) => p >= 0)).toBe(true)
  expect([...ordine].sort((a, b) => a - b)).toEqual(ordine)
  await expect(page.getByRole('heading', { name: 'Parametri', exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Numero, potenza e perdite' })).toBeVisible()

  await impostaPosizione(page, MILANO.lat, MILANO.lon)
  await expect(page.getByText('Valori della posizione precedente')).toHaveCount(2)
  await page.clock.runFor(DEBOUNCE_MS)
  await expect(page.getByText('Valori della posizione precedente')).toHaveCount(0)
})

test('B: «Riprova» a successo porta il focus sui Risultati della scena', async ({ page, pvgis, consoleGuard }) => {
  consoleGuard.allow(/Failed to load resource/)
  await orologioFermo(page)
  await avvio(page, pvgis)
  await radioB(page).check()
  pvgis.gatewayError(502)
  await impostaPosizione(page, MILANO.lat, MILANO.lon)
  await page.clock.runFor(DEBOUNCE_MS)
  await expect(page.getByRole('alert')).toBeVisible()
  pvgis.useDefault()
  const riprova = page.getByRole('button', { name: 'Riprova', exact: true })
  await riprova.focus()
  await page.keyboard.press('Enter')
  await expect(riprova).toHaveCount(0)
  await expect(risultati(page)).toBeFocused()
  expect(await risultati(page).evaluate((el) => el.closest('.scene') !== null)).toBe(true)
})

for (const larghezza of [320, 360, 390, 1280]) {
  test(`B a ${larghezza} px: nessuno scorrimento orizzontale`, async ({ page, pvgis }) => {
    await page.setViewportSize({ width: larghezza, height: 800 })
    await orologioFermo(page)
    await avvio(page, pvgis)
    await radioB(page).check()
    const m = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }))
    expect(m.s).toBeLessThanOrEqual(m.c)
  })
}
