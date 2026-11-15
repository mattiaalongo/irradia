import { defineConfig, devices } from '@playwright/test'
import type { LookOption } from './e2e/fixtures' // solo il tipo: nessun codice di prova viene caricato

// Configurazione delle prove nel browser (Playwright). Girano su Chromium contro
// la build di produzione servita da `vite preview`.
// https://playwright.dev/docs/test-configuration
// Porta di `vite preview`: PW_PORT (intero 1024-65535), predefinita 4173. Con più copie di lavoro
// in parallelo ognuna usa la sua porta (#46). Un valore non valido ferma subito l'esecuzione.
const DEFAULT_PORT = 4173
function readPort(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_PORT
  const port = Number(raw)
  if (!/^\d+$/.test(raw.trim()) || port < 1024 || port > 65535) {
    throw new Error(`PW_PORT non valida: "${raw}". Serve un intero tra 1024 e 65535 (predefinita ${DEFAULT_PORT}).`)
  }
  return port
}
const PORT = readPort(process.env.PW_PORT)

// Impostazioni del browser comuni ai progetti.
const chromiumUse = {
  ...devices['Desktop Chrome'],
  launchOptions: {
    // Nel cloud Chromium è preinstallato in una cartella fissa; si indica con PW_CHROMIUM_PATH. Se la
    // variabile manca (CI su GitHub, PC del proprietario) vale `undefined` e Playwright usa il proprio browser.
    executablePath: process.env.PW_CHROMIUM_PATH || undefined,
  },
}

export default defineConfig<{ look: LookOption }>({
  // Le prove stanno in e2e/, separate da src/: Vitest non le raccoglie (vedi
  // `test.include` in vite.config.ts) e Playwright non raccoglie i test di Vitest.
  testDir: 'e2e',

  // File di prova in parallelo: sono indipendenti (ognuno apre la sua pagina) e
  // le prove restano veloci.
  fullyParallel: true,

  // In CI 2 processi: i runner gratuiti hanno 2 core, di più renderebbe le prove
  // instabili. In locale Playwright sceglie da solo in base ai core.
  workers: process.env.CI ? 2 : undefined,

  // In CI un `test.only` dimenticato farebbe girare una sola prova e il verde
  // sarebbe falso: con forbidOnly la CI fallisce.
  forbidOnly: !!process.env.CI,

  // Nessun nuovo tentativo: una prova instabile va corretta, non mascherata
  // da un secondo giro che la fa passare "per fortuna".
  retries: 0,

  // In CI: annotazioni sulla PR (github) + rapporto HTML da caricare come file.
  // `open: 'never'` impedisce che il rapporto provi ad aprire un browser.
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : 'list',

  use: {
    // `vite preview` serve la build su questa porta (vedi webServer sotto).
    baseURL: `http://localhost:${PORT}`,

    // Lingua e fuso fissi: i numeri ("6.498") e i mesi sono in italiano e le
    // prove non devono dipendere dalle impostazioni del PC o del runner.
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',

    // Diagnostica solo quando serve: traccia e schermata se una prova fallisce.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',

    // Nessun service worker: potrebbe intercettare le richieste prima di
    // `page.route`, rendendo le finte risposte di PVGIS inefficaci.
    serviceWorkers: 'block',
  },

  projects: [
    // Un solo browser per ora (Chromium): l'app è semplice e il costo di
    // Firefox/WebKit non è giustificato. Si aggiungono qui se servirà.
    {
      name: 'chromium',
      use: chromiumUse,
    },
    // Aspetto B «Giornata di sole» (#56): stesso browser e stesse impostazioni, ma la pagina parte con
    // `irradia.look=b` già in memoria (opzione `look` di e2e/fixtures.ts). Esegue SOLO i file la cui
    // verifica cambia con l'aspetto (impaginazione, colori e contrasti, barra fissa, cornice dei risultati
    // non aggiornati). Calcolo, rete, mappa, campi e dial non dipendono dall'aspetto; `aspetto-b*.spec.ts`
    // attivano B da sé e girano già nel progetto predefinito; `aspetto-nuovo.spec.ts` verifica A.
    {
      name: 'chromium-look-b',
      testMatch: ['impaginazione.spec.ts', 'stale-results.spec.ts', 'barra-fissa.spec.ts'],
      use: { ...chromiumUse, look: 'b' },
    },
  ],

  // Prova la BUILD di produzione (quella che arriverà agli utenti), non il
  // server di sviluppo. `--strictPort` fa fallire l'avvio se la porta è occupata
  // invece di passare in silenzio a un'altra (baseURL non sarebbe più valido).
  webServer: {
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    // Mai riusare un server già acceso (#46): potrebbe servire la build di un altro ramo/copia di
    // lavoro e la prova passerebbe sul codice sbagliato. Con --strictPort una porta occupata fa
    // fallire subito e in modo chiaro l'avvio; allora scegliere un'altra porta con PW_PORT.
    reuseExistingServer: false,
    // La build richiede qualche decina di secondi: margine ampio.
    timeout: 120_000,
  },
})
