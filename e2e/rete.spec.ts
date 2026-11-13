import type { Page } from '@playwright/test'
import { expect, test, type PvgisMock } from './fixtures'
import {
  DEBOUNCE_MS, ETICHETTE, MILANO, ROMA, avvio, campo, contrasto, impostaPosizione, orologioFermo, sincronizza, slider, totale,
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
      testo: /Per il punto scelto non ci sono dati: risulta in mare.*Scegli un punto sulla terraferma\. I valori mostrati sono quelli della posizione precedente\./, consoleAttesa: true, generico: false },
    { nome: 'pagina HTML con codice 200 (firewall)', attiva: (p) => p.firewallHtml(),
      testo: /non leggibile come JSON/, consoleAttesa: false },
    // Rete assente: stesso testo del servizio non raggiungibile (issue #21).
    { nome: 'rete assente', attiva: (p) => p.offline(),
      testo: /Riprova tra qualche secondo\. I valori mostrati sono quelli della posizione precedente\./, consoleAttesa: true, generico: false },
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
    // Il dettaglio è accorciato a 300 caratteri + "…" (decisione del PO del 13/11/2026, #47):
    // prima finivano nella pagina tutti i 5 MB e la prova sfiorava il timeout. Il "…" chiude il
    // dettaglio, non l'avviso: dopo può seguire la frase sui valori della posizione precedente.
    const testo = (await page.getByRole('alert').textContent()) ?? ''
    expect(testo.length).toBeLessThan(1000)
    expect(testo).toMatch(MSG)
    expect(testo).toMatch(/x\u2026(\s|$)/)
    expect(testo).not.toContain('x'.repeat(301))
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
    await expect(page.getByRole('alert')).toContainText('risulta in mare')
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

// Issue #15 / #14 punto 1: il riepilogo "Impianto da X kWp (N × P Wp)" non deve MAI assumere,
// nemmeno per un istante, un testo in cui kWp ≠ N × P / 1000 (React scrive prima i campi nuovi
// e poi il risultato differito: si vedrebbero kWp vecchi con N e P nuovi).
// Un MutationObserver nella pagina registra ogni testo assunto dal riepilogo.
test.describe('riepilogo dell\'impianto coerente in ogni istante (issue #15)', () => {
  async function installaOsservatore(page: Page): Promise<void> {
    await page.evaluate(() => {
      const w = window as unknown as { __riepiloghi: string[] }
      w.__riepiloghi = []
      const gruppo = document.querySelector('[role="group"][aria-labelledby]')
      if (!gruppo) throw new Error('gruppo del totale non trovato')
      const leggi = () => {
        const t = gruppo.querySelector('.hero-detail')?.textContent ?? ''
        if (w.__riepiloghi.at(-1) !== t) w.__riepiloghi.push(t)
      }
      leggi()
      new MutationObserver(leggi).observe(gruppo, { subtree: true, childList: true, characterData: true, attributes: true })
    })
  }

  async function stati(page: Page): Promise<string[]> {
    return page.evaluate(() => (window as unknown as { __riepiloghi: string[] }).__riepiloghi)
  }

  function incoerenti(testi: string[]): string[] {
    return testi.filter((t) => {
      const m = /Impianto da ([\d.]+,\d{2}) kWp \((\d+) × (\d+) Wp\)/.exec(t.replace(/\s+/g, ' '))
      if (!m) return true
      const kwp = Number(m[1].replace(/\./g, '').replace(',', '.'))
      return kwp.toFixed(2) !== ((Number(m[2]) * Number(m[3])) / 1000).toFixed(2)
    })
  }

  for (const inErrore of [false, true]) {
    test(`ogni testo del riepilogo è coerente, PVGIS ${inErrore ? 'in errore (mare, HTTP 400)' : 'funzionante'}`, async ({ page, pvgis, consoleGuard }) => {
      if (inErrore) consoleGuard.allow(/Failed to load resource/)
      await orologioFermo(page)
      await avvio(page, pvgis)
      await expect(totale(page)).toContainText('Impianto da 4,30 kWp (10 × 430 Wp)')
      if (inErrore) {
        pvgis.fail(400, 'Location over the sea')
        await impostaPosizione(page, MILANO.lat, MILANO.lon)
        await page.clock.runFor(DEBOUNCE_MS)
        await expect(page.getByRole('alert')).toBeVisible()
      }
      await installaOsservatore(page)

      await campo(page, ETICHETTE.potenza).fill('435')
      await expect(totale(page)).toContainText('Impianto da 4,35 kWp (10 × 435 Wp)')
      const s = slider(page, ETICHETTE.potenza)
      await s.fill('500')
      await expect(totale(page)).toContainText('(10 × 500 Wp)')
      await s.press('ArrowLeft')
      await s.press('ArrowRight')
      await campo(page, ETICHETTE.pannelli).fill('20')
      await expect(totale(page)).toContainText('Impianto da 10,00 kWp (20 × 500 Wp)')
      await campo(page, ETICHETTE.pannelli).fill('7')
      await expect(totale(page)).toContainText('Impianto da 3,50 kWp (7 × 500 Wp)')

      const registrati = await stati(page)
      expect(registrati.length).toBeGreaterThan(3)
      expect(incoerenti(registrati), `stati registrati: ${JSON.stringify(registrati)}`).toEqual([])
    })
  }
})

// Issue #21: con la connessione a PVGIS caduta l'intermediario risponde 502/503/504 senza JSON
// (il proxy di Vite: 502, text/plain, corpo vuoto). L'avviso deve dire che il problema è
// temporaneo, senza "HTTP", "JSON" né "PVGIS" e senza NaN.
test.describe('servizio non raggiungibile (issue #21)', () => {
  const TEMPORANEO =
    'I dati non sono disponibili in questo momento: può essere un problema temporaneo del servizio o della connessione a Internet. Riprova tra qualche secondo.'
  const PRECEDENTE = 'I valori mostrati sono quelli della posizione precedente.'
  const barra = (page: Page) => page.getByTestId('sticky-total')

  /** Primo caricamento senza risposta valida: aspetta che parta l'unica richiesta. */
  async function primoCaricamento(page: Page, pvgis: PvgisMock): Promise<void> {
    await page.goto('/')
    await expect(campo(page, ETICHETTE.lat)).toBeVisible()
    await expect
      .poll(async () => {
        await page.clock.runFor(DEBOUNCE_MS)
        return pvgis.count
      })
      .toBe(1)
  }

  const casi = [
    { nome: '502 vuoto text/plain (proxy di Vite)', status: 502, body: '', contentType: 'text/plain' },
    { nome: '503 pagina HTML', status: 503, body: '<html><body><h1>503 Service Unavailable</h1></body></html>', contentType: 'text/html' },
    { nome: '504 vuoto', status: 504, body: '', contentType: 'text/plain' },
  ]

  for (const c of casi) {
    test(`${c.nome}: avviso "riprova", risultato precedente invariato`, async ({ page, pvgis, consoleGuard }) => {
      consoleGuard.allow(/Failed to load resource/)
      await orologioFermo(page)
      await avvio(page, pvgis)
      const totalePrima = await totale(page).innerText()

      pvgis.gatewayError(c.status, c.body, c.contentType)
      await impostaPosizione(page, MILANO.lat, MILANO.lon)
      await page.clock.runFor(DEBOUNCE_MS)

      const avviso = page.getByRole('alert')
      await expect(avviso).toHaveCount(1)
      await expect(avviso).toHaveText(`${TEMPORANEO} ${PRECEDENTE}`)
      await expect(avviso).not.toContainText(/HTTP|JSON|PVGIS|\d{3}/)
      await expect(page.locator('body')).not.toContainText('NaN')
      expect(await totale(page).innerText()).toBe(totalePrima)
      await expect(page.getByRole('region', { name: 'Risultati' })).toHaveAttribute('aria-busy', 'false')
    })
  }

  test('502 al primo caricamento: avviso senza frase sulla posizione precedente, nessun totale', async ({ page, pvgis, consoleGuard }) => {
    consoleGuard.allow(/Failed to load resource/)
    await orologioFermo(page)
    pvgis.gatewayError(502)
    await primoCaricamento(page, pvgis)
    await expect(page.getByRole('alert')).toHaveText(TEMPORANEO)
    await expect(totale(page)).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText('NaN')
  })

  for (const s of [
    { nome: 'pagina HTML con codice 200 (firewall)', attiva: (p: PvgisMock) => p.firewallHtml() },
    { nome: 'JSON malformato con codice 200', attiva: (p: PvgisMock) => p.malformedJson() },
  ]) {
    test(`${s.nome}: resta il testo generico, non "riprova"`, async ({ page, pvgis }) => {
      await orologioFermo(page)
      await avvio(page, pvgis)
      s.attiva(pvgis)
      await impostaPosizione(page, MILANO.lat, MILANO.lon)
      await page.clock.runFor(DEBOUNCE_MS)
      const avviso = page.getByRole('alert')
      await expect(avviso).toContainText('Dati non disponibili per questa posizione.')
      await expect(avviso).toContainText('non leggibile come JSON')
      await expect(avviso).not.toContainText('Riprova')
    })
  }

  test.describe('barra fissa del telefono', () => {
    test.use({ viewport: { width: 390, height: 800 } })

    test('502 con risultato precedente: "Dati non disponibili ora" e il numero vecchio', async ({ page, pvgis, consoleGuard }) => {
      consoleGuard.allow(/Failed to load resource/)
      await orologioFermo(page)
      await avvio(page, pvgis)
      pvgis.gatewayError(502)
      await impostaPosizione(page, MILANO.lat, MILANO.lon)
      await page.clock.runFor(DEBOUNCE_MS)
      await expect(page.getByRole('alert')).toBeVisible()
      await expect(barra(page)).toContainText('Dati non disponibili ora')
      await expect(barra(page)).toContainText('kWh')
      await expect(barra(page)).not.toContainText(/NaN|HTTP|Aggiorno/)
    })

    test('504 al primo caricamento: "Dati non disponibili ora", nessun numero', async ({ page, pvgis, consoleGuard }) => {
      consoleGuard.allow(/Failed to load resource/)
      await orologioFermo(page)
      pvgis.gatewayError(504)
      await primoCaricamento(page, pvgis)
      await expect(barra(page)).toContainText('Dati non disponibili ora')
      await expect(barra(page)).not.toContainText(/kWh|NaN|HTTP/)
    })
  })
})

// Issue #21, decisione D2 del PO: pulsante "Riprova" per gli errori temporanei (servizio o rete).
test.describe('pulsante "Riprova" (issue #21)', () => {
  const riprova = (page: Page) => page.getByRole('button', { name: 'Riprova', exact: true })
  const risultati = (page: Page) => page.getByRole('region', { name: 'Risultati' })
  const focusSuBody = (page: Page) => page.evaluate(() => document.activeElement === document.body || document.activeElement === null)

  /** Roma caricata, poi Milano con lo scenario d'errore attivo: l'avviso è visibile. */
  async function conErrore(page: Page, pvgis: PvgisMock, attiva: (p: PvgisMock) => void): Promise<void> {
    await orologioFermo(page)
    await avvio(page, pvgis)
    attiva(pvgis)
    await impostaPosizione(page, MILANO.lat, MILANO.lon)
    await page.clock.runFor(DEBOUNCE_MS)
    await expect(page.getByRole('alert')).toBeVisible()
  }

  test('502: un clic = +1 richiesta (anche con due clic rapidi), poi avviso e pulsante spariscono, focus sui risultati', async ({ page, pvgis, consoleGuard }) => {
    consoleGuard.allow(/Failed to load resource/)
    await conErrore(page, pvgis, (p) => p.gatewayError(502))
    const prima = pvgis.count
    const richiesteNuove = () => pvgis.requests.slice(prima)

    // Il pulsante è fuori dall'avviso.
    await expect(page.getByRole('alert').getByRole('button')).toHaveCount(0)
    await expect(riprova(page)).toBeVisible()
    await expect(riprova(page)).toHaveAttribute('aria-disabled', 'false')

    // Risposta tenuta in sospeso: si vede lo stato "in corso" e il doppio clic non raddoppia.
    const gate = pvgis.hold()
    // Da tastiera: dall'ultimo campo dei parametri, Tab porta al pulsante; Invio lo attiva.
    await campo(page, ETICHETTE.perdite).focus()
    await page.keyboard.press('Tab')
    await expect(riprova(page)).toBeFocused()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter') // secondo attivamento rapido: ignorato
    await expect(riprova(page)).toHaveAttribute('aria-disabled', 'true')
    await expect(riprova(page)).toBeFocused()
    expect(await focusSuBody(page)).toBe(false)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect.poll(() => richiesteNuove().length).toBe(1)
    // Nessuna attesa di 0,8 s: la richiesta è già partita con l'orologio fermo.
    await page.clock.runFor(10_000)
    await sincronizza(page)
    expect(richiesteNuove().length).toBe(1)
    expect(richiesteNuove()[0]).toMatchObject({ lat: 45.4642, lon: 9.19 })

    // Anche un clic del mouse mentre è disattivato non fa nulla.
    await riprova(page).dblclick({ force: true })
    await sincronizza(page)
    expect(richiesteNuove().length).toBe(1)

    gate.release()
    await expect(riprova(page)).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(totale(page)).toContainText('kWh')
    // Il pulsante aveva il focus ed è sparito: il focus passa ai risultati, non a <body>.
    await expect(risultati(page)).toBeFocused()
    expect(await focusSuBody(page)).toBe(false)
    expect(richiesteNuove().length).toBe(1)
  })

  test('due clic rapidi del mouse: una sola richiesta', async ({ page, pvgis, consoleGuard }) => {
    consoleGuard.allow(/Failed to load resource/)
    await conErrore(page, pvgis, (p) => p.gatewayError(503, '', 'text/html'))
    const prima = pvgis.count
    pvgis.useDefault()
    await riprova(page).dblclick({ force: true })
    await expect(riprova(page)).toHaveCount(0)
    await expect(totale(page)).toContainText('kWh')
    expect(pvgis.count).toBe(prima + 1)
  })

  test('se anche il secondo tentativo fallisce: l\'avviso resta e "Riprova" torna attivo, focus sul pulsante', async ({ page, pvgis, consoleGuard }) => {
    consoleGuard.allow(/Failed to load resource/)
    await conErrore(page, pvgis, (p) => p.gatewayError(502))
    const prima = pvgis.count
    await riprova(page).focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => pvgis.count).toBe(prima + 1)
    await expect(page.getByRole('alert')).toHaveCount(1)
    await expect(page.getByRole('alert')).toContainText('I dati non sono disponibili in questo momento')
    await expect(riprova(page)).toHaveAttribute('aria-disabled', 'false')
    await expect(riprova(page)).toBeFocused()
    expect(await focusSuBody(page)).toBe(false)

    // Terzo tentativo, questa volta riuscito.
    pvgis.useDefault()
    await page.keyboard.press('Enter')
    await expect(riprova(page)).toHaveCount(0)
    await expect(risultati(page)).toBeFocused()
    expect(pvgis.count).toBe(prima + 2)
  })

  test('rete assente: "Riprova" presente', async ({ page, pvgis, consoleGuard }) => {
    consoleGuard.allow(/Failed to load resource/)
    await conErrore(page, pvgis, (p) => p.offline())
    await expect(riprova(page)).toBeVisible()
    pvgis.useDefault()
    await riprova(page).click()
    await expect(riprova(page)).toHaveCount(0)
    await expect(totale(page)).toContainText('kWh')
  })

  test('primo caricamento fallito senza risultato precedente: "Riprova" presente e funziona', async ({ page, pvgis, consoleGuard }) => {
    consoleGuard.allow(/Failed to load resource/)
    await orologioFermo(page)
    pvgis.gatewayError(504)
    await page.goto('/')
    await expect.poll(async () => { await page.clock.runFor(DEBOUNCE_MS); return pvgis.count }).toBe(1)
    await expect(riprova(page)).toBeVisible()
    pvgis.useDefault()
    await riprova(page).click()
    await expect(totale(page)).toContainText('kWh')
    await expect(riprova(page)).toHaveCount(0)
  })

  const senzaPulsante: { nome: string; attiva: (p: PvgisMock) => void; console: boolean }[] = [
    { nome: 'mare', attiva: (p) => p.fail(400, 'Location over the sea. Please, select another location'), console: true },
    { nome: 'fuori zona', attiva: (p) => p.fail(400, 'Location out of the spatial coverage of PVGIS5'), console: true },
    { nome: 'firewall (HTML con codice 200)', attiva: (p) => p.firewallHtml(), console: false },
    { nome: 'JSON malformato', attiva: (p) => p.malformedJson(), console: false },
  ]
  for (const c of senzaPulsante) {
    test(`${c.nome}: nessun "Riprova"`, async ({ page, pvgis, consoleGuard }) => {
      if (c.console) consoleGuard.allow(/Failed to load resource/)
      await conErrore(page, pvgis, c.attiva)
      await expect(riprova(page)).toHaveCount(0)
      await expect(page.getByRole('button', { name: /riprova/i })).toHaveCount(0)
    })
  }

  test('anello di focus del pulsante: contrasto >= 3 nel tema chiaro e scuro', async ({ page, pvgis, consoleGuard }) => {
    consoleGuard.allow(/Failed to load resource/)
    await conErrore(page, pvgis, (p) => p.gatewayError(502))
    for (const tema of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: tema })
      await campo(page, ETICHETTE.perdite).focus()
      await page.keyboard.press('Tab')
      await expect(riprova(page)).toBeFocused()
      const d = await riprova(page).evaluate((b) => {
        const s = getComputedStyle(b)
        return { colore: s.outlineColor, stile: s.outlineStyle, spessore: parseFloat(s.outlineWidth), sfondo: getComputedStyle(document.body).backgroundColor }
      })
      expect(d.stile, tema).toBe('solid')
      expect(d.spessore, tema).toBeGreaterThanOrEqual(2)
      expect(contrasto(d.colore, d.sfondo), `${tema}: anello/sfondo`).toBeGreaterThanOrEqual(3)
    }
  })

  test.describe('telefono 390 px', () => {
    test.use({ viewport: { width: 390, height: 800 } })

    test('la barra fissa dice "Dati non disponibili ora" e non contiene elementi focalizzabili', async ({ page, pvgis, consoleGuard }) => {
      consoleGuard.allow(/Failed to load resource/)
      await conErrore(page, pvgis, (p) => p.gatewayError(502))
      const barra = page.getByTestId('sticky-total')
      await expect(barra).toContainText('Dati non disponibili ora')
      expect(
        await barra.evaluate((el) => el.querySelectorAll('a[href], button, input, select, textarea, [tabindex]').length),
      ).toBe(0)
      await expect(riprova(page)).toHaveCount(1)
      // Il pulsante nei risultati non finisce sotto la barra fissa quando si scorre fino a lui.
      await riprova(page).scrollIntoViewIfNeeded()
      const [r, b] = await Promise.all([riprova(page).boundingBox(), barra.boundingBox()])
      expect(r!.y + r!.height).toBeLessThanOrEqual(b!.y)
    })
  })
})
