import { expect, test } from './fixtures'
import { MONTH_NAMES } from '../src/ui/format'
import { DEBOUNCE_MS, ETICHETTE, avvio, campo, orologioFermo, sincronizza, slider, totale } from './helpers'

// Controllo dei campi numerici e uso da tastiera.
// Comportamento reale dell'app (NumberSlider): un testo non valido mostra il messaggio e
// aria-invalid=true, il valore dell'app resta l'ultimo valido; all'uscita dal campo (blur)
// il campo torna a mostrare l'ultimo valore valido.

const MSG_NUMERO = 'Inserisci un numero'
const MSG_INTERO = 'Inserisci un numero intero'

interface Caso {
  titolo: string
  etichetta: string
  testo: string
  messaggio: string
  /** Valore che il campo deve mostrare dopo l'uscita (ultimo valore valido). */
  dopoBlur: string
}

const LAT_OK = '41,9028'
const casi: Caso[] = [
  { titolo: 'latitudine 33,9 (sotto il minimo 34)', etichetta: ETICHETTE.lat, testo: '33,9', messaggio: 'Il valore deve essere tra 34 e 72', dopoBlur: LAT_OK },
  { titolo: 'latitudine 72,1 (sopra il massimo 72)', etichetta: ETICHETTE.lat, testo: '72,1', messaggio: 'Il valore deve essere tra 34 e 72', dopoBlur: LAT_OK },
  { titolo: 'latitudine "abc"', etichetta: ETICHETTE.lat, testo: 'abc', messaggio: MSG_NUMERO, dopoBlur: LAT_OK },
  { titolo: 'latitudine "1e3" (notazione esponenziale)', etichetta: ETICHETTE.lat, testo: '1e3', messaggio: MSG_NUMERO, dopoBlur: LAT_OK },
  { titolo: 'latitudine vuota', etichetta: ETICHETTE.lat, testo: '', messaggio: MSG_NUMERO, dopoBlur: LAT_OK },
  { titolo: 'latitudine "NaN"', etichetta: ETICHETTE.lat, testo: 'NaN', messaggio: MSG_NUMERO, dopoBlur: LAT_OK },
  { titolo: 'latitudine "Infinity"', etichetta: ETICHETTE.lat, testo: 'Infinity', messaggio: MSG_NUMERO, dopoBlur: LAT_OK },
  { titolo: 'latitudine "41,5,2" (due virgole)', etichetta: ETICHETTE.lat, testo: '41,5,2', messaggio: MSG_NUMERO, dopoBlur: LAT_OK },
  { titolo: 'latitudine "41.5.2" (due punti)', etichetta: ETICHETTE.lat, testo: '41.5.2', messaggio: MSG_NUMERO, dopoBlur: LAT_OK },
  { titolo: 'latitudine "41,5.2" (virgola e punto)', etichetta: ETICHETTE.lat, testo: '41,5.2', messaggio: MSG_NUMERO, dopoBlur: LAT_OK },
  { titolo: 'longitudine -25,1 (sotto il minimo -25)', etichetta: ETICHETTE.lon, testo: '-25,1', messaggio: 'Il valore deve essere tra -25 e 45', dopoBlur: '12,4964' },
  { titolo: 'longitudine 45,1 (sopra il massimo 45)', etichetta: ETICHETTE.lon, testo: '45,1', messaggio: 'Il valore deve essere tra -25 e 45', dopoBlur: '12,4964' },
  { titolo: 'pannelli "2,5" (non intero)', etichetta: ETICHETTE.pannelli, testo: '2,5', messaggio: MSG_INTERO, dopoBlur: '10' },
  { titolo: 'pannelli 0 (sotto il minimo 1)', etichetta: ETICHETTE.pannelli, testo: '0', messaggio: 'Il valore deve essere tra 1 e 50', dopoBlur: '10' },
  { titolo: 'pannelli 51 (sopra il massimo 50)', etichetta: ETICHETTE.pannelli, testo: '51', messaggio: 'Il valore deve essere tra 1 e 50', dopoBlur: '10' },
  { titolo: 'pannelli negativo', etichetta: ETICHETTE.pannelli, testo: '-3', messaggio: 'Il valore deve essere tra 1 e 50', dopoBlur: '10' },
  { titolo: 'inclinazione 91', etichetta: ETICHETTE.inclinazione, testo: '91', messaggio: 'Il valore deve essere tra 0 e 90', dopoBlur: '35' },
  { titolo: 'inclinazione -1', etichetta: ETICHETTE.inclinazione, testo: '-1', messaggio: 'Il valore deve essere tra 0 e 90', dopoBlur: '35' },
  { titolo: 'inclinazione decimale 35,5', etichetta: ETICHETTE.inclinazione, testo: '35,5', messaggio: MSG_INTERO, dopoBlur: '35' },
  { titolo: 'azimut 360 (massimo 359)', etichetta: ETICHETTE.azimut, testo: '360', messaggio: 'Il valore deve essere tra 0 e 359', dopoBlur: '180' },
  { titolo: 'potenza 99 (minimo 100)', etichetta: ETICHETTE.potenza, testo: '99', messaggio: 'Il valore deve essere tra 100 e 700', dopoBlur: '430' },
  { titolo: 'potenza 701 (massimo 700)', etichetta: ETICHETTE.potenza, testo: '701', messaggio: 'Il valore deve essere tra 100 e 700', dopoBlur: '430' },
  { titolo: 'perdite 30,1 (massimo 30)', etichetta: ETICHETTE.perdite, testo: '30,1', messaggio: 'Il valore deve essere tra 0 e 30', dopoBlur: '14,0' },
  { titolo: 'perdite -0,1 (minimo 0)', etichetta: ETICHETTE.perdite, testo: '-0,1', messaggio: 'Il valore deve essere tra 0 e 30', dopoBlur: '14,0' },
]

test.describe('valori non validi', () => {
  for (const c of casi) {
    test(`${c.titolo}: messaggio, aria-invalid, nessuna richiesta, ultimo valore valido all'uscita`, async ({ page, pvgis }) => {
      await orologioFermo(page)
      await avvio(page, pvgis)
      const prima = pvgis.count
      const risultatoPrima = await totale(page).innerText()

      const input = campo(page, c.etichetta)
      await input.fill(c.testo)
      await expect(input).toHaveAttribute('aria-invalid', 'true')
      // Un solo avviso nella pagina, con il testo giusto.
      await expect(page.getByRole('alert')).toHaveText(c.messaggio)

      // Passa più tempo dell'attesa: nessun download e il risultato non cambia.
      await page.clock.runFor(5 * DEBOUNCE_MS)
      await sincronizza(page)
      expect(pvgis.count).toBe(prima)
      expect(await totale(page).innerText()).toBe(risultatoPrima)
      await expect(page.locator('body')).not.toContainText('NaN')

      // All'uscita dal campo torna l'ultimo valore valido e l'avviso sparisce.
      await input.blur()
      await expect(input).toHaveValue(c.dopoBlur)
      await expect(input).toHaveAttribute('aria-invalid', 'false')
      await expect(page.getByRole('alert')).toHaveCount(0)
    })
  }

  test('lo slider non cambia mentre il testo è non valido', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await campo(page, ETICHETTE.inclinazione).fill('abc')
    await expect(slider(page, ETICHETTE.inclinazione)).toHaveValue('35')
  })

  test('ultimo valore valido: scrivo 45, poi un testo non valido, esco dal campo', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const lat = campo(page, ETICHETTE.lat)
    await lat.fill('45')
    await expect(lat).toHaveAttribute('aria-invalid', 'false')
    await lat.fill('33,9')
    await expect(lat).toHaveAttribute('aria-invalid', 'true')
    await lat.blur()
    await expect(lat).toHaveValue('45,0000')
  })
})

test.describe('input malevoli', () => {
  const ostili = [
    '<script>window.__xss = 1</script>',
    '<img src=x onerror="window.__xss=1">',
    '"><svg onload=window.__xss=1>',
    "'; DROP TABLE x; --",
    '../../etc/passwd',
    '${7*7}',
    '{{7*7}}',
    'A'.repeat(200_000),
  ]
  for (const testo of ostili) {
    test(`testo ostile (${testo.slice(0, 30)}${testo.length > 30 ? '…' : ''}) nei campi: solo "Inserisci un numero", nessuna esecuzione`, async ({ page, pvgis }) => {
      await orologioFermo(page)
      await avvio(page, pvgis)
      const prima = pvgis.count
      for (const etichetta of [ETICHETTE.lat, ETICHETTE.pannelli, ETICHETTE.perdite]) {
        const input = campo(page, etichetta)
        await input.fill(testo)
        await expect(page.getByRole('alert')).toHaveText(MSG_NUMERO)
        await expect(input).toHaveAttribute('aria-invalid', 'true')
        await input.blur()
      }
      expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
      await page.clock.runFor(5 * DEBOUNCE_MS)
      await sincronizza(page)
      // Nessun dato dell'utente finisce in una richiesta: nessuna richiesta, e il risultato resta.
      expect(pvgis.count).toBe(prima)
      await expect(totale(page)).toContainText('kWh')
    })
  }
})

test.describe('valori validi', () => {
  const validi: [string, string, string][] = [
    ['virgola decimale', ETICHETTE.lat, '41,5'],
    ['punto decimale', ETICHETTE.lat, '41.5'],
    ['spazi attorno al numero', ETICHETTE.lat, '  41,5  '],
    ['minimo della latitudine', ETICHETTE.lat, '34'],
    ['massimo della latitudine', ETICHETTE.lat, '72'],
    ['minimo della longitudine', ETICHETTE.lon, '-25'],
    ['massimo della longitudine', ETICHETTE.lon, '45'],
    ['inclinazione 0', ETICHETTE.inclinazione, '0'],
    ['inclinazione 90', ETICHETTE.inclinazione, '90'],
    ['azimut 0', ETICHETTE.azimut, '0'],
    ['azimut 359', ETICHETTE.azimut, '359'],
    ['1 pannello', ETICHETTE.pannelli, '1'],
    ['50 pannelli', ETICHETTE.pannelli, '50'],
    ['potenza 100', ETICHETTE.potenza, '100'],
    ['potenza 700', ETICHETTE.potenza, '700'],
    ['perdite 0', ETICHETTE.perdite, '0'],
    ['perdite 30', ETICHETTE.perdite, '30'],
    ['perdite con punto 12.5', ETICHETTE.perdite, '12.5'],
  ]
  for (const [titolo, etichetta, testo] of validi) {
    test(`${titolo} ("${testo}") è accettato: nessun errore e nessun NaN`, async ({ page, pvgis }) => {
      await orologioFermo(page)
      await avvio(page, pvgis)
      const input = campo(page, etichetta)
      await input.fill(testo)
      await expect(input).toHaveAttribute('aria-invalid', 'false')
      await expect(page.getByRole('alert')).toHaveCount(0)
      await page.clock.runFor(DEBOUNCE_MS)
      await expect(totale(page)).toContainText('kWh')
      await expect(page.locator('body')).not.toContainText('NaN')
    })
  }
})

test.describe('tastiera', () => {
  test('Tab raggiunge in ordine i parametri e poi le 12 barre, sempre con fuoco visibile', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)

    const parametri = [
      ETICHETTE.lat, ETICHETTE.lon, ETICHETTE.inclinazione, ETICHETTE.azimut, ETICHETTE.pannelli,
      ETICHETTE.potenza, ETICHETTE.perdite,
    ]
    // Nel DOM, per ogni parametro lo slider precede il campo di testo.
    const ordine = parametri.flatMap((e) => [slider(page, e), campo(page, e)])

    // La mappa (contenitore, due pulsanti di zoom, link all'attribuzione) precede i campi:
    // si parte dall'ultimo suo controllo, così il primo Tab arriva al primo parametro.
    // (La prova della mappa è in mappa.spec.ts.)
    const attribuzione = page.getByRole('link', { name: 'OpenStreetMap' })
    await expect(attribuzione).toBeVisible()
    await attribuzione.focus()
    for (const controllo of ordine) {
      await page.keyboard.press('Tab')
      await expect(controllo).toBeFocused()
      // Fuoco visibile: contorno disegnato (stile e spessore non nulli).
      const outline = await controllo.evaluate((el) => {
        const s = getComputedStyle(el)
        return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) }
      })
      expect(outline.style, 'outline-style').not.toBe('none')
      expect(outline.width, 'outline-width').toBeGreaterThan(0)
    }

    for (let m = 0; m < 12; m++) {
      await page.keyboard.press('Tab')
      const barra = page.getByRole('img', { name: new RegExp(`^${MONTH_NAMES[m]}:`) })
      await expect(barra).toBeFocused()
      // Le barre non hanno outline (vedi index.css): il fuoco è un tratto sul rettangolo sensibile.
      const tratto = await barra.locator('rect').evaluate((el) => getComputedStyle(el).strokeWidth)
      expect(parseFloat(tratto), `tratto di fuoco della barra ${m + 1}`).toBeGreaterThan(0)
    }
  })

  test('Tab su una barra mostra il valore del mese; spostando il fuoco cambia', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const gennaio = page.getByRole('img', { name: /^Gennaio: .* kWh$/ })
    await gennaio.focus()
    await expect(page.getByText(/^Gennaio [\d.]+ kWh$/)).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(page.getByText(/^Febbraio [\d.]+ kWh$/)).toBeVisible()
    await expect(page.getByText(/^Gennaio [\d.]+ kWh$/)).toHaveCount(0)
  })

  test('freccia destra sullo slider dell\'inclinazione: 35 → 36, anche nel campo', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const s = slider(page, ETICHETTE.inclinazione)
    await s.focus()
    await expect(s).toHaveValue('35')
    await page.keyboard.press('ArrowRight')
    await expect(s).toHaveValue('36')
    await expect(campo(page, ETICHETTE.inclinazione)).toHaveValue('36')
    // Lo slider dell'inclinazione non provoca richieste.
    const prima = pvgis.count
    await page.clock.runFor(5 * DEBOUNCE_MS)
    await sincronizza(page)
    expect(pvgis.count).toBe(prima)
  })

  test('freccia sinistra al minimo dell\'inclinazione non va sotto 0', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const s = slider(page, ETICHETTE.inclinazione)
    await campo(page, ETICHETTE.inclinazione).fill('0')
    await s.focus()
    await page.keyboard.press('ArrowLeft')
    await expect(s).toHaveValue('0')
    await expect(page.locator('body')).not.toContainText('NaN')
  })
})
