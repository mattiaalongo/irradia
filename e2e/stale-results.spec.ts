import type { Locator, Page } from '@playwright/test'
import { expect, test, type LookOption, type PvgisMock } from './fixtures'
// Testo approvato dal PO il 14/11/2026 (STALE_LABEL in src/ui/StaleResults.tsx): copiato qui di proposito,
// così un cambio accidentale del testo fa fallire la prova (e tsc non importa il .tsx da e2e/).
const STALE_LABEL = 'Valori della posizione precedente'
import { DEBOUNCE_MS, MILANO, ROMA, avvio, contrasto, impostaPosizione, orologioFermo } from './helpers'

// Risultati "non aggiornati" (issue #42): niente opacità, cornice tratteggiata, etichetta, totale in --plate-mute (ex --muted).
// Si prova in attesa di 0,8 s, download in sospeso ed errore (mare, HTTP 400), in tema chiaro e scuro,
// a 1280 e 360 px; più forced-colors. Tutti i contrasti si calcolano dai colori calcolati dal browser.

// Tutte le cornici «non aggiornato». In A è una sola (totale + grafico insieme); in B sono DUE (#56: una
// attorno al totale, una attorno al grafico, ognuna con la sua etichetta). Le prove valgono per entrambi gli
// aspetti: `look` arriva dall'opzione del progetto (A nel progetto `chromium`, B in `chromium-look-b`).
const blocco = (page: Page): Locator => page.locator('.stale-results')
const nonAggiornati = (page: Page): Locator => page.locator('.stale-results.is-stale')
const numeroBlocchi = (look: LookOption): number => (look === 'b' ? 2 : 1)
const etichetta = (page: Page): Locator => page.getByText(STALE_LABEL, { exact: true })
const SEA = 'Location over the sea. Please, select another location'

type Stato = 'attesa' | 'download' | 'errore'
const STATI: Stato[] = ['attesa', 'download', 'errore']

/** Porta la pagina nello stato non aggiornato richiesto, a partire dal risultato di Roma (già caricato con `avvio`). Restituisce lo sblocco. */
async function vaiANonAggiornato(page: Page, pvgis: PvgisMock, stato: Stato, look: LookOption): Promise<() => void> {
  let release = () => {}
  if (stato === 'errore') pvgis.fail(400, SEA)
  else if (stato === 'download') release = pvgis.hold().release
  await impostaPosizione(page, MILANO.lat, MILANO.lon)
  if (stato !== 'attesa') {
    await page.clock.runFor(DEBOUNCE_MS)
    await expect.poll(() => pvgis.count).toBe(2)
  }
  if (stato === 'errore') await expect(page.getByRole('alert')).toBeVisible()
  await expect(nonAggiornati(page)).toHaveCount(numeroBlocchi(look))
  return release
}

interface Misure {
  opacitaMax: number // minimo dell'opacità cumulativa
  testi: { nome: string; contrasto: number }[]
}

/** Opacità cumulativa e contrasto di ogni testo visibile nel blocco, sui colori calcolati. */
async function misura(page: Page): Promise<Misure> {
  const raw = await page.evaluate(() => {
    const roots = [...document.querySelectorAll('.stale-results')]
    const sfondoEffettivo = (el: Element): string => {
      for (let e: Element | null = el; e; e = e.parentElement) {
        const bg = getComputedStyle(e).backgroundColor
        if (!/rgba?\(.*,\s*0\)$/.test(bg) && bg !== 'transparent') return bg
      }
      return getComputedStyle(document.body).backgroundColor
    }
    const opacita = (el: Element): number => {
      let o = 1
      for (let e: Element | null = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity)
      return o
    }
    const tutti = roots.flatMap((root) => [root, ...root.querySelectorAll('*')])
    const minOp = Math.min(...tutti.map(opacita))
    const testi: { nome: string; fg: string; bg: string }[] = []
    for (const el of tutti) {
      const diretto = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim() !== '')
      if (!diretto) continue
      if (el.getClientRects().length === 0 && !(el instanceof SVGElement)) continue // nascosto (details chiuso)
      const s = getComputedStyle(el)
      if (s.visibility === 'hidden' || s.display === 'none') continue
      const fg = el instanceof SVGElement ? s.fill : s.color
      testi.push({ nome: `${el.tagName.toLowerCase()}.${el.getAttribute('class') ?? ''} "${el.textContent!.trim().slice(0, 25)}"`, fg, bg: sfondoEffettivo(el) })
    }
    return { minOp, testi }
  })
  return {
    opacitaMax: raw.minOp,
    testi: raw.testi.map((t) => ({ nome: t.nome, contrasto: contrasto(t.fg, t.bg) })),
  }
}

const stileBlocco = (page: Page, indice = 0) =>
  blocco(page).nth(indice).evaluate((el) => {
    const s = getComputedStyle(el)
    const sonda = (v: string) => {
      const x = document.createElement('span')
      x.style.color = v
      document.body.append(x)
      const c = getComputedStyle(x).color
      x.remove()
      return c
    }
    return {
      stile: s.borderTopStyle, larghezza: parseFloat(s.borderTopWidth), colore: s.borderTopColor,
      sfondo: getComputedStyle(document.body).backgroundColor, muted: sonda('var(--ink2)'), fg: sonda('var(--ink)'),
    }
  })

const coloreBarre = (page: Page) =>
  page.locator('.chart-bar-fill').first().evaluate((el) => {
    const s = getComputedStyle(el)
    return { fill: s.fill, opacity: s.opacity }
  })

const offsetHero = (page: Page) =>
  page.evaluate(() => {
    const b = document.querySelector('.stale-results')!.getBoundingClientRect()
    const h = document.querySelector('.stale-results .hero')!.getBoundingClientRect()
    return h.top - b.top
  })

for (const colorScheme of ['light', 'dark'] as const) {
  for (const larghezza of [1280, 360]) {
    test.describe(`tema ${colorScheme}, ${larghezza} px`, () => {
      test.beforeEach(async ({ page, consoleGuard }) => {
        consoleGuard.allow(/Failed to load resource/)
        await page.emulateMedia({ colorScheme })
        await page.setViewportSize({ width: larghezza, height: 900 })
        await orologioFermo(page)
      })

      for (const stato of STATI) {
        test(`${stato}: opacità 1, contrasto testi, cornice, barre, etichetta, posizione`, async ({ page, pvgis, look }) => {
          const n = numeroBlocchi(look)
          await avvio(page, pvgis)
          const pronto = { misure: await misura(page), barre: await coloreBarre(page), hero: await offsetHero(page), stile: await stileBlocco(page) }
          expect(pronto.stile.colore, 'pronto: cornice trasparente').toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
          await expect(etichetta(page)).toHaveCount(0)

          const release = await vaiANonAggiornato(page, pvgis, stato, look)
          await expect(etichetta(page)).toHaveCount(n)
          for (let i = 0; i < n; i++) await expect(etichetta(page).nth(i)).toBeVisible()

          // 1. opacità cumulativa
          const m = await misura(page)
          expect(m.opacitaMax, 'opacità cumulativa minima').toBe(1)
          // 2. contrasto di ogni testo (compresi totale grigio ed etichetta)
          expect(m.testi.length).toBeGreaterThan(5)
          for (const t of m.testi) expect(t.contrasto, t.nome).toBeGreaterThanOrEqual(4.5)
          const lab = m.testi.find((t) => t.nome.includes('stale-label'))
          expect(lab, 'etichetta tra i testi controllati').toBeDefined()
          expect(m.testi.find((t) => t.nome.startsWith('p.hero"') || t.nome.includes('hero'))).toBeDefined()
          // 3. barre invariate
          expect(await coloreBarre(page)).toEqual(pronto.barre)
          // 5. cornice
          for (let i = 0; i < n; i++) {
            const st = await stileBlocco(page, i)
            expect(st.stile, `cornice ${i}`).toBe('dashed')
            expect(st.larghezza).toBeGreaterThanOrEqual(2)
            expect(st.colore).toBe(st.muted)
            expect(contrasto(st.colore, st.sfondo), 'cornice/sfondo').toBeGreaterThanOrEqual(3)
          }
          // 6. nessuno spostamento del totale dentro il blocco
          expect(Math.abs((await offsetHero(page)) - pronto.hero)).toBeLessThanOrEqual(1)
          // etichetta: non sovrapposta alla prima riga, dentro la pagina
          const [bl, bh] = await Promise.all([etichetta(page).first().boundingBox(), page.locator('.stale-results .hero-label').boundingBox()])
          expect(bl!.y + bl!.height, 'etichetta sopra la prima riga').toBeLessThanOrEqual(bh!.y + 1)
          expect(bl!.x).toBeGreaterThanOrEqual(0)
          expect(bl!.x + bl!.width).toBeLessThanOrEqual(larghezza)
          // 7. non in regioni live / alert; una sola volta nell'albero di accessibilità
          expect(await etichetta(page).evaluateAll((els) => els.every((el) => !el.closest('[role="alert"],[role="status"],[aria-live]')))).toBe(true)
          expect(((await page.locator('main').ariaSnapshot()).match(new RegExp(STALE_LABEL, 'g')) ?? []).length).toBe(n)

          // ritorno dei dati: cornice trasparente, etichetta sparita
          pvgis.useDefault()
          release()
          if (stato === 'errore') {
            await page.getByLabel('Latitudine (Nord)', { exact: true }).fill(ROMA.lat)
            await page.clock.runFor(DEBOUNCE_MS)
          } else if (stato === 'attesa') {
            await page.clock.runFor(DEBOUNCE_MS)
          }
          await expect(nonAggiornati(page)).toHaveCount(0)
          await expect(etichetta(page)).toHaveCount(0)
          for (let i = 0; i < n; i++) expect((await stileBlocco(page, i)).colore).toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
          expect(Math.abs((await offsetHero(page)) - pronto.hero)).toBeLessThanOrEqual(1)
        })
      }

      test('anello di focus del grafico (Tab) ≥ 3:1 mentre non aggiornato', async ({ page, pvgis, look }) => {
        await avvio(page, pvgis)
        await vaiANonAggiornato(page, pvgis, 'errore', look)
        const prima = page.locator('g.chart-bar[data-month="1"]')
        await page.getByRole('heading', { name: 'Produzione mese per mese (kWh)' }).focus().catch(() => {})
        await prima.focus()
        await page.keyboard.press('Tab')
        const seconda = page.locator('g.chart-bar[data-month="2"]')
        await expect(seconda).toBeFocused()
        const d = await seconda.evaluate((g) => {
          const s = getComputedStyle(g.querySelector('.chart-focus')!)
          return { display: s.display, stroke: s.stroke, w: parseFloat(s.strokeWidth), op: s.opacity, bg: getComputedStyle(document.body).backgroundColor }
        })
        expect(d.display).not.toBe('none')
        expect(d.w).toBeGreaterThanOrEqual(2)
        expect(d.op).toBe('1')
        expect(contrasto(d.stroke, d.bg)).toBeGreaterThanOrEqual(3)
      })
    })
  }
}

test.describe('sezione e barra fissa', () => {
  test('la barra fissa resta aria-hidden e la cornice non compare nell’attesa di un punto in memoria', async ({ page, pvgis }) => {
    await page.setViewportSize({ width: 390, height: 800 })
    await orologioFermo(page)
    await avvio(page, pvgis)
    await expect(page.getByTestId('sticky-total')).toHaveAttribute('aria-hidden', 'true')
    // Milano scaricata, poi ritorno a Roma (in memoria): nessuno stato non aggiornato.
    await impostaPosizione(page, MILANO.lat, MILANO.lon)
    await page.clock.runFor(DEBOUNCE_MS)
    await expect(nonAggiornati(page)).toHaveCount(0)
    await expect.poll(() => pvgis.count).toBe(2)
    await impostaPosizione(page, ROMA.lat, ROMA.lon)
    await expect(nonAggiornati(page)).toHaveCount(0)
    await page.clock.runFor(DEBOUNCE_MS)
    await expect(nonAggiornati(page)).toHaveCount(0)
    expect(pvgis.count).toBe(2)
    await expect(etichetta(page)).toHaveCount(0)
  })
})

test.describe('casi limite', () => {
  test('cambi rapidi di posizione: una sola etichetta per cornice e una sola richiesta dopo l’attesa', async ({ page, pvgis, look }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await impostaPosizione(page, MILANO.lat, MILANO.lon)
    await page.clock.runFor(DEBOUNCE_MS / 2)
    await impostaPosizione(page, '43,5', '10,3')
    await expect(etichetta(page)).toHaveCount(numeroBlocchi(look))
    await page.clock.runFor(DEBOUNCE_MS / 2)
    await expect(etichetta(page)).toHaveCount(numeroBlocchi(look))
    await page.clock.runFor(DEBOUNCE_MS)
    await expect(etichetta(page)).toHaveCount(0)
    expect(pvgis.count).toBe(2)
  })

  test('Riprova: l’etichetta resta durante il tentativo e sparisce al successo', async ({ page, pvgis, consoleGuard, look }) => {
    consoleGuard.allow(/Failed to load resource/)
    await orologioFermo(page)
    await avvio(page, pvgis)
    pvgis.use((route) => route.fulfill({ status: 502, contentType: 'text/plain', body: '' }))
    await impostaPosizione(page, MILANO.lat, MILANO.lon)
    await page.clock.runFor(DEBOUNCE_MS)
    const riprova = page.getByRole('button', { name: 'Riprova' })
    await expect(riprova).toBeVisible()
    await expect(etichetta(page)).toHaveCount(numeroBlocchi(look))
    const rilascio = pvgis.hold()
    await riprova.click()
    await expect.poll(() => pvgis.count).toBe(3)
    await expect(etichetta(page)).toHaveCount(numeroBlocchi(look))
    expect((await misura(page)).opacitaMax).toBe(1)
    rilascio.release()
    await expect(etichetta(page)).toHaveCount(0)
  })

  // Il CSS dell'etichetta è in px: lo zoom del solo testo non la cambia, quindi si prova la larghezza
  // equivalente (reflow WCAG 1.4.10): 320 px e 280 px.
  for (const larghezza of [320, 280]) {
    test(`${larghezza} px: etichetta non sovrapposta alla prima riga e dentro la cornice`, async ({ page, pvgis, consoleGuard, look }) => {
      consoleGuard.allow(/Failed to load resource/)
      await page.setViewportSize({ width: larghezza, height: 800 })
      await orologioFermo(page)
      await avvio(page, pvgis)
      const n = numeroBlocchi(look)
      const larghezzaPronto = await Promise.all(Array.from({ length: n }, (_, i) => blocco(page).nth(i).boundingBox().then((b) => b!.width)))
      await vaiANonAggiornato(page, pvgis, 'download', look)
      // Ogni cornice (una in A, due in B): la sua etichetta sta dentro di essa; la cornice non cambia larghezza.
      for (let i = 0; i < n; i++) {
        const cornice = blocco(page).nth(i)
        const [bl, bb] = await Promise.all([cornice.getByText(STALE_LABEL, { exact: true }).boundingBox(), cornice.boundingBox()])
        expect(bl!.x, `cornice ${i}`).toBeGreaterThanOrEqual(bb!.x)
        expect(bl!.x + bl!.width).toBeLessThanOrEqual(bb!.x + bb!.width)
        expect(bb!.width, 'la cornice non cambia la larghezza del blocco').toBeCloseTo(larghezzaPronto[i], 0)
      }
      // L'etichetta del totale sta sopra la prima riga (`.hero-label`, presente solo nella cornice del totale).
      const [bl0, hl] = await Promise.all([blocco(page).first().getByText(STALE_LABEL, { exact: true }).boundingBox(), page.locator('.stale-results .hero-label').boundingBox()])
      expect(bl0!.y + bl0!.height, 'etichetta sopra la prima riga').toBeLessThanOrEqual(hl!.y + 1)
      // (Lo scorrimento orizzontale a 320 px, prima presente, è corretto dal #54/#56 e provato in impaginazione.spec.ts.)
    })
  }
})

test.describe('forced-colors', () => {
  for (const stato of STATI) {
    test(`${stato}: cornice ancora tratteggiata e visibile, etichetta visibile`, async ({ page, pvgis, consoleGuard, look }) => {
      consoleGuard.allow(/Failed to load resource/)
      await page.emulateMedia({ forcedColors: 'active' })
      await orologioFermo(page)
      await avvio(page, pvgis)
      await vaiANonAggiornato(page, pvgis, stato, look)
      for (let i = 0; i < numeroBlocchi(look); i++) {
        const st = await stileBlocco(page, i)
        expect(st.stile, `cornice ${i}`).toBe('dashed')
        expect(st.larghezza).toBeGreaterThanOrEqual(2)
        expect(st.colore).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
        await expect(etichetta(page).nth(i)).toBeVisible()
      }
      expect((await misura(page)).opacitaMax).toBe(1)
    })
  }
})
