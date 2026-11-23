import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { ETICHETTE, avvio, campo, slider } from './helpers'

// Prove del tester sulla correzione #58: regressioni del tocco normale e gesti con piu' dita.
// Geometria come in dial.spec.ts: orientamento = bussola con centro (100,100) e raggio 64 nel disegno 200 x 200.
const azimut = (page: Page) => slider(page, ETICHETTE.azimut)
const tilt = (page: Page) => slider(page, ETICHETTE.inclinazione)
const controllo = (s: Locator) => s.locator('xpath=ancestor::div[contains(@class,"dial-control")]')

type P = { x: number; y: number; id?: number }

async function scatta(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  return (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', punti: P[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: punti })
}

test.describe('tocco: regressioni e gesti con piu dita (#58)', () => {
  test.use({ hasTouch: true, viewport: { width: 360, height: 700 } })

  async function prepara(page: Page, pvgis: Parameters<typeof avvio>[1]) {
    await avvio(page, pvgis)
    const s = azimut(page)
    await s.scrollIntoViewIfNeeded()
    const b = (await controllo(s).boundingBox())!
    const pt = (ux: number, uy: number): P => ({ x: b.x + (ux / 200) * b.width, y: b.y + (uy / 200) * b.height })
    return { s, b, pt }
  }

  test('trascinamento che parte dentro: il valore segue il dito (Est -> Ovest)', async ({ page, pvgis }) => {
    const { s, pt } = await prepara(page, pvgis)
    const t = await scatta(page)
    await t('touchStart', [{ ...pt(150, 100), id: 1 }]) // Est
    await expect(s).toHaveValue('90')
    await t('touchMove', [{ ...pt(100, 150), id: 1 }]) // Sud
    await expect(s).toHaveValue('180')
    await t('touchMove', [{ ...pt(50, 100), id: 1 }]) // Ovest
    await expect(s).toHaveValue('270')
    await t('touchEnd', [])
    await expect(s).toHaveValue('270')
    await expect(campo(page, ETICHETTE.azimut)).toHaveValue('270')
  })

  test('parte dentro ed esce lontano (cattura del puntatore): valore dall angolo, non dalla x', async ({ page, pvgis }) => {
    const { s, b, pt } = await prepara(page, pvgis)
    const t = await scatta(page)
    await t('touchStart', [{ ...pt(150, 100), id: 1 }])
    await expect(s).toHaveValue('90')
    // molto in basso sotto il comando, ma x a Est del centro: l'angolo e' ~ Sud-Est, non "x a 3/4 = 270"
    await t('touchMove', [{ x: b.x + b.width * 0.5, y: b.y + b.height + 120, id: 1 }])
    await expect(s).toHaveValue('180')
    await t('touchEnd', [])
    await expect(s).toHaveValue('180')
  })

  test('primo dito dentro e fermo, secondo dito parte fuori e sale nel comando: il valore resta quello del primo', async ({ page, pvgis }) => {
    const { s, b, pt } = await prepara(page, pvgis)
    const t = await scatta(page)
    const a = { ...pt(150, 100), id: 1 }
    await t('touchStart', [a])
    await expect(s).toHaveValue('90')
    let y = b.y + b.height + 4
    const x = b.x + b.width * 0.25
    await t('touchStart', [a, { x, y, id: 2 }])
    for (let i = 0; i < 6; i++) {
      y -= 8
      await t('touchMove', [a, { x, y, id: 2 }])
    }
    await expect(s).toHaveValue('90')
    await t('touchEnd', [])
    await expect(s).toHaveValue('90')
  })

  test('primo dito fuori, secondo dito dentro: il dito dentro vale; poi un tocco normale funziona subito', async ({ page, pvgis }) => {
    const { s, b, pt } = await prepara(page, pvgis)
    await campo(page, ETICHETTE.azimut).fill('201')
    await expect(s).toHaveValue('201')
    const t = await scatta(page)
    const fuori = { x: b.x + b.width * 0.8, y: b.y + b.height + 4, id: 1 }
    await t('touchStart', [fuori])
    const dentro = { ...pt(150, 100), id: 2 }
    await t('touchStart', [fuori, dentro])
    await t('touchEnd', [])
    await expect(s).toHaveValue('90') // il secondo dito e' dentro: vale come un tocco normale
    await campo(page, ETICHETTE.azimut).fill('201')
    await expect(s).toHaveValue('201')
    // il flag e' stato azzerato: un tocco normale ora imposta il valore
    await page.touchscreen.tap(pt(150, 100).x, pt(150, 100).y)
    await expect(s).toHaveValue('90')
  })

  test('touchcancel dopo un gesto fuori azzera lo stato; tastiera e fill continuano a funzionare', async ({ page, pvgis }) => {
    const { s, b } = await prepara(page, pvgis)
    const t = await scatta(page)
    await t('touchStart', [{ x: b.x + b.width / 2, y: b.y + b.height + 4, id: 1 }])
    await t('touchMove', [{ x: b.x + b.width / 2, y: b.y + b.height - 20, id: 1 }])
    await t('touchCancel', [])
    await expect(s).toHaveValue('180')
    await s.focus()
    await page.keyboard.press('ArrowRight')
    await expect(s).toHaveValue('181')
    await page.keyboard.press('PageUp')
    await expect(s).toHaveValue('191')
    await s.fill('45') // evento sintetico (tecnologie assistive)
    await expect(s).toHaveValue('45')
    await expect(campo(page, ETICHETTE.azimut)).toHaveValue('45')
  })

  test('inclinazione: dito che parte appena fuori e sale dentro non cambia il valore', async ({ page, pvgis }) => {
    await avvio(page, pvgis)
    const s = tilt(page)
    await s.scrollIntoViewIfNeeded()
    const b = (await controllo(s).boundingBox())!
    const t = await scatta(page)
    let y = b.y + b.height + 3
    const x = b.x + b.width * 0.6
    await t('touchStart', [{ x, y }])
    for (let i = 0; i < 10; i++) {
      y -= 6
      await t('touchMove', [{ x, y }])
    }
    await t('touchEnd', [])
    await expect(s).toHaveValue('35')
  })

  test('gesto che parte fuori: la pagina scorre (touchmove non annullato)', async ({ page, pvgis }) => {
    const { s } = await prepara(page, pvgis)
    await page.evaluate(() => window.scrollBy(0, -250)) // lontano dal fondo pagina: si puo' scorrere verso il basso
    const b = (await controllo(s).boundingBox())!
    const t = await scatta(page)
    const prima = await page.evaluate(() => window.scrollY)
    let y = b.y + b.height + 6
    const x = b.x + b.width / 2
    await t('touchStart', [{ x, y }])
    for (let i = 0; i < 12; i++) {
      y -= 10
      await t('touchMove', [{ x, y }])
    }
    await t('touchEnd', [])
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(prima)
  })

  test('gesto che parte dentro: la pagina NON scorre (touch-action none)', async ({ page, pvgis }) => {
    const { b, pt } = await prepara(page, pvgis)
    const t = await scatta(page)
    const prima = await page.evaluate(() => window.scrollY)
    const p = pt(150, 100)
    await t('touchStart', [p])
    for (let i = 1; i <= 8; i++) await t('touchMove', [{ x: p.x, y: p.y - i * 8 }])
    await t('touchEnd', [])
    expect(await page.evaluate(() => window.scrollY)).toBe(prima)
    expect(b.height).toBeGreaterThan(0)
  })
})
