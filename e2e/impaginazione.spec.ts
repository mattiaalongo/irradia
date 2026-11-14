import type { Locator } from '@playwright/test'
import { expect, test } from './fixtures'
import { ETICHETTE, avvio, orologioFermo, slider, totale } from './helpers'

// Impaginazione su schermi diversi e contrasto del testo della nota (WCAG 2.x).

test.describe('nessuno scorrimento orizzontale', () => {
  for (const width of [320, 360, 390, 412, 1280]) {
    test(`larghezza ${width} px: scrollWidth ≤ clientWidth`, async ({ page, pvgis }) => {
      await page.setViewportSize({ width, height: 800 })
      await orologioFermo(page)
      await avvio(page, pvgis)
      // Si apre anche la tabella: è il contenuto più largo dopo il grafico.
      await page.getByText('Tabella dei valori mensili').click()

      const misure = await page.evaluate(() => ({
        html: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
        body: [document.body.scrollWidth, document.body.clientWidth],
      }))
      expect(misure.html[0], 'html.scrollWidth').toBeLessThanOrEqual(misure.html[1])
      expect(misure.body[0], 'body.scrollWidth').toBeLessThanOrEqual(misure.body[1])
    })
  }
})

type Rgba = [number, number, number, number]

/** Legge "rgb(r, g, b)", "rgba(r, g, b, a)" o "color(srgb r g b / a)" come calcolato da Chromium. */
function leggiColore(css: string): Rgba {
  const n = css.match(/-?\d*\.?\d+(?:e-?\d+)?/g)?.map(Number)
  if (!n || n.length < 3) throw new Error(`colore non riconosciuto: ${css}`)
  const a = n[3] ?? 1
  if (css.startsWith('color(srgb')) return [n[0] * 255, n[1] * 255, n[2] * 255, a]
  return [n[0], n[1], n[2], a]
}

/** Luminanza relativa WCAG 2.x (sRGB). */
function luminanza([r, g, b]: Rgba): number {
  const lin = (c: number) => {
    const x = c / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrasto(a: Rgba, b: Rgba): number {
  const [l1, l2] = [luminanza(a), luminanza(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

/** Colore del testo e sfondo effettivo (primo antenato non trasparente, con trasparenze composte). */
async function coloriEffettivi(el: Locator): Promise<{ testo: string; sfondi: string[]; opacita: number }> {
  return el.evaluate((node) => {
    const sfondi: string[] = []
    let opacita = 1
    for (let n: Element | null = node; n; n = n.parentElement) {
      const s = getComputedStyle(n)
      opacita *= Number(s.opacity)
      sfondi.push(s.backgroundColor)
    }
    return { testo: getComputedStyle(node).color, sfondi, opacita }
  })
}

function sfondoEffettivo(sfondi: string[]): Rgba {
  // Si parte da bianco opaco (canvas del browser) e si compongono gli strati dal più esterno.
  let base: Rgba = [255, 255, 255, 1]
  for (const css of [...sfondi].reverse()) {
    const [r, g, b, a] = leggiColore(css)
    base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a), 1]
  }
  return base
}

test.describe('contrasto della nota sotto il totale', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`tema ${colorScheme}: contrasto ≥ 4,5:1`, async ({ page, pvgis }) => {
      await page.emulateMedia({ colorScheme })
      await orologioFermo(page)
      await avvio(page, pvgis)
      const nota = totale(page).getByText(/^Stima su un anno tipo/)
      await expect(nota).toBeVisible()

      const { testo, sfondi, opacita } = await coloriEffettivi(nota)
      expect(opacita, 'la nota non deve essere attenuata (stato "stale")').toBe(1)
      const sfondo = sfondoEffettivo(sfondi)
      const fg = leggiColore(testo)
      expect(fg[3], 'il testo deve essere opaco').toBe(1)
      const c = contrasto(fg, sfondo)
      // Valori dichiarati in CLAUDE.md: 5,1:1 (chiaro) e 6,3:1 (scuro).
      expect(c, `contrasto ${c.toFixed(2)}:1 (testo ${testo}, sfondo ${sfondo.map(Math.round)})`).toBeGreaterThanOrEqual(4.5)
    })
  }
})

test.describe('barra fissa del totale (solo telefono)', () => {
  test('390 px: muovendo uno slider il totale resta visibile e cambia', async ({ page, pvgis }) => {
    await page.setViewportSize({ width: 390, height: 800 })
    await orologioFermo(page)
    await avvio(page, pvgis)
    const barra = page.getByTestId('sticky-total')
    await expect(barra).toBeInViewport({ ratio: 1 })
    const prima = await barra.innerText()

    const s = slider(page, ETICHETTE.pannelli)
    await s.scrollIntoViewIfNeeded()
    await s.focus()
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight')

    await expect(barra).toBeInViewport({ ratio: 1 })
    await expect.poll(() => barra.innerText()).not.toBe(prima)
    // Il campo appena mosso non finisce sotto la barra.
    const box = await s.boundingBox()
    const bar = await barra.boundingBox()
    expect(box!.y + box!.height).toBeLessThanOrEqual(bar!.y)
  })

  test('1280 px: la barra non compare', async ({ page, pvgis }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await orologioFermo(page)
    await avvio(page, pvgis)
    await expect(page.getByTestId('sticky-total')).toBeHidden()
  })
})
