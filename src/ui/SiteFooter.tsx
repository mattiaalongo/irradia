/**
 * Piè di pagina con l'informativa sulla privacy. Testo approvato dal PO il 10/11/2026 (issue #24) e
 * aggiornato il 14/11/2026 (issue #56, parte 2) per l'unica informazione salvata sul dispositivo:
 * l'aspetto della pagina (`LOOK_STORAGE_KEY` in look.ts). Si modifica qui, in un solo punto.
 */

export const PRIVACY_TITLE = 'Privacy.'

export const PRIVACY_BODY =
  'Irradia non ha account e non usa cookie. ' +
  'Sul tuo dispositivo salva una sola informazione: l\'aspetto della pagina che hai scelto (Strumento o Giornata di sole), ' +
  'per riproporlo alla visita successiva; puoi cancellarla cancellando i dati del sito dal browser. ' +
  'Non salva posizioni né parametri, e nulla viene salvato su un nostro server: ' +
  'le posizioni già consultate restano solo in memoria finché la pagina è aperta. ' +
  'Per calcolare la produzione, le coordinate scelte (arrotondate a circa 11 m) vengono inviate a PVGIS, ' +
  'il servizio della Commissione Europea che fornisce i dati sull\'irraggiamento. ' +
  'La mappa scarica le immagini da OpenStreetMap, che riceve il tuo indirizzo IP e la zona che stai guardando.'

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>
        <strong>{PRIVACY_TITLE}</strong> {PRIVACY_BODY}
      </p>
    </footer>
  )
}
