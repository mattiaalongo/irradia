import type { Page } from '@playwright/test'
import { expect, test, type PvgisMock } from './fixtures'
import {
  DEBOUNCE_MS, ETICHETTE, MILANO, ROMA, avvio, campo, impostaPosizione, orologioFermo, sincronizza, slider, totale,
} from './helpers'

// Comportamento di rete dell'app: attesa prima del download, numero di richieste, errori.
//
// Quasi tutte le prove usano un orologio finto FERMO (page.clock): il tempo avanza solo
// quando la prova lo chiede, così "0,8 s" si verifica al millisecondo e senza attese reali.
// Il fetch non è finto: la rete (simulata da page.route) continua a rispondere in tempo reale.

test.describe('attesa prima del download', () => {
  test('0 richieste a 799 ms, 1 a 800 ms dall\'ultima modifica', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const prima = pvgis.count

    await campo(page, ETICHETTE.lat).fill('45,4642')
    await page.clock.runFor(DEBOUNCE_MS - 1)
    await sincronizza(page)
    expect(pvgis.count).toBe(prima)

    await page.clock.runFor(1)
    await expect.poll(() => pvgis.count).toBe(prima + 1)
    expect(pvgis.requests.at(-1)?.lat).toBe(45.4642)
  })

  test('una nuova modifica azzera l\'attesa', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const prima = pvgis.count

    await campo(page, ETICHETTE.lat).fill('45,4642')
    await page.clock.runFor(700)
    await campo(page, ETICHETTE.lon).fill('9,19')
    await page.clock.runFor(700) // 1400 ms dalla prima modifica, 700 dall'ultima
    await sincronizza(page)
    expect(pvgis.count).toBe(prima)
    await page.clock.runFor(DEBOUNCE_MS)
    await expect.poll(() => pvgis.count).toBe(prima + 1)
  })

  test('latitudine scritta cifra per cifra: una sola richiesta', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const prima = pvgis.count

    const lat = campo(page, ETICHETTE.lat)
    await lat.fill('')
    await lat.pressSequentially('45,4642')
    await expect(lat).toHaveValue('45,4642')
    await page.clock.runFor(DEBOUNCE_MS)
    await expect.poll(() => pvgis.count).toBe(prima + 1)
    // Nessuna richiesta in più nemmeno lasciando passare molto tempo.
    await page.clock.runFor(10_000)
    await sincronizza(page)
    expect(pvgis.count).toBe(prima + 1)
    expect(pvgis.requests.at(-1)?.lat).toBe(45.4642)
  })

  test('numero e potenza dei pannelli non provocano richieste, ma aggiornano il risultato', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const prima = pvgis.count

    await campo(page, ETICHETTE.pannelli).fill('20')
    await expect(totale(page)).toContainText('Impianto da 8,60 kWp (20 × 430 Wp)')
    await campo(page, ETICHETTE.potenza).fill('450')
    await expect(totale(page)).toContainText('Impianto da 9,00 kWp (20 × 450 Wp)')
    await slider(page, ETICHETTE.potenza).fill('500')
    await expect(totale(page)).toContainText('Impianto da 10,00 kWp (20 × 500 Wp)')

    await page.clock.runFor(10_000)
    await sincronizza(page)
    expect(pvgis.count).toBe(prima)
  })

  test('Roma → Milano → Roma: 2 richieste in totale (la memoria evita la terza)', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    expect(pvgis.count).toBe(1)

    await impostaPosizione(page, MILANO.lat, MILANO.lon)
    await page.clock.runFor(DEBOUNCE_MS)
    await expect(page.getByText(/45,4642° N/)).toBeVisible()
    expect(pvgis.count).toBe(2)

    await impostaPosizione(page, ROMA.lat, ROMA.lon)
    // Già in memoria: i dati di Roma tornano subito, senza attesa.
    await expect(page.getByText(/41,9028° N/)).toBeVisible()
    await page.clock.runFor(10_000)
    await sincronizza(page)
    expect(pvgis.count).toBe(2)
    expect(pvgis.requests.map((r) => r.lat)).toEqual([41.9028, 45.4642])
  })
})

test.describe('errori di PVGIS', () => {
  const MSG = /Dati non disponibili per questa posizione\./

  /** Dopo un primo caricamento riuscito (Roma) passa a Milano con il nuovo scenario già attivo. */
  async function milanoConScenario(page: Page, pvgis: PvgisMock): Promise<void> {
    await orologioFermo(page)
    await avvio(page, pvgis)
  }

  const scenari: { nome: string; attiva: (p: PvgisMock) => void; testo: RegExp; consoleAttesa: boolean; generico?: false }[] = [
    // Mare: testo dedicato, senza "HTTP 400" né inglese (issue #11).
    { nome: 'HTTP 400 in mare', attiva: (p) => p.fail(400, 'Location over the sea. Please, select another location'),
      testo: /Il punto scelto risulta in mare.*Scegli un punto sulla terraferma\. I valori mostrati sono quelli della posizione precedente\./, consoleAttesa: true, generico: false },
    { nome: 'pagina HTML con codice 200 (firewall)', attiva: (p) => p.firewallHtml(),
      testo: /non leggibile come JSON/, consoleAttesa: false },
    { nome: 'rete assente', attiva: (p) => p.offline(),
      testo: /Impossibile contattare PVGIS/, consoleAttesa: true },
    { nome: 'JSON malformato', attiva: (p) => p.malformedJson(),
      testo: /non leggibile come JSON/, consoleAttesa: false },
  ]

  for (const s of scenari) {
    test(`${s.nome}: avviso, nessun NaN, risultato precedente ancora visibile`, async ({ page, pvgis, consoleGuard }) => {
      // Il browser scrive da solo "Failed to load resource" per le risposte HTTP di errore.
      if (s.consoleAttesa) consoleGuard.allow(/Failed to load resource/)
      await milanoConScenario(page, pvgis)
      const totalePrima = await totale(page).innerText()

      s.attiva(pvgis)
      await impostaPosizione(page, MILANO.lat, MILANO.lon)
      await page.clock.runFor(DEBOUNCE_MS)

      const avviso = page.getByRole('alert')
      await expect(avviso).toBeVisible()
      if (s.generico !== false) await expect(avviso).toContainText(MSG)
      await expect(avviso).toContainText(s.testo)
      await expect(page.locator('body')).not.toContainText('NaN')
      // Il risultato di Roma resta (attenuato), identico a prima.
      await expect(totale(page)).toBeVisible()
      expect(await totale(page).innerText()).toBe(totalePrima)
      await expect(page.getByRole('region', { name: 'Risultati' })).toHaveAttribute('aria-busy', 'false')
    })
  }

  test('un messaggio di errore con HTML/script è mostrato come testo, senza eseguirlo', async ({ page, pvgis, consoleGuard }) => {
    consoleGuard.allow(/Failed to load resource/)
    await milanoConScenario(page, pvgis)
    pvgis.fail(400, '<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>')
    await impostaPosizione(page, MILANO.lat, MILANO.lon)
    await page.clock.runFor(DEBOUNCE_MS)
    await expect(page.getByRole('alert')).toContainText('<img src=x onerror="window.__xss=1">')
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
    await expect(page.locator('img[src="x"]')).toHaveCount(0)
  })

  test('risposta 200 con un JSON valido ma di dimensione enorme (messaggio da 5 MB) non blocca la pagina', async ({ page, pvgis, consoleGuard }) => {
    consoleGuard.allow(/Failed to load resource/)
    await milanoConScenario(page, pvgis)
    pvgis.fail(500, 'x'.repeat(5_000_000))
    await impostaPosizione(page, MILANO.lat, MILANO.lon)
    await page.clock.runFor(DEBOUNCE_MS)
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(campo(page, ETICHETTE.pannelli)).toBeEditable()
  })

  test('JSON valido ma con struttura sbagliata (es. unità cambiate) → avviso, nessun NaN', async ({ page, pvgis }) => {
    await milanoConScenario(page, pvgis)
    pvgis.use((route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"inputs":{},"outputs":{},"meta":{}}' }))
    await impostaPosizione(page, MILANO.lat, MILANO.lon)
    await page.clock.runFor(DEBOUNCE_MS)
    await expect(page.getByRole('alert')).toContainText(MSG)
    await expect(page.getByRole('alert')).toContainText('Risposta PVGIS non valida')
    await expect(page.locator('body')).not.toContainText('NaN')
  })

  test('errore al primo caricamento: avviso e nessun totale', async ({ page, pvgis, consoleGuard }) => {
    consoleGuard.allow(/Failed to load resource/)
    pvgis.fail(400, 'Location over the sea')
    await orologioFermo(page)
    await page.goto('/')
    await expect(campo(page, ETICHETTE.lat)).toBeVisible()
    await expect
      .poll(async () => {
        await page.clock.runFor(DEBOUNCE_MS)
        return pvgis.count
      })
      .toBe(1)
    await expect(page.getByRole('alert')).toContainText('Il punto scelto risulta in mare')
    await expect(totale(page)).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText('NaN')
  })

  test('dopo l\'errore, tornando a una posizione valida l\'avviso sparisce', async ({ page, pvgis, consoleGuard }) => {
    consoleGuard.allow(/Failed to load resource/)
    await milanoConScenario(page, pvgis)
    pvgis.fail(400, 'Location over the sea')
    await impostaPosizione(page, MILANO.lat, MILANO.lon)
    await page.clock.runFor(DEBOUNCE_MS)
    await expect(page.getByRole('alert')).toBeVisible()

    pvgis.useDefault()
    await impostaPosizione(page, ROMA.lat, ROMA.lon) // Roma è in memoria
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(totale(page)).toBeVisible()
  })

  // Issue #15 (https://github.com/mattiaalongo/irradia/issues/15): con PVGIS in errore il
  // riepilogo "Impianto da X kWp (N × P Wp)" sembrava non aggiornarsi cambiando i pannelli,
  // mostrando la nuova potenza del singolo pannello ma i kWp vecchi.
  // NON riproducibile sulla build di produzione (quella provata qui): il riepilogo si aggiorna
  // subito, in errore come a PVGIS funzionante. Con `npm run dev` invece i kWp restano indietro
  // di un passo per circa un secondo, anche SENZA errore (useDeferredValue in sviluppo): vedi il
  // rapporto del tester. Per questo non è marcata `test.fail()`: la prova resta come guardia
  // del comportamento corretto (riepilogo coerente: kWp = N × P) durante l'errore.
  test('riepilogo kWp coerente durante l\'errore (issue #15)', async ({ page, pvgis, consoleGuard }) => {
    consoleGuard.allow(/Failed to load resource/)
    await milanoConScenario(page, pvgis)
    await expect(totale(page)).toContainText('Impianto da 4,30 kWp (10 × 430 Wp)')

    pvgis.fail(400, 'Location over the sea')
    await impostaPosizione(page, MILANO.lat, MILANO.lon)
    await page.clock.runFor(DEBOUNCE_MS)
    await expect(page.getByRole('alert')).toBeVisible()

    await campo(page, ETICHETTE.potenza).fill('435')
    await expect(totale(page)).toContainText('Impianto da 4,35 kWp (10 × 435 Wp)')
    await slider(page, ETICHETTE.potenza).fill('500')
    await expect(totale(page)).toContainText('Impianto da 5,00 kWp (10 × 500 Wp)')
    await campo(page, ETICHETTE.pannelli).fill('20')
    await expect(totale(page)).toContainText('Impianto da 10,00 kWp (20 × 500 Wp)')
  })
})

test.describe('risposta lenta', () => {
  test('al primo caricamento: aria-busy=true e messaggio, poi il risultato', async ({ page, pvgis }) => {
    const risposta = pvgis.hold()
    await orologioFermo(page)
    await page.goto('/')
    await expect
      .poll(async () => {
        await page.clock.runFor(DEBOUNCE_MS)
        return pvgis.count
      })
      .toBe(1)

    const risultati = page.getByRole('region', { name: 'Risultati' })
    await expect(risultati).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByText('Scarico l\'anno tipo da PVGIS…')).toBeVisible()
    await expect(totale(page)).toHaveCount(0)

    risposta.release()
    await expect(totale(page)).toContainText('kWh')
    await expect(risultati).toHaveAttribute('aria-busy', 'false')
    await expect(page.getByText('Scarico l\'anno tipo da PVGIS…')).toHaveCount(0)
  })

  test('cambiando posizione: caricamento visibile e dati precedenti ancora presenti', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const risposta = pvgis.hold()

    await impostaPosizione(page, MILANO.lat, MILANO.lon)
    await page.clock.runFor(DEBOUNCE_MS)
    const risultati = page.getByRole('region', { name: 'Risultati' })
    await expect(risultati).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByText('Scarico l\'anno tipo da PVGIS…')).toBeVisible()
    await expect(totale(page)).toBeVisible()

    risposta.release()
    await expect(page.getByText(/45,4642° N/)).toBeVisible()
    await expect(risultati).toHaveAttribute('aria-busy', 'false')
  })
})
