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
