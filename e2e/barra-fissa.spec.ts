import { expect, test } from './fixtures'
import {
  DEBOUNCE_MS, ETICHETTE, MILANO, avvio, campo, impostaPosizione, orologioFermo, totale,
} from './helpers'

// Barra fissa del totale annuo (solo telefono, < 820 px): stati, coerenza col totale
// principale, impaginazione, contrasto, accessibilità. Il selettore data-testid è l'unico
// modo di trovare la barra perché è aria-hidden (fuori dall'albero di accessibilità).

const barra = (page: import('@playwright/test').Page) => page.getByTestId('sticky-total')
const numero = (testo: string) => testo.replace(/[^\d.]/g, '') // "6.498 kWh" -> "6.498"

async function avviaSenzaRisposta(page: import('@playwright/test').Page, pvgis: import('./fixtures').PvgisMock) {
  await page.goto('/')
  await expect(campo(page, ETICHETTE.lat)).toBeVisible()
  await expect
    .poll(async () => {
      await page.clock.runFor(DEBOUNCE_MS)
      return pvgis.count
    })
    .toBe(1)
}

test.describe('stati della barra', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 })
    await orologioFermo(page)
  })

  test('caricamento iniziale: "Scarico i dati da PVGIS…", poi il risultato', async ({ page, pvgis }) => {
    const risposta = pvgis.hold()
    await page.goto('/')
    await expect(barra(page)).toBeVisible()
    await expect(barra(page)).toContainText('Scarico i dati da PVGIS…')
    await expect(barra(page)).not.toContainText('kWh')
    await expect
      .poll(async () => {
        await page.clock.runFor(DEBOUNCE_MS)
        return pvgis.count
      })
      .toBe(1)
    await expect(barra(page)).toContainText('Scarico i dati da PVGIS…')
    risposta.release()
    await expect(barra(page)).toContainText('kWh')
    await expect(barra(page)).toContainText('Produzione stimata in un anno')
    await expect(barra(page)).not.toContainText('Scarico')
  })

  test('cambio posizione con risultato precedente: "Aggiorno…" col vecchio numero, poi il nuovo', async ({ page, pvgis }) => {
    await avvio(page, pvgis)
    const vecchio = numero(await barra(page).innerText())

    const risposta = pvgis.hold()
    await impostaPosizione(page, MILANO.lat, MILANO.lon)
    await page.clock.runFor(DEBOUNCE_MS)
    await expect.poll(() => pvgis.count).toBe(2)
    await expect(barra(page)).toContainText('Aggiorno con i nuovi dati…')
    expect(numero(await barra(page).innerText())).toBe(vecchio)

    risposta.release()
    await expect(barra(page)).toContainText('Produzione stimata in un anno')
    await expect(barra(page)).not.toContainText('Aggiorno')
    expect(numero(await barra(page).innerText())).not.toBe(vecchio)
  })

  test('errore PVGIS al primo caricamento: "Dati non disponibili", senza NaN', async ({ page, pvgis, consoleGuard }) => {
    consoleGuard.allow(/Failed to load resource/)
    pvgis.fail(400, 'Location over the sea. Please, select another location')
    await avviaSenzaRisposta(page, pvgis)
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(barra(page)).toContainText('Dati non disponibili')
    await expect(barra(page)).not.toContainText('kWh')
    await expect(barra(page)).not.toContainText('NaN')
  })

  test('errore dopo un risultato: la barra segue il totale principale (numero identico)', async ({ page, pvgis, consoleGuard }) => {
    consoleGuard.allow(/Failed to load resource/)
    await avvio(page, pvgis)
    const vecchio = numero(await barra(page).innerText())
    pvgis.fail(400, 'Location over the sea')
    await impostaPosizione(page, MILANO.lat, MILANO.lon)
    await page.clock.runFor(DEBOUNCE_MS)
    await expect(page.getByRole('alert')).toBeVisible()
    // Con un risultato precedente l'app lo mostra (attenuato): la barra deve dire lo stesso numero,
    // avvisare che non è aggiornato e non dire "Aggiorno…" (nessun download in corso).
    await expect(barra(page)).toContainText('Dati non aggiornati (errore)')
    await expect(barra(page)).not.toContainText('Aggiorno')
    expect(numero(await barra(page).innerText())).toBe(vecchio)
    await expect(totale(page)).toContainText(`${vecchio} kWh`)
  })
})

test.describe('coerenza col totale principale', () => {
  test('il numero della barra coincide con quello del totale a ogni modifica', async ({ page, pvgis }) => {
    await page.setViewportSize({ width: 390, height: 800 })
    await orologioFermo(page)
    await avvio(page, pvgis)
    const principale = async () => {
      const t = await totale(page).innerText()
      return t.match(/\d{1,3}(?:\.\d{3})*(?= kWh\b)/)?.[0] ?? ''
    }
    const dellaBarra = async () => (await barra(page).innerText()).match(/\d{1,3}(?:\.\d{3})*(?= kWh)/)?.[0] ?? ''
    for (const [etichetta, valore] of [
      [ETICHETTE.pannelli, '37'], [ETICHETTE.potenza, '600'], [ETICHETTE.inclinazione, '10'],
      [ETICHETTE.azimut, '270'], [ETICHETTE.perdite, '3'], [ETICHETTE.pannelli, '1'],
    ] as const) {
      await campo(page, etichetta).fill(valore)
      await expect.poll(dellaBarra).toBe(await principale().then((p) => p || 'x'))
      expect(await dellaBarra()).toBe(await principale())
      expect(await dellaBarra()).not.toBe('')
    }
  })
})

test.describe('impaginazione della barra', () => {
  for (const width of [360, 390, 412]) {
    test(`${width} px: nessuno scorrimento orizzontale, fine pagina non coperta`, async ({ page, pvgis }) => {
      await page.setViewportSize({ width, height: 700 })
      await orologioFermo(page)
      await avvio(page, pvgis)
      await page.getByText('Tabella dei valori mensili').click()
      await expect(barra(page)).toBeVisible()

      const m = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
      expect(m[0]).toBeLessThanOrEqual(m[1])
      const bw = await barra(page).evaluate((n) => n.scrollWidth <= n.clientWidth)
      expect(bw, 'la barra non deve traboccare').toBe(true)

      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const nota = page.getByText(/^Dati: anno meteorologico tipo PVGIS/)
      await expect(nota).toBeInViewport({ ratio: 1 })
      const b = await barra(page).boundingBox()
      const n = await nota.boundingBox()
      expect(n!.y + n!.height, 'ultimo testo sopra la barra').toBeLessThanOrEqual(b!.y)
      // Anche l'ultima riga della tabella dei valori (se non è l'ultimo elemento).
      const ultimaRiga = page.locator('.chart-table tr').last()
      const r = await ultimaRiga.boundingBox()
      expect(r!.y + r!.height).toBeLessThanOrEqual(b!.y)
    })
  }

  test('360 px: stato errore e caricamento senza scorrimento orizzontale', async ({ page, pvgis, consoleGuard }) => {
    consoleGuard.allow(/Failed to load resource/)
    await page.setViewportSize({ width: 360, height: 700 })
    await orologioFermo(page)
    pvgis.fail(400, 'Location over the sea. Please, select another location')
    await avviaSenzaRisposta(page, pvgis)
    await expect(barra(page)).toContainText('Dati non disponibili')
    const m = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
    expect(m[0]).toBeLessThanOrEqual(m[1])
    expect(await barra(page).evaluate((n) => n.scrollWidth <= n.clientWidth)).toBe(true)
  })

  test('il focus da tastiera su un campo in basso non resta coperto', async ({ page, pvgis }) => {
    await page.setViewportSize({ width: 390, height: 600 })
    await orologioFermo(page)
    await avvio(page, pvgis)
    // Tab dall'ultimo campo prima della fine dei parametri fino all'ultimo elemento focalizzabile.
    await campo(page, ETICHETTE.perdite).focus()
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      const focused = page.locator(':focus')
      const f = await focused.boundingBox()
      const b = await barra(page).boundingBox()
      if (f) expect(f.y + f.height, `elemento ${i}`).toBeLessThanOrEqual(b!.y + 0.5)
    }
    // Ultimo elemento focalizzabile della pagina (barre del grafico o sommario della tabella).
    await page.evaluate(() => {
      const els = [...document.querySelectorAll<HTMLElement>('input,summary,[tabindex="0"],button')]
      els.at(-1)!.focus()
    })
    const f = await page.locator(':focus').boundingBox()
    const b = await barra(page).boundingBox()
    expect(f!.y + f!.height).toBeLessThanOrEqual(b!.y + 0.5)
  })

  test('confine della media query: 819 px barra visibile, 820 px nascosta', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await page.setViewportSize({ width: 820, height: 800 })
    await avvio(page, pvgis)
    await expect(barra(page)).toBeHidden()
    await page.setViewportSize({ width: 819, height: 800 })
    await expect(barra(page)).toBeVisible()
    await expect(barra(page)).toBeInViewport({ ratio: 1 })
    const pad = await page.evaluate(() => getComputedStyle(document.querySelector('main')!).paddingBottom)
    expect(parseFloat(pad)).toBeGreaterThanOrEqual(32 + 56)
    await page.setViewportSize({ width: 820, height: 800 })
    await expect(barra(page)).toBeHidden()
    const pad2 = await page.evaluate(() => getComputedStyle(document.querySelector('main')!).paddingBottom)
    expect(parseFloat(pad2)).toBeLessThan(88)
  })
})

// Contrasto WCAG calcolato dai colori effettivi (stessa formula di impaginazione.spec.ts).
function lum(css: string): number {
  const n = css.match(/-?\d*\.?\d+(?:e-?\d+)?/g)!.map(Number)
  const [r, g, b] = css.startsWith('color(srgb') ? n.slice(0, 3).map((x) => x * 255) : n.slice(0, 3)
  const lin = (c: number) => ((c / 255) <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
const rapporto = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

test.describe('contrasto del testo della barra', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    for (const stato of ['risultato', 'aggiorno', 'caricamento', 'errore'] as const) {
      test(`tema ${colorScheme}, stato ${stato}: ≥ 4,5:1`, async ({ page, pvgis, consoleGuard }) => {
        consoleGuard.allow(/Failed to load resource/)
        await page.emulateMedia({ colorScheme })
        await page.setViewportSize({ width: 390, height: 800 })
        await orologioFermo(page)
        if (stato === 'errore') {
          pvgis.fail(400, 'Location over the sea')
          await avviaSenzaRisposta(page, pvgis)
          await expect(barra(page)).toContainText('Dati non disponibili')
        } else if (stato === 'caricamento') {
          pvgis.hold()
          await page.goto('/')
          await expect(barra(page)).toContainText('Scarico i dati da PVGIS…')
        } else {
          await avvio(page, pvgis)
          if (stato === 'aggiorno') {
            pvgis.hold()
            await impostaPosizione(page, MILANO.lat, MILANO.lon)
            await page.clock.runFor(DEBOUNCE_MS)
            await expect(barra(page)).toContainText('Aggiorno con i nuovi dati…')
          }
        }
        const dati = await barra(page).evaluate((root) => {
          const sfondo = getComputedStyle(root).backgroundColor
          const testi = [...root.querySelectorAll<HTMLElement>('*')]
            .filter((e) => [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent!.trim()))
            .map((e) => ({ t: e.textContent!.trim(), colore: getComputedStyle(e).color, op: getComputedStyle(e).opacity }))
          return { sfondo, testi, opRadice: getComputedStyle(root).opacity }
        })
        expect(dati.testi.length).toBeGreaterThan(0)
        expect(Number(dati.opRadice)).toBe(1)
        expect(dati.sfondo).not.toMatch(/rgba\(.*, 0\)$/)
        for (const t of dati.testi) {
          expect(Number(t.op)).toBe(1)
          const c = rapporto(t.colore, dati.sfondo)
          expect(c, `"${t.t}" ${t.colore} su ${dati.sfondo}: ${c.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
        }
      })
    }
  }
})

test.describe('accessibilità della barra', () => {
  test('fuori dall\'albero di accessibilità e senza elementi focalizzabili', async ({ page, pvgis }) => {
    await page.setViewportSize({ width: 390, height: 800 })
    await orologioFermo(page)
    await avvio(page, pvgis)
    await expect(barra(page)).toHaveAttribute('aria-hidden', 'true')
    const focalizzabili = await barra(page).evaluate(
      (n) => n.querySelectorAll('a,button,input,select,textarea,summary,[tabindex]').length,
    )
    expect(focalizzabili).toBe(0)
    // Il testo della barra non è trovabile per ruolo/testo accessibile.
    await expect(page.getByRole('group', { name: 'Produzione stimata in un anno' })).toHaveCount(1)
    const snap = await page.locator('body').ariaSnapshot()
    expect(snap).not.toContain('Aggiorno con i nuovi dati')
    // kWh del totale compare una volta sola per il totale (la barra non ripete il numero).
    const numeroTotale = numero(await barra(page).innerText())
    const occorrenze = snap.split(numeroTotale).length - 1
    expect(occorrenze, `il numero ${numeroTotale} nello snapshot`).toBeLessThanOrEqual(2)
  })

  test('nessun ruolo alert/status nella barra e ordine di Tab invariato', async ({ page, pvgis }) => {
    await page.setViewportSize({ width: 390, height: 800 })
    await orologioFermo(page)
    await avvio(page, pvgis)
    expect(await barra(page).evaluate((n) => n.querySelectorAll('[role],[aria-live]').length)).toBe(0)
    const dentro = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="sticky-total"]')!
      const els = [...document.querySelectorAll<HTMLElement>('input,summary,[tabindex="0"],button,a')]
      return els.some((e) => bar.contains(e))
    })
    expect(dentro).toBe(false)
  })
})
