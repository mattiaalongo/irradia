import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import LookSwitch from './LookSwitch'
import { LOOK_LABELS, LOOK_SWITCH_LEGEND, type Look } from './look'

/** Tutti gli elementi <input> dell'albero restituito dal componente (che non usa hook). */
function inputs(node: ReactNode): ReactElement<{ value: Look; onChange: () => void; checked: boolean }>[] {
  if (Array.isArray(node)) return node.flatMap(inputs)
  if (!isValidElement(node)) return []
  const el = node as ReactElement<{ children?: ReactNode; value: Look; onChange: () => void; checked: boolean }>
  return el.type === 'input' ? [el] : inputs(el.props.children)
}

describe('LookSwitch', () => {
  it('testi approvati dal PO', () => {
    expect(LOOK_SWITCH_LEGEND).toBe('Aspetto della pagina')
    expect(LOOK_LABELS).toEqual({ a: 'Strumento', b: 'Giornata di sole' })
  })

  it('fieldset con legenda e due radio nativi nello stesso gruppo, etichette cliccabili', () => {
    const html = renderToStaticMarkup(<LookSwitch look="a" onChange={() => {}} />)
    expect(html).toMatch(/^<fieldset class="look-switch"><legend>Aspetto della pagina<\/legend>/)
    const radios = html.match(/<input type="radio"[^>]*>/g) ?? []
    expect(radios).toHaveLength(2)
    for (const r of radios) expect(r).toContain('name="irradia-look"')
    // Ogni radio sta dentro la sua etichetta (nome accessibile = testo dell'etichetta).
    expect(html).toMatch(/<label class="look-option"><input[^>]*value="a"[^>]*\/?>Strumento<\/label>/)
    expect(html).toMatch(/<label class="look-option"><input[^>]*value="b"[^>]*\/?>Giornata di sole<\/label>/)
  })

  it('è selezionato il radio dell\'aspetto attuale', () => {
    const checkedValues = (look: Look) =>
      (renderToStaticMarkup(<LookSwitch look={look} onChange={() => {}} />).match(/<input[^>]*>/g) ?? [])
        .filter((tag) => /\schecked/.test(tag))
        .map((tag) => tag.match(/value="(\w)"/)?.[1])
    expect(checkedValues('a')).toEqual(['a'])
    expect(checkedValues('b')).toEqual(['b'])
  })

  it('niente aria-live né role: nessun annuncio al cambio', () => {
    const html = renderToStaticMarkup(<LookSwitch look="b" onChange={() => {}} />)
    expect(html).not.toMatch(/aria-live|role=/)
  })

  it('scegliere un radio chiama onChange con il suo aspetto', () => {
    const calls: Look[] = []
    const tree = LookSwitch({ look: 'a', onChange: (l) => calls.push(l) })
    const radios = inputs(tree)
    expect(radios.map((r) => r.props.value)).toEqual(['a', 'b'])
    expect(radios.map((r) => r.props.checked)).toEqual([true, false])
    radios[1].props.onChange()
    radios[0].props.onChange()
    expect(calls).toEqual(['b', 'a'])
  })
})
