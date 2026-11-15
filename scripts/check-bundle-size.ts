// Controllo automatico della dimensione del JS caricato all'avvio (issue #37).
//
// Si esegue dopo la build: `npm run build && npm run size`. Gira con `node` puro
// (Node 22.18+ esegue i .ts togliendo i tipi), senza dipendenze: ogni dipendenza
// in più è codice di terzi.
//
// Cosa si misura: i file JS che il browser scarica per primi, cioè quelli citati
// in dist/index.html (`<script type="module" src>` e `<link rel="modulepreload">`),
// compressi con gzip (livello 6, quello predefinito di zlib). Il JS differito
// (mappa Leaflet, caricata con React.lazy) e il CSS si stampano solo per
// informazione: nessun limite (decisione del PO del 12/11/2026).
//
// Attenzione: il numero stampato da Vite è circa l'1 % più alto del nostro
// (Vite usa il codice nativo di Rolldown, non riproducibile da Node). Il limite
// qui sotto vale per la misura di questo script.

import { existsSync, readFileSync, readdirSync, appendFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

// Limite del JS iniziale, in kB (1 kB = 1000 byte), gzip livello 6.
// UNICO posto in cui vive questo numero. Storia: alzato da 80 a 82 l'11/11/2026
// con #26 (decisione del PO); confermato il 12/11/2026 con #37, misurato con
// gzip di Node (~1 % sotto il numero di Vite); alzato da 82 a 85 il 14/11/2026
// con il nuovo aspetto (#56, decisione del PO); alzato da 85 a 87 il 14/11/2026
// con l'aspetto B «Giornata di sole» e il suo interruttore (#56 parte 2, decisione
// del PO). Per cambiarlo serve il PO.
export const INITIAL_JS_LIMIT_KB = 87

/** Attributi di un tag, con nomi in minuscolo; accetta "doppi", 'singoli' o senza apici. */
function parseAttributes(tag: string): Map<string, string> {
  const attrs = new Map<string, string>()
  const re = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
  // Si salta il nome del tag (`<script`, `<link`).
  const body = tag.replace(/^<\s*[a-zA-Z0-9-]+/, '')
  for (const m of body.matchAll(re)) {
    attrs.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '')
  }
  return attrs
}

/** Percorsi dei file JS caricati subito da index.html, nell'ordine in cui compaiono, senza doppioni. */
export function findInitialScripts(html: string): string[] {
  const found: string[] = []
  for (const m of html.matchAll(/<(script|link)\b[^>]*>/gi)) {
    const attrs = parseAttributes(m[0])
    const isScript =
      m[1].toLowerCase() === 'script' &&
      attrs.get('type')?.toLowerCase() === 'module'
    const isPreload =
      m[1].toLowerCase() === 'link' &&
      attrs.get('rel')?.toLowerCase().split(/\s+/).includes('modulepreload')
    const path = isScript ? attrs.get('src') : isPreload ? attrs.get('href') : undefined
    if (path && !found.includes(path)) found.push(path)
  }
  return found
}

/** Percorsi dei fogli di stile citati da index.html (solo informativo). */
export function findStylesheets(html: string): string[] {
  const found: string[] = []
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = parseAttributes(m[0])
    const href = attrs.get('href')
    if (href && attrs.get('rel')?.toLowerCase().split(/\s+/).includes('stylesheet')) {
      if (!found.includes(href)) found.push(href)
    }
  }
  return found
}

/** Dimensione in byte dopo gzip (livello 6, predefinito di zlib). */
export function gzipBytes(data: Uint8Array | string): number {
  return gzipSync(data).length
}

export interface LimitResult {
  ok: boolean
  /** kB (1000 byte) misurati. */
  kb: number
  /** Margine in kB: positivo sotto il limite, negativo sopra. */
  marginKb: number
}

/** Confronta con il limite: esattamente uguale va bene, un byte sopra no. */
export function checkLimit(bytes: number, limitKb: number): LimitResult {
  const limitBytes = limitKb * 1000
  return { ok: bytes <= limitBytes, kb: bytes / 1000, marginKb: (limitBytes - bytes) / 1000 }
}

/** Numero all'italiana con 2 decimali ("80,00"). */
export function formatKb(kb: number): string {
  return kb.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Frase di esito (stessa per terminale e riepilogo di GitHub). */
export function describeResult(
  bytes: number,
  files: string[],
  limitKb: number,
): { ok: boolean; message: string } {
  const r = checkLimit(bytes, limitKb)
  const names = files.map((f) => basename(f)).join(', ')
  if (r.ok) {
    return {
      ok: true,
      message: `JS iniziale: ${formatKb(r.kb)} kB gzip (${names}), limite ${limitKb} kB: OK, margine ${formatKb(r.marginKb)} kB`,
    }
  }
  return {
    ok: false,
    message:
      `JS iniziale: ${formatKb(r.kb)} kB gzip supera il limite di ${limitKb} kB di ${formatKb(-r.marginKb)} kB. ` +
      'Riduci il codice caricato all\'avvio oppure chiedi al PO di alzare il limite (scripts/check-bundle-size.ts).',
  }
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function main(): void {
  const distDir = 'dist'
  const indexPath = join(distDir, 'index.html')
  if (!existsSync(indexPath)) {
    fail(`Manca ${indexPath}: esegui prima npm run build.`)
  }
  const html = readFileSync(indexPath, 'utf8')
  const scripts = findInitialScripts(html)
  if (scripts.length === 0) {
    // Niente falso verde: senza script non c'è nulla da misurare, quindi qualcosa non va.
    fail(`Nessuno script <script type="module"> trovato in ${indexPath}: impossibile misurare il JS iniziale.`)
  }

  // I percorsi di index.html sono assoluti rispetto al sito ("/assets/…"): si leggono da dist/.
  const resolve = (p: string) => join(distDir, p.replace(/^\/+/, ''))
  let total = 0
  for (const s of scripts) {
    const file = resolve(s)
    if (!existsSync(file)) fail(`File citato in ${indexPath} ma assente: ${file}. Esegui di nuovo npm run build.`)
    total += gzipBytes(readFileSync(file))
  }

  const result = describeResult(total, scripts, INITIAL_JS_LIMIT_KB)
  const lines = [result.message]

  // Solo informativi, senza limite.
  const css = findStylesheets(html)
    .filter((c) => existsSync(resolve(c)))
    .map((c) => `${basename(c)} ${formatKb(gzipBytes(readFileSync(resolve(c))) / 1000)} kB`)
  if (css.length > 0) lines.push(`CSS iniziale (solo informativo): ${css.join(', ')} gzip`)

  const assetsDir = join(distDir, 'assets')
  const initial = new Set(scripts.map((s) => basename(s)))
  const lazy = existsSync(assetsDir)
    ? readdirSync(assetsDir)
        .filter((f) => f.endsWith('.js') && !initial.has(f))
        .map((f) => `${f} ${formatKb(gzipBytes(readFileSync(join(assetsDir, f))) / 1000)} kB`)
    : []
  if (lazy.length > 0) lines.push(`JS differito (solo informativo): ${lazy.join(', ')} gzip`)

  console.log(lines.join('\n'))

  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (summaryPath) {
    const md = [`### Dimensione del JS iniziale`, '', `${result.ok ? 'OK' : 'ERRORE'}: ${result.message}`, '', ...lines.slice(1).map((l) => `- ${l}`), '']
    appendFileSync(summaryPath, md.join('\n') + '\n')
  }

  if (!result.ok) process.exit(1)
}

// Parte solo se lanciato da riga di comando, non quando lo importano i test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
