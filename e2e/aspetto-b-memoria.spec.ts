import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { DEBOUNCE_MS, MILANO, avvio, impostaPosizione, orologioFermo, sincronizza, totale } from './helpers'

// Prove del tester sull'interruttore dell'aspetto (#56 parte 2): memoria, valori ostili, cambi rapidi,
// errori attivi, barriera d'errore. Solo coordinate di città.

const radioA = (page: Page) => page.getByRole('radio', { name: 'Strumento', exact: true })
const radioB = (page: Page) => page.getByRole('radio', { name: 'Giornata di sole', exact: true })
const aspetto = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-look'))
const cornici = (page: Page) => page.getByText('Valori della posizione precedente')
const numero = (page: Page) => totale(page).locator('.hero').textContent()

test.describe('memoria dell\'aspetto', () => {
  test('lettura che lancia (solo getItem): A, nessun errore, il cambio funziona e salva', async ({ page, pvgis }) => {
    await page.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw new DOMException('negato', 'SecurityError')
      }
    })
    await orologioFermo(page)
    await avvio(page, pvgis)
    await expect(radioA(page)).toBeChecked()
    expect(await aspetto(page)).toBe('a')
    await radioB(page).check()
    expect(await aspetto(page)).toBe('b')
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['irradia.look'])
  })

  test('scrittura che lancia (memoria piena): il cambio funziona lo stesso, nessun errore', async ({ page, pvgis }) => {
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException('piena', 'QuotaExceededError')
      }
    })
    await orologioFermo(page)
    await avvio(page, pvgis)
    await radioB(page).check()
    await expect(radioB(page)).toBeChecked()
    expect(await aspetto(page)).toBe('b')
    await radioA(page).check()
    expect(await aspetto(page)).toBe('a')
  })

  test('localStorage null o undefined: A, nessun errore', async ({ page, pvgis }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { configurable: true, get: () => null })
    })
    await orologioFermo(page)
    await avvio(page, pvgis)
    expect(await aspetto(page)).toBe('a')
    await radioB(page).check()
    expect(await aspetto(page)).toBe('b')
  })

  const OSTILI: [string, string][] = [
    ['vuoto', ''],
    ['maiuscola', 'B'],
    ['con spazio dopo', 'b '],
    ['con spazio prima', ' b'],
    ['con carattere nullo', 'b\u0000'],
    ['JSON', '"b"'],
    ['script', '<script>window.__pwned=1</script>'],
    ['attributo che esce dal valore', 'b" onload="window.__pwned=1'],
    ['__proto__', '__proto__'],
    ['numerico', '1'],
    ['esponenziale', '1e3'],
    ['unicode', 'ｂ'],
    ['2 MB di testo', 'b'.repeat(2_000_000)],
  ]
  for (const [nome, valore] of OSTILI) {
    test(`valore ostile in memoria (${nome}): A, niente codice eseguito, nessun errore`, async ({ page, pvgis }) => {
      await page.addInitScript((v) => {
        try {
          localStorage.setItem('irradia.look', v)
        } catch {
          /* memoria piena: la prova diventa "nessun valore", comunque A */
        }
      }, valore)
      await orologioFermo(page)
      await avvio(page, pvgis)
      expect(await aspetto(page)).toBe('a')
      await expect(radioA(page)).toBeChecked()
      expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined()
      expect(await page.evaluate(() => document.documentElement.outerHTML.slice(0, 300))).not.toContain('onload')
    })
  }

  test('«b» valido in memoria: B già applicato al PRIMO disegno (nessun lampo di A)', async ({ page, pvgis }) => {
    await page.addInitScript(() => {
      localStorage.setItem('irradia.look', 'b')
      const w = window as unknown as { __lookAlPrimoDisegno?: string | null }
      const mo = new MutationObserver(() => {
        const root = document.getElementById('root')
        if (root && root.childElementCount > 0 && w.__lookAlPrimoDisegno === undefined) {
          w.__lookAlPrimoDisegno = document.documentElement.getAttribute('data-look')
          mo.disconnect()
        }
      })
      mo.observe(document, { childList: true, subtree: true })
    })
    await orologioFermo(page)
    await avvio(page, pvgis)
    expect(await page.evaluate(() => (window as unknown as { __lookAlPrimoDisegno?: string | null }).__lookAlPrimoDisegno)).toBe('b')
    await expect(radioB(page)).toBeChecked()
  })

  test('sul dispositivo resta SOLO la chiave irradia.look (niente altre chiavi, sessionStorage, cookie)', async ({ page, pvgis, context }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await impostaPosizione(page, MILANO.lat, MILANO.lon)
    await page.clock.runFor(DEBOUNCE_MS)
    await radioB(page).check()
    await radioA(page).check()
    await radioB(page).check()
    await page.getByText('Come è calcolata la stima').click()
    expect(await page.evaluate(() => Object.entries(localStorage))).toEqual([['irradia.look', 'b']])
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0)
    expect(await page.evaluate(() => document.cookie)).toBe('')
    expect(await context.cookies()).toEqual([])
    expect(await page.evaluate(async () => (await indexedDB.databases()).length)).toBe(0)
  })

  test('data-look manomesso: la pagina non si rompe e il radio rimette l\'attributo giusto', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    for (const valore of ['zzz', '', 'B', '"><img src=x onerror=window.__pwned=1>']) {
      await page.evaluate((v) => document.documentElement.setAttribute('data-look', v), valore)
      await radioB(page).check()
      expect(await aspetto(page)).toBe('b')
      await radioA(page).check()
      expect(await aspetto(page)).toBe('a')
    }
    await page.evaluate(() => document.documentElement.removeAttribute('data-look'))
    await radioB(page).check()
    expect(await aspetto(page)).toBe('b')
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined()
  })

  test('clic sul radio già selezionato e su etichetta: nessun effetto collaterale', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const prima = pvgis.count
    await radioA(page).click()
    await page.getByText('Giornata di sole', { exact: true }).click()
    expect(await aspetto(page)).toBe('b')
    await page.getByText('Giornata di sole', { exact: true }).click()
    expect(await aspetto(page)).toBe('b')
    await page.clock.runFor(DEBOUNCE_MS * 2)
    await sincronizza(page)
    expect(pvgis.count).toBe(prima)
  })
})

test.describe('cambi di aspetto durante download, attesa ed errori', () => {
  test('30 cambi rapidi durante l\'attesa di 0,8 s: una sola richiesta, totale corretto, cornici coerenti', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const prima = pvgis.count
    await impostaPosizione(page, MILANO.lat, MILANO.lon)
    await expect(cornici(page)).toHaveCount(1) // A: una cornice
    for (let i = 0; i < 30; i++) {
      await (i % 2 === 0 ? radioB(page) : radioA(page)).check()
    }
    // Dopo 30 cambi (pari) siamo di nuovo in A; una cornice. Passo a B: due.
    await expect(cornici(page)).toHaveCount(1)
    await radioB(page).check()
    await expect(cornici(page)).toHaveCount(2)
    await sincronizza(page)
    expect(pvgis.count).toBe(prima) // il cambio non ha anticipato né raddoppiato la richiesta
    await page.clock.runFor(DEBOUNCE_MS)
    await expect.poll(() => pvgis.count).toBe(prima + 1)
    await expect(cornici(page)).toHaveCount(0)
    await expect(totale(page)).toContainText('kWh')
    await expect(page.getByRole('alert')).toHaveCount(0)
    await page.clock.runFor(DEBOUNCE_MS * 3)
    await sincronizza(page)
    expect(pvgis.count).toBe(prima + 1)
  })

  test('cambi durante il download (richiesta sospesa): stesse cornici, nessuna richiesta in più, poi risultato', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const prima = pvgis.count
    const gate = pvgis.hold()
    await impostaPosizione(page, MILANO.lat, MILANO.lon)
    await page.clock.runFor(DEBOUNCE_MS)
    await expect.poll(() => pvgis.count).toBe(prima + 1)
    await expect(page.getByText('Scarico l\'anno tipo da PVGIS…')).toBeVisible()
    for (let i = 0; i < 10; i++) {
      await radioB(page).check()
      await expect(page.getByText('Scarico l\'anno tipo da PVGIS…')).toHaveCount(1)
      await expect(cornici(page)).toHaveCount(2)
      await radioA(page).check()
      await expect(page.getByText('Scarico l\'anno tipo da PVGIS…')).toHaveCount(1)
      await expect(cornici(page)).toHaveCount(1)
    }
    await radioB(page).check()
    await sincronizza(page)
    expect(pvgis.count).toBe(prima + 1)
    gate.release()
    await expect(cornici(page)).toHaveCount(0)
    await expect(page.getByText('Scarico l\'anno tipo da PVGIS…')).toHaveCount(0)
    await expect(totale(page)).toContainText('kWh')
    expect(pvgis.count).toBe(prima + 1)
  })

  test('errore attivo: il cambio non perde avviso né «Riprova»; doppio clic su «Riprova» in B = una richiesta', async ({ page, pvgis, consoleGuard }) => {
    consoleGuard.allow(/Failed to load resource/)
    await orologioFermo(page)
    await avvio(page, pvgis)
    pvgis.gatewayError(502)
    await impostaPosizione(page, MILANO.lat, MILANO.lon)
    await page.clock.runFor(DEBOUNCE_MS)
    const riprova = page.getByRole('button', { name: 'Riprova', exact: true })
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(riprova).toBeVisible()
    for (const radio of [radioB, radioA, radioB, radioA, radioB]) {
      await radio(page).check()
      await expect(page.getByRole('alert')).toHaveCount(1)
      await expect(riprova).toHaveCount(1)
      await expect(cornici(page)).toHaveCount((await aspetto(page)) === 'b' ? 2 : 1)
    }
    const prima = pvgis.count
    const gate = pvgis.hold()
    await riprova.dblclick()
    await sincronizza(page)
    await expect.poll(() => pvgis.count).toBe(prima + 1)
    await expect(riprova).toHaveAttribute('aria-disabled', 'true')
    // Cambio di aspetto con il tentativo in corso: il pulsante resta e resta disabilitato.
    await radioA(page).check()
    await expect(riprova).toHaveAttribute('aria-disabled', 'true')
    gate.release()
    await expect(riprova).toHaveCount(0)
    expect(pvgis.count).toBe(prima + 1)
    // Il focus NON va sui Risultati: l'utente l'aveva già spostato sul radio (comportamento voluto: lo si
    // sposta solo se il pulsante lo aveva quando sparisce, vedi App.tsx). Il caso con il focus sul pulsante è in aspetto-b.spec.ts.
    await expect(radioA(page)).toBeFocused()
  })

  test('B: errore a primo caricamento (mare) senza risultati: nessuna cornice, messaggio sulla scena', async ({ page, pvgis, consoleGuard }) => {
    consoleGuard.allow(/Failed to load resource/)
    await page.addInitScript(() => localStorage.setItem('irradia.look', 'b'))
    pvgis.fail(400, 'Location over the sea. Please chose another location')
    await orologioFermo(page)
    await page.goto('/')
    await page.clock.runFor(DEBOUNCE_MS)
    await expect(page.getByRole('alert')).toBeVisible()
    expect(await page.getByRole('alert').evaluate((el) => el.closest('.scene') !== null)).toBe(true)
    await expect(cornici(page)).toHaveCount(0)
    await expect(totale(page)).toHaveCount(0)
    await radioA(page).check()
    await expect(page.getByRole('alert')).toHaveCount(1)
  })

  for (const larghezza of [1280, 390]) {
    test(`cambio con la mappa aperta: lo zoom resta (${larghezza} px)`, async ({ page, pvgis, tiles }) => {
      void tiles
      await page.setViewportSize({ width: larghezza, height: 900 })
      await orologioFermo(page)
      await avvio(page, pvgis)
      if (larghezza < 820) {
        await page.getByRole('button', { name: 'Scegli sulla mappa' }).click()
        await expect.poll(async () => {
          await page.clock.runFor(100)
          return page.locator('.leaflet-container').count()
        }).toBe(1)
      }
      const zoom = async () => {
        await page.clock.runFor(600)
        return page.locator('img.leaflet-tile').evaluateAll((imgs) => Math.max(...imgs.map((i) => Number((i as HTMLImageElement).src.split('/')[3]))))
      }
      await page.getByRole('button', { name: 'Ingrandisci' }).first().click()
      await page.getByRole('button', { name: 'Ingrandisci' }).first().click()
      const z0 = await zoom()
      expect(z0).toBeGreaterThanOrEqual(6)
      await page.locator('.leaflet-container').evaluate((el) => ((el as HTMLElement & { probe?: number }).probe = 5))
      await radioB(page).check()
      await radioA(page).check()
      await radioB(page).check()
      await page.clock.runFor(1000)
      expect(await page.locator('.leaflet-container').evaluate((el) => (el as HTMLElement & { probe?: number }).probe)).toBe(5)
      expect(await zoom()).toEqual(z0)
    })
  }

  test('barriera d\'errore di tutta l\'app in B: messaggio leggibile con i colori di B, ricarica torna in B', async ({ page, pvgis, consoleGuard }) => {
    consoleGuard.allow(/./)
    await page.addInitScript(() => localStorage.setItem('irradia.look', 'b'))
    await orologioFermo(page)
    await avvio(page, pvgis)
    // Fa lanciare il disegno: la formattazione dei numeri è usata a ogni render.
    await page.evaluate(() => {
      Number.prototype.toLocaleString = () => {
        throw new Error('rotto apposta')
      }
    })
    await page.getByLabel('Numero di pannelli', { exact: true }).fill('12')
    const avviso = page.getByRole('alert')
    await expect(avviso).toContainText('Qualcosa non ha funzionato')
    const ricarica = page.getByRole('button', { name: 'Ricarica la pagina' })
    await expect(ricarica).toBeVisible()
    expect(await aspetto(page)).toBe('b')
    // Colori: testo del messaggio e del pulsante contro lo sfondo della pagina di B.
    const m = await page.evaluate(() => {
      const bg = getComputedStyle(document.body).backgroundColor
      const p = document.querySelector('.app-error p')!
      const b = document.querySelector('.app-error button')!
      return { bg, p: getComputedStyle(p).color, b: getComputedStyle(b).color, bb: getComputedStyle(b).backgroundColor, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }
    })
    const { contrasto } = await import('./helpers')
    expect(contrasto(m.p, m.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrasto(m.b, /rgba?\(.*,\s*0\)/.test(m.bb) ? m.bg : m.bb)).toBeGreaterThanOrEqual(4.5)
    expect(m.sw).toBeLessThanOrEqual(m.cw)
    await Promise.all([page.waitForEvent('load'), ricarica.click()])
    await expect(page.getByLabel('Numero di pannelli', { exact: true })).toHaveValue('10')
    expect(await aspetto(page)).toBe('b')
    await expect(radioB(page)).toBeChecked()
    void numero
  })
})
