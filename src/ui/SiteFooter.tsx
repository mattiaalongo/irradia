/**
 * Piè di pagina con l'informativa sulla privacy.
 * TESTO IN ATTESA DI APPROVAZIONE DEL PO (issue #24, punto 11): si modifica qui, in un solo punto.
 */

export const PRIVACY_TITLE = 'Privacy.'

export const PRIVACY_BODY =
  'Irradia non ha account, non usa cookie e non salva nulla sul tuo dispositivo né su un nostro server: ' +
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
