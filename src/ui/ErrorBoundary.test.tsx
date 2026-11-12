import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ErrorBoundary, { ReloadFallback } from './ErrorBoundary'
import { APP_ERROR_TEXT, MAP_ERROR_TEXT, RELOAD_LABEL } from './errorBoundaryText'

describe('ErrorBoundary', () => {
  it('senza errori mostra i figli e non il messaggio', () => {
    const html = renderToStaticMarkup(
      <ErrorBoundary fallback={<p>errore</p>}>
        <p>contenuto</p>
      </ErrorBoundary>,
    )
    expect(html).toBe('<p>contenuto</p>')
  })

  it('getDerivedStateFromError produce lo stato di errore', () => {
    expect(ErrorBoundary.getDerivedStateFromError()).toEqual({ hasError: true })
  })

  it('con lo stato di errore mostra il messaggio al posto dei figli', () => {
    const boundary = new ErrorBoundary({ fallback: <p>errore</p>, children: <p>contenuto</p> })
    boundary.state = ErrorBoundary.getDerivedStateFromError()
    expect(renderToStaticMarkup(<>{boundary.render()}</>)).toBe('<p>errore</p>')
  })
})

describe('ReloadFallback', () => {
  it('mappa: testo approvato in un avviso role="alert"', () => {
    const html = renderToStaticMarkup(<ReloadFallback className="map map-error" text={MAP_ERROR_TEXT} />)
    expect(html).toContain('class="map map-error"')
    expect(html).toContain(`<p role="alert">${MAP_ERROR_TEXT}</p>`)
    expect(MAP_ERROR_TEXT).toContain('qui sotto')
  })

  it('pagina intera: testo approvato in un avviso role="alert"', () => {
    const html = renderToStaticMarkup(<ReloadFallback className="app-error" text={APP_ERROR_TEXT} />)
    expect(html).toContain(`<p role="alert">${APP_ERROR_TEXT}</p>`)
  })

  it('il pulsante è type="button", fuori dall\'avviso, con la scritta approvata', () => {
    const html = renderToStaticMarkup(<ReloadFallback className="app-error" text={APP_ERROR_TEXT} />)
    expect(html).toMatch(new RegExp(`</p><button type="button"[^>]*>${RELOAD_LABEL}</button>`))
    expect(RELOAD_LABEL).toBe('Ricarica la pagina')
  })
})
