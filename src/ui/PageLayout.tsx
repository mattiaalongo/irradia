/**
 * Disposizione della pagina nei due aspetti (issue #56, parte 2). I pezzi (anteprima, comandi,
 * mappa, slider, risultati, grafico…) sono costruiti UNA volta in App.tsx; queste due funzioni
 * decidono solo DOVE metterli.
 *
 * Un solo componente `PageLayout` che chiama `layoutA(parts)` o `layoutB(parts)` come funzioni
 * normali, e non due componenti `<LayoutA/>`/`<LayoutB/>`: due componenti diversi nello stesso punto
 * sarebbero due tipi diversi per React, che al cambio di aspetto smonterebbe e ricreerebbe TUTTO,
 * mappa compresa (zoom perso, Leaflet ricreato, mappa del telefono richiusa). Chiamate come
 * funzioni, restituiscono elementi semplici con **chiavi** (`key`) comuni ai due aspetti: React riconosce come "lo stesso" il contenitore `layout` → sezione `params` → scheda
 * `position` e li sposta senza ricrearli. Il percorso fino alla mappa è quindi identico:
 *   Fragment › div.layout[key=layout] › section.params[key=params] › fieldset[key=position] › mappa
 * Gli altri pezzi (anteprima, comandi, risultati) cambiano contenitore e vengono ricreati: non hanno
 * stato da conservare (i valori stanno in App.tsx).
 *
 * L'ordine nel DOM è l'ordine visivo (tastiera e lettori di schermo seguono ciò che si vede).
 */

import type { ReactNode, Ref } from 'react'
import PanelPreview from './PanelPreview'
import StaleResults from './StaleResults'
import type { Look } from './look'

/** Nome accessibile del gruppo degli slider nell'aspetto B (testo nel prototipo approvato dal PO). */
export const SLIDERS_GROUP_LABEL = 'Numero, potenza e perdite'
/** id del titolo visibile «Parametri» nell'aspetto B (c'è una sola pagina, nessun conflitto). */
const PARAMS_TITLE_ID = 'params-title'

export interface PageParts {
  /** Valori IMMEDIATI dei due angoli, per l'anteprima. */
  readonly tiltDeg: number
  readonly azimuthDeg: number
  /** I due comandi circolari (`div.dials`). */
  readonly dials: ReactNode
  /** Contenuto della scheda Posizione dopo la legenda: mappa e campi lat/lon. */
  readonly location: ReactNode
  /** I tre slider: numero, potenza, perdite. */
  readonly sliders: ReactNode
  /** Proprietà della sezione «Risultati» (riferimento per il focus dopo «Riprova», aria-busy). */
  readonly resultsRef: Ref<HTMLElement>
  readonly resultsBusy: boolean
  /** Messaggi di download/errore, pulsante «Riprova», errore del motore. */
  readonly messages: ReactNode
  /** true se ci sono risultati da mostrare (`total` e `details` hanno senso). */
  readonly hasResults: boolean
  /** Risultati della posizione precedente (#42). */
  readonly stale: boolean
  /** Totale annuo con la sua nota. */
  readonly total: ReactNode
  /** Grafico dei mesi con tabella, fonti, «Come è calcolata la stima». */
  readonly details: ReactNode
}

/** Aspetto A «Strumento»: parametri a sinistra, risultati a destra. DOM identico a prima del #56 parte 2. */
function layoutA(p: PageParts): ReactNode {
  return (
    <>
      <div className="layout" key="layout">
        <section className="params" aria-label="Parametri" key="params">
          <fieldset key="position">
            <legend>Posizione</legend>
            {p.location}
          </fieldset>

          <fieldset key="panels">
            <legend>Pannelli</legend>
            <PanelPreview tiltDeg={p.tiltDeg} azimuthDeg={p.azimuthDeg} />
            {p.dials}
            {p.sliders}
          </fieldset>
        </section>

        <section className="results" aria-label="Risultati" ref={p.resultsRef} tabIndex={-1} aria-busy={p.resultsBusy} key="results">
          {p.messages}
          {p.hasResults && (
            <StaleResults stale={p.stale}>
              {p.total}
              {p.details}
            </StaleResults>
          )}
        </section>
      </div>
    </>
  )
}

/**
 * Aspetto B «Giornata di sole»: in alto la «scena» (anteprima grande e Risultati con il totale |
 * comandi circolari), sotto due colonne (Parametri: posizione e slider | grafico e note).
 * Due cornici «non aggiornato» (#42): una attorno al totale, una attorno al grafico.
 */
function layoutB(p: PageParts): ReactNode {
  return (
    <>
      <div className="scene" key="scene">
        <div className="scene-main">
          <PanelPreview tiltDeg={p.tiltDeg} azimuthDeg={p.azimuthDeg} variant="b" />
          <section className="results" aria-label="Risultati" ref={p.resultsRef} tabIndex={-1} aria-busy={p.resultsBusy}>
            {p.messages}
            {p.hasResults && <StaleResults stale={p.stale}>{p.total}</StaleResults>}
          </section>
        </div>
        <fieldset className="scene-dials">
          <legend>Pannelli</legend>
          {p.dials}
        </fieldset>
      </div>

      <div className="layout" key="layout">
        <section className="params" aria-labelledby={PARAMS_TITLE_ID} key="params">
          <h2 className="params-title" id={PARAMS_TITLE_ID} key="title">Parametri</h2>
          <fieldset key="position">
            <legend>Posizione</legend>
            {p.location}
          </fieldset>
          <div className="sliders" role="group" aria-label={SLIDERS_GROUP_LABEL} key="sliders">
            {p.sliders}
          </div>
        </section>

        <div className="results-more" key="more">
          {p.hasResults && <StaleResults stale={p.stale}>{p.details}</StaleResults>}
        </div>
      </div>
    </>
  )
}

/** Disposizione dei pezzi secondo l'aspetto scelto. */
export default function PageLayout({ look, parts }: { look: Look; parts: PageParts }) {
  return look === 'b' ? layoutB(parts) : layoutA(parts)
}
