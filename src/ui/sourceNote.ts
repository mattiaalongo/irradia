/**
 * Frase sulle ombre e sull'effetto spettrale nella nota delle fonti sotto i risultati.
 * Testi approvati dal PO l'11/11/2026 (issue #25). Pura: il testo dipende solo da `usesHorizon`,
 * letto da PVGIS (`Tmy.usesHorizon`).
 */
export function shadingNote(usesHorizon: boolean): string {
  return usesHorizon
    ? "Considera le ombre di montagne e colline (profilo del terreno di PVGIS), non quelle di edifici e alberi vicini. Non considera l'effetto spettrale (±1 %)."
    : "Non considera le ombre di montagne, colline, edifici e alberi né l'effetto spettrale (±1 %)."
}
