import type { Page } from '@playwright/test'
import { PVGIS_ERROR_BODIES, expect, test } from './fixtures'
import { DEBOUNCE_MS, ETICHETTE, MILANO, avvio, campo, impostaPosizione, orologioFermo, totale } from './helpers'

// Errori di PVGIS con i corpi REALI salvati nei fixture (issue #11): mare e fuori copertura
// hanno un testo italiano dedicato; tutto il resto resta il messaggio generico con dettaglio.

const PRECEDENTE = 'I valori mostrati sono quelli della posizione precedente.'
const barra = (page: Page) => page.getByTestId('sticky-total')
const mappa = (page: Page) => page.getByRole('group', { name: /^Mappa: clicca o tocca/ })

async function primoCaricamento(page: Page, pvgis: import('./fixtures').PvgisMock) {
  await page.goto('/')
  await expect(campo(page, ETICHETTE.lat)).toBeVisible()
  await expect
    .poll(async () => {
      await page.clock.runFor(DEBOUNCE_MS)
      return pvgis.count
    })
    .toBe(1)
}

async function vaiA(page: Page, p: { lat: string; lon: string }) {
  await impostaPosizione(page, p.lat, p.lon)
  await page.clock.runFor(DEBOUNCE_MS)
}

test.describe('avviso con i corpi reali di PVGIS', () => {
  test.beforeEach(async ({ page, consoleGuard }) => {
    consoleGuard.allow(/Failed to load resource/)
    await orologioFermo(page)
  })

  test('mare con risultato precedente: testo italiano e frase sulla posizione precedente', async ({ page, pvgis }) => {
    await avvio(page, pvgis)
    const prima = await totale(page).innerText()
    pvgis.failWithBody(400, PVGIS_ERROR_BODIES.sea)
    await vaiA(page, MILANO)
    const avviso = page.getByRole('alert')
    await expect(avviso).toHaveCount(1)
    await expect(avviso).toHaveText(
      `Per il punto scelto non ci sono dati: risulta in mare. Scegli un punto sulla terraferma. ${PRECEDENTE}`,
    )
    await expect(avviso).not.toContainText(/HTTP|Location|sea|PVGIS/)
    expect(await totale(page).innerText()).toBe(prima)
    expect(pvgis.count).toBe(2)
  })

  test('mare senza risultato precedente: nessuna frase sulla posizione precedente', async ({ page, pvgis }) => {
    pvgis.failWithBody(400, PVGIS_ERROR_BODIES.sea)
    await primoCaricamento(page, pvgis)
    const avviso = page.getByRole('alert')
    await expect(avviso).toHaveCount(1)
    await expect(avviso).toHaveText('Per il punto scelto non ci sono dati: risulta in mare. Scegli un punto sulla terraferma.')
    await expect(avviso).not.toContainText('precedente')
    await expect(totale(page)).toHaveCount(0)
  })

  test('fuori copertura: italiano, niente "HTTP 400" né inglese', async ({ page, pvgis }) => {
    await avvio(page, pvgis)
    pvgis.failWithBody(400, PVGIS_ERROR_BODIES.coverage)
    await vaiA(page, MILANO)
    const avviso = page.getByRole('alert')
    await expect(avviso).toHaveCount(1)
    await expect(avviso).toHaveText(
      `Per il punto scelto non ci sono dati: è fuori dalla zona coperta. Scegli un altro punto. ${PRECEDENTE}`,
    )
    await expect(avviso).not.toContainText(/HTTP|400|Location|spatial|coverage|PVGIS/)
  })

  test('testo PVGIS sconosciuto (400): messaggio generico con dettaglio', async ({ page, pvgis }) => {
    await avvio(page, pvgis)
    pvgis.failWithBody(400, '{"message":"lat: Incorrect value. Please, enter a float between -90 and 90.","status":400}')
    await vaiA(page, MILANO)
    const avviso = page.getByRole('alert')
    await expect(avviso).toHaveCount(1)
    await expect(avviso).toContainText('Dati non disponibili per questa posizione.')
    await expect(avviso).toContainText('Incorrect value')
    await expect(avviso).not.toContainText('risulta in mare')
    await expect(avviso).not.toContainText('fuori dalla zona coperta')
  })

  test('5xx con "over the sea": generico, non "mare"', async ({ page, pvgis }) => {
    await avvio(page, pvgis)
    pvgis.failWithBody(500, PVGIS_ERROR_BODIES.sea)
    await vaiA(page, MILANO)
    const avviso = page.getByRole('alert')
    await expect(avviso).toHaveCount(1)
    await expect(avviso).toContainText('Dati non disponibili per questa posizione.')
    await expect(avviso).not.toContainText('risulta in mare')
  })

  test('ritorno dal mare a una posizione valida: avviso sparito e risultato aggiornato', async ({ page, pvgis }) => {
    await avvio(page, pvgis) // Roma
    const roma = await totale(page).innerText()
    pvgis.failWithBody(400, PVGIS_ERROR_BODIES.sea)
    await vaiA(page, { lat: '45,4642', lon: '9,19' })
    await expect(page.getByRole('alert')).toContainText('in mare')
    pvgis.useDefault()
    await vaiA(page, { lat: '45,4650', lon: '9,19' }) // Milano, non in memoria
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(totale(page)).toContainText('kWh')
    await expect.poll(() => totale(page).innerText()).not.toBe(roma)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Risultati' })).toHaveAttribute('aria-busy', 'false')
  })

  test('clic sulla mappa in un punto di mare: messaggio italiano, una sola richiesta in più', async ({ page, pvgis, tiles }) => {
    await avvio(page, pvgis)
    await expect(mappa(page)).toBeVisible()
    await expect.poll(() => tiles.count).toBeGreaterThan(0)
    pvgis.failWithBody(400, PVGIS_ERROR_BODIES.sea)
    const prima = pvgis.count
    const box = (await mappa(page).boundingBox())!
    await page.mouse.click(box.x + box.width / 2 + 60, box.y + box.height / 2 - 40)
    await expect(campo(page, ETICHETTE.lon)).not.toHaveValue('12,4964')
    await page.clock.runFor(DEBOUNCE_MS)
    await expect(page.getByRole('alert')).toHaveCount(1)
    await expect(page.getByRole('alert')).toContainText('risulta in mare')
    await expect(page.getByRole('alert')).toContainText(PRECEDENTE)
    expect(pvgis.count).toBe(prima + 1)
  })
})

test.describe('barra fissa a 360 px', () => {
  test.use({ viewport: { width: 360, height: 740 } })

  for (const tema of ['light', 'dark'] as const) {
    for (const caso of [
      { nome: 'mare', corpo: PVGIS_ERROR_BODIES.sea, testo: 'Punto in mare' },
      { nome: 'fuori copertura', corpo: PVGIS_ERROR_BODIES.coverage, testo: 'Fuori zona coperta' },
    ]) {
      for (const conRisultato of [false, true]) {
        test(`${tema}, ${caso.nome}, ${conRisultato ? 'con' : 'senza'} risultato: una riga, senza tagli`, async ({ page, pvgis, consoleGuard }) => {
          consoleGuard.allow(/Failed to load resource/)
          await page.emulateMedia({ colorScheme: tema })
          await orologioFermo(page)
          if (conRisultato) {
            await avvio(page, pvgis)
            pvgis.failWithBody(400, caso.corpo)
            await vaiA(page, MILANO)
          } else {
            pvgis.failWithBody(400, caso.corpo)
            await primoCaricamento(page, pvgis)
          }
          await expect(barra(page)).toContainText(caso.testo)
          await expect(barra(page)).not.toContainText(/NaN|HTTP|Dati non/)
          const m = await barra(page).evaluate((root) => {
            const nodi = [...root.querySelectorAll<HTMLElement>('*')].filter((e) =>
              [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent!.includes('Punto in mare') || c.textContent!.includes('Fuori zona')),
            )
            const righe = nodi.map((e) => {
              const r = document.createRange()
              r.selectNodeContents(e)
              return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size
            })
            const br = root.getBoundingClientRect()
            const tagliati = [...root.querySelectorAll<HTMLElement>('*')].some((e) => {
              const b = e.getBoundingClientRect()
              return b.width > 0 && (b.right > br.right + 0.5 || b.left < br.left - 0.5)
            })
            return {
              righe, tagliati,
              orizzontale: root.scrollWidth > root.clientWidth,
              pagina: document.documentElement.scrollWidth > document.documentElement.clientWidth,
              h: br.height,
            }
          })
          expect(m.righe.length).toBeGreaterThan(0)
          for (const n of m.righe) expect(n).toBe(1)
          expect(m.tagliati).toBe(false)
          expect(m.orizzontale).toBe(false)
          expect(m.pagina).toBe(false)
          if (conRisultato) await expect(barra(page)).toContainText('kWh')
          else await expect(barra(page)).not.toContainText('kWh')
        })
      }
    }
  }

  test('errori generici: "Dati non aggiornati (errore)" con risultato, "Dati non disponibili" senza', async ({ page, pvgis, consoleGuard }) => {
    consoleGuard.allow(/Failed to load resource/)
    await orologioFermo(page)
    await avvio(page, pvgis)
    pvgis.failWithBody(400, '{"message":"lat: Incorrect value.","status":400}')
    await vaiA(page, MILANO)
    await expect(barra(page)).toContainText('Dati non aggiornati (errore)')
    await expect(barra(page)).toContainText('kWh')
  })

  test('errore generico al primo caricamento: "Dati non disponibili"', async ({ page, pvgis, consoleGuard }) => {
    consoleGuard.allow(/Failed to load resource/)
    await orologioFermo(page)
    pvgis.failWithBody(500, '{"message":"Internal error"}')
    await primoCaricamento(page, pvgis)
    await expect(barra(page)).toContainText('Dati non disponibili')
    await expect(page.getByRole('alert')).toHaveCount(1)
  })

  test('un solo role="alert" con la barra fissa e un errore di mare', async ({ page, pvgis, consoleGuard }) => {
    consoleGuard.allow(/Failed to load resource/)
    await orologioFermo(page)
    pvgis.failWithBody(400, PVGIS_ERROR_BODIES.sea)
    await primoCaricamento(page, pvgis)
    await expect(page.getByRole('alert')).toHaveCount(1)
    await expect(barra(page)).toHaveAttribute('aria-hidden', 'true')
    await expect(page.locator('[aria-live]:not([aria-hidden="true"] *)')).toHaveCount(0)
  })
})

