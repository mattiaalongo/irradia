/**
 * Barriera d'errore generica (React 19 non ha una versione a funzione).
 * Se un figlio lancia un errore durante il disegno, o un `lazy()` non riesce a caricare il
 * suo file, mostra `fallback` al posto dei figli invece di smontare tutta la pagina.
 * Non c'è un "riprova" nella pagina: dopo un `import()` fallito Chromium ricorda il fallimento
 * per quell'indirizzo finché la pagina resta aperta (verificato l'11/11/2026): serve ricaricare.
 */

import { Component, type ReactNode } from 'react'
import { RELOAD_LABEL } from './errorBoundaryText'

interface ErrorBoundaryProps {
  fallback: ReactNode
  children: ReactNode
}

export interface ErrorBoundaryState {
  hasError: boolean
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}

/** Messaggio di errore con il pulsante di ricarica (il pulsante è fuori dall'avviso, il focus non si sposta). */
export function ReloadFallback({ text, className }: { text: string; className: string }) {
  return (
    <div className={className}>
      <p role="alert">{text}</p>
      <button type="button" className="reload-button" onClick={() => window.location.reload()}>
        {RELOAD_LABEL}
      </button>
    </div>
  )
}
