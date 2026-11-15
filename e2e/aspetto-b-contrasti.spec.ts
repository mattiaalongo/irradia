import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { DEBOUNCE_MS, MILANO, avvio, contrasto, impostaPosizione, orologioFermo } from './helpers'

// Contrasti dei DUE aspetti (A «Strumento», B «Giornata di sole»), chiaro e scuro, sui colori REALI
// calcolati dal browser (#56 parte 2). Nell'aspetto B la scena ha una SFUMATURA (cielo): ogni elemento
// che sta sul cielo è misurato contro ENTRAMBI gli estremi (--sky-top e --sky-bot) e vale il peggiore.
// Soglie: testi ≥ 4,5:1 (WCAG 1.4.3); parti grafiche, cornice «non aggiornato», anello di focus ≥ 3:1 (1.4.11).

/** `fg2`: secondo colore dello stesso elemento (cursore = riempimento + bordo): basta che UNO dei due si stacchi dal fondo. */
interface Voce { nome: string; fg: string; fg2?: string; bgs: string[]; soglia: number }

/** Misure fatte nella pagina: colore calcolato del primo piano e fondi possibili (uno, o i due estremi del cielo). */
async function misura(page: Page, conStale: boolean): Promise<Voce[]> {
  return page.evaluate((conStale) => {
    const root = document.documentElement
    const rgb = (v: string): string => {
      const e = document.createElement('i')
      e.style.color = `var(${v})`
      document.body.appendChild(e)
      const c = getComputedStyle(e).color
      e.remove()
      return c
    }
    const B = root.getAttribute('data-look') === 'b'
    const cielo = B ? [rgb('--sky-top'), rgb('--sky-bot')] : []
    const opaco = (c: string) => !/rgba?\(.*,\s*0\)$/.test(c) && c !== 'transparent'
    /** Fondi possibili dietro un elemento: primo antenato con colore pieno; se manca e sta sul cielo, i due estremi. */
    const fondi = (el: Element): string[] => {
      for (let e: Element | null = el; e; e = e.parentElement) {
        if (e instanceof SVGElement && e.tagName === 'svg') continue
        if (e === document.documentElement) break
        const bg = getComputedStyle(e).backgroundColor
        if (opaco(bg)) return [bg]
        if (e.tagName === 'MAIN' || e === document.body) break
        if (B && e.matches('.scene, main > header') ) return cielo
      }
      return [getComputedStyle(document.body).backgroundColor]
    }
    const out: { nome: string; fg: string; fg2?: string; bgs: string[]; soglia: number }[] = []
    const nome = (el: Element, extra = '') => `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').split(' ')[0]} ${extra}`.trim()

    // Testi
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('.leaflet-container')) continue
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim() !== '')) continue
      if (el.getClientRects().length === 0 && !(el instanceof SVGElement)) continue
      const s = getComputedStyle(el)
      if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') continue
      if (el.closest('details:not([open])') && !el.closest('summary')) continue
      if (el instanceof SVGElement && s.display === 'none') continue
      const fg = el instanceof SVGElement ? s.fill : s.color
      out.push({ nome: `testo ${nome(el, `"${el.textContent!.trim().slice(0, 24)}"`)}`, fg, bgs: fondi(el), soglia: 4.5 })
    }

    // Parti grafiche: [selettore, proprietà, etichetta]
    const grafiche: [string, 'stroke' | 'fill' | 'borderTopColor', string][] = [
      ['.dial-arc', 'stroke', 'arco vuoto dei comandi'],
      ['.dial-ticks', 'stroke', 'tacche dei comandi'],
      ['.dial-sweep', 'stroke', 'arco pieno (inclinazione)'],
      ['.dial-needle', 'stroke', 'ago'],
      ['.scene-dials .num', 'borderTopColor', 'bordo dei campi (sul cielo)'],
      ['.params .num', 'borderTopColor', 'bordo dei campi (sul fondo)'],
      ['.chart-bar-fill', 'fill', 'barre del grafico'],
      ['.look-options', 'borderTopColor', 'bordo dell\'interruttore'],
    ]
    for (const [sel, prop, etichetta] of grafiche) {
      const els = [...document.querySelectorAll(sel)]
      for (const el of els.slice(0, 2)) {
        const s = getComputedStyle(el)
        const fg = s[prop]
        if (!fg || fg === 'none') continue
        // Il cursore giallo e gli archi nel cielo: fondo = cielo; l'ago è disegnato su fondo = antenato.
        out.push({ nome: `grafica ${etichetta}`, fg, bgs: fondi(el.closest('.look-options') ? el.parentElement! : el), soglia: 3 })
      }
    }
    // Cursore dei comandi: riempimento o bordo, basta che uno si stacchi dal fondo.
    for (const el of [...document.querySelectorAll('.dial-handle')].slice(0, 2)) {
      const st = getComputedStyle(el)
      out.push({ nome: 'grafica cursore dei comandi (riempimento o bordo)', fg: st.fill, fg2: st.stroke, bgs: fondi(el), soglia: 3 })
    }
    // Anello di focus: colore della variabile, sul cielo (B) e sul fondo pagina.
    out.push({ nome: 'anello di focus sul fondo pagina', fg: rgb('--focus-ring'), bgs: [getComputedStyle(document.body).backgroundColor], soglia: 3 })
    if (B) out.push({ nome: 'anello di focus sul cielo', fg: rgb('--focus-ring'), bgs: cielo, soglia: 3 })
    // Cursori degli slider (pseudo-elementi: non leggibili dal browser, si usano le variabili).
    if (B) {
      out.push({ nome: 'slider: cursore (giallo-sole o bordo) vs fondo', fg: rgb('--signal'), fg2: rgb('--thumb-edge'), bgs: [getComputedStyle(document.body).backgroundColor], soglia: 3 })
      out.push({ nome: 'slider: parte vuota vs fondo', fg: rgb('--track'), bgs: [getComputedStyle(document.body).backgroundColor], soglia: 3 })
      out.push({ nome: 'slider: parte piena vs fondo', fg: rgb('--bar'), bgs: [getComputedStyle(document.body).backgroundColor], soglia: 3 })
    }
    // Cornice «Valori della posizione precedente» (#42)
    if (conStale) {
      for (const el of document.querySelectorAll('.stale-results.is-stale')) {
        out.push({ nome: `cornice #42 (${el.closest('.scene') ? 'sul cielo' : 'sul fondo'})`, fg: getComputedStyle(el).borderTopColor, bgs: fondi(el), soglia: 3 })
      }
    }
    return out
  }, conStale)
}

/** Contrasto peggiore di una voce contro tutti i suoi fondi. */
const peggiore = (v: Voce) =>
  Math.min(...v.bgs.map((bg) => Math.max(contrasto(v.fg, bg), v.fg2 ? contrasto(v.fg2, bg) : 0)))

for (const look of ['a', 'b'] as const) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`contrasti: aspetto ${look.toUpperCase()}, tema ${colorScheme} (fondo peggiore della sfumatura)`, async ({ page, pvgis }) => {
      await page.emulateMedia({ colorScheme })
      await page.setViewportSize({ width: 1280, height: 900 })
      await orologioFermo(page)
      await avvio(page, pvgis)
      if (look === 'b') await page.getByRole('radio', { name: 'Giornata di sole', exact: true }).check()
      await page.getByText('Come è calcolata la stima').click()
      await page.getByText('Tabella dei valori mensili').click()
      const voci = await misura(page, false)
      const sotto = voci.filter((v) => peggiore(v) < v.soglia).map((v) => `${v.nome}: ${peggiore(v).toFixed(2)} < ${v.soglia}`)
      // Tabella dei valori (una riga per voce distinta, il peggiore per nome).
      const perNome = new Map<string, number>()
      for (const v of voci) perNome.set(v.nome.replace(/ "[^"]*"$/, ''), Math.min(perNome.get(v.nome.replace(/ "[^"]*"$/, '')) ?? 99, peggiore(v)))
      console.log(`# ${look.toUpperCase()} ${colorScheme}\n` + [...perNome].map(([n, c]) => `${n}\t${c.toFixed(2)}`).join('\n'))
      expect(sotto).toEqual([])
    })
  }
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`contrasti B con risultati non aggiornati: tema ${colorScheme}`, async ({ page, pvgis }) => {
    await page.emulateMedia({ colorScheme })
    await page.setViewportSize({ width: 1280, height: 900 })
    await orologioFermo(page)
    await avvio(page, pvgis)
    await page.getByRole('radio', { name: 'Giornata di sole', exact: true }).check()
    await impostaPosizione(page, MILANO.lat, MILANO.lon)
    await expect(page.getByText('Valori della posizione precedente')).toHaveCount(2)
    void DEBOUNCE_MS
    const voci = await misura(page, true)
    const stale = voci.filter((v) => v.nome.startsWith('cornice #42') || /Valori della posizione|6\.498|kWh/.test(v.nome))
    expect(stale.length).toBeGreaterThan(2)
    const sotto = voci.filter((v) => peggiore(v) < v.soglia).map((v) => `${v.nome}: ${peggiore(v).toFixed(2)} < ${v.soglia}`)
    console.log(`# B stale ${colorScheme}\n` + stale.map((v) => `${v.nome}\t${peggiore(v).toFixed(2)}`).join('\n'))
    expect(sotto).toEqual([])
  })
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`contrasti B con errore di PVGIS (messaggio e «Riprova» sulla scena): tema ${colorScheme}`, async ({ page, pvgis, consoleGuard }) => {
    consoleGuard.allow(/Failed to load resource/)
    await page.emulateMedia({ colorScheme })
    await page.setViewportSize({ width: 1280, height: 900 })
    await orologioFermo(page)
    await avvio(page, pvgis)
    await page.getByRole('radio', { name: 'Giornata di sole', exact: true }).check()
    pvgis.gatewayError(502)
    await impostaPosizione(page, MILANO.lat, MILANO.lon)
    await page.clock.runFor(DEBOUNCE_MS)
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Riprova', exact: true })).toBeVisible()
    const voci = await misura(page, true)
    const err = voci.filter((v) => /status|reload-button/.test(v.nome))
    expect(err.length).toBeGreaterThan(1)
    console.log(`# B errore ${colorScheme}\n` + err.map((v) => `${v.nome}\t${peggiore(v).toFixed(2)}`).join('\n'))
    expect(voci.filter((v) => peggiore(v) < v.soglia).map((v) => `${v.nome}: ${peggiore(v).toFixed(2)}`)).toEqual([])
  })
}
