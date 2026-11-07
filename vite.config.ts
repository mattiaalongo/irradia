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
      },
    },
  },
  test: {
    // Il motore di calcolo è TypeScript puro: non serve simulare un browser.
    environment: 'node',
  },
})
