import type { Page, Route } from '@playwright/test'
import { expect, test } from './fixtures'
import { MAP_ERROR_TEXT, RELOAD_LABEL } from '../src/ui/errorBoundaryText'
import { DEBOUNCE_MS, ETICHETTE, MILANO, ROMA, avvio, campo, orologioFermo, sincronizza, totale } from './helpers'

// Errore di caricamento della mappa (issue #38): il file della mappa viene fatto fallire DAVVERO
// con page.route (nessun gancio di prova nell'app). La pagina deve restare utilizzabile.

const JS = '**/assets/MapPicker-*.js'
const CSS = '**/assets/MapPicker-*.css'

// Errori di console attesi, uno per tipo di guasto (messaggi di Chromium e di Vite, verificati il 12/11/2026).
const ATTESI_ABORT = [
  /^console\.error: Failed to load resource: net::ERR_INTERNET_DISCONNECTED$/,
  /^console\.error: TypeError: Failed to fetch dynamically imported module: \S*\/MapPicker-[\w-]+\.js$/,
]
const ATTESI_404 = [
  /^console\.error: Failed to load resource: the server responded with a status of 404 \(Not Found\)$/,
  /^console\.error: TypeError: Failed to fetch dynamically imported module: \S*\/MapPicker-[\w-]+\.js$/,
]
const ATTESI_CSS = [
  /^console\.error: Failed to load resource: net::ERR_INTERNET_DISCONNECTED$/,
  /^console\.error: Error: Unable to preload CSS for \S*\/MapPicker-[\w-]+\.css/,
]
const ATTESI_LANCIA = [/^console\.error: Error: boom\n/]

// Un tentativo di caricamento della mappa fa 1 oppure 2 richieste del file JS, a seconda dei tempi:
// l'aiutante di Vite (`__vitePreload`) aggiunge un <link rel="modulepreload"> e chiama `import()` solo
// dopo l'arrivo del CSS; se intanto il preload è già fallito, il browser può richiedere di nuovo il file.
// Visto nella CI (2 richieste) e mai riprodotto in locale (1). Le prove controllano quindi che il
// numero resti fermo dopo il primo tentativo, non che sia esattamente 1.
const RICHIESTE_PER_TENTATIVO = 2

type Guasto = (route: Route) => Promise<void> | void
const abort: Guasto = (route) => route.abort('internetdisconnected')
const risposta404: Guasto = (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' })
const lancia: Guasto = (route) =>
  route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: "export default function MapPicker() { throw new Error('boom') }",
  })

const avviso = (page: Page) => page.getByRole('alert').filter({ hasText: MAP_ERROR_TEXT })
const ricarica = (page: Page) => page.getByRole('button', { name: RELOAD_LABEL })

/** Con l'orologio fermo React mostra l'esito del `lazy()` dopo un timer: lo si fa correre. */
async function attendi(page: Page, cond: () => Promise<boolean>): Promise<void> {
  await expect
    .poll(async () => {
      await page.clock.runFor(300)
      return cond()
    })
    .toBe(true)
}

/** Registra il guasto e conta le richieste al file della mappa (JS). */
async function guasta(page: Page, pattern: string, guasto: Guasto): Promise<{ count: () => number }> {
  let n = 0
  await page.route(pattern, (route) => {
    if (pattern === JS) n++
    return guasto(route)
  })
  return { count: () => n }
}

const guasti: [string, Guasto][] = [
  ['rete assente (abort)', abort],
  ['404 dopo un nuovo rilascio', risposta404],
]

test.describe('schermo largo', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  for (const [nome, guasto] of guasti) {
    test(`${nome}: messaggio con pulsante, campi e risultati restano`, async ({ page, pvgis, consoleGuard }) => {
      ;(guasto === abort ? ATTESI_ABORT : ATTESI_404).forEach((re) => consoleGuard.allow(re))
      await orologioFermo(page)
      await guasta(page, JS, guasto)
      await avvio(page, pvgis)

      await attendi(page, () => avviso(page).isVisible())
      await expect(avviso(page)).toHaveText(MAP_ERROR_TEXT)
      await expect(ricarica(page)).toBeVisible()
      await expect(page.locator('.leaflet-pane')).toHaveCount(0)
      await expect(page.getByRole('status').filter({ hasText: 'Carico la mappa' })).toHaveCount(0)
      await expect(campo(page, ETICHETTE.lat)).toBeVisible()
      await expect(totale(page)).toContainText('kWh')
    })
  }

  test('file lento che poi fallisce: prima "Carico la mappa…", poi il messaggio al posto dello stato', async ({
    page,
    pvgis,
    consoleGuard,
  }) => {
    ATTESI_ABORT.forEach((re) => consoleGuard.allow(re))
    await orologioFermo(page)
    let sblocca!: () => void
    const cancello = new Promise<void>((resolve) => (sblocca = resolve))
    await page.route(JS, async (route) => {
      await cancello
      await route.abort('internetdisconnected')
    })
    await avvio(page, pvgis)
    await attendi(page, () => page.getByRole('status').filter({ hasText: 'Carico la mappa' }).isVisible())
    await expect(avviso(page)).toHaveCount(0)
    sblocca()
    await attendi(page, () => avviso(page).isVisible())
    await expect(page.getByRole('status').filter({ hasText: 'Carico la mappa' })).toHaveCount(0)
    await expect(totale(page)).toContainText('kWh')
  })

  test('il modulo che lancia durante il disegno dà lo stesso messaggio, il resto funziona', async ({
    page,
    pvgis,
    consoleGuard,
  }) => {
    ATTESI_LANCIA.forEach((re) => consoleGuard.allow(re))
    await orologioFermo(page)
    await guasta(page, JS, lancia)
    await avvio(page, pvgis)
    await attendi(page, () => avviso(page).isVisible())
    await expect(avviso(page)).toHaveText(MAP_ERROR_TEXT)
    await expect(ricarica(page)).toBeVisible()
    await expect(totale(page)).toContainText('kWh')
    await campo(page, ETICHETTE.pannelli).fill('20')
    await expect(totale(page)).toContainText('kWh')
  })

  test('il CSS della mappa che non si carica dà il messaggio, mai una mappa senza stile', async ({
    page,
    pvgis,
    consoleGuard,
  }) => {
    ATTESI_CSS.forEach((re) => consoleGuard.allow(re))
    await orologioFermo(page)
    await guasta(page, CSS, abort)
    await avvio(page, pvgis)
    await attendi(page, () => avviso(page).isVisible())
    await expect(avviso(page)).toHaveText(MAP_ERROR_TEXT)
    await expect(page.locator('.leaflet-pane')).toHaveCount(0)
    await expect(page.locator('.leaflet-container')).toHaveCount(0)
  })

  test('dopo l’errore: una sola richiesta PVGIS dopo 0,8 s, parametri che aggiornano il totale, valori mantenuti', async ({
    page,
    pvgis,
    consoleGuard,
  }) => {
    ATTESI_ABORT.forEach((re) => consoleGuard.allow(re))
    await orologioFermo(page)
    await guasta(page, JS, abort)
    await avvio(page, pvgis)
    await attendi(page, () => avviso(page).isVisible())

    const prima = pvgis.count
    await campo(page, ETICHETTE.lat).fill(MILANO.lat)
    await campo(page, ETICHETTE.lon).fill(MILANO.lon)
    await page.clock.runFor(DEBOUNCE_MS - 1)
    await sincronizza(page)
    expect(pvgis.count).toBe(prima)
    await page.clock.runFor(1)
    await expect.poll(() => pvgis.count).toBe(prima + 1)
    await expect(totale(page)).toContainText('kWh')

    // I parametri dell'impianto non scaricano nulla.
    const totaleTesto = await totale(page).innerText()
    await campo(page, ETICHETTE.pannelli).fill('20')
    await expect.poll(async () => totale(page).innerText()).not.toBe(totaleTesto)
    await page.clock.runFor(DEBOUNCE_MS * 2)
    await sincronizza(page)
    expect(pvgis.count).toBe(prima + 1)

    await expect(campo(page, ETICHETTE.lat)).toHaveValue('45,4642')
    await expect(campo(page, ETICHETTE.lon)).toHaveValue('9,1900')
    await expect(campo(page, ETICHETTE.pannelli)).toHaveValue('20')
    await expect(avviso(page)).toBeVisible()
  })

  test('"Ricarica la pagina" ricarica: la mappa torna e i campi ai valori iniziali', async ({
    page,
    pvgis,
    consoleGuard,
  }) => {
    ATTESI_ABORT.forEach((re) => consoleGuard.allow(re))
    await orologioFermo(page)
    await page.route(JS, abort)
    await avvio(page, pvgis)
    await attendi(page, () => avviso(page).isVisible())
    await campo(page, ETICHETTE.pannelli).fill('20')
    await campo(page, ETICHETTE.lat).fill(MILANO.lat)

    await page.unroute(JS, abort) // il file torna disponibile (il fixture continua a servirlo)
    await Promise.all([page.waitForEvent('load'), ricarica(page).click()])
    await expect(campo(page, ETICHETTE.lat)).toBeVisible()
    await attendi(page, async () => (await page.locator('.leaflet-pane').count()) > 0)
    await expect(avviso(page)).toHaveCount(0)
    await expect(campo(page, ETICHETTE.lat)).toHaveValue(ROMA.lat)
    await expect(campo(page, ETICHETTE.lon)).toHaveValue(ROMA.lon)
    await expect(campo(page, ETICHETTE.pannelli)).toHaveValue('10')
  })

  test('Tab raggiunge il pulsante di ricarica e mostra l’anello di focus', async ({ page, pvgis, consoleGuard }) => {
    ATTESI_ABORT.forEach((re) => consoleGuard.allow(re))
    await orologioFermo(page)
    await guasta(page, JS, abort)
    await avvio(page, pvgis)
    await attendi(page, () => avviso(page).isVisible())

    // Il pulsante precede i campi nell'ordine della pagina? Si preme Tab finché non è a fuoco.
    await page.locator('body').click({ position: { x: 1, y: 1 } })
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab')
      if (await ricarica(page).evaluate((el) => el === document.activeElement)) break
    }
    await expect(ricarica(page)).toBeFocused()
    const outline = await ricarica(page).evaluate((el) => {
      const s = getComputedStyle(el)
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) }
    })
    expect(outline.style).not.toBe('none')
    expect(outline.width).toBeGreaterThanOrEqual(2)
    // Il focus non è stato rubato al caricamento: l'avviso non ha preso il focus da solo.
  })
})

test.describe('telefono', () => {
  test.use({ viewport: { width: 390, height: 800 } })

  test('nessuna richiesta né messaggio prima di "Scegli sulla mappa"; chiudi nasconde, riaprire non riscarica', async ({
    page,
    pvgis,
    consoleGuard,
  }) => {
    ATTESI_ABORT.forEach((re) => consoleGuard.allow(re))
    await orologioFermo(page)
    const file = await guasta(page, JS, abort)
    await avvio(page, pvgis)
    await sincronizza(page)
    expect(file.count()).toBe(0)
    await expect(page.getByText(MAP_ERROR_TEXT)).toHaveCount(0)

    await page.getByRole('button', { name: 'Scegli sulla mappa' }).click()
    await attendi(page, () => avviso(page).isVisible())
    await expect(ricarica(page)).toBeVisible()
    const primoTentativo = file.count()
    expect(primoTentativo).toBeGreaterThanOrEqual(1)
    expect(primoTentativo).toBeLessThanOrEqual(RICHIESTE_PER_TENTATIVO)

    await page.getByRole('button', { name: 'Chiudi la mappa' }).click()
    await expect(avviso(page)).toBeHidden()
    await page.getByRole('button', { name: 'Scegli sulla mappa' }).click()
    await expect(avviso(page)).toBeVisible()
    await sincronizza(page)
    // Riaprire non riscarica: nessuna richiesta in più rispetto al primo tentativo.
    expect(file.count()).toBe(primoTentativo)
  })

  test('nessun scorrimento orizzontale con il messaggio, a 360, 390 e 412 px', async ({ page, pvgis, consoleGuard }) => {
    ATTESI_ABORT.forEach((re) => consoleGuard.allow(re))
    await orologioFermo(page)
    await guasta(page, JS, abort)
    await avvio(page, pvgis)
    await page.getByRole('button', { name: 'Scegli sulla mappa' }).click()
    await attendi(page, () => avviso(page).isVisible())
    for (const width of [360, 390, 412]) {
      await page.setViewportSize({ width, height: 800 })
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(over, `a ${width} px`).toBeLessThanOrEqual(0)
      const box = (await ricarica(page).boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
  })

  test('doppio clic e apri/chiudi rapidi non fanno più di un tentativo di caricamento né errori non dichiarati', async ({
    page,
    pvgis,
    consoleGuard,
  }) => {
    ATTESI_ABORT.forEach((re) => consoleGuard.allow(re))
    await orologioFermo(page)
    const file = await guasta(page, JS, abort)
    await avvio(page, pvgis)
    await page.getByRole('button', { name: 'Scegli sulla mappa' }).dblclick()
    await page.getByRole('button', { name: /sulla mappa|Chiudi la mappa/ }).click()
    await page.getByRole('button', { name: /sulla mappa|Chiudi la mappa/ }).click()
    await page.getByRole('button', { name: 'Scegli sulla mappa' }).click().catch(() => {})
    await attendi(page, () => avviso(page).count().then((n) => n === 1))
    await sincronizza(page)
    // Un solo tentativo di caricamento (1 o 2 richieste, vedi RICHIESTE_PER_TENTATIVO)...
    const dopo = file.count()
    expect(dopo).toBeGreaterThanOrEqual(1)
    expect(dopo).toBeLessThanOrEqual(RICHIESTE_PER_TENTATIVO)
    // ...e nessun nuovo tentativo partito più tardi.
    await page.clock.runFor(2000)
    await sincronizza(page)
    expect(file.count()).toBe(dopo)
  })
})
