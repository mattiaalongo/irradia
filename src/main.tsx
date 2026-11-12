import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary, { ReloadFallback } from './ui/ErrorBoundary'
import { APP_ERROR_TEXT } from './ui/errorBoundaryText'

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
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
