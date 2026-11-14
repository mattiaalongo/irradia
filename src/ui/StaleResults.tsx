import type { ReactNode } from 'react'

/**
 * Testo dell'etichetta posata sul bordo della cornice quando i risultati non sono aggiornati
 * (issue #42, testo approvato dal PO il 14/11/2026). Vero in tutti e tre i casi in cui la pagina mostra
 * ancora il risultato di prima: attesa di 0,8 s, download, errore. I numeri sono della posizione
 * precedente, ma già ricalcolati con i parametri attuali dei pannelli. Unico punto in cui il testo è scritto.
 */
export const STALE_LABEL = 'Valori della posizione precedente'

/**
 * Contenitore dei risultati. Quando `stale` è vero mostra lo stato "non aggiornato" senza opacità
 * (l'opacità portava testi e barre sotto i contrasti minimi di WCAG 1.4.3 / 1.4.11): cornice tratteggiata,
 * etichetta in testo, totale annuo in colore secondario (stili in `index.css`, `.stale-results`).
 *
 * Accessibilità: l'etichetta è testo normale, primo figlio del blocco, quindi letto prima del totale.
 * Niente `role="alert"`/`status` né `aria-live`: non si annuncia nulla a ogni passo di slider
 * (l'errore resta annunciato una volta dal suo avviso, il download da `aria-busy` sulla sezione).
 * Lo spazio della cornice è sempre riservato (bordo trasparente quando i dati sono aggiornati):
 * nessuno spostamento della pagina tra i due stati.
 */
export default function StaleResults({ stale, children }: { stale: boolean; children: ReactNode }) {
  return (
    <div className={stale ? 'stale-results is-stale' : 'stale-results'}>
      {stale && <span className="stale-label">{STALE_LABEL}</span>}
      {children}
    </div>
  )
}
