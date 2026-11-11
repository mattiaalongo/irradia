import { FIXTURE_BODIES, expect, test } from './fixtures'
import type { Locator } from '@playwright/test'
import { MILANO, avvio, impostaPosizione, orologioFermo, DEBOUNCE_MS } from './helpers'

// Issue #26: sezione richiudibile "Come è calcolata la stima" sotto la nota delle fonti.

const sommario = (page: import('@playwright/test').Page) => page.getByText('Come è calcolata la stima', { exact: true })
const sezione = (page: import('@playwright/test').Page) => page.locator('details.method')
const CONTENUTO = 'Il numero mostrato è l\'energia che l\'impianto consegna'

test('chiusa per default, contenuto nascosto', async ({ page, pvgis }) => {
  await orologioFermo(page)
  await avvio(page, pvgis)
  await expect(sommario(page)).toBeVisible()
  expect(await sezione(page).evaluate((d: HTMLDetailsElement) => d.open)).toBe(false)
  await expect(page.getByText(CONTENUTO)).toBeHidden()
})

test('da tastiera: Tab fino al sommario, Invio apre, Invio chiude', async ({ page, pvgis }) => {
  await orologioFermo(page)
  await avvio(page, pvgis)
  const s = page.locator('details.method > summary')
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab')
    if (await s.evaluate((n) => n === document.activeElement)) break
  }
  await expect(s).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByText(CONTENUTO)).toBeVisible()
  await expect(page.getByText('Le ombre di montagne e colline: nelle ore')).toBeVisible()
  await expect(page.locator('details.method a')).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(page.getByText(CONTENUTO)).toBeHidden()
})

test('use_horizon false: variante senza ombre del terreno', async ({ page, pvgis }) => {
  const j = JSON.parse(FIXTURE_BODIES.roma)
  j.inputs.meteo_data.use_horizon = false
  pvgis.body(JSON.stringify(j))
  await orologioFermo(page)
  await avvio(page, pvgis)
  await sommario(page).click()
  await expect(sezione(page).getByText('per questo punto PVGIS non ha applicato il profilo del terreno')).toBeVisible()
  await expect(sezione(page).getByText('Le ombre di montagne e colline: nelle ore')).toHaveCount(0)
})

test('390 px: nessuno scorrimento orizzontale e ultima riga non sotto la barra fissa', async ({ page, pvgis }) => {
  await page.setViewportSize({ width: 390, height: 700 })
  await orologioFermo(page)
  await avvio(page, pvgis)
  await sommario(page).click()
  const m = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  expect(m[0]).toBeLessThanOrEqual(m[1])

  const ultima = sezione(page).locator('.method-body p').last()
  await ultima.scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect(ultima).toBeInViewport({ ratio: 1 })
  const b = await page.getByTestId('sticky-total').boundingBox()
  const r = await ultima.boundingBox()
  expect(r!.y + r!.height, 'ultima riga sopra la barra').toBeLessThanOrEqual(b!.y)
})

// Aggiunte del tester (L4a): telefoni 360/412 px, contrasto nei due temi, anni a 4 cifre, Milano.

for (const width of [360, 412]) {
  test(`${width} px: nessuno scorrimento orizzontale con la sezione aperta`, async ({ page, pvgis }) => {
    await page.setViewportSize({ width, height: 700 })
    await orologioFermo(page)
    await avvio(page, pvgis)
    await sommario(page).click()
    await expect(page.getByText(CONTENUTO)).toBeVisible()
    const m = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
    expect(m[0]).toBeLessThanOrEqual(m[1])
    const ultima = sezione(page).locator('.method-body p').last()
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await expect(ultima).toBeInViewport({ ratio: 1 })
    const b = await page.getByTestId('sticky-total').boundingBox()
    const r = await ultima.boundingBox()
    expect(r!.y + r!.height).toBeLessThanOrEqual(b!.y)
  })
}

type Rgba = [number, number, number, number]
function leggiColore(css: string): Rgba {
  const n = css.match(/-?\d*\.?\d+(?:e-?\d+)?/g)?.map(Number)
  if (!n || n.length < 3) throw new Error(`colore non riconosciuto: ${css}`)
  const a = n[3] ?? 1
  if (css.startsWith('color(srgb')) return [n[0] * 255, n[1] * 255, n[2] * 255, a]
  return [n[0], n[1], n[2], a]
}
function luminanza([r, g, b]: Rgba): number {
  const lin = (c: number) => {
    const x = c / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
async function contrastoDi(el: Locator): Promise<{ c: number; opacita: number }> {
  const { testo, sfondi, opacita } = await el.evaluate((node) => {
    const sfondi: string[] = []
    let opacita = 1
    for (let n: Element | null = node; n; n = n.parentElement) {
      const s = getComputedStyle(n)
      opacita *= Number(s.opacity)
      sfondi.push(s.backgroundColor)
    }
    return { testo: getComputedStyle(node).color, sfondi, opacita }
  })
  let base: Rgba = [255, 255, 255, 1]
  for (const css of [...sfondi].reverse()) {
    const [r, g, b, a] = leggiColore(css)
    base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a), 1]
  }
  const [l1, l2] = [luminanza(leggiColore(testo)), luminanza(base)].sort((x, y) => y - x)
  return { c: (l1 + 0.05) / (l2 + 0.05), opacita }
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`tema ${colorScheme}: sommario e corpo con contrasto >= 4,5:1`, async ({ page, pvgis }) => {
    await page.emulateMedia({ colorScheme })
    await orologioFermo(page)
    await avvio(page, pvgis)
    await sommario(page).click()
    for (const el of [page.locator('details.method > summary'), page.getByText(CONTENUTO), sezione(page).locator('li').first()]) {
      await expect(el).toBeVisible()
      const { c, opacita } = await contrastoDi(el)
      expect(opacita).toBe(1)
      expect(c, `contrasto ${c.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
    }
  })
}

test('anni a 4 cifre senza separatore delle migliaia', async ({ page, pvgis }) => {
  await orologioFermo(page)
  await avvio(page, pvgis)
  await sommario(page).click()
  const testo = await sezione(page).innerText()
  expect(testo).toMatch(/tra il 20\d\d e il 20\d\d/)
  expect(testo).not.toMatch(/\b2\.0\d\d\b/)
  expect(testo).toContain('8.760')
})

test('Milano: la sezione si aggiorna e resta aperta dopo il nuovo anno tipo', async ({ page, pvgis }) => {
  await orologioFermo(page)
  await avvio(page, pvgis)
  await sommario(page).click()
  await impostaPosizione(page, MILANO.lat, MILANO.lon)
  await page.clock.runFor(DEBOUNCE_MS)
  await expect.poll(() => pvgis.count).toBe(2)
  await expect(page.getByText(CONTENUTO)).toBeVisible()
  await expect(sezione(page).getByText('Le ombre di montagne e colline: nelle ore')).toBeVisible()
})
