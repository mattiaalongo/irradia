/**
 * Area di lavoro dell'app (Italia/Europa), in gradi, limiti inclusi.
 *
 * Unica fonte dei limiti per l'interfaccia (campi e mappa, tramite `ui/mapArea.ts`) e per
 * l'intermediario verso PVGIS (`server/pvgisProxy.ts`), che rifiuta le coordinate fuori area.
 * Nessuna dipendenza: può essere importato sia dal browser sia dal server.
 *
 * Motivo dei valori (CLAUDE.md): l'area del progetto è Italia/Europa; 34-72° N va da
 * Creta/Cipro a Capo Nord, −25-45° E dalle Azzorre/Islanda al Caucaso. Sono numeri interi:
 * arrotondando a 4 decimali un punto interno resta interno.
 */
export const AREA_MIN_LAT = 34
export const AREA_MAX_LAT = 72
export const AREA_MIN_LON = -25
export const AREA_MAX_LON = 45
