import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { DEBOUNCE_MS, ETICHETTE, avvio, campo, contrasto, orologioFermo, sincronizza, slider } from './helpers'

// Comandi circolari di inclinazione e orientamento, anteprima del pannello e nuovo aspetto (#56).
// Geometria dei comandi (src/ui/AngleDial.tsx, viewBox 200 x 200): inclinazione = quarto di cerchio con
// centro (24, 176) e raggio 128 (0° a destra, 90° in alto); orientamento = bussola con centro (100, 100)
// e raggio 64 (0° in alto, 90° a destra, 180° in basso). I clic si calcolano da qui, in pixel dello schermo.

const TILT = { cx: 24, cy: 176, r: 128 }
const AZ = { cx: 100, cy: 100, r: 64 }
const RAD = Math.PI / 180

const tilt = (page: Page) => slider(page, ETICHETTE.inclinazione)
const azimut = (page: Page) => slider(page, ETICHETTE.azimut)
const controllo = (s: Locator) => s.locator('xpath=ancestor::div[contains(@class,"dial-control")]')

/** Punto dello schermo che corrisponde a (x, y) in unità del disegno del comando. */
async function schermo(s: Locator, x: number, y: number): Promise<{ x: number; y: number }> {
  await s.scrollIntoViewIfNeeded()
  const b = (await controllo(s).boundingBox())!
  return { x: b.x + (x / 200) * b.width, y: b.y + (y / 200) * b.height }
}
const puntoTilt = (deg: number, r: number) => ({ x: TILT.cx + r * Math.cos(deg * RAD), y: TILT.cy - r * Math.sin(deg * RAD) })
const puntoAz = (deg: number, r: number) => ({ x: AZ.cx + r * Math.sin(deg * RAD), y: AZ.cy - r * Math.cos(deg * RAD) })

async function clic(page: Page, s: Locator, p: { x: number; y: number }): Promise<void> {
  const q = await schermo(s, p.x, p.y)
  await page.mouse.click(q.x, q.y)
}

test.describe('struttura', () => {
  test('esattamente 5 slider: latitudine e longitudine non ne hanno', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await expect(page.getByRole('slider')).toHaveCount(5)
    await expect(slider(page, ETICHETTE.lat)).toHaveCount(0)
    await expect(slider(page, ETICHETTE.lon)).toHaveCount(0)
    await expect(campo(page, ETICHETTE.lat)).toBeVisible()
    await expect(campo(page, ETICHETTE.lon)).toBeVisible()
    for (const e of [ETICHETTE.inclinazione, ETICHETTE.azimut, ETICHETTE.pannelli, ETICHETTE.potenza, ETICHETTE.perdite]) {
      await expect(slider(page, e)).toHaveCount(1)
    }
  })

  test('il disegno dei comandi è nascosto alle tecnologie assistive', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const n = await page.locator('.dial-svg').count()
    expect(n).toBe(2)
    for (const el of await page.locator('.dial-svg').all()) await expect(el).toHaveAttribute('aria-hidden', 'true')
  })

  test('aria-valuetext e aiuti con i valori iniziali', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await expect(tilt(page)).toHaveAttribute('aria-valuetext', '35°')
    await expect(azimut(page)).toHaveAttribute('aria-valuetext', '180°, Sud')
    // I valori min/max nativi dell'input.
    expect(await tilt(page).evaluate((el: HTMLInputElement) => [el.min, el.max, el.step])).toEqual(['0', '90', '1'])
    expect(await azimut(page).evaluate((el: HTMLInputElement) => [el.min, el.max, el.step])).toEqual(['0', '359', '1'])
    await expect(page.getByText('Verso Sud', { exact: true })).toBeVisible()
    await expect(page.getByText('0° = piatti, 90° = verticali', { exact: true })).toBeVisible()
  })
})

test.describe('inclinazione da tastiera', () => {
  test('frecce, Pagina su/giù, Home, Fine, mai fuori da [0, 90]; il campo segue subito', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const s = tilt(page)
    const c = campo(page, ETICHETTE.inclinazione)
    await s.focus()
    const passi: [string, string][] = [
      ['ArrowRight', '36'], ['ArrowUp', '37'], ['ArrowLeft', '36'], ['ArrowDown', '35'],
      ['PageUp', '45'], ['PageUp', '55'], ['PageDown', '45'],
      ['End', '90'], ['ArrowRight', '90'], ['ArrowUp', '90'], ['PageUp', '90'],
      ['Home', '0'], ['ArrowLeft', '0'], ['ArrowDown', '0'], ['PageDown', '0'],
      ['ArrowRight', '1'], ['PageUp', '11'],
    ]
    for (const [tasto, atteso] of passi) {
      await page.keyboard.press(tasto)
      await expect(s, `${tasto}`).toHaveValue(atteso)
      await expect(c, `${tasto}: campo`).toHaveValue(atteso)
    }
    // Pagina su vicino al massimo: limitato a 90, non gira.
    await c.fill('85')
    await page.keyboard.press('PageUp') // il fuoco è nel campo: nessun effetto sul comando
    await s.focus()
    await page.keyboard.press('PageUp')
    await expect(s).toHaveValue('90')
    await c.fill('5')
    await s.focus()
    await page.keyboard.press('PageDown')
    await expect(s).toHaveValue('0')
  })

  test('tastiera rapida: 40 pressioni di freccia in fila (35 + 40 = 75) senza perdere nessun passo', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await tilt(page).focus()
    for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowRight', { delay: 0 })
    await expect(tilt(page)).toHaveValue('75')
    await expect(campo(page, ETICHETTE.inclinazione)).toHaveValue('75')
    for (let i = 0; i < 200; i++) await page.keyboard.press('ArrowRight')
    await expect(tilt(page)).toHaveValue('90')
    await expect(tilt(page)).toHaveAttribute('aria-valuetext', '90°, verticali')
  })

  test('campo → comando: il valore scritto arriva al comando e al testo per i lettori di schermo', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await campo(page, ETICHETTE.inclinazione).fill('0')
    await expect(tilt(page)).toHaveValue('0')
    await expect(tilt(page)).toHaveAttribute('aria-valuetext', '0°, piatti')
    await expect(page.getByText('Piatti', { exact: true })).toBeVisible()
    await campo(page, ETICHETTE.inclinazione).fill('90')
    await expect(tilt(page)).toHaveAttribute('aria-valuetext', '90°, verticali')
    await expect(page.getByText('Verticali', { exact: true })).toBeVisible()
    await campo(page, ETICHETTE.inclinazione).fill('12')
    await expect(tilt(page)).toHaveAttribute('aria-valuetext', '12°')
  })
})

test.describe('orientamento da tastiera', () => {
  test('gira: 359 + destra = 0, 0 + sinistra = 359, 355 + Pagina su = 5; Home 0, Fine 359', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const s = azimut(page)
    const c = campo(page, ETICHETTE.azimut)
    await c.fill('359')
    await s.focus()
    await page.keyboard.press('ArrowRight')
    await expect(s).toHaveValue('0')
    await expect(c).toHaveValue('0')
    await page.keyboard.press('ArrowLeft')
    await expect(s).toHaveValue('359')
    await expect(c).toHaveValue('359')
    await c.fill('355')
    await s.focus()
    await page.keyboard.press('PageUp')
    await expect(s).toHaveValue('5')
    await expect(c).toHaveValue('5')
    await page.keyboard.press('PageDown')
    await expect(s).toHaveValue('355')
    await page.keyboard.press('Home')
    await expect(s).toHaveValue('0')
    await page.keyboard.press('End')
    await expect(s).toHaveValue('359')
    await page.keyboard.press('ArrowDown')
    await expect(s).toHaveValue('358')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await expect(s).toHaveValue('0')
  })

  test('aria-valuetext e aiuto per ogni punto cardinale', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const casi: [string, string, string][] = [
      ['0', '0°, Nord', 'Verso Nord'], ['90', '90°, Est', 'Verso Est'], ['180', '180°, Sud', 'Verso Sud'],
      ['270', '270°, Ovest', 'Verso Ovest'], ['359', '359°, Nord', 'Verso Nord'],
      ['157', '157°, Sud-Est', 'Verso Sud-Est'], ['158', '158°, Sud', 'Verso Sud'],
    ]
    for (const [v, valuetext, aiuto] of casi) {
      await campo(page, ETICHETTE.azimut).fill(v)
      await expect(azimut(page), v).toHaveAttribute('aria-valuetext', valuetext)
      await expect(page.getByText(aiuto, { exact: true }), v).toBeVisible()
    }
  })

  test('l\'aiuto non contiene più "0 = Sud" né convenzioni di PVGIS', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await expect(page.locator('.params')).not.toContainText(/0\s*=\s*Sud|aspect/i)
  })
})

test.describe('puntatore', () => {
  test('clic sulla bussola: in basso → 180, a destra → 90, in alto → 0, a sinistra → 270', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const s = azimut(page)
    const c = campo(page, ETICHETTE.azimut)
    for (const [deg, atteso] of [[90, '90'], [0, '0'], [180, '180'], [270, '270']] as const) {
      // prima altrove, perché un clic che non cambia il valore non provi nulla
      await c.fill(deg === 0 ? '100' : '0')
      await clic(page, s, puntoAz(deg, 50))
      await expect(s, `${deg}°`).toHaveValue(atteso)
      await expect(c).toHaveValue(atteso)
    }
    // Il clic mette anche il fuoco sul comando (tastiera subito utilizzabile).
    await expect(s).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(s).toHaveValue('271')
  })

  test('clic sull\'arco dell\'inclinazione: 45° → 45 ± 1, 0 e 90 agli estremi', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const s = tilt(page)
    await clic(page, s, puntoTilt(45, 100))
    expect(Math.abs(Number(await s.inputValue()) - 45)).toBeLessThanOrEqual(1)
    await clic(page, s, puntoTilt(0, 100))
    await expect(s).toHaveValue('0')
    await clic(page, s, puntoTilt(90, 100))
    await expect(s).toHaveValue('90')
    // Fuori dal quarto di cerchio ma sul lato giusto degli assi: resta nei limiti
    await clic(page, s, { x: 190, y: 190 }) // in basso a destra → 0
    await expect(s).toHaveValue('0')
    await clic(page, s, { x: 5, y: 5 }) // in alto a sinistra → 90
    await expect(s).toHaveValue('90')
  })

  test('clic al centro (zona morta): il valore non cambia e non diventa NaN', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await clic(page, azimut(page), { x: AZ.cx, y: AZ.cy })
    await expect(azimut(page)).toHaveValue('180')
    await clic(page, tilt(page), { x: TILT.cx, y: TILT.cy })
    await expect(tilt(page)).toHaveValue('35')
    await expect(page.locator('body')).not.toContainText('NaN')
  })

  test('trascinamento sulla bussola attraverso Nord: nessun salto (359 ↔ 0 è un passo da 1°)', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const s = azimut(page)
    const p0 = await schermo(s, puntoAz(350, 50).x, puntoAz(350, 50).y)
    await page.mouse.move(p0.x, p0.y)
    await page.mouse.down()
    const visti: number[] = [Number(await s.inputValue())]
    for (let a = 350; a <= 370; a += 2) {
      const p = puntoAz(a, 50)
      const q = await schermo(s, p.x, p.y)
      await page.mouse.move(q.x, q.y)
      visti.push(Number(await s.inputValue()))
    }
    await page.mouse.up()
    for (let i = 1; i < visti.length; i++) {
      const d = Math.abs(visti[i] - visti[i - 1])
      expect(Math.min(d, 360 - d), `passo ${i}: ${visti.join(',')}`).toBeLessThanOrEqual(4)
    }
    expect(visti.at(-1)).toBe(10)
    // Dopo il rilascio, muovere il mouse non cambia più il valore.
    await page.mouse.move(p0.x, p0.y)
    expect(Number(await s.inputValue())).toBe(10)
  })

  test('trascinamento dell\'inclinazione nel quadrante opposto: il valore non salta da un estremo all\'altro', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    for (const [partenza, estremo] of [[80, 90], [10, 0]] as const) {
      const s = tilt(page)
      await campo(page, ETICHETTE.inclinazione).fill(String(partenza))
      const a = puntoTilt(partenza, 100)
      const p = await schermo(s, a.x, a.y)
      await page.mouse.move(p.x, p.y)
      await page.mouse.down()
      // Percorso: dal punto di partenza verso il quadrante in basso a sinistra (θ da -100° a -170° rispetto al centro),
      // passando dal lato dell'estremo di partenza.
      const traiettoria: number[] = partenza >= 45
        ? [100, 120, 140, 160, 175, 190, 205, 220, 235, 250]
        : [-10, -30, -60, -80]
      const nelOpposto: number[] = []
      for (const th of traiettoria) {
        const q = await schermo(s, TILT.cx + 90 * Math.cos(th * RAD), TILT.cy - 90 * Math.sin(th * RAD))
        await page.mouse.move(q.x, q.y)
        const v = Number(await s.inputValue())
        const norm = ((th + 180) % 360 + 360) % 360 - 180 // -180..180
        if (norm < -90 && norm > -180) nelOpposto.push(v)
        if (norm > 90 || norm < -90) expect(v, `θ=${th}`).toBe(estremo)
      }
      await page.mouse.up()
      if (partenza >= 45) expect(nelOpposto.length).toBeGreaterThan(2)
      expect(new Set(nelOpposto).size, `quadrante opposto costante: ${nelOpposto}`).toBeLessThanOrEqual(1)
      await expect(s).toHaveValue(/^\d+$/)
    }
  })

  test('trascinamento fuori dal comando (con cattura del puntatore) continua a funzionare e si ferma al rilascio', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const s = azimut(page)
    const a = await schermo(s, puntoAz(90, 50).x, puntoAz(90, 50).y)
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    await page.mouse.move(a.x + 600, a.y + 0) // molto a destra, fuori dal comando
    await expect(s).toHaveValue('90')
    const centro = await schermo(s, AZ.cx, AZ.cy)
    await page.mouse.move(centro.x, a.y + 400, { steps: 5 }) // molto in basso, sulla verticale del centro
    await expect(s).toHaveValue('180')
    await page.mouse.up()
    await page.mouse.move(a.x + 300, a.y - 300)
    await expect(s).toHaveValue('180')
  })

  test('il tasto destro del mouse non cambia il valore', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const p = await schermo(azimut(page), puntoAz(90, 50).x, puntoAz(90, 50).y)
    await page.mouse.click(p.x, p.y, { button: 'right' })
    await expect(azimut(page)).toHaveValue('180')
  })
})

test.describe('nessuna richiesta a PVGIS dai parametri dei pannelli', () => {
  test('comandi, campi e orologio che avanza di 5 × 0,8 s: nessuna richiesta in più', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const prima = pvgis.count
    await tilt(page).focus()
    for (const k of ['ArrowRight', 'PageUp', 'End', 'Home']) await page.keyboard.press(k)
    await azimut(page).focus()
    for (const k of ['ArrowLeft', 'PageDown', 'End', 'ArrowRight']) await page.keyboard.press(k)
    await clic(page, azimut(page), puntoAz(90, 50))
    await clic(page, tilt(page), puntoTilt(45, 100))
    await campo(page, ETICHETTE.inclinazione).fill('20')
    await campo(page, ETICHETTE.azimut).fill('270')
    await campo(page, ETICHETTE.pannelli).fill('12')
    await campo(page, ETICHETTE.potenza).fill('500')
    await campo(page, ETICHETTE.perdite).fill('9,5')
    await slider(page, ETICHETTE.pannelli).press('ArrowRight')
    for (let i = 0; i < 5; i++) await page.clock.runFor(DEBOUNCE_MS)
    await sincronizza(page)
    expect(pvgis.count).toBe(prima)
  })

  test('la produzione cambia davvero con l\'orientamento (Sud > Nord) e senza NaN', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const leggi = async () => Number((await page.locator('.hero').first().innerText()).replace(/[^\d]/g, ''))
    const sud = await leggi()
    await azimut(page).focus()
    await page.keyboard.press('Home') // Nord
    await expect.poll(leggi).toBeLessThan(sud)
    await expect(page.locator('body')).not.toContainText('NaN')
  })
})

test.describe('anello di focus', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`Tab sui due comandi: anello visibile, contrasto ≥ 3:1, tema ${colorScheme}`, async ({ page, pvgis }) => {
      await page.emulateMedia({ colorScheme })
      await orologioFermo(page)
      await avvio(page, pvgis)
      const misura = (s: Locator) =>
        s.evaluate((el) => {
          const box = el.closest('.dial-control')!
          const ring = getComputedStyle(box.querySelector('.dial-ring')!)
          const halo = getComputedStyle(box.querySelector('.dial-ring-halo')!)
          const face = getComputedStyle(box.querySelector('.dial-face')!)
          const dialBox = getComputedStyle(el.closest('.dial-box')!)
          return {
            ringDisplay: ring.display, ringW: parseFloat(ring.strokeWidth), ring: ring.stroke,
            haloDisplay: halo.display, halo: halo.stroke, face: face.fill, boxBg: dialBox.backgroundColor,
            outline: getComputedStyle(el).outlineStyle,
          }
        })
      // senza fuoco: anello nascosto
      for (const s of [tilt(page), azimut(page)]) expect((await misura(s)).ringDisplay).toBe('none')
      await campo(page, ETICHETTE.lon).focus()
      await page.keyboard.press('Tab')
      await expect(tilt(page)).toBeFocused()
      let m = await misura(tilt(page))
      expect(m.ringDisplay).not.toBe('none')
      expect(m.ringW).toBeGreaterThanOrEqual(2)
      expect(contrasto(m.ring, m.halo), 'anello/alone').toBeGreaterThanOrEqual(3)
      expect(contrasto(m.ring, m.face), 'anello/quadrante').toBeGreaterThanOrEqual(3)
      expect(contrasto(m.ring, m.boxBg), 'anello/fondo').toBeGreaterThanOrEqual(3)
      await page.keyboard.press('Tab') // campo dell'inclinazione
      await page.keyboard.press('Tab') // bussola
      await expect(azimut(page)).toBeFocused()
      m = await misura(azimut(page))
      expect(m.ringDisplay).not.toBe('none')
      expect(contrasto(m.ring, m.halo), 'anello/alone').toBeGreaterThanOrEqual(3)
      expect(contrasto(m.ring, m.face), 'anello/quadrante').toBeGreaterThanOrEqual(3)
      // il primo non mostra più l'anello
      expect((await misura(tilt(page))).ringDisplay).toBe('none')
    })

    test(`graduazioni, cursore e lettere: contrasto grafico ≥ 3:1 (testi ≥ 4,5:1), tema ${colorScheme}`, async ({ page, pvgis }) => {
      await page.emulateMedia({ colorScheme })
      await orologioFermo(page)
      await avvio(page, pvgis)
      const d = await page.evaluate(() => {
        const pick = (sel: string, prop: 'stroke' | 'fill') => getComputedStyle(document.querySelector(sel)!)[prop]
        return {
          face: pick('.angle-dial-azimuth .dial-face', 'fill'),
          ticks: pick('.angle-dial-azimuth .dial-ticks', 'stroke'),
          arc: pick('.angle-dial-azimuth .dial-arc', 'stroke'),
          needle: pick('.angle-dial-azimuth .dial-needle', 'stroke'),
          letter: pick('.angle-dial-azimuth .dial-letter', 'fill'),
          num: pick('.angle-dial-azimuth .dial-num', 'fill'),
          handle: pick('.angle-dial-azimuth .dial-handle', 'fill'),
          dot: pick('.angle-dial-azimuth .dial-handle-dot', 'fill'),
          sweep: pick('.angle-dial-tilt .dial-sweep', 'stroke'),
          tiltNum: pick('.angle-dial-tilt .dial-num', 'fill'),
          tiltFace: pick('.angle-dial-tilt .dial-face', 'fill'),
        }
      })
      expect(contrasto(d.ticks, d.face), 'tacche').toBeGreaterThanOrEqual(3)
      expect(contrasto(d.arc, d.face), 'bordo').toBeGreaterThanOrEqual(3)
      expect(contrasto(d.needle, d.face), 'lancetta').toBeGreaterThanOrEqual(3)
      expect(contrasto(d.handle, d.face), 'cursore').toBeGreaterThanOrEqual(3)
      expect(contrasto(d.sweep, d.tiltFace), 'arco attivo').toBeGreaterThanOrEqual(3)
      expect(contrasto(d.dot, d.handle), 'punto sul cursore').toBeGreaterThanOrEqual(3)
      expect(contrasto(d.letter, d.face), 'lettere N E S O').toBeGreaterThanOrEqual(4.5)
      expect(contrasto(d.num, d.face), 'numeri').toBeGreaterThanOrEqual(4.5)
      expect(contrasto(d.tiltNum, d.tiltFace), 'numeri dell\'inclinazione').toBeGreaterThanOrEqual(4.5)
    })
  }
})

test.describe('touch-action', () => {
  for (const larghezza of [1280, 360]) {
    test(`solo il comando ha touch-action none (${larghezza} px); fuori dal comando si scorre`, async ({ page, pvgis }) => {
      await page.setViewportSize({ width: larghezza, height: 800 })
      await orologioFermo(page)
      await avvio(page, pvgis)
      const r = await page.evaluate(() => {
        const comandi = [...document.querySelectorAll('.dial-control')]
        const altri = [...document.querySelectorAll('body *')].filter(
          (el) => !el.closest('.dial-control') && !el.closest('.leaflet-container'),
        )
        const conNone = altri.filter((el) => getComputedStyle(el).touchAction === 'none').map((el) => el.className.toString() || el.tagName)
        // elementi dentro .dial-control che bloccano: devono essere il comando e il suo input
        const dentro = comandi.map((c) => getComputedStyle(c).touchAction)
        const input = [...document.querySelectorAll('.dial-input')].map((c) => getComputedStyle(c).touchAction)
        // il bordo del riquadro (padding) e i campi accanto non bloccano
        const box = [...document.querySelectorAll('.dial-box')].map((c) => getComputedStyle(c).touchAction)
        const campi = [...document.querySelectorAll('.dial-box ~ *, .angle-dial input[type="text"]')].map((c) => getComputedStyle(c).touchAction)
        return { conNone, dentro, input, box, campi, html: getComputedStyle(document.documentElement).touchAction, body: getComputedStyle(document.body).touchAction }
      })
      expect(r.conNone).toEqual([])
      expect(r.dentro).toEqual(['none', 'none'])
      expect(r.input).toEqual(['none', 'none'])
      expect(r.box.every((v) => v !== 'none')).toBe(true)
      expect(r.campi.every((v) => v !== 'none')).toBe(true)
      expect(r.html).not.toBe('none')
      expect(r.body).not.toBe('none')
    })
  }

  test('360 px: un punto subito fuori dal comando (nel riquadro, a lato e sopra) non è bloccato', async ({ page, pvgis }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await orologioFermo(page)
    await avvio(page, pvgis)
    for (const s of [tilt(page), azimut(page)]) {
      await s.scrollIntoViewIfNeeded()
      const c = (await controllo(s).boundingBox())!
      const pagina = await page.evaluate(() => window.innerWidth)
      // a sinistra del comando (margine del riquadro) se c'è spazio, altrimenti al di sopra
      const punti = [
        { x: c.x - 3, y: c.y + c.height / 2 },
        { x: c.x + c.width / 2, y: c.y - 3 },
        { x: c.x + c.width / 2, y: c.y + c.height + 3 },
      ].filter((p) => p.x > 0 && p.x < pagina && p.y > 0)
      expect(punti.length).toBeGreaterThan(0)
      for (const p of punti) {
        const bloccato = await page.evaluate(({ x, y }) => {
          for (let e = document.elementFromPoint(x, y); e; e = e.parentElement) {
            if (getComputedStyle(e).touchAction === 'none') return (e.className.toString() || e.tagName)
          }
          return null
        }, p)
        expect(bloccato, `punto ${p.x},${p.y}`).toBeNull()
      }
    }
  })

  test('360 px: scorrere la pagina con un gesto che parte da fuori dal comando cambia la posizione di scorrimento, non il valore', async ({ page, pvgis }) => {
    await page.setViewportSize({ width: 360, height: 700 })
    await orologioFermo(page)
    await avvio(page, pvgis)
    await azimut(page).scrollIntoViewIfNeeded()
    const prima = await azimut(page).inputValue()
    await page.mouse.move(180, 650)
    await page.mouse.wheel(0, 300)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
    expect(await azimut(page).inputValue()).toBe(prima)
  })
})

test.describe('tocco', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 800 } })

  // Difetto trovato e corretto nella PR del #56: lo slider nativo trasparente gestiva il tocco per conto suo e, dopo il
  // pointerdown che impostava il valore giusto, emetteva un `input` calcolato dalla sola x (tocco a Est: 281 invece di 90).
  test('un tocco sul comando imposta il valore; un tocco subito fuori non lo cambia', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const s = azimut(page)
    const p = await schermo(s, puntoAz(90, 50).x, puntoAz(90, 50).y)
    await page.touchscreen.tap(p.x, p.y)
    await expect(s).toHaveValue('90')
    const t = await schermo(tilt(page), puntoTilt(30, 100).x, puntoTilt(30, 100).y)
    await page.touchscreen.tap(t.x, t.y)
    expect(Math.abs(Number(await tilt(page).inputValue()) - 30)).toBeLessThanOrEqual(1)
    const c = (await controllo(s).boundingBox())!
    await page.touchscreen.tap(c.x + c.width / 2, c.y + c.height + 3) // fuori dal comando (riquadro/spazio sotto)
    await expect(s).toHaveValue('90')
  })
})

test.describe('tocco che parte fuori dal comando (#58)', () => {
  test.use({ hasTouch: true, viewport: { width: 360, height: 700 } })

  // Difetto #58: un dito che partiva ~4 px sotto il comando e saliva dentro di esso lasciava attivo il trascinamento
  // nativo dello slider trasparente (valore dalla sola x: 180 a metà larghezza) e bloccava lo scorrimento della pagina.
  // Il gesto si simula con il protocollo di Chromium (CDP), perché `page.touchscreen` sa solo toccare, non trascinare.
  for (const distanza of [2, 4, 8]) {
    test(`dito ${distanza} px sotto l'orientamento che sale di 8 × 5 px: il valore non cambia`, async ({ page, pvgis }) => {
      await orologioFermo(page)
      await avvio(page, pvgis)
      const c = campo(page, ETICHETTE.azimut)
      await c.fill('201')
      await c.blur()
      const s = azimut(page)
      await expect(s).toHaveValue('201')
      await s.scrollIntoViewIfNeeded()
      const b = (await controllo(s).boundingBox())!
      const x = b.x + b.width / 2
      let y = b.y + b.height + distanza
      const cdp = await page.context().newCDPSession(page)
      const tocco = (type: 'touchStart' | 'touchMove' | 'touchEnd', punti: { x: number; y: number }[]) =>
        cdp.send('Input.dispatchTouchEvent', { type, touchPoints: punti })
      await tocco('touchStart', [{ x, y }])
      for (let i = 0; i < 8; i++) {
        y -= 5
        await tocco('touchMove', [{ x, y }])
      }
      await tocco('touchEnd', [])
      await expect(s).toHaveValue('201')
      await expect(c).toHaveValue('201')
    })
  }
})

test.describe('anteprima del pannello', () => {
  const anteprima = (page: Page) => page.locator('.panel-preview svg')

  test('aria-hidden; faccia "back" con 0°/60°, "front" con 180°/35°', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await expect(anteprima(page)).toHaveAttribute('aria-hidden', 'true')
    await expect(anteprima(page)).toHaveAttribute('data-face', 'front')
    await campo(page, ETICHETTE.azimut).fill('0')
    await campo(page, ETICHETTE.inclinazione).fill('60')
    await expect(anteprima(page)).toHaveAttribute('data-face', 'back')
    await campo(page, ETICHETTE.azimut).fill('180')
    await campo(page, ETICHETTE.inclinazione).fill('35')
    await expect(anteprima(page)).toHaveAttribute('data-face', 'front')
    // Nessun elemento dell'anteprima è raggiungibile con Tab né espone un ruolo.
    expect(await anteprima(page).evaluate((s) => s.querySelectorAll('[tabindex],a,button,[role]').length)).toBe(0)
    expect(await page.locator('.panel-preview').getByRole('img').count()).toBe(0)
  })

  test('la tastiera sul comando aggiorna l\'anteprima (valore immediato)', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await azimut(page).focus()
    await page.keyboard.press('Home') // Nord, il pannello guarda a Nord
    await tilt(page).focus()
    await page.keyboard.press('PageUp')
    await page.keyboard.press('PageUp') // 55°
    await page.keyboard.press('PageUp') // 65°
    await expect(anteprima(page)).toHaveAttribute('data-face', 'back')
    await expect(page.locator('.pp-side-label')).toHaveText('65°')
  })

  test('nessun NaN, Infinity o undefined negli attributi per tutte le combinazioni estreme', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const azimuts = ['0', '1', '44', '45', '89', '90', '135', '179', '180', '181', '225', '270', '315', '358', '359']
    const tilts = ['0', '1', '10', '35', '60', '89', '90']
    for (const az of azimuts) {
      await campo(page, ETICHETTE.azimut).fill(az)
      for (const t of tilts) {
        await campo(page, ETICHETTE.inclinazione).fill(t)
        await expect(tilt(page)).toHaveValue(t)
        const brutti = await anteprima(page).evaluate((svg) => {
          const out: string[] = []
          for (const el of [svg, ...svg.querySelectorAll('*')]) {
            for (const a of el.attributes) if (/NaN|Infinity|undefined|null/.test(a.value)) out.push(`${el.tagName}.${a.name}=${a.value.slice(0, 40)}`)
            if (el.tagName === 'text' && /NaN|undefined/.test(el.textContent ?? '')) out.push('text')
          }
          return out
        })
        expect(brutti, `az ${az}, inclinazione ${t}`).toEqual([])
        const face = await anteprima(page).getAttribute('data-face')
        expect(['front', 'back']).toContain(face)
      }
    }
  })
})

test.describe('aspetto e rete', () => {
  test('nessuna richiesta fuori dall\'origine dell\'app (salvo tessere OSM simulate): i caratteri sono locali', async ({ page, pvgis }) => {
    const richieste: string[] = []
    page.on('request', (r) => richieste.push(r.url()))
    await orologioFermo(page)
    await avvio(page, pvgis)
    await page.evaluate(() => document.fonts.ready)
    const origine = new URL(page.url()).origin
    const esterne = richieste.filter((u) => !u.startsWith(origine) && !u.startsWith('data:') && !u.startsWith('blob:'))
    expect(esterne.filter((u) => !u.startsWith('https://tile.openstreetmap.org/'))).toEqual([])
    expect(richieste.some((u) => /fonts\.(googleapis|gstatic)\.com/.test(u))).toBe(false)
    // I caratteri Barlow sono caricati dalla stessa origine.
    expect(richieste.some((u) => u.startsWith(origine) && u.endsWith('.woff2'))).toBe(true)
    expect(await page.evaluate(() => document.fonts.check('16px Barlow'))).toBe(true)
  })

  for (const larghezza of [320, 360, 390, 412, 1280]) {
    test(`${larghezza} px: nessuno scorrimento orizzontale con i comandi e con valori estremi`, async ({ page, pvgis }) => {
      await page.setViewportSize({ width: larghezza, height: 800 })
      await orologioFermo(page)
      await avvio(page, pvgis)
      await campo(page, ETICHETTE.azimut).fill('359')
      await campo(page, ETICHETTE.inclinazione).fill('90')
      await campo(page, ETICHETTE.pannelli).fill('50')
      const m = await page.evaluate(() => ({
        html: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
        body: [document.body.scrollWidth, document.body.clientWidth],
      }))
      expect(m.html[0]).toBeLessThanOrEqual(m.html[1])
      expect(m.body[0]).toBeLessThanOrEqual(m.body[1])
      // i comandi stanno interamente dentro la finestra
      for (const s of [tilt(page), azimut(page)]) {
        const b = (await controllo(s).boundingBox())!
        expect(b.x).toBeGreaterThanOrEqual(0)
        expect(b.x + b.width).toBeLessThanOrEqual(larghezza)
        expect(b.width).toBeGreaterThanOrEqual(120)
      }
      const a = (await page.locator('.panel-preview').boundingBox())!
      expect(a.x + a.width).toBeLessThanOrEqual(larghezza)
    })
  }

  test('forced-colors: il comando resta visibile con i colori di sistema', async ({ page, pvgis }) => {
    await page.emulateMedia({ forcedColors: 'active' })
    await orologioFermo(page)
    await avvio(page, pvgis)
    const d = await page.evaluate(() => {
      const g = (sel: string, prop: 'stroke' | 'fill') => getComputedStyle(document.querySelector(sel)!)[prop]
      return {
        canvas: getComputedStyle(document.body).backgroundColor,
        text: getComputedStyle(document.body).color,
        face: g('.angle-dial-azimuth .dial-face', 'fill'),
        ticks: g('.angle-dial-azimuth .dial-ticks', 'stroke'),
        arc: g('.angle-dial-azimuth .dial-arc', 'stroke'),
        needle: g('.angle-dial-azimuth .dial-needle', 'stroke'),
        letter: g('.angle-dial-azimuth .dial-letter', 'fill'),
        num: g('.angle-dial-azimuth .dial-num', 'fill'),
        handle: g('.angle-dial-azimuth .dial-handle', 'fill'),
        dot: g('.angle-dial-azimuth .dial-handle-dot', 'fill'),
        sweep: g('.angle-dial-tilt .dial-sweep', 'stroke'),
        axes: g('.angle-dial-tilt .dial-axes', 'stroke'),
        tiltTicks: g('.angle-dial-tilt .dial-ticks', 'stroke'),
      }
    })
    for (const k of ['ticks', 'arc', 'needle', 'letter', 'num', 'tiltTicks', 'axes'] as const) {
      expect(d[k], k).not.toBe('none')
      expect(contrasto(d[k], d.face), `${k} su sfondo del quadrante`).toBeGreaterThanOrEqual(3)
    }
    expect(d.handle).not.toBe('none')
    expect(contrasto(d.handle, d.face), 'cursore').toBeGreaterThanOrEqual(3)
    expect(contrasto(d.dot, d.handle), 'punto sul cursore').toBeGreaterThanOrEqual(3)
    expect(contrasto(d.sweep, d.face), 'arco attivo').toBeGreaterThanOrEqual(3)
    // anello di focus con colori di sistema
    await campo(page, ETICHETTE.lon).focus()
    await page.keyboard.press('Tab')
    await expect(tilt(page)).toBeFocused()
    const ring = await tilt(page).evaluate((el) => {
      const r = getComputedStyle(el.closest('.dial-control')!.querySelector('.dial-ring')!)
      return { display: r.display, stroke: r.stroke, canvas: getComputedStyle(document.body).backgroundColor }
    })
    expect(ring.display).not.toBe('none')
    expect(contrasto(ring.stroke, ring.canvas)).toBeGreaterThanOrEqual(3)
  })
})
