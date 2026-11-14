import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { DEBOUNCE_MS, ETICHETTE, avvio, campo, orologioFermo, sincronizza } from './helpers'

// Prove del tester sulla mappa (issue #24, criteri 1-9). Complementano `mappa.spec.ts`.

const mappa = (page: Page) => page.getByRole('group', { name: /^Mappa: clicca o tocca/ })
const marcatore = (page: Page) => page.locator('.leaflet-marker-icon')
const numero = async (page: Page, etichetta: string) =>
  Number((await campo(page, etichetta).inputValue()).replace(',', '.'))

const CENTRO = { lat: 42.1, lon: 12.5 } // MAP_INITIAL_CENTER
const ZOOM = 5 // MAP_INITIAL_ZOOM (la dimensione del contenitore non lo cambia a 1280 px)

// Web Mercator scritto qui in modo indipendente dal codice di Leaflet (EPSG:3857, tessere 256 px).
const mondo = (z: number) => 256 * 2 ** z
const aPixel = (lat: number, lon: number, z: number) => {
  const f = (lat * Math.PI) / 180
  return {
    x: ((lon + 180) / 360) * mondo(z),
    y: (0.5 - Math.log(Math.tan(Math.PI / 4 + f / 2)) / (2 * Math.PI)) * mondo(z),
  }
}
const daPixel = (x: number, y: number, z: number) => ({
  lon: (x / mondo(z)) * 360 - 180,
  lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / mondo(z)))) * 180) / Math.PI,
})
/** Coordinate attese per un clic a (dx, dy) pixel dal centro della mappa (vista iniziale). */
function attese(dx: number, dy: number) {
  const c = aPixel(CENTRO.lat, CENTRO.lon, ZOOM)
  return daPixel(c.x + dx, c.y + dy, ZOOM)
}
/** 1 pixel in gradi di longitudine allo zoom corrente. */
const PX_GRADI = 360 / mondo(ZOOM)

async function centro(page: Page) {
  const box = (await mappa(page).boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box }
}
async function clicca(page: Page, dx: number, dy: number) {
  const c = await centro(page)
  await page.mouse.click(c.x + dx, c.y + dy)
}
/** Posizione (pixel di pagina) della punta del marcatore (ancora 14,37 nell'icona 28×38). */
async function punta(page: Page) {
  const b = (await marcatore(page).boundingBox())!
  return { x: b.x + 14, y: b.y + 37 }
}
async function attendiMappa(page: Page) {
  await expect(mappa(page)).toBeVisible()
  await expect(marcatore(page)).toBeVisible()
}
/** L'orologio finto ferma anche requestAnimationFrame: i movimenti animati di Leaflet avanzano solo così. */
async function fotogrammi(page: Page, ms = 500) {
  await page.clock.runFor(ms)
}
async function inAttesa(page: Page, ms = DEBOUNCE_MS) {
  await page.clock.runFor(ms)
  await sincronizza(page)
}

test.describe('schermo largo: clic e coordinate', () => {
  test('la vista iniziale è a zoom 5 (presupposto delle prove)', async ({ page, pvgis, tiles }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await attendiMappa(page)
    await expect.poll(() => tiles.requests.some((p) => p.startsWith('/5/'))).toBe(true)
  })

  for (const [dx, dy] of [
    [0, 0],
    [100, -60],
    [-150, 80],
    [140, 100],
    [-100, 100],
  ]) {
    test(`clic a (${dx}, ${dy}) px dal centro: i campi coincidono col Web Mercator entro 1 px`, async ({ page, pvgis }) => {
      await orologioFermo(page)
      await avvio(page, pvgis)
      await attendiMappa(page)
      await clicca(page, dx, dy)
      await expect(campo(page, ETICHETTE.lon)).not.toHaveValue('12,4964')
      const a = attese(dx, dy)
      const lat = await numero(page, ETICHETTE.lat)
      const lon = await numero(page, ETICHETTE.lon)
      expect(Math.abs(lon - a.lon), 'longitudine').toBeLessThanOrEqual(PX_GRADI)
      // 1 px in latitudine: derivata del Mercator, ≈ PX_GRADI·cos(lat)
      expect(Math.abs(lat - a.lat), 'latitudine').toBeLessThanOrEqual(PX_GRADI * Math.cos((a.lat * Math.PI) / 180) * 1.0001)
      // arrotondamento a 4 decimali
      expect((await campo(page, ETICHETTE.lat).inputValue()).split(',')[1]?.length ?? 0).toBeLessThanOrEqual(4)
      expect((await campo(page, ETICHETTE.lon).inputValue()).split(',')[1]?.length ?? 0).toBeLessThanOrEqual(4)
    })
  }

  test('dopo il clic il marcatore sta sul punto cliccato', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await attendiMappa(page)
    const c = await centro(page)
    await clicca(page, 120, 50)
    await expect(campo(page, ETICHETTE.lon)).not.toHaveValue('12,4964')
    await expect
      .poll(async () => {
        const p = await punta(page)
        return Math.hypot(p.x - (c.x + 120), p.y - (c.y + 50))
      })
      .toBeLessThanOrEqual(1.5)
  })
})

test.describe('schermo largo: richieste a PVGIS', () => {
  test('10 clic entro 0,8 s tra l\'uno e l\'altro → 1 richiesta; ritorno a un punto già visto → 0', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await attendiMappa(page)
    const prima = pvgis.count

    for (let i = 0; i < 10; i++) {
      await clicca(page, -140 + i * 28, 20 * (i % 3))
      await page.clock.runFor(300)
    }
    await inAttesa(page, DEBOUNCE_MS)
    await expect.poll(() => pvgis.count).toBe(prima + 1)
    const ultimo = { lat: await campo(page, ETICHETTE.lat).inputValue(), lon: await campo(page, ETICHETTE.lon).inputValue() }

    // un altro punto, poi di nuovo il primo (già visto) → nessuna richiesta nuova
    await clicca(page, 0, 0)
    await inAttesa(page)
    await expect.poll(() => pvgis.count).toBe(prima + 2)
    await clicca(page, 120, 0)
    await inAttesa(page)
    await expect.poll(() => pvgis.count).toBe(prima + 3)
    await clicca(page, 0, 0)
    await inAttesa(page)
    await inAttesa(page)
    expect(pvgis.count).toBe(prima + 3)
    expect(ultimo.lat).not.toBe('')
  })

  test('ritorno alla posizione iniziale (Roma) con un clic sullo stesso punto → 0 richieste', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await attendiMappa(page)
    await clicca(page, 100, 0)
    await inAttesa(page)
    await expect.poll(() => pvgis.count).toBe(2)
    await clicca(page, 100, 0) // stesso pixel → stesso punto
    await inAttesa(page)
    await inAttesa(page)
    expect(pvgis.count).toBe(2)
  })

  test('trascinare la mappa, rotella, pulsanti e tastiera → 0 richieste e posizione invariata', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await attendiMappa(page)
    const prima = pvgis.count
    const c = await centro(page)

    // trascinamento della mappa (fuori dal marcatore)
    await page.mouse.move(c.x - 200, c.y + 80)
    await page.mouse.down()
    await page.mouse.move(c.x - 100, c.y + 20, { steps: 8 })
    await page.mouse.move(c.x - 50, c.y - 10, { steps: 8 })
    await page.mouse.up()
    // pulsanti
    await page.getByRole('button', { name: 'Ingrandisci' }).click()
    await page.getByRole('button', { name: 'Riduci' }).click()
    await page.getByRole('button', { name: 'Riduci' }).click()
    // tastiera
    await mappa(page).focus()
    for (const k of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Equal', 'Minus', 'Shift+Equal']) {
      await page.keyboard.press(k)
    }
    // rotella (attiva con la mappa a fuoco)
    await page.mouse.move(c.x + 100, c.y + 50)
    await page.mouse.wheel(0, -300)
    await page.mouse.wheel(0, 300)
    await inAttesa(page, DEBOUNCE_MS * 2)
    await inAttesa(page, DEBOUNCE_MS * 2)

    expect(pvgis.count).toBe(prima)
    await expect(campo(page, ETICHETTE.lat)).toHaveValue('41,9028')
    await expect(campo(page, ETICHETTE.lon)).toHaveValue('12,4964')
  })

  test('la rotella senza la mappa a fuoco non ingrandisce (non blocca lo scorrimento della pagina)', async ({ page, pvgis, tiles }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await attendiMappa(page)
    await page.locator('body').click({ position: { x: 1, y: 1 } })
    const prima = tiles.count
    const c = await centro(page)
    await page.mouse.move(c.x, c.y)
    await page.mouse.wheel(0, -1000)
    await sincronizza(page)
    await page.waitForLoadState('networkidle')
    expect(tiles.requests.slice(prima).some((p) => !p.startsWith('/5/'))).toBe(false)
  })

  test('il doppio clic non cambia la posizione né ingrandisce (zoom con doppio clic disattivato)', async ({ page, pvgis, tiles }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await attendiMappa(page)
    const c = await centro(page)
    await page.mouse.dblclick(c.x + 80, c.y + 30)
    await inAttesa(page)
    // Il doppio clic produce due clic: la posizione cambia (comportamento noto e voluto), ma 1 sola richiesta.
    await expect.poll(() => pvgis.count).toBe(2)
    expect(tiles.requests.some((p) => !p.startsWith('/5/'))).toBe(false)
  })
})

test.describe('schermo largo: marcatore trascinabile', () => {
  test('trascinare il marcatore → 1 richiesta e campi aggiornati sul punto di rilascio', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await attendiMappa(page)
    const prima = pvgis.count
    const p0 = await punta(page)
    const m = (await marcatore(page).boundingBox())!

    await page.mouse.move(m.x + 14, m.y + 14)
    await page.mouse.down()
    await page.mouse.move(m.x + 14 + 40, m.y + 14 - 10, { steps: 6 })
    await fotogrammi(page, 100)
    // durante il trascinamento la posizione non cambia
    await page.clock.runFor(DEBOUNCE_MS * 2)
    expect(pvgis.count).toBe(prima)
    await expect(campo(page, ETICHETTE.lat)).toHaveValue('41,9028')
    await page.mouse.move(m.x + 14 + 80, m.y + 14 - 20, { steps: 6 })
    await fotogrammi(page, 100)
    await page.mouse.up()
    await fotogrammi(page, 100)
    await expect(campo(page, ETICHETTE.lon)).not.toHaveValue('12,4964')

    const p1 = await punta(page)
    expect(p1.x - p0.x).toBeGreaterThan(60)
    const c = await centro(page)
    const a = daPixel(
      aPixel(CENTRO.lat, CENTRO.lon, ZOOM).x + (p1.x - c.x),
      aPixel(CENTRO.lat, CENTRO.lon, ZOOM).y + (p1.y - c.y),
      ZOOM,
    )
    expect(Math.abs((await numero(page, ETICHETTE.lon)) - a.lon)).toBeLessThanOrEqual(PX_GRADI * 1.5)
    expect(Math.abs((await numero(page, ETICHETTE.lat)) - a.lat)).toBeLessThanOrEqual(PX_GRADI * 1.5)

    await inAttesa(page)
    await expect.poll(() => pvgis.count).toBe(prima + 1)
  })

  test('trascinare il marcatore fuori dall\'area → torna al suo posto, messaggio, 0 richieste', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await attendiMappa(page)
    // posizione al limite Est dell'area (valida)
    await campo(page, ETICHETTE.lon).fill('45')
    await campo(page, ETICHETTE.lat).fill('50')
    await inAttesa(page)
    await expect.poll(() => pvgis.count).toBe(2)
    await expect(marcatore(page)).toBeVisible()

    const m = (await marcatore(page).boundingBox())!
    const prima = pvgis.count
    // si afferra il corpo del marcatore (non il pixel sul bordo del contenitore: lì parte il trascinamento della mappa)
    await page.mouse.move(m.x + 8, m.y + 14)
    await page.mouse.down()
    await page.mouse.move(m.x + 8 + 40, m.y + 14, { steps: 6 })
    await fotogrammi(page, 100)
    await page.mouse.move(m.x + 8 + 90, m.y + 14, { steps: 6 })
    await fotogrammi(page, 100)
    await page.mouse.up()
    await fotogrammi(page, 100)

    await expect(page.getByRole('status').filter({ hasText: 'Punto fuori dall\'area coperta' })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'Punto fuori dall\'area coperta' })).toHaveText(
      /latitudine 34-72°, longitudine −25-45°\)\./,
    )
    await expect(campo(page, ETICHETTE.lon)).toHaveValue(/^45(,0+)?$/)
    await expect(campo(page, ETICHETTE.lat)).toHaveValue(/^50(,0+)?$/)
    await inAttesa(page, DEBOUNCE_MS * 2)
    expect(pvgis.count).toBe(prima)
    // il marcatore è tornato dov'era
    await expect
      .poll(async () => Math.abs((await marcatore(page).boundingBox())!.x - m.x))
      .toBeLessThanOrEqual(1.5)
    // il messaggio sparisce quando la posizione cambia
    await campo(page, ETICHETTE.lon).fill('40')
    await expect(page.getByText('Punto fuori dall\'area coperta')).toHaveCount(0)
  })
})

test.describe('schermo largo: bordi dell\'area', () => {
  test('a zoom minimo ogni angolo cliccabile dà un punto nell\'area o il messaggio, mai richieste fuori area', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await attendiMappa(page)
    const riduci = page.getByRole('button', { name: 'Riduci' })
    for (let i = 0; i < 8 && (await riduci.getAttribute('aria-disabled')) !== 'true'; i++) {
      await riduci.click()
      await fotogrammi(page)
    }
    await expect(riduci).toHaveAttribute('aria-disabled', 'true')
    const c = await centro(page)
    const w = c.box.width / 2 - 3
    const h = c.box.height / 2 - 3
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      await page.mouse.click(c.x + sx * w, c.y + sy * h)
      await inAttesa(page)
      const lat = await numero(page, ETICHETTE.lat)
      const lon = await numero(page, ETICHETTE.lon)
      expect(lat).toBeGreaterThanOrEqual(34)
      expect(lat).toBeLessThanOrEqual(72)
      expect(lon).toBeGreaterThanOrEqual(-25)
      expect(lon).toBeLessThanOrEqual(45)
    }
    for (const r of pvgis.requests) {
      expect(r.lat).toBeGreaterThanOrEqual(34)
      expect(r.lat).toBeLessThanOrEqual(72)
      expect(r.lon).toBeGreaterThanOrEqual(-25)
      expect(r.lon).toBeLessThanOrEqual(45)
    }
  })

  test('la mappa non esce dall\'area: trascinando molto verso Nord-Est la vista si ferma al bordo', async ({ page, pvgis, tiles }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await attendiMappa(page)
    const c = await centro(page)
    await page.mouse.move(c.x - 250, c.y + 100)
    await page.mouse.down()
    for (let i = 0; i < 20; i++) await page.mouse.move(c.x - 250 + i * 30, c.y + 100 + i * 20)
    await page.mouse.up()
    await inAttesa(page)
    // con maxBounds nessuna tessera oltre l'area: a zoom 5, y minimo 0..., x massimo ammesso 2^5-1
    await page.waitForLoadState('networkidle')
    for (const p of tiles.requests) {
      const [z, x, y] = p.replace('.png', '').split('/').filter(Boolean).map(Number)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(2 ** z)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThan(2 ** z)
    }
    expect(pvgis.count).toBe(1)
  })
})

test.describe('dai campi alla mappa', () => {
  test('valori validi spostano il marcatore (Mercator, 1,5 px); nessun errore di console', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await attendiMappa(page)
    const p0 = await punta(page)
    const roma = aPixel(41.9028, 12.4964, ZOOM)

    await campo(page, ETICHETTE.lat).fill('45,4642')
    await campo(page, ETICHETTE.lon).fill('9,19')
    const mi = aPixel(45.4642, 9.19, ZOOM)
    await expect
      .poll(async () => {
        await fotogrammi(page, 100)
        const p = await punta(page)
        return Math.hypot(p.x - p0.x - (mi.x - roma.x), p.y - p0.y - (mi.y - roma.y))
      })
      .toBeLessThanOrEqual(1.5)
  })

  test('un punto lontano (Capo Nord) porta il marcatore dentro la vista', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await attendiMappa(page)
    await campo(page, ETICHETTE.lat).fill('71,1')
    await campo(page, ETICHETTE.lon).fill('25,8')
    const box = (await mappa(page).boundingBox())!
    await expect
      .poll(async () => {
        await fotogrammi(page, 100)
        const p = await punta(page)
        return p.x > box.x && p.x < box.x + box.width && p.y > box.y && p.y < box.y + box.height
      })
      .toBe(true)
  })

  test('limiti inclusi: 34 / 72 / −25 / 45 posizionano il marcatore senza errori', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await attendiMappa(page)
    for (const [lat, lon] of [['34', '-25'], ['72', '45'], ['34', '45'], ['72', '-25']]) {
      await campo(page, ETICHETTE.lat).fill(lat)
      await campo(page, ETICHETTE.lon).fill(lon)
      await sincronizza(page)
      await expect(marcatore(page)).toBeVisible()
    }
  })

  test('valori vuoti, non validi o fuori area non rompono nulla e il marcatore resta dov\'era', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await attendiMappa(page)
    const p0 = await punta(page)
    for (const v of ['', 'abc', '99', '-200', '72,0001', '1e3', 'NaN', 'Infinity', '--5', ' ', '<script>alert(1)</script>']) {
      await campo(page, ETICHETTE.lat).fill(v)
      await campo(page, ETICHETTE.lon).fill(v)
      await sincronizza(page)
    }
    await expect(mappa(page)).toBeVisible()
    await expect(marcatore(page)).toBeVisible()
    await fotogrammi(page)
    const p1 = await punta(page)
    expect(Math.hypot(p1.x - p0.x, p1.y - p0.y)).toBeLessThanOrEqual(1.5)
    // e la mappa funziona ancora
    await campo(page, ETICHETTE.lat).fill('45,4642')
    await campo(page, ETICHETTE.lon).fill('9,19')
    await expect.poll(async () => { await fotogrammi(page, 100); return (await punta(page)).x }).toBeLessThan(p0.x)
    await clicca(page, 50, 50)
    await expect(campo(page, ETICHETTE.lon)).not.toHaveValue('9,19')
  })

  test('il campo della longitudine sposta il marcatore (nessuno slider dal #56)', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await attendiMappa(page)
    const p0 = await punta(page)
    await expect(page.getByRole('slider', { name: `${ETICHETTE.lon} (slider)`, exact: true })).toHaveCount(0)
    await campo(page, ETICHETTE.lon).fill('45') // 45° E: il marcatore va a destra
    const box = (await mappa(page).boundingBox())!
    await expect
      .poll(async () => {
        await fotogrammi(page, 100)
        const p = await punta(page)
        return p.x > p0.x && p.x <= box.x + box.width
      })
      .toBe(true)
  })
})

test.describe('tessere in errore', () => {
  for (const [nome, risposta] of [
    ['HTTP 500', 'status'],
    ['rete interrotta', 'abort'],
  ] as const) {
    test(`${nome}: l'app resta usabile e i campi funzionano`, async ({ page, pvgis, consoleGuard }) => {
      consoleGuard.allow(/Failed to load resource|net::ERR/)
      // Regola registrata dopo quella di `tiles`: ha la precedenza.
      await page.route('https://tile.openstreetmap.org/**', (route) =>
        risposta === 'status'
          ? route.fulfill({ status: 500, contentType: 'text/plain', body: 'errore' })
          : route.abort('connectionreset'),
      )
      await orologioFermo(page)
      await avvio(page, pvgis)
      await attendiMappa(page)
      await clicca(page, 70, 30) // il clic funziona anche senza sfondo
      await expect(campo(page, ETICHETTE.lon)).not.toHaveValue('12,4964')
      await campo(page, ETICHETTE.lat).fill('45,4642')
      await campo(page, ETICHETTE.lon).fill('9,19')
      await inAttesa(page)
      await expect.poll(() => pvgis.count).toBeGreaterThanOrEqual(2)
      await expect(page.getByRole('group', { name: 'Produzione stimata in un anno' })).toContainText('kWh')
      await expect(page.getByRole('button', { name: 'Ingrandisci' })).toBeEnabled()
    })
  }
})

test.describe('rete e caricamento differito', () => {
  test('schermo largo: richieste solo a localhost, PVGIS e tessere OSM', async ({ page, pvgis, tiles }) => {
    const esterne: string[] = []
    page.on('request', (r) => {
      const u = new URL(r.url())
      if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') esterne.push(u.hostname)
    })
    await orologioFermo(page)
    await avvio(page, pvgis)
    await attendiMappa(page)
    await expect.poll(() => tiles.count).toBeGreaterThan(0)
    await clicca(page, 50, 0)
    await page.getByRole('button', { name: 'Ingrandisci' }).click()
    await page.waitForLoadState('networkidle')
    expect(new Set(esterne)).toEqual(new Set(['tile.openstreetmap.org']))
    expect(tiles.requests.every((p) => /^\/\d+\/\d+\/\d+\.png$/.test(p))).toBe(true)
  })

  test.describe('telefono', () => {
    test.use({ viewport: { width: 390, height: 800 } })

    test('prima dell\'apertura né tessere né il file JS della mappa; dopo sì, una volta sola', async ({ page, pvgis, tiles }) => {
      const asset: string[] = []
      page.on('request', (r) => {
        const u = new URL(r.url())
        if (u.pathname.startsWith('/assets/')) asset.push(u.pathname)
      })
      await orologioFermo(page)
      await avvio(page, pvgis)
      expect(tiles.count).toBe(0)
      expect(asset.some((a) => /MapPicker.*\.(js|css)$/.test(a)), 'file della mappa prima dell\'apertura').toBe(false)
      expect(asset.some((a) => /index.*\.js$/.test(a))).toBe(true)

      await page.getByRole('button', { name: 'Scegli sulla mappa' }).click()
      await expect
        .poll(async () => {
          await page.clock.runFor(300)
          return mappa(page).isVisible()
        })
        .toBe(true)
      expect(asset.some((a) => /MapPicker.*\.js$/.test(a))).toBe(true)
      await expect.poll(() => tiles.count).toBeGreaterThan(0)

      // chiudi e riapri: niente nuovo download del file
      const nAsset = asset.length
      await page.getByRole('button', { name: 'Chiudi la mappa' }).click()
      await expect(mappa(page)).toBeHidden()
      await page.getByRole('button', { name: 'Scegli sulla mappa' }).click()
      await expect(mappa(page)).toBeVisible()
      expect(asset.length).toBe(nAsset)
    })
  })
})

test.describe('telefono: tocco', () => {
  test.use({ viewport: { width: 390, height: 800 }, hasTouch: true })

  test('un tocco sulla mappa cambia i campi → 1 richiesta', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    const prima = pvgis.count
    await page.getByRole('button', { name: 'Scegli sulla mappa' }).click()
    await expect
      .poll(async () => {
        await page.clock.runFor(300)
        return mappa(page).isVisible()
      })
      .toBe(true)
    await expect(marcatore(page)).toBeVisible()
    await mappa(page).scrollIntoViewIfNeeded()
    const c = await centro(page)
    await page.touchscreen.tap(c.x + 50, c.y + 20)
    await expect(campo(page, ETICHETTE.lon)).not.toHaveValue('12,4964')
    await page.touchscreen.tap(c.x - 60, c.y - 20)
    await inAttesa(page)
    await expect.poll(() => pvgis.count).toBe(prima + 1)
    // tocco: dx 50 px a zoom 5 ≈ 2,2° (il vero valore dipende dall'ultima posizione toccata)
    const lon = await numero(page, ETICHETTE.lon)
    expect(lon).toBeLessThan(12.5)
  })
})

// --- stili: contrasto, attribuzione, sovrapposizioni ----------------------------------------

type Rgb = [number, number, number]
function leggi(css: string): Rgb {
  const n = css.match(/-?\d*\.?\d+(?:e-?\d+)?/g)!.map(Number)
  return css.startsWith('color(srgb') ? [n[0] * 255, n[1] * 255, n[2] * 255] : [n[0], n[1], n[2]]
}
function lum([r, g, b]: Rgb): number {
  const f = (c: number) => {
    const x = c / 255
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const contrasto = (a: Rgb, b: Rgb) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

test.describe('attribuzione e controlli', () => {
  for (const tema of ['light', 'dark'] as const) {
    test(`tema ${tema}: attribuzione visibile, testo e link ≥ 4,5:1; controlli di zoom leggibili`, async ({ page, pvgis }) => {
      await page.emulateMedia({ colorScheme: tema })
      await orologioFermo(page)
      await avvio(page, pvgis)
      await attendiMappa(page)
      const attr = page.locator('.leaflet-control-attribution')
      await expect(attr).toBeVisible()
      await expect(attr).toContainText('© OpenStreetMap contributors')
      const link = attr.getByRole('link', { name: 'OpenStreetMap' })
      await expect(link).toBeVisible()
      await expect(link).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright')

      const stili = await page.evaluate(() => {
        const q = (s: string) => document.querySelector(s) as HTMLElement
        const a = q('.leaflet-control-attribution')
        const l = q('.leaflet-control-attribution a')
        const z = q('.leaflet-control-zoom-in')
        const zd = q('.leaflet-control-zoom-out')
        const g = (e: HTMLElement) => getComputedStyle(e)
        return {
          attrFg: g(a).color, attrBg: g(a).backgroundColor,
          linkFg: g(l).color,
          zoomFg: g(z).color, zoomBg: g(z).backgroundColor,
          zoomOutFg: g(zd).color, zoomOutBg: g(zd).backgroundColor,
        }
      })
      expect(contrasto(leggi(stili.attrFg), leggi(stili.attrBg)), 'testo attribuzione').toBeGreaterThanOrEqual(4.5)
      expect(contrasto(leggi(stili.linkFg), leggi(stili.attrBg)), 'link attribuzione').toBeGreaterThanOrEqual(4.5)
      expect(contrasto(leggi(stili.zoomFg), leggi(stili.zoomBg)), '+').toBeGreaterThanOrEqual(4.5)
      expect(contrasto(leggi(stili.zoomOutFg), leggi(stili.zoomOutBg)), '−').toBeGreaterThanOrEqual(4.5)
      expect(stili.attrBg).not.toMatch(/rgba\(.*, 0\)|transparent/)
    })
  }

  test('il link di attribuzione porta a openstreetmap.org; se apre una nuova scheda ha rel noopener', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await attendiMappa(page)
    const l = page.locator('.leaflet-control-attribution a')
    const href = new URL((await l.getAttribute('href'))!)
    expect(href.protocol).toBe('https:')
    expect(href.hostname).toBe('www.openstreetmap.org')
    // Si apre in una nuova scheda: l'utente non perde i valori inseriti.
    await expect(l).toHaveAttribute('target', '_blank')
    expect(await l.getAttribute('rel')).toMatch(/noopener/)
  })
})

test.describe('sicurezza', () => {
  test('il messaggio fuori area è un testo fisso (nessun dato dell\'utente) e il marcatore non usa dati dell\'utente', async ({ page, pvgis }) => {
    await orologioFermo(page)
    await avvio(page, pvgis)
    await attendiMappa(page)
    await campo(page, ETICHETTE.lat).fill('<img src=x onerror=alert(1)>')
    await sincronizza(page)
    const html = await page.locator('.map-picker').innerHTML()
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('<script')
    // nessuna richiesta PVGIS con testo dell'utente nell'URL
    for (const r of pvgis.requests) expect(r.url).toMatch(/^\/api\/pvgis\/v5_3\/tmy\?lat=[-\d.]+&lon=[-\d.]+&usehorizon=1&outputformat=json$/)
  })
})

test.describe('impaginazione con la mappa aperta', () => {
  for (const width of [360, 390, 412, 1280]) {
    test(`larghezza ${width} px: niente scorrimento orizzontale, piè di pagina visibile sopra la barra fissa`, async ({ page, pvgis }) => {
      await page.setViewportSize({ width, height: 800 })
      await orologioFermo(page)
      await avvio(page, pvgis)
      if (width < 820) {
        await page.getByRole('button', { name: 'Scegli sulla mappa' }).click()
        await expect
          .poll(async () => {
            await page.clock.runFor(300)
            return mappa(page).isVisible()
          })
          .toBe(true)
      }
      await attendiMappa(page)
      await page.getByText('Tabella dei valori mensili').click()
      const m = await page.evaluate(() => ({
        h: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
        b: [document.body.scrollWidth, document.body.clientWidth],
      }))
      expect(m.h[0]).toBeLessThanOrEqual(m.h[1])
      expect(m.b[0]).toBeLessThanOrEqual(m.b[1])
      const box = (await mappa(page).boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)

      // in fondo alla pagina il piè di pagina non è coperto dalla barra fissa
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const footer = page.locator('footer.site-footer')
      await expect(footer).toBeVisible()
      const f = (await footer.boundingBox())!
      const barra = page.getByTestId('sticky-total')
      if (width < 820) {
        const b = (await barra.boundingBox())!
        expect(f.y + f.height).toBeLessThanOrEqual(b.y + 1)
      }
    })
  }

  test('telefono: la barra fissa sta sopra la mappa (z-index) quando si sovrappongono', async ({ page, pvgis }) => {
    await page.setViewportSize({ width: 390, height: 600 })
    await orologioFermo(page)
    await avvio(page, pvgis)
    await page.getByRole('button', { name: 'Scegli sulla mappa' }).click()
    await expect
      .poll(async () => {
        await page.clock.runFor(300)
        return mappa(page).isVisible()
      })
      .toBe(true)
    // porta la mappa sotto la barra: scorrimento finché il suo bordo inferiore è a metà della barra
    const barraBox = (await page.getByTestId('sticky-total').boundingBox())!
    await page.evaluate((barraTop) => {
      const el = document.querySelector('.map') as HTMLElement
      const r = el.getBoundingClientRect()
      window.scrollBy(0, r.bottom - (barraTop + 20))
    }, barraBox.y)
    const hit = await page.evaluate((y) => {
      const e = document.elementFromPoint(100, y)
      return e?.closest('.sticky-total') ? 'barra' : (e?.className ?? 'altro')
    }, barraBox.y + 20)
    expect(hit).toBe('barra')
  })
})

test.describe('controlli di zoom disattivati e segnaposto (build di produzione)', () => {
  for (const tema of ['light', 'dark'] as const) {
    test(`tema ${tema}: il pulsante di zoom disattivato resta leggibile (≥ 4,5:1 sui colori del tema)`, async ({ page, pvgis }) => {
      await page.emulateMedia({ colorScheme: tema })
      await orologioFermo(page)
      await avvio(page, pvgis)
      await attendiMappa(page)
      const riduci = page.getByRole('button', { name: 'Riduci' })
      for (let i = 0; i < 8 && (await riduci.getAttribute('aria-disabled')) !== 'true'; i++) {
        await riduci.click()
        await fotogrammi(page)
      }
      await expect(riduci).toHaveAttribute('aria-disabled', 'true')
      const s = await page.evaluate(() => {
        const g = getComputedStyle(document.querySelector('.leaflet-control-zoom-out') as HTMLElement)
        const b = getComputedStyle(document.querySelector('.leaflet-bar') as HTMLElement)
        return { fg: g.color, bg: g.backgroundColor, border: b.borderTopWidth }
      })
      expect(contrasto(leggi(s.fg), leggi(s.bg))).toBeGreaterThanOrEqual(4.5)
      expect(s.border).toBe('1px')
    })
  }

  for (const tema of ['light', 'dark'] as const) {
    test(`telefono, tema ${tema}: il pulsante "Scegli sulla mappa" mantiene i suoi stili (altezza, bordo, contrasto)`, async ({ page, pvgis }) => {
      await page.emulateMedia({ colorScheme: tema })
      await page.setViewportSize({ width: 360, height: 800 })
      await orologioFermo(page)
      await avvio(page, pvgis)
      const st = await page.getByRole('button', { name: 'Scegli sulla mappa' }).evaluate((e) => {
        const c = getComputedStyle(e)
        return { h: e.getBoundingClientRect().height, border: c.borderTopWidth, fg: c.color }
      })
      const sfondo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
      expect(st.h).toBeGreaterThanOrEqual(44)
      expect(st.border).toBe('1px')
      expect(contrasto(leggi(st.fg), leggi(sfondo))).toBeGreaterThanOrEqual(4.5)
    })
  }
})
