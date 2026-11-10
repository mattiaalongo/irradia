import { formatNumber } from './format'

export type StickyTotalState =
  | { kind: 'ready'; annualKwh: number; updating: boolean; failed: boolean; shortError?: string }
  | { kind: 'loading' }
  | { kind: 'error'; shortError?: string }

/**
 * Barra fissa in basso, solo su telefono (CSS): ripete il totale annuo perché chi muove uno
 * slider dei pannelli lo veda cambiare senza scorrere la pagina.
 *
 * Per le tecnologie assistive è nascosta (aria-hidden): il totale vero, con la sua nota e il suo
 * `role="alert"` per gli errori, è quello nei risultati. Così nessuna regione `aria-live` si
 * aggiorna a ogni passo di uno slider e il numero non viene letto due volte. Non contiene elementi
 * che prendono il focus, quindi aria-hidden è sicuro.
 */
export default function StickyTotal({ state }: { state: StickyTotalState }) {
  let label: React.ReactNode = 'Produzione stimata in un anno'
  let body: React.ReactNode
  if (state.kind === 'ready') {
    if (state.updating) label = 'Aggiorno con i nuovi dati…'
    // Download fallito con un risultato precedente: il numero è quello della posizione di prima.
    // L'avviso completo (role="alert") è nei risultati, spesso fuori schermo sul telefono.
    // Il testo breve (mare / fuori zona) non va mai a capo: semmai si stringe l'etichetta generica.
    else if (state.failed) label = state.shortError ? <span className="sticky-short">{state.shortError}</span> : 'Dati non aggiornati (errore)'
    // Numero attenuato (colore secondario, contrasto ≥ 4,5:1) come il totale nei risultati
    // (`.stale`): è il valore della posizione precedente.
    body = (
      <span className={state.updating || state.failed ? 'sticky-old' : undefined}>
        {formatNumber(state.annualKwh)} <span className="sticky-unit">kWh</span>
      </span>
    )
  } else if (state.kind === 'loading') {
    body = <span className="sticky-msg">Scarico i dati da PVGIS…</span>
  } else {
    body = <span className={state.shortError ? 'sticky-msg error sticky-short' : 'sticky-msg error'}>{state.shortError ?? 'Dati non disponibili'}</span>
  }
  return (
    <div className="sticky-total" aria-hidden="true" data-testid="sticky-total">
      <span className="sticky-label">{label}</span>
      <span className="sticky-value">{body}</span>
    </div>
  )
}
