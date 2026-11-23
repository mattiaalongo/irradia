import { defineConfig } from 'vitest/config'
import type { Connect, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { devProxyRequest } from './src/server/devProxyRequest.ts'
import {
  handlePvgisProxy,
  PVGIS_PROXY_MAX_BYTES,
  PVGIS_PROXY_TIMEOUT_MS,
  PVGIS_PROXY_USER_AGENT_DEV,
} from './src/server/pvgisProxy.ts'

/**
 * Intermediario verso PVGIS per `npm run dev` e `npm run preview`.
 *
 * PVGIS non invia header CORS, quindi il browser non può leggerne le risposte: chiede a Vite
 * (stessa origine: niente CORS) e Vite gira la richiesta a PVGIS:
 *   /api/pvgis/v5_3/tmy?...  →  https://re.jrc.ec.europa.eu/api/v5_3/tmy?...
 * Le regole (unico percorso, parametri controllati, tempo e dimensione massimi, errori) sono
 * quelle di `src/server/pvgisProxy.ts`, la stessa funzione usata in produzione
 * (`src/server/worker.ts`): qui si converte solo la richiesta di Node in una `Request` standard
 * e la `Response` di ritorno in una risposta di Node.
 *
 * Chi parla con PVGIS è questo intermediario, non il browser: si presenta col suo nome
 * (`irradia-dev-proxy`). Inoltrando lo User-Agent di Chrome il firewall di PVGIS rifiuta la
 * richiesta (pagina HTML "Request Rejected" con codice 200; verificato 8/11/2026).
 */
function pvgisProxyPlugin(): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    // Se il browser chiude la connessione (es. l'app annulla un download superato), anche la
    // richiesta a PVGIS si interrompe. `close` arriva anche dopo una risposta completa: in quel
    // caso `writableEnded` è vero e non si annulla nulla.
    const abort = new AbortController()
    // Conversione senza eccezioni; `undefined` = non è per l'intermediario (vedi il file).
    const request = devProxyRequest(req.url, req.method, abort.signal)
    if (request === undefined) return next()
    res.on('close', () => {
      if (!res.writableEnded) abort.abort()
    })

    handlePvgisProxy(request, {
      fetch: globalThis.fetch,
      userAgent: PVGIS_PROXY_USER_AGENT_DEV,
      timeoutMs: PVGIS_PROXY_TIMEOUT_MS,
      maxBytes: PVGIS_PROXY_MAX_BYTES,
    })
      .then(async (response) => {
        res.statusCode = response.status
        response.headers.forEach((value, name) => res.setHeader(name, value))
        res.end(response.body === null ? undefined : Buffer.from(await response.arrayBuffer()))
      })
      .catch(next)
  }
  return {
    name: 'irradia-pvgis-proxy',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

// https://vite.dev/config/  —  https://vitest.dev/config/
export default defineConfig({
  plugins: [react(), pvgisProxyPlugin()],
  // Nessuna intestazione CORS nemmeno in sviluppo e in anteprima, come in produzione: l'app è
  // servita dalla stessa origine dell'intermediario e non ne ha bisogno. Il valore predefinito di
  // Vite aggiunge `Access-Control-Allow-Origin` per le pagine aperte da localhost
  // (https://vite.dev/config/server-options#server-cors).
  server: { cors: false },
  preview: { cors: false },
  test: {
    // Il motore di calcolo è TypeScript puro: non serve simulare un browser.
    environment: 'node',
    // Solo i test di src/ e scripts/: le prove del browser (e2e/*.spec.ts) le esegue
    // Playwright, e Vitest le romperebbe cercando di avviarle da solo.
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    // Seme fisso di fast-check (vedi il file).
    setupFiles: ['src/test/fastCheckSetup.ts'],
  },
})
