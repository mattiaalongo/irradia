import { formatNumber } from './format'

export type StickyTotalState =
  | { kind: 'ready'; annualKwh: number; updating: boolean; failed: boolean }
  | { kind: 'loading' }
  | { kind: 'error' }

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
  let label = 'Produzione stimata in un anno'
  let body: React.ReactNode
  if (state.kind === 'ready') {
    if (state.updating) label = 'Aggiorno con i nuovi dati…'
    // Download fallito con un risultato precedente: il numero è quello della posizione di prima.
    // L'avviso completo (role="alert") è nei risultati, spesso fuori schermo sul telefono.
    else if (state.failed) label = 'Dati non aggiornati (errore)'
    body = (
      <>
        {formatNumber(state.annualKwh)} <span className="sticky-unit">kWh</span>
      </>
    )
  } else if (state.kind === 'loading') {
    body = <span className="sticky-msg">Scarico i dati da PVGIS…</span>
  } else {
    body = <span className="sticky-msg error">Dati non disponibili</span>
  }
  return (
    <div className="sticky-total" aria-hidden="true" data-testid="sticky-total">
      <span className="sticky-label">{label}</span>
      <span className="sticky-value">{body}</span>
    </div>
  )
}
