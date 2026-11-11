/**
 * Testi della sezione richiudibile "Come è calcolata la stima" (issue #26).
 * Testi approvati dal PO l'11/11/2026 (con le correzioni C5 e I4 della rilettura del SWD). Pura: nessun React, i valori calcolati arrivano dal motore.
 *
 * DEVE RESTARE ALLINEATA AL MOTORE. Se cambia il modello (diffusa, riflessione sul vetro,
 * temperatura, rendimento, perdite, albedo, ombre del terreno) o la versione di PVGIS
 * (`PVGIS_API_VERSION`), aggiornare questi testi e `ANNUAL_NOTE` (ui/AnnualTotal.tsx).
 * Le citazioni di modelli e fonti valgono per PVGIS `v5_3`.
 * `methodNote.test.ts` fa suonare un allarme quando le costanti del modello cambiano.
 */
import { DEFAULT_ALBEDO } from '../engine/irradiance'
import { TMY_HOURS } from '../engine/pvgisTmy'
import { DEFAULT_SYSTEM_LOSS_PCT } from '../engine/simulate'
import { formatNumber } from './format'

export const METHOD_SUMMARY = 'Come è calcolata la stima'

export const METHOD_INTRO =
  `Il numero mostrato è l'energia che l'impianto consegna in un anno, dopo le perdite di sistema. ` +
  `Irradia la calcola ora per ora, per tutte le ${formatNumber(TMY_HOURS)} ore di un anno tipo, ` +
  `con gli stessi modelli fisici pubblicati usati da PVGIS 5.3, tranne l'effetto spettrale (vedi sotto). ` +
  `Il calcolo non usa modelli statistici opachi né intelligenza artificiale: con gli stessi dati e gli stessi ` +
  `parametri il risultato è sempre lo stesso.`

export const INCLUDED_LABEL = 'Cosa è compreso'
export const EXCLUDED_LABEL = 'Cosa non è compreso'
export const DIFFERENCES_LABEL = 'Perché può differire dal sito PVGIS'

/** Elenco di ciò che il calcolo comprende; la voce sulle ombre del terreno c'è solo se PVGIS le ha applicate. */
export function includedItems(usesHorizon: boolean, yearMin: number, yearMax: number): string[] {
  return [
    `Il meteo del punto scelto: l'anno tipo di PVGIS (JRC, Commissione Europea), fatto di 12 mesi reali scelti tra il ${yearMin} e il ${yearMax}, con la luce del sole, la temperatura dell'aria e il vento di ogni ora.`,
    'La posizione del sole in ogni ora, calcolata con l\'algoritmo NOAA.',
    `La luce che arriva sui pannelli: quella diretta del sole, quella diffusa dal cielo (modello di Muneer) e quella riflessa dal terreno, supponendo un suolo comune (albedo ${formatNumber(DEFAULT_ALBEDO, 1)}: prato o terra; neve e superfici chiare riflettono di più).`,
    ...(usesHorizon
      ? ['Le ombre di montagne e colline: nelle ore in cui il sole è dietro il profilo del terreno, PVGIS toglie la luce diretta e resta solo quella diffusa.']
      : []),
    'La luce riflessa via dal vetro dei pannelli, che aumenta quando il sole colpisce i pannelli di striscio, cioè molto di lato o quasi radente (modello di Martin e Ruiz).',
    'La temperatura dei pannelli, che dipende dal sole, dall\'aria e dal vento (modello di Faiman): più sono caldi, meno producono. Il calcolo considera pannelli ben ventilati, con aria che circola dietro.',
    'Il rendimento dei pannelli al variare della luce e della temperatura, per pannelli in silicio cristallino, i più diffusi (modello di Huld, 2011).',
    `Le perdite di sistema: la percentuale che scegli (PVGIS suggerisce ${formatNumber(DEFAULT_SYSTEM_LOSS_PCT)} %) viene tolta allo stesso modo dalla produzione di ogni ora. Rappresenta in blocco ciò che il calcolo non descrive una per una, come inverter, cavi, sporcizia e piccole differenze tra un pannello e l'altro.`,
  ]
}

/** Elenco di ciò che il calcolo non comprende; la prima voce dipende dalle ombre del terreno. */
export function excludedItems(usesHorizon: boolean): string[] {
  return [
    usesHorizon
      ? 'Le ombre di edifici, alberi, camini e altri ostacoli vicini: il profilo del terreno di PVGIS non li contiene. Se il tetto è in ombra in alcune ore, la produzione reale sarà più bassa.'
      : 'Le ombre di montagne, colline, edifici, alberi e camini: per questo punto PVGIS non ha applicato il profilo del terreno. Se il tetto è in ombra in alcune ore, la produzione reale sarà più bassa.',
    'Le ombre di una fila di pannelli sull\'altra, ad esempio su un tetto piano.',
    'La neve e il calo di potenza dei pannelli con gli anni: il calcolo considera pannelli nuovi.',
    'Il limite di potenza dell\'inverter: se l\'inverter è più piccolo dei pannelli, nelle ore di pieno sole la produzione reale viene tagliata.',
    'L\'effetto spettrale, cioè il cambiare del colore della luce con il cielo e le stagioni: PVGIS lo stima in circa ±1 %.',
    'Altri tipi di pannello e di montaggio: film sottile, pannelli bifacciali (che usano anche la luce sul retro), pannelli integrati nel tetto senza aria dietro (si scaldano di più), inseguitori solari.',
    'Costi, risparmi e tempi di rientro dell\'investimento.',
  ]
}

export const DIFFERENCES_PARAGRAPHS: readonly string[] = [
  'Il sito PVGIS mostra la media di tutti gli anni disponibili; qui si usa un solo anno tipo, che può essere un po\' più o un po\' meno soleggiato della media. Per la stessa ragione un anno reale può produrre qualche punto percentuale in più o in meno: è la variabilità del meteo, non un errore. Inoltre Irradia non calcola l\'effetto spettrale, che PVGIS invece considera.',
  'Il calcolo è verificato da prove automatiche contro i risultati di PVGIS a Roma e a Milano: calcolando ora per ora con gli stessi dati meteo, l\'energia dell\'anno differisce da quella di PVGIS meno dell\'1 %.',
]
