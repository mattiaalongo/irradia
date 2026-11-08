import { defineConfig, devices } from '@playwright/test'

// Configurazione delle prove nel browser (Playwright). Girano su Chromium contro
// la build di produzione servita da `vite preview`.
// https://playwright.dev/docs/test-configuration
export default defineConfig({
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
    baseURL: 'http://localhost:4173',

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
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Nel cloud Chromium è preinstallato in una cartella fissa; si indica
          // con PW_CHROMIUM_PATH. Se la variabile manca (CI su GitHub, PC del
          // proprietario) vale `undefined` e Playwright usa il proprio browser.
          executablePath: process.env.PW_CHROMIUM_PATH || undefined,
        },
      },
    },
  ],

  // Prova la BUILD di produzione (quella che arriverà agli utenti), non il
  // server di sviluppo. `--strictPort` fa fallire l'avvio se la porta è occupata
  // invece di passare in silenzio a un'altra (baseURL non sarebbe più valido).
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    // In locale riusa un server già acceso (più veloce); in CI parte sempre pulito.
    reuseExistingServer: !process.env.CI,
    // La build richiede qualche decina di secondi: margine ampio.
    timeout: 120_000,
  },
})
