import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import SiteFooter, { PRIVACY_BODY, PRIVACY_TITLE } from './SiteFooter'
import { LOOK_LABELS } from './look'

describe('SiteFooter', () => {
  it('testo approvato dal PO il 14/11/2026 (issue #56), parola per parola', () => {
    expect(PRIVACY_TITLE).toBe('Privacy.')
    expect(PRIVACY_BODY).toBe(
      'Irradia non ha account e non usa cookie. Sul tuo dispositivo salva una sola informazione: l\'aspetto della pagina che hai scelto (Strumento o Giornata di sole), per riproporlo alla visita successiva; puoi cancellarla cancellando i dati del sito dal browser. Non salva posizioni né parametri, e nulla viene salvato su un nostro server: le posizioni già consultate restano solo in memoria finché la pagina è aperta. Per calcolare la produzione, le coordinate scelte (arrotondate a circa 11 m) vengono inviate a PVGIS, il servizio della Commissione Europea che fornisce i dati sull\'irraggiamento. La mappa scarica le immagini da OpenStreetMap, che riceve il tuo indirizzo IP e la zona che stai guardando.',
    )
  })

  it('i nomi degli aspetti citati sono quelli dell\'interruttore', () => {
    expect(PRIVACY_BODY).toContain(`(${LOOK_LABELS.a} o ${LOOK_LABELS.b})`)
  })

  it('titolo in grassetto seguito dal testo', () => {
    expect(renderToStaticMarkup(<SiteFooter />)).toMatch(/^<footer class="site-footer"><p><strong>Privacy\.<\/strong> Irradia non ha account/)
  })
})
