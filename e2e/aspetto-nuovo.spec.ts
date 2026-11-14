import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { DEBOUNCE_MS, ETICHETTE, MILANO, avvio, campo, contrasto, impostaPosizione, orologioFermo, slider, totale } from './helpers'

// Prove "cattive" e di aspetto del nuovo disegno (#56): testo strano nei campi, ridimensionamento, contrasto
// di ogni testo in chiaro e scuro, errore di PVGIS con i nuovi stili, barra fissa scura da 64 px.

/** Contrasto di ogni testo visibile della pagina (HTML e SVG) sul suo sfondo effettivo; restituisce i peggiori. */
async function testiDebili(page: Page, soglia: number): Promise<string[]> {
  const raw = await page.evaluate(() => {
    const sfondo = (el: Element): string => {
      for (let e: Element | null = el; e; e = e.parentElement) {
        const s = getComputedStyle(e)
        if (e instanceof SVGElement && e.tagName === 'svg') continue
        const bg = s.backgroundColor
        if (!/rgba?\(.*,\s*0\)$/.test(bg) && bg !== 'transparent') return bg
        if (s.backgroundImage !== 'none') return 'GRADIENTE'
      }
      return getComputedStyle(document.body).backgroundColor
    }
    const out: { nome: string; fg: string; bg: string }[] = []
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('.leaflet-container')) continue // tessere e controlli di Leaflet: altra prova
      const diretto = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim() !== '')
      if (!diretto) continue
      if (el.getClientRects().length === 0 && !(el instanceof SVGElement)) continue
      const s = getComputedStyle(el)
      if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') continue
      if (el.closest('details:not([open])') && !el.closest('summary')) continue
      const fg = el instanceof SVGElement ? s.fill : s.color
      out.push({ nome: `${el.tagName.toLowerCase()}.${el.getAttribute('class') ?? ''} "${el.textContent!.trim().slice(0, 30)}"`, fg, bg: sfondo(el) })
    }
    return out
  })
  return raw
    .filter((t) => t.bg !== 'GRADIENTE' && t.fg !== 'none')
    .map((t) => ({ n: t.nome, c: contrasto(t.fg, t.bg) }))
    .filter((t) => t.c < soglia)
    .map((t) => `${t.n}: ${t.c.toFixed(2)}`)
}

for (const colorScheme of ['light', 'dark'] as const) {
  for (const larghezza of [1280, 390, 360]) {
    test.describe(`contrasti, tema ${colorScheme}, ${larghezza} px`, () => {
      test('ogni testo della pagina ≥ 4,5:1 sul colore calcolato dal browser', async ({ page, pvgis }) => {
        await page.emulateMedia({ colorScheme })
        await page.setViewportSize({ width: larghezza, height: 900 })
        await orologioFermo(page)
        await avvio(page, pvgis)
        await page.getByText('Come è calcolata la stima').click()
        await page.getByText('Tabella dei valori mensili').click()
        expect(await testiDebili(page, 4.5)).toEqual([])
      })

      test('stato non aggiornato + errore: ancora tutti i testi ≥ 4,5:1', async ({ page, pvgis, consoleGuard }) => {
        consoleGuard.allow(/Failed to load resource/)
        await page.emulateMedia({ colorScheme })
        await page.setViewportSize({ width: larghezza, height: 900 })
        await orologioFermo(page)
        await avvio(page, pvgis)
        pvgis.fail(400, 'Location over the sea. Please, select another location')
        await impostaPosizione(page, MILANO.lat, MILANO.lon)
        await page.clock.runFor(DEBOUNCE_MS)
        await expect(page.getByRole('alert')).toBeVisible()
        expect(await testiDebili(page, 4.5)).toEqual([])
        const m = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }))
        expect(m.s).toBeLessThanOrEqual(m.c)
      })
    })
  }
}

test.describe('barra fissa scura (telefono)', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`altezza 64 px, testo ≥ 4,5:1, non copre l'ultimo contenuto: ${colorScheme}, 360 px`, async ({ page, pvgis }) => {
      await page.emulateMedia({ colorScheme })
      await page.setViewportSize({ width: 360, height: 700 })
      await orologioFermo(page)
      await avvio(page, pvgis)
      const barra = page.getByTestId('sticky-total')
      await expect(barra).toBeVisible()
      const b = (await barra.boundingBox())!
      expect(b.height).toBeGreaterThanOrEqual(63.5)
      expect(b.height).toBeLessThanOrEqual(64.5)
      expect(b.y + b.height).toBeCloseTo(700, 0)
      expect(b.x).toBe(0)
      expect(b.width).toBe(360)
      await expect(barra).toHaveAttribute('aria-hidden', 'true')
      // in fondo alla pagina il piè di pagina resta leggibile sopra la barra
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const f = (await page.locator('footer').boundingBox())!
      expect(f.y + f.height).toBeLessThanOrEqual(b.y + 0.5)
      // testo e sfondo della barra
      const c = await barra.evaluate((el) => {
        const t = [el, ...el.querySelectorAll('*')].filter((n) => [...n.childNodes].some((x) => x.nodeType === 3 && x.textContent!.trim()))
        return { bg: getComputedStyle(el).backgroundColor, fg: t.map((n) => getComputedStyle(n).color) }
      })
      for (const fg of c.fg) expect(contrasto(fg, c.bg)).toBeGreaterThanOrEqual(4.5)
      expect(c.fg.length).toBeGreaterThan(0)
    })
  }

  test('con errore PVGIS la barra mostra lo stato e resta a 64 px', async ({ page, pvgis, consoleGuard }) => {
    consoleGuard.allow(/Failed to load resource/)
    await page.setViewportSize({ width: 320, height: 700 })
    await orologioFermo(page)
    await avvio(page, pvgis)
    pvgis.gatewayError(502)
    await impostaPosizione(page, MILANO.lat, MILANO.lon)
    await page.clock.runFor(DEBOUNCE_MS)
    const barra = page.getByTestId('sticky-total')
    await expect(barra).toContainText('Dati non disponibili ora')
    const b = (await barra.boundingBox())!
    expect(b.height).toBeLessThanOrEqual(64.5)
    expect(await barra.evaluate((n) => n.scrollWidth <= n.clientWidth)).toBe(true)
  })
})

test.describe('testo strano nei campi', () => {
  const STRANI = [
    '', ' ', '   ', '35°', '+35', '-0', '1e1', '0x10', '３５', '١٢٣', '35\n', '\t35', '3 5', '35,0000000000000000001',
    '9'.repeat(500), '0,'.repeat(300), '<b>35</b>', '％', '‮53', '35\u0000', '𝟑𝟓', '😀', 'Infinity', '-Infinity', '٣٥',
  ]

  test('ogni valore strano in ogni campo: nessuna eccezione, nessun NaN, comandi coerenti', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const prima = pvgis.count
    for (const e of Object.values(ETICHETTE)) {
      for (const testo of STRANI) {
        await campo(page, e).fill(testo)
        await expect(page.locator('body')).not.toContainText('NaN')
        // lo slider (se c'è) resta dentro i suoi limiti
        const s = slider(page, e)
        if (await s.count()) {
          const v = Number(await s.inputValue())
          const [min, max] = await s.evaluate((el: HTMLInputElement) => [Number(el.min), Number(el.max)])
          expect(Number.isFinite(v) && v >= min && v <= max, `${e} "${testo.slice(0, 10)}" → ${v}`).toBe(true)
        }
      }
      await campo(page, e).blur()
    }
    // Il testo strano può aver prodotto valori validi (es. "+35"), quindi non si pretende zero richieste per
    // la posizione; ma i campi dei pannelli non ne provocano mai.
    expect(pvgis.count).toBeLessThanOrEqual(prima + 1)
  })

  test('valori stranamente validi non diventano valori impossibili nel motore (tilt/azimut)', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    // "-0" e "0x10" ecc. non devono lasciare "-0" mostrato nel comando o un valore fuori dai limiti
    for (const testo of ['-0', '+90', '90,0', '359,0', '00', '007']) {
      await campo(page, ETICHETTE.azimut).fill(testo)
      await campo(page, ETICHETTE.inclinazione).fill(testo)
      await page.keyboard.press('Tab')
      const t = Number(await slider(page, ETICHETTE.inclinazione).inputValue())
      const a = Number(await slider(page, ETICHETTE.azimut).inputValue())
      expect(t).toBeGreaterThanOrEqual(0)
      expect(t).toBeLessThanOrEqual(90)
      expect(a).toBeGreaterThanOrEqual(0)
      expect(a).toBeLessThanOrEqual(359)
      await expect(page.locator('body')).not.toContainText('NaN')
      await expect(page.locator('body')).not.toContainText('-0°')
    }
  })

  test('incolla (evento paste) di testo con markup nel campo di un comando: viene trattato come testo', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await page.evaluate(() => { (window as unknown as Record<string, unknown>).__xss = 0 })
    const c = campo(page, ETICHETTE.azimut)
    await c.focus()
    await page.keyboard.insertText('<img src=x onerror="window.__xss=1">')
    await expect(c).toHaveAttribute('aria-invalid', 'true')
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__xss)).toBe(0)
    await expect(page.getByRole('alert')).toContainText('numero')
  })
})

test.describe('tastiera rapida e ridimensionamento', () => {
  test('raffica di tasti alternati sui due comandi: valori sempre nei limiti', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const tasti = ['ArrowRight', 'ArrowLeft', 'PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown']
    for (const s of [slider(page, ETICHETTE.inclinazione), slider(page, ETICHETTE.azimut)]) {
      await s.focus()
      for (let i = 0; i < 120; i++) {
        await page.keyboard.press(tasti[(i * 7 + 3) % tasti.length])
        if (i % 20 === 0) {
          const v = Number(await s.inputValue())
          const max = Number(await s.getAttribute('max'))
          expect(v >= 0 && v <= max).toBe(true)
        }
      }
      const v = Number(await s.inputValue())
      await expect(s).toHaveAttribute('aria-valuetext', new RegExp(`^${v}°`))
    }
    await expect(totale(page)).toContainText('kWh')
  })

  test('ridimensionare la finestra durante il trascinamento non produce valori fuori scala', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const s = slider(page, ETICHETTE.azimut)
    await s.scrollIntoViewIfNeeded()
    const b = (await s.locator('xpath=ancestor::div[contains(@class,"dial-control")]').boundingBox())!
    await page.mouse.move(b.x + b.width * 0.8, b.y + b.height * 0.5)
    await page.mouse.down()
    for (const w of [1000, 600, 360, 320, 800, 1280]) {
      await page.setViewportSize({ width: w, height: 800 })
      await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.7)
      const v = Number(await s.inputValue())
      expect(v >= 0 && v <= 359, `${w}: ${v}`).toBe(true)
    }
    await page.mouse.up()
    await expect(page.locator('body')).not.toContainText('NaN')
    const m = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }))
    expect(m.s).toBeLessThanOrEqual(m.c)
  })

  test('il cambio di tema chiaro/scuro con un comando a fuoco mantiene l\'anello e il valore', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await campo(page, ETICHETTE.lon).focus()
    await page.keyboard.press('Tab')
    const t = slider(page, ETICHETTE.inclinazione)
    await expect(t).toBeFocused()
    for (const tema of ['dark', 'light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: tema })
      await expect(t).toBeFocused()
      expect(await t.evaluate((el) => getComputedStyle(el.closest('.dial-control')!.querySelector('.dial-ring')!).display)).not.toBe('none')
      await expect(t).toHaveValue('35')
    }
  })
})

test.describe('PVGIS in errore con i nuovi stili', () => {
  // Un messaggio di 600 caratteri con spazi (il motore ne mostra al massimo 300) e uno senza spazi.
  // Il caso senza spazi è un DIFETTO NOTO di impaginazione, non nuovo del #56 (stesso comportamento prima:
  // né .status né .error hanno overflow-wrap), di gravità bassa perché i messaggi veri di PVGIS hanno spazi.
  const CASI = [
    { nome: 'con spazi', msg: 'parola '.repeat(90), difetto: false },
    { nome: 'senza spazi', msg: 'x'.repeat(600), difetto: true },
  ]
  for (const larghezza of [320, 360]) {
    for (const caso of CASI) {
      const prova = test // il difetto del messaggio senza spazi è stato corretto (overflow-wrap)
      prova(`${larghezza} px: messaggio lungo ${caso.nome} dentro la finestra, comandi ancora usabili`, async ({ page, pvgis, consoleGuard }) => {
        consoleGuard.allow(/Failed to load resource/)
        await page.setViewportSize({ width: larghezza, height: 800 })
        await orologioFermo(page)
        await avvio(page, pvgis)
        pvgis.fail(400, caso.msg)
        await impostaPosizione(page, MILANO.lat, MILANO.lon)
        await page.clock.runFor(DEBOUNCE_MS)
        const avviso = page.getByRole('alert')
        await expect(avviso).toBeVisible()
        const r = (await avviso.boundingBox())!
        expect(r.x).toBeGreaterThanOrEqual(0)
        expect(r.x + r.width).toBeLessThanOrEqual(larghezza)
        const m = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }))
        expect(m.s).toBeLessThanOrEqual(m.c)
        // i comandi dei pannelli funzionano e non provocano richieste
        const n = pvgis.count
        await slider(page, ETICHETTE.inclinazione).focus()
        await page.keyboard.press('End')
        await expect(slider(page, ETICHETTE.inclinazione)).toHaveValue('90')
        await page.clock.runFor(DEBOUNCE_MS * 3)
        expect(pvgis.count).toBe(n)
      })
    }
  }
})
