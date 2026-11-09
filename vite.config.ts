import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/  —  https://vitest.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // PVGIS non invia header CORS, quindi il browser non può leggerne le risposte.
      // In sviluppo il browser chiede a Vite (stessa origine: niente CORS) e Vite
      // gira la richiesta a PVGIS:
      //   /api/pvgis/v5_3/tmy?...  →  https://re.jrc.ec.europa.eu/api/v5_3/tmy?...
      // Vale solo con `npm run dev`: in produzione servirà una funzione lato server.
      '/api/pvgis': {
        target: 'https://re.jrc.ec.europa.eu',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/pvgis/, '/api'),
        // Chi parla con PVGIS è questo intermediario, non il browser: si presenta col
        // suo nome. Inoltrando lo User-Agent di Chrome il firewall di PVGIS rifiuta la
        // richiesta (pagina HTML "Request Rejected" con codice 200; verificato 8/11/2026).
        headers: { 'User-Agent': 'irradia-dev-proxy' },
      },
    },
  },
  test: {
    // Il motore di calcolo è TypeScript puro: non serve simulare un browser.
    environment: 'node',
    // Solo i test di src/: le prove del browser (e2e/*.spec.ts) le esegue
    // Playwright, e Vitest le romperebbe cercando di avviarle da solo.
    include: ['src/**/*.test.{ts,tsx}'],
    // Seme fisso di fast-check (vedi il file).
    setupFiles: ['src/test/fastCheckSetup.ts'],
  },
})
