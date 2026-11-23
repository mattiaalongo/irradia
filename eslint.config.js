import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'playwright-report', 'test-results', 'blob-report'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // Regole React solo sul codice dell'app: nelle prove Playwright il `use(...)`
    // dei fixture sarebbe scambiato per un hook di React.
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    // Intermediario verso PVGIS (src/server) e costanti condivise (src/shared): girano anche sul
    // server, con le sole API web standard. Vietati React, Leaflet, Node e l'interfaccia, così
    // non possono trascinare nella funzione codice del browser o legarla a Node.
    // I globali sono quelli di un worker (niente `window`/`document`); `tsconfig.server.json`
    // fa lo stesso controllo sui tipi.
    files: ['src/server/**/*.ts', 'src/shared/**/*.ts'],
    languageOptions: { globals: globals.worker },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(react|react-dom|leaflet)(/|$)',
              message: 'src/server e src/shared non possono usare React o Leaflet.',
            },
            {
              regex: '^node:',
              message: 'src/server e src/shared usano solo le API web standard, non quelle di Node.',
            },
            {
              regex: '(^|/)(ui|App|main)(/|$)',
              message: 'src/server e src/shared non possono importare dall\'interfaccia (src/ui).',
            },
          ],
        },
      ],
    },
  },
  {
    // Prove del browser, configurazione di Playwright e script di controllo: girano in Node.
    files: ['e2e/**/*.ts', 'playwright.config.ts', 'scripts/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
)
