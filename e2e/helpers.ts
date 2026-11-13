import type { Locator, Page } from '@playwright/test'
import { expect, type PvgisMock } from './fixtures'

// Selettori condivisi: per ruolo/etichetta, come li usa un utente (e uno screen reader).

/** Campo di testo di un parametro (l'etichetta visibile, senza "(slider)"). */
export const campo = (page: Page, etichetta: string): Locator => page.getByLabel(etichetta, { exact: true })

/** Slider di un parametro. */
export const slider = (page: Page, etichetta: string): Locator =>
  page.getByRole('slider', { name: `${etichetta} (slider)`, exact: true })

export const ETICHETTE = {
  lat: 'Latitudine (Nord)',
  lon: 'Longitudine (Est)',
  inclinazione: 'Inclinazione',
  azimut: 'Orientamento (azimut da Nord)',
  pannelli: 'Numero di pannelli',
  potenza: 'Potenza di un pannello',
  perdite: 'Perdite di sistema',
} as const

/** Gruppo del totale annuo (etichetta "Produzione stimata in un anno"). */
export const totale = (page: Page): Locator => page.getByRole('group', { name: 'Produzione stimata in un anno' })

/** Imposta la posizione scrivendo i due campi (una sola richiesta dopo l'attesa). */
export async function impostaPosizione(page: Page, lat: string, lon: string): Promise<void> {
  await campo(page, ETICHETTE.lat).fill(lat)
  await campo(page, ETICHETTE.lon).fill(lon)
}

export const MILANO = { lat: '45,4642', lon: '9,19' }
export const ROMA = { lat: '41,9028', lon: '12,4964' }

export const DEBOUNCE_MS = 800 // TMY_DEBOUNCE_MS in src/ui/config.ts

/** Orologio fermo prima del caricamento: nessun timer scatta finché non lo si fa avanzare. */
export async function orologioFermo(page: Page): Promise<void> {
  await page.clock.install({ time: new Date('2026-06-01T10:00:00Z') })
  await page.clock.pauseAt(new Date('2026-06-01T10:00:05Z'))
}

/**
 * Fa avanzare l'orologio finché la richiesta iniziale (Roma) è partita e il risultato è visibile.
 * Serve il ciclo perché l'effetto che avvia l'attesa dopo il primo disegno non ha un istante
 * osservabile: avanzare a scatti di 0,8 s è deterministico (il tempo è finto) e termina appena
 * il timer esiste. Dopo questo, ogni modifica dell'utente è un evento "discreto" e React avvia
 * l'attesa in modo sincrono: da lì in poi i tempi sono esatti.
 */
export async function avvio(page: Page, pvgis: PvgisMock): Promise<void> {
  await page.goto('/')
  await expect(campo(page, ETICHETTE.lat)).toBeVisible()
  await expect
    .poll(async () => {
      await page.clock.runFor(DEBOUNCE_MS)
      return pvgis.count
    })
    .toBe(1)
  await expect(totale(page)).toContainText('kWh')
}

/** Dà il tempo al browser di consegnare le richieste già emesse prima di contarle. */
export async function sincronizza(page: Page): Promise<void> {
  await page.evaluate(() => 0)
}

/** Luminanza relativa (WCAG) di un colore calcolato dal browser: `rgb(...)` o `color(srgb ...)`. */
function luminanza(css: string): number {
  const n = css.match(/-?\d*\.?\d+(?:e-?\d+)?/g)!.map(Number)
  const [r, g, b] = css.startsWith('color(srgb') ? n.slice(0, 3).map((x) => x * 255) : n.slice(0, 3)
  const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Rapporto di contrasto WCAG tra due colori calcolati. */
export function contrasto(a: string, b: string): number {
  const [x, y] = [luminanza(a), luminanza(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

