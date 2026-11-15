import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { DEBOUNCE_MS, MILANO, avvio, contrasto, impostaPosizione, orologioFermo, totale } from './helpers'

// Prove del tester sull'aspetto B «Giornata di sole» (#56 parte 2): ordine di Tab, anelli di focus,
// comandi circolari, caratteri, scorrimento orizzontale, barra fissa, grafico, preferenze di sistema.

const radioB = (page: Page) => page.getByRole('radio', { name: 'Giornata di sole', exact: true })
const radioA = (page: Page) => page.getByRole('radio', { name: 'Strumento', exact: true })
const scegli = async (page: Page, look: 'a' | 'b') => {
  if (look === 'b') await radioB(page).check()
}

/** Nome leggibile dell'elemento a fuoco. */
const aFuoco = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el || el === document.body) return 'BODY'
    const lab = el.getAttribute('aria-label') ?? (el as HTMLInputElement).labels?.[0]?.textContent ?? el.textContent ?? ''
    return `${el.tagName.toLowerCase()}:${lab.trim().replace(/\s+/g, ' ').slice(0, 40)}`
  })

async function percorsoTab(page: Page, passi: number): Promise<string[]> {
  await page.locator('body').click({ position: { x: 1, y: 1 } })
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  const out: string[] = []
  for (let i = 0; i < passi; i++) {
    await page.keyboard.press('Tab')
    out.push(await aFuoco(page))
  }
  return out
}

test.describe('ordine di Tab', () => {
  test('B: interruttore → comandi della scena → mappa → campi → slider → grafico → sommari; A invariato', async ({ page, pvgis }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await orologioFermo(page)
    await avvio(page, pvgis)
    const giro = (p: string[]) => p.slice(0, p.indexOf('BODY'))
    const a = giro(await percorsoTab(page, 40))
    await radioB(page).check()
    await page.evaluate(() => window.scrollTo(0, 0))
    const b = giro(await percorsoTab(page, 40))
    expect(a.length).toBeGreaterThan(25)
    expect(b.length).toBe(a.length) // stessi punti di sosta, solo in ordine diverso
    const senzaRadio = (p: string[]) => p.filter((x) => !/^input:(Strumento|Giornata)/.test(x)).sort()
    expect(senzaRadio(b)).toEqual(senzaRadio(a))

    const indice = (percorso: string[], parte: RegExp) => percorso.findIndex((s) => parte.test(s))
    // B
    const ordineB = [/input:Strumento|input:Giornata/, /Inclinazione \(slider\)/, /Orientamento \(azimut da Nord\) \(slider\)/, /Ingrandisci|Riduci|div:.*mappa/i, /Latitudine/, /Longitudine/, /Numero di pannelli/, /Potenza di un pannello/, /Perdite di sistema/]
    const posB = ordineB.map((re) => indice(b, re))
    expect(posB.every((p) => p >= 0), `B: ${JSON.stringify(posB)}`).toBe(true)
    // Il primo radio sta prima di tutto; i comandi prima della mappa; la mappa prima dei campi; i campi prima dei cursori.
    expect([...posB].sort((x, y) => x - y)).toEqual(posB)
    const iChart = indice(b, /g:Gennaio|Gennaio/)
    const iSommario = indice(b, /summary:/)
    expect(iChart).toBeGreaterThan(posB[posB.length - 1])
    expect(iSommario).toBeGreaterThan(iChart)
    // Nessuno stop duplicato nel giro (nessuna trappola).
    expect(new Set(b).size).toBe(b.length)
    // A: l'ordine storico: interruttore, mappa, campi, comandi...
    const posA = [/input:Strumento|input:Giornata/, /Ingrandisci|Riduci|div:.*mappa/i, /Latitudine/, /Longitudine/, /Inclinazione \(slider\)/, /Orientamento/].map((re) => indice(a, re))
    expect(posA.every((p) => p >= 0), `A: ${JSON.stringify(posA)}`).toBe(true)
    expect([...posA].sort((x, y) => x - y)).toEqual(posA)
  })
})

// ---------------------------------------------------------------------------------------------
// Anello di focus di OGNI punto di sosta, in B e A, chiaro e scuro: visibile e ≥ 3:1 sul fondo giusto
// (sul cielo: contro entrambi gli estremi della sfumatura).
// ---------------------------------------------------------------------------------------------
for (const look of ['a', 'b'] as const) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`anello di focus di ogni punto di sosta: aspetto ${look.toUpperCase()}, tema ${colorScheme}`, async ({ page, pvgis }) => {
      await page.emulateMedia({ colorScheme })
      await page.setViewportSize({ width: 1280, height: 900 })
      await orologioFermo(page)
      await avvio(page, pvgis)
      await scegli(page, look)
      await page.getByText('Come è calcolata la stima').click()
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
      await page.locator('body').click({ position: { x: 1, y: 1 } })
      const difetti: string[] = []
      const visti: string[] = []
      for (let i = 0; i < 60; i++) {
        await page.keyboard.press('Tab')
        const nome = await aFuoco(page)
        if (nome === 'BODY' || visti.includes(nome)) break
        visti.push(nome)
        const r = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement
          const rgb = (c: string) => c
          // Elemento che disegna l'anello: l'etichetta del radio (:has), il contenitore del campo, la barra del grafico, il thumb dello slider.
          const lab = el.closest('.look-option') as HTMLElement | null
          const num = el.closest('.num') as HTMLElement | null
          const cand: { tipo: string; color: string; width: number; style: string; shadow?: string }[] = []
          for (const [tipo, e] of [['elemento', el], ['etichetta', lab], ['campo', num]] as const) {
            if (!e) continue
            const s = getComputedStyle(e)
            cand.push({ tipo, color: rgb(s.outlineColor), width: parseFloat(s.outlineWidth), style: s.outlineStyle })
          }
          const isRange = el instanceof HTMLInputElement && el.type === 'range' && !el.closest('.dial-control')
          // Comandi circolari: anello `dial-ring` dentro il contenitore, visibile con :focus-visible dell'input.
          const ring = el.closest('.dial-control')?.querySelector('.dial-ring') as SVGElement | null
          if (ring) {
            const s = getComputedStyle(ring)
            cand.push({ tipo: 'dial-ring', color: s.stroke, width: parseFloat(s.strokeWidth), style: s.display === 'none' || s.visibility === 'hidden' ? 'none' : 'solid' })
          }
          // Grafico: anello del mese.
          const cf = el.querySelector('.chart-focus') as SVGElement | null
          if (cf) {
            const s = getComputedStyle(cf)
            cand.push({ tipo: 'chart-focus', color: s.stroke, width: parseFloat(s.strokeWidth), style: s.display === 'none' ? 'none' : 'solid' })
          }
          const sky = document.documentElement.getAttribute('data-look') === 'b' && !!el.closest('.scene, main > header')
          const varc = (v: string) => {
            const e = document.createElement('i')
            e.style.color = `var(${v})`
            document.body.appendChild(e)
            const c = getComputedStyle(e).color
            e.remove()
            return c
          }
          return { cand, isRange, ring: varc('--focus-ring'), sky, body: getComputedStyle(document.body).backgroundColor, top: sky ? varc('--sky-top') : '', bot: sky ? varc('--sky-bot') : '' }
        })
        if (r.isRange) {
          // Il cursore è uno pseudo-elemento: non si legge dagli stili. Si fotografa e si cerca il colore dell'anello.
          const box = (await page.locator(':focus').boundingBox())!
          const pct = await page.locator(':focus').evaluate((el) => {
            const i = el as HTMLInputElement
            return (Number(i.value) - Number(i.min)) / (Number(i.max) - Number(i.min))
          })
          const cx = box.x + 15 + pct * (box.width - 30)
          const clip = { x: Math.max(0, cx - 24), y: box.y + box.height / 2 - 24, width: 48, height: 48 }
          const png = (await page.screenshot({ clip })).toString('base64')
          const trovati = await page.evaluate(async ([b64, ring]) => {
            const img = new Image()
            img.src = `data:image/png;base64,${b64}`
            await img.decode()
            const c = document.createElement('canvas')
            c.width = img.width; c.height = img.height
            const g = c.getContext('2d')!
            g.drawImage(img, 0, 0)
            const d = g.getImageData(0, 0, c.width, c.height).data
            const [rr, gg, bb] = ring.match(/\d+/g)!.map(Number)
            let n = 0
            for (let k = 0; k < d.length; k += 4) if (Math.abs(d[k] - rr) < 6 && Math.abs(d[k + 1] - gg) < 6 && Math.abs(d[k + 2] - bb) < 6) n++
            return n
          }, [png, r.ring] as const)
          if (trovati < 40) difetti.push(`${nome}: anello del cursore non trovato (${trovati} pixel del colore ${r.ring})`)
          const fondiR = r.sky ? [r.top, r.bot] : [r.body]
          const pe = Math.min(...fondiR.map((f) => contrasto(r.ring, f)))
          if (pe < 3) difetti.push(`${nome} [thumb]: ${pe.toFixed(2)}`)
          continue
        }
        const visibile = r.cand.filter((c) => c.style !== 'none' && (c.width > 0 || c.shadow))
        if (visibile.length === 0) { difetti.push(`${nome}: nessun anello visibile`); continue }
        const fondi = r.sky ? [r.top, r.bot] : [r.body]
        for (const c of visibile) {
          if (c.shadow) {
            // box-shadow: l'ultimo colore è l'anello esterno.
            const colori = c.shadow.match(/rgba?\([^)]*\)/g) ?? []
            const esterno = colori[0]
            if (!esterno) { difetti.push(`${nome}: ombra senza colore (${c.shadow})`); continue }
            const peggiore = Math.min(...fondi.map((f) => contrasto(esterno, f)))
            if (peggiore < 3) difetti.push(`${nome} [thumb]: ${peggiore.toFixed(2)}`)
          } else if (c.color) {
            const peggiore = Math.min(...fondi.map((f) => contrasto(c.color, f)))
            if (peggiore < 3) difetti.push(`${nome} [${c.tipo}]: ${peggiore.toFixed(2)} (${c.color})`)
          }
        }
      }
      expect(visti.length).toBeGreaterThan(25)
      expect(difetti).toEqual([])
    })
  }
}

// ---------------------------------------------------------------------------------------------
// Comandi circolari: nomi, aria-valuetext e tasti identici in A e B; trascinamento in B.
// ---------------------------------------------------------------------------------------------
const TILT = { cx: 24, cy: 176, r: 128 }
const AZ = { cx: 100, cy: 100, r: 64 }
const RAD = Math.PI / 180
const dial = (page: Page, nome: string) => page.getByRole('slider', { name: `${nome} (slider)`, exact: true })

async function sequenzaTasti(page: Page, nome: string, tasti: string[]): Promise<string[]> {
  const s = dial(page, nome)
  await s.focus()
  const out: string[] = []
  for (const t of tasti) {
    await page.keyboard.press(t)
    out.push(`${t}: ${await s.inputValue()} | ${await s.getAttribute('aria-valuetext')} | min ${await s.getAttribute('aria-valuemin') ?? await s.getAttribute('min')} max ${await s.getAttribute('aria-valuemax') ?? await s.getAttribute('max')}`)
  }
  return out
}

test.describe('comandi circolari in A e B', () => {
  test('stessi nomi accessibili, aria-valuetext e tasti: la sequenza è identica in A e in B', async ({ page, pvgis }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await orologioFermo(page)
    await avvio(page, pvgis)
    const tastiTilt = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageUp', 'PageDown', 'Home', 'ArrowLeft', 'End', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowDown']
    const tastiAz = ['Home', 'ArrowLeft', 'End', 'ArrowRight', 'PageUp', 'PageDown', 'PageDown', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowLeft']
    const nomi = async () => page.getByRole('slider').evaluateAll((l) => l.map((e) => `${e.getAttribute('aria-label')}`))
    const iniz = async () => ({
      nomi: await nomi(),
      valuetext: await page.getByRole('slider').evaluateAll((l) => l.map((e) => e.getAttribute('aria-valuetext'))),
    })
    const a0 = await iniz()
    const a1 = await sequenzaTasti(page, 'Inclinazione', tastiTilt)
    const a2 = await sequenzaTasti(page, 'Orientamento (azimut da Nord)', tastiAz)
    // Torna ai valori iniziali per confrontare la stessa partenza.
    const prima = pvgis.count
    await page.reload()
    await expect(radioA(page)).toBeAttached()
    await expect.poll(async () => {
      await page.clock.runFor(DEBOUNCE_MS)
      return pvgis.count
    }).toBe(prima + 1)
    await expect(totale(page)).toContainText('kWh')
    await radioB(page).check()
    const b0 = await iniz()
    const b1 = await sequenzaTasti(page, 'Inclinazione', tastiTilt)
    const b2 = await sequenzaTasti(page, 'Orientamento (azimut da Nord)', tastiAz)
    expect(b0).toEqual(a0)
    expect(b1).toEqual(a1)
    expect(b2).toEqual(a2)
    // I campi numerici accanto ai comandi seguono i tasti anche in B.
    await expect(page.getByLabel('Inclinazione', { exact: true })).toHaveValue(await dial(page, 'Inclinazione').inputValue())
    // I sommi dei comandi sono nel DOM e senza duplicati di nome.
    expect(new Set(b0.nomi).size).toBe(b0.nomi.length)
    await page.clock.runFor(DEBOUNCE_MS * 2)
  })

  test('B: il disegno dei comandi è nascosto alle tecnologie assistive, etichette numeriche intermedie nascoste dal CSS', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await radioB(page).check()
    expect(await page.locator('.dial-svg').evaluateAll((l) => l.map((e) => e.getAttribute('aria-hidden')))).toEqual(['true', 'true'])
    const visibili = await page.evaluate(() => ({
      tilt: [...document.querySelectorAll('.angle-dial-tilt .dial-num')].map((e) => getComputedStyle(e).display === 'none' ? '-' : e.textContent),
      az: [...document.querySelectorAll('.angle-dial-azimuth .dial-num')].map((e) => getComputedStyle(e).display === 'none' ? '-' : e.textContent),
      lettere: [...document.querySelectorAll('.angle-dial-azimuth .dial-letter')].map((e) => e.textContent),
    }))
    // Visibili solo gli estremi dell'inclinazione e le lettere; nessun numero dell'azimut.
    expect(visibili.tilt.filter((x) => x !== '-').sort()).toEqual(['0°', '90°'].sort())
    expect(visibili.az.every((x) => x === '-')).toBe(true)
    expect(visibili.lettere).toEqual(['N', 'E', 'S', 'O'])
  })

  test('B: trascinamento del cursore (più grande) sul quarto di cerchio e sulla bussola', async ({ page, pvgis }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await orologioFermo(page)
    await avvio(page, pvgis)
    await radioB(page).check()
    for (const [nome, kind] of [['Inclinazione', 'tilt'], ['Orientamento (azimut da Nord)', 'az']] as const) {
      const s = dial(page, nome)
      const box = (await s.locator('xpath=ancestor::div[contains(@class,"dial-control")]').boundingBox())!
      const punto = (x: number, y: number) => ({ x: box.x + (x / 200) * box.width, y: box.y + (y / 200) * box.height })
      const handle = (await page.locator(`.angle-dial-${kind === 'tilt' ? 'tilt' : 'azimuth'} .dial-handle`).boundingBox())!
      // Il cursore è più grande di quello di A? Lato minimo realistico per un bersaglio di tocco: ≥ 20 px.
      expect(handle.width).toBeGreaterThanOrEqual(20)
      const da = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }
      const a = kind === 'tilt' ? punto(TILT.cx + TILT.r * Math.cos(60 * RAD), TILT.cy - TILT.r * Math.sin(60 * RAD)) : punto(AZ.cx + AZ.r * Math.sin(90 * RAD), AZ.cy - AZ.r * Math.cos(90 * RAD))
      await page.mouse.move(da.x, da.y)
      await page.mouse.down()
      await page.mouse.move((da.x + a.x) / 2, (da.y + a.y) / 2, { steps: 5 })
      await page.mouse.move(a.x, a.y, { steps: 5 })
      await page.mouse.up()
      const v = Number(await s.inputValue())
      expect(Math.abs(v - (kind === 'tilt' ? 60 : 90)), `${nome}: ${v}`).toBeLessThanOrEqual(2)
      await expect(page.getByLabel(nome === 'Inclinazione' ? 'Inclinazione' : 'Orientamento (azimut da Nord)', { exact: true })).toHaveValue(String(v))
    }
    // Trascinamento oltre Nord sulla bussola: nessun salto.
    const s = dial(page, 'Orientamento (azimut da Nord)')
    const box = (await s.locator('xpath=ancestor::div[contains(@class,"dial-control")]').boundingBox())!
    const punto = (deg: number) => ({ x: box.x + ((AZ.cx + AZ.r * Math.sin(deg * RAD)) / 200) * box.width, y: box.y + ((AZ.cy - AZ.r * Math.cos(deg * RAD)) / 200) * box.height })
    const h = (await page.locator('.angle-dial-azimuth .dial-handle').boundingBox())!
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
    await page.mouse.down()
    const visti: number[] = []
    for (const deg of [80, 60, 30, 10, 0, 350, 330, 300]) {
      const p = punto(deg)
      await page.mouse.move(p.x, p.y, { steps: 3 })
      visti.push(Number(await s.inputValue()))
    }
    await page.mouse.up()
    for (let i = 1; i < visti.length; i++) {
      const d = Math.abs(((visti[i] - visti[i - 1] + 540) % 360) - 180)
      expect(d, `salto ${visti.join(',')}`).toBeLessThanOrEqual(80) // differenza circolare fra due passi: nessun salto
    }
    expect(Math.abs(visti[visti.length - 1] - 300)).toBeLessThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------------------------
// Caratteri: nessuna richiesta fuori dall'origine; in A niente Figtree, in B niente Barlow.
// ---------------------------------------------------------------------------------------------
test.describe('caratteri', () => {
  for (const look of ['a', 'b'] as const) {
    test(`aspetto ${look.toUpperCase()} (partenza a freddo): solo ${look === 'a' ? 'Barlow' : 'Figtree'}, tutto dalla nostra origine`, async ({ page, pvgis }) => {
      if (look === 'b') await page.addInitScript(() => localStorage.setItem('irradia.look', 'b'))
      const richieste: string[] = []
      page.on('request', (r) => richieste.push(r.url()))
      await orologioFermo(page)
      await avvio(page, pvgis)
      await page.getByText('Come è calcolata la stima').click()
      await page.evaluate(() => document.fonts.ready)
      const origine = new URL(page.url()).origin
      expect(richieste.filter((u) => !u.startsWith(origine) && !u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith('https://tile.openstreetmap.org/'))).toEqual([])
      const font = richieste.filter((u) => u.endsWith('.woff2')).map((u) => u.split('/').pop()!)
      expect(font.length).toBeGreaterThan(0)
      if (look === 'a') {
        expect(font.some((f) => /figtree/i.test(f))).toBe(false)
        expect(font.some((f) => /barlow/i.test(f))).toBe(true)
      } else {
        expect(font.some((f) => /barlow/i.test(f))).toBe(false)
        expect(font.some((f) => /figtree/i.test(f))).toBe(true)
      }
      const usati = await page.evaluate(() => {
        const set = new Set<string>()
        for (const el of document.querySelectorAll('body *')) {
          if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())) continue
          if (el.getClientRects().length === 0) continue
          set.add(getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/['"]/g, ''))
        }
        return [...set]
      })
      // Ogni testo visibile ha come primo carattere quello dell'aspetto (nei campi di Leaflet: eccezione, esclusi sopra? no).
      console.log(`${look}: primi font usati = ${usati.join(' | ')}`)
      if (look === 'b') expect(usati.filter((f) => /barlow/i.test(f))).toEqual([])
      else expect(usati.filter((f) => /figtree/i.test(f))).toEqual([])
    })
  }
})

// ---------------------------------------------------------------------------------------------
// Nessuno scorrimento orizzontale, nessun elemento che esce a destra: 5 larghezze × 2 temi × 2 aspetti,
// anche con messaggio d'errore lunghissimo senza spazi e con risultati non aggiornati (due cornici in B).
// ---------------------------------------------------------------------------------------------
async function sporgenze(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const cw = document.documentElement.clientWidth
    const out: string[] = []
    if (document.documentElement.scrollWidth > cw) out.push(`html scrollWidth ${document.documentElement.scrollWidth} > ${cw}`)
    if (document.body.scrollWidth > cw) out.push(`body scrollWidth ${document.body.scrollWidth} > ${cw}`)
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('.leaflet-container, [aria-hidden="true"] svg, .chart-plot')) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (getComputedStyle(el).position === 'fixed' || getComputedStyle(el).visibility === 'hidden') continue
      if (r.right > cw + 1 || r.left < -1) out.push(`${el.tagName.toLowerCase()}.${el.getAttribute('class') ?? ''}: ${Math.round(r.left)}..${Math.round(r.right)} (finestra ${cw})`)
    }
    return out.slice(0, 8)
  })
}

for (const look of ['a', 'b'] as const) {
  for (const colorScheme of ['light', 'dark'] as const) {
    for (const larghezza of [320, 360, 390, 412, 1440]) {
      test(`senza scorrimento orizzontale: ${look.toUpperCase()}, ${colorScheme}, ${larghezza} px (normale, errore lungo, non aggiornato)`, async ({ page, pvgis, consoleGuard }) => {
        consoleGuard.allow(/Failed to load resource/)
        await page.emulateMedia({ colorScheme })
        await page.setViewportSize({ width: larghezza, height: 800 })
        await orologioFermo(page)
        await avvio(page, pvgis)
        await scegli(page, look)
        await page.getByText('Come è calcolata la stima').click()
        await page.getByText('Tabella dei valori mensili').click()
        expect(await sporgenze(page), 'normale').toEqual([])
        // Stato non aggiornato (attesa).
        await impostaPosizione(page, MILANO.lat, MILANO.lon)
        await expect(page.getByText('Valori della posizione precedente')).toHaveCount(look === 'b' ? 2 : 1)
        expect(await sporgenze(page), 'non aggiornato').toEqual([])
        // Errore con messaggio lungo e senza spazi, sopra i risultati vecchi.
        pvgis.failWithBody(400, { message: 'Q'.repeat(400) })
        await page.clock.runFor(DEBOUNCE_MS)
        await expect(page.getByRole('alert')).toBeVisible()
        expect(await sporgenze(page), 'errore lungo').toEqual([])
        // Valori estremi nei campi e nei comandi.
        await page.getByLabel('Numero di pannelli', { exact: true }).fill('50')
        await page.getByLabel('Potenza di un pannello', { exact: true }).fill('700')
        await page.getByLabel('Inclinazione', { exact: true }).fill('90')
        await page.getByLabel('Orientamento (azimut da Nord)', { exact: true }).fill('359')
        expect(await sporgenze(page), 'valori estremi').toEqual([])
      })
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Barra fissa del telefono: stessa altezza in A e B, non copre l'ultimo contenuto, aria-hidden.
// ---------------------------------------------------------------------------------------------
test.describe('barra fissa in A e B', () => {
  for (const larghezza of [320, 390, 412, 819]) {
    test(`${larghezza} px: stessa altezza in A e B, aria-hidden, fine pagina non coperta`, async ({ page, pvgis }) => {
      await page.setViewportSize({ width: larghezza, height: 700 })
      await orologioFermo(page)
      await avvio(page, pvgis)
      const misura = async () => {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
        return page.evaluate(() => {
          const bar = document.querySelector('.sticky-total')!.getBoundingClientRect()
          const foot = document.querySelector('footer')!.getBoundingClientRect()
          return { h: Math.round(bar.height), top: bar.top, bottom: bar.bottom, vh: window.innerHeight, footBottom: foot.bottom, hidden: document.querySelector('.sticky-total')!.getAttribute('aria-hidden'), focusable: document.querySelectorAll('.sticky-total a, .sticky-total button, .sticky-total [tabindex]').length }
        })
      }
      const a = await misura()
      await radioB(page).check()
      const b = await misura()
      expect(a.hidden).toBe('true')
      expect(b.hidden).toBe('true')
      expect(b.focusable).toBe(0)
      expect(b.h).toBe(a.h)
      expect(Math.abs(b.bottom - b.vh)).toBeLessThanOrEqual(1) // incollata in basso
      expect(a.footBottom).toBeLessThanOrEqual(a.top + 0.5)
      expect(b.footBottom).toBeLessThanOrEqual(b.top + 0.5)
    })
  }

  test('390 px: stati «Aggiorno…», «Scarico…», errore: stessa altezza in A e B', async ({ page, pvgis, consoleGuard }) => {
    consoleGuard.allow(/Failed to load resource/)
    await page.setViewportSize({ width: 390, height: 700 })
    await orologioFermo(page)
    await avvio(page, pvgis)
    const altezza = () => page.locator('.sticky-total').evaluate((e) => Math.round(e.getBoundingClientRect().height))
    const testo = () => page.locator('.sticky-total').innerText()
    const registro: Record<string, { a: number; b: number; ta: string; tb: string }> = {}
    const rileva = async (stato: string) => {
      const out = { a: 0, b: 0, ta: '', tb: '' }
      await radioA(page).check(); out.a = await altezza(); out.ta = await testo()
      await radioB(page).check(); out.b = await altezza(); out.tb = await testo()
      registro[stato] = out
    }
    const gate = pvgis.hold()
    await impostaPosizione(page, MILANO.lat, MILANO.lon)
    await rileva('attesa')
    await page.clock.runFor(DEBOUNCE_MS)
    await rileva('download')
    gate.release()
    await expect(page.getByText('Scarico l\'anno tipo da PVGIS…')).toHaveCount(0)
    pvgis.gatewayError(503)
    await impostaPosizione(page, ROMA_LAT, ROMA_LON)
    await page.clock.runFor(DEBOUNCE_MS)
    await expect(page.getByRole('alert')).toBeVisible()
    await rileva('errore')
    for (const [stato, r] of Object.entries(registro)) {
      expect(r.b, `${stato}: altezza`).toBe(r.a)
      expect(r.tb, `${stato}: testo`).toBe(r.ta)
    }
  })
})
const ROMA_LAT = '40,8518' // Napoli (Roma e Milano sono già in memoria: una posizione nuova forza il download)
const ROMA_LON = '14,2681'

// ---------------------------------------------------------------------------------------------
// Grafico in B: regole dataviz (barre ≤ 24 px, valori solo su massimo e minimo, tabella, anello di focus).
// ---------------------------------------------------------------------------------------------
test.describe('grafico in B', () => {
  for (const larghezza of [320, 390, 1280, 1440]) {
    test(`${larghezza} px: barre ≤ 24 px, due soli valori scritti (max e min), tabella, anello di focus visibile`, async ({ page, pvgis }) => {
      await page.setViewportSize({ width: larghezza, height: 900 })
      await orologioFermo(page)
      await avvio(page, pvgis)
      await radioB(page).check()
      const m = await page.evaluate(() => {
        const bars = [...document.querySelectorAll('.chart-bar-fill')].map((e) => e.getBoundingClientRect().width)
        const valori = [...document.querySelectorAll('.chart-value')].map((e) => e.textContent)
        const kwh = [...document.querySelectorAll('.chart-bar')].map((e) => Number(e.getAttribute('aria-label')!.replace(/\D/g, '')))
        return { bars, valori, kwh }
      })
      expect(m.bars).toHaveLength(12)
      for (const w of m.bars) expect(w).toBeLessThanOrEqual(24.01)
      expect(m.valori).toHaveLength(2)
      expect(m.valori.map((v) => Number(v!.replace(/\D/g, ''))).sort((a, b) => a - b)).toEqual([Math.min(...m.kwh), Math.max(...m.kwh)])
      // Tabella dei valori disponibile, 12 righe.
      await page.getByText('Tabella dei valori mensili').click()
      await expect(page.locator('.chart-table tbody tr')).toHaveCount(12)
      // Tab sul primo mese: l'anello compare, attorno alla fascia, tratto ≥ 2 px, non sulla barra.
      const primo = page.locator('.chart-bar').first()
      await primo.focus()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
      await expect(primo).toBeFocused()
      const f = await primo.evaluate((el) => {
        const cf = el.querySelector('.chart-focus')!
        const s = getComputedStyle(cf)
        const rf = cf.getBoundingClientRect()
        const bf = el.querySelector('.chart-bar-fill')!.getBoundingClientRect()
        return { display: s.display, w: parseFloat(s.strokeWidth), stroke: s.stroke, fill: s.fill, rfW: rf.width, bfW: bf.width, rfL: rf.left, bfL: bf.left, rfR: rf.right, bfR: bf.right }
      })
      expect(f.display).not.toBe('none')
      expect(f.w).toBeGreaterThanOrEqual(2)
      expect(f.fill).toBe('none')
      expect(f.rfW).toBeGreaterThan(f.bfW)
      expect(f.rfL).toBeLessThan(f.bfL)
      expect(f.rfR).toBeGreaterThan(f.bfR)
    })
  }

  test('passaggio del mouse: valore del mese in un suggerimento, nessun errore', async ({ page, pvgis }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await orologioFermo(page)
    await avvio(page, pvgis)
    await radioB(page).check()
    await page.locator('.chart-bar').nth(6).hover()
    await expect(page.locator('.chart-tooltip')).toContainText('Luglio')
  })
})

// ---------------------------------------------------------------------------------------------
// Preferenze del sistema: forced-colors, riduzione del movimento, ingrandimento del testo.
// ---------------------------------------------------------------------------------------------
test.describe('preferenze del sistema', () => {
  for (const look of ['a', 'b'] as const) {
    test(`forced-colors, aspetto ${look.toUpperCase()}: interruttore visibile, anello di focus e bordo con colori di sistema`, async ({ page, pvgis }) => {
      await page.emulateMedia({ forcedColors: 'active' })
      await orologioFermo(page)
      await avvio(page, pvgis)
      await scegli(page, look)
      const radio = look === 'a' ? radioA(page) : radioB(page)
      await expect(radio).toBeVisible()
      await expect(radio).toBeChecked()
      const m = await page.evaluate(() => {
        const opts = document.querySelector('.look-options')!
        const s = getComputedStyle(opts)
        const lab = getComputedStyle(document.querySelector('.look-option')!)
        return { bordo: s.borderTopColor, bordoW: parseFloat(s.borderTopWidth), bg: getComputedStyle(document.body).backgroundColor, fg: getComputedStyle(document.body).color, testo: lab.color, labBg: lab.backgroundColor }
      })
      expect(m.bordoW).toBeGreaterThan(0)
      expect(contrasto(m.bordo, m.bg), 'bordo').toBeGreaterThanOrEqual(3)
      expect(contrasto(m.testo, m.labBg === 'rgba(0, 0, 0, 0)' ? m.bg : m.labBg), 'testo').toBeGreaterThanOrEqual(4.5)
      // Anello di focus da tastiera sul radio.
      await page.locator('body').click({ position: { x: 1, y: 1 } })
      await page.keyboard.press('Tab')
      await expect(radio).toBeFocused()
      const anello = await page.evaluate(() => {
        const lab = document.querySelector('.look-option:has(input:focus-visible)')
        if (!lab) return null
        const s = getComputedStyle(lab)
        return { stile: s.outlineStyle, w: parseFloat(s.outlineWidth), colore: s.outlineColor, bg: getComputedStyle(document.body).backgroundColor }
      })
      expect(anello).not.toBeNull()
      expect(anello!.stile).not.toBe('none')
      expect(anello!.w).toBeGreaterThan(0)
      expect(contrasto(anello!.colore, anello!.bg)).toBeGreaterThanOrEqual(3)
    })
  }

  test('B: forced-colors con risultati non aggiornati: due cornici in CanvasText, etichette leggibili', async ({ page, pvgis }) => {
    await page.emulateMedia({ forcedColors: 'active' })
    await orologioFermo(page)
    await avvio(page, pvgis)
    await radioB(page).check()
    await impostaPosizione(page, MILANO.lat, MILANO.lon)
    await expect(page.getByText('Valori della posizione precedente')).toHaveCount(2)
    const m = await page.evaluate(() => {
      const text = getComputedStyle(document.body).color
      const cornici = [...document.querySelectorAll('.stale-results.is-stale')].map((e) => { const s = getComputedStyle(e); return { c: s.borderTopColor, st: s.borderTopStyle, w: parseFloat(s.borderTopWidth) } })
      const et = [...document.querySelectorAll('.stale-label')].map((e) => { const s = getComputedStyle(e); return { c: s.color, bg: s.backgroundColor, b: s.borderTopColor } })
      return { text, cornici, et }
    })
    expect(m.cornici).toHaveLength(2)
    for (const c of m.cornici) { expect(c.c).toBe(m.text); expect(c.st).toBe('dashed'); expect(c.w).toBe(2) }
    for (const e of m.et) { expect(e.c).toBe(m.text); expect(contrasto(e.c, e.bg)).toBeGreaterThanOrEqual(4.5) }
  })

  for (const look of ['a', 'b'] as const) {
    test(`prefers-reduced-motion, aspetto ${look.toUpperCase()}: nessuna animazione né transizione attiva dopo il cambio`, async ({ page, pvgis }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await orologioFermo(page)
      await avvio(page, pvgis)
      await scegli(page, look)
      await radioA(page).check()
      await radioB(page).check()
      const m = await page.evaluate(() => ({
        anim: document.getAnimations().map((a) => a.constructor.name + ':' + ((a.effect as KeyframeEffect | null)?.target as Element | null)?.className),
        lunghe: [...document.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return parseFloat(s.transitionDuration) > 0 || parseFloat(s.animationDuration) > 0 }).map((e) => `${e.tagName}.${(e.getAttribute('class') ?? '')}`).filter((x) => !/leaflet/.test(x)).slice(0, 5),
      }))
      expect(m.anim).toEqual([])
      expect(m.lunghe).toEqual([])
    })
  }

  for (const look of ['a', 'b'] as const) {
    test(`testo ingrandito al 200 % e finestra stretta (400 %), aspetto ${look.toUpperCase()}: niente scorrimento orizzontale, interruttore intero`, async ({ page, pvgis }) => {
      await page.setViewportSize({ width: 640, height: 900 }) // 1280 px a zoom 200 %
      await orologioFermo(page)
      await avvio(page, pvgis)
      await scegli(page, look)
      await page.addStyleTag({ content: 'html { font-size: 200% !important }' })
      expect(await sporgenze(page), 'testo 200 %').toEqual([])
      await page.setViewportSize({ width: 320, height: 900 }) // 1280 px a zoom 400 % (reflow WCAG 1.4.10)
      expect(await sporgenze(page), 'reflow 320 px con testo 200 %').toEqual([])
      const box = (await page.getByRole('group', { name: 'Aspetto della pagina' }).boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(320)
      await expect(radioA(page)).toBeVisible()
      await expect(radioB(page)).toBeVisible()
    })
  }
})

// ---------------------------------------------------------------------------------------------
// Piè di pagina sulla privacy: testo nuovo in entrambi gli aspetti.
// ---------------------------------------------------------------------------------------------
test('piè di pagina: dice che si salva solo l\'aspetto scelto; leggibile in A e B', async ({ page, pvgis }) => {
  await orologioFermo(page)
  await avvio(page, pvgis)
  const testo = async () => (await page.locator('footer').innerText()).replace(/\s+/g, ' ')
  const a = await testo()
  await radioB(page).check()
  const b = await testo()
  expect(b).toBe(a)
  expect(a).toContain('non usa cookie')
  expect(a).toContain('una sola informazione: l\'aspetto della pagina')
  expect(a).toContain('Strumento o Giornata di sole')
  expect(a).toContain('PVGIS')
  expect(a).toContain('OpenStreetMap')
})
