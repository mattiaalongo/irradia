import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary, { ReloadFallback } from './ui/ErrorBoundary'
import { APP_ERROR_TEXT } from './ui/errorBoundaryText'
import { applyLook, browserStorage, readStoredLook } from './ui/look'

// Aspetto della pagina (#56 parte 2): letto e applicato PRIMA del primo disegno, così la pagina
// compare subito con l'aspetto giusto. L'attributo sta su <html> perché anche la barriera d'errore
// qui sotto, fuori da <App>, prenda i colori dell'aspetto scelto.
const look = readStoredLook(browserStorage())
applyLook(document.documentElement, look)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Rete di sicurezza: un errore imprevisto non lascia la pagina bianca. */}
    <ErrorBoundary
      fallback={
        <main>
          <ReloadFallback className="app-error" text={APP_ERROR_TEXT} />
        </main>
      }
    >
      <App initialLook={look} />
    </ErrorBoundary>
  </StrictMode>,
)
