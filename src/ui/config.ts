/**
 * Impostazioni dell'interfaccia.
 */

/**
 * Indirizzo di base dell'API PVGIS visto dal browser.
 * In sviluppo è il proxy di Vite (`vite.config.ts`), che gira le richieste a
 * https://re.jrc.ec.europa.eu/api: PVGIS non invia header CORS, quindi il browser
 * non può chiamarlo direttamente. In produzione (fase 6) servirà un intermediario
 * lato server raggiungibile allo stesso indirizzo.
 */
export const PVGIS_BASE_URL = '/api/pvgis'

/**
 * Attesa, in millisecondi, dopo l'ultima modifica della posizione prima di scaricare
 * i dati: evita una richiesta per ogni cifra digitata o per ogni passo dello slider.
 */
export const TMY_DEBOUNCE_MS = 800

/*
 * Mappa (fase 5). Fonte: OpenStreetMap Foundation, "Tile Usage Policy"
 * (https://operations.osmfoundation.org/policies/tiles/, consultata il 9/11/2026).
 * La policy chiede: indirizzo `tile.openstreetmap.org` (senza sottodomini a/b/c),
 * attribuzione visibile, nessuno scaricamento massivo, rispetto delle intestazioni di cache.
 */

/** Indirizzo delle tessere del server OSM standard (formato {z}/{x}/{y} di Leaflet). */
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

/**
 * Attribuzione (HTML) richiesta dalla licenza ODbL e dalla tile usage policy;
 * testo suggerito da https://www.openstreetmap.org/copyright.
 */
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

/** Zoom massimo: il server OSM standard produce tessere fino al livello 19 (oltre: errore). */
export const MAP_MAX_ZOOM = 19

/**
 * Vista iniziale: centro dell'Italia (≈ 42,1 N, 12,5 E) con zoom 5, che a una larghezza
 * tipica mostra l'Italia e i paesi vicini. Area del progetto: Italia/Europa (CLAUDE.md).
 */
export const MAP_INITIAL_CENTER = { lat: 42.1, lon: 12.5 } as const
export const MAP_INITIAL_ZOOM = 5
