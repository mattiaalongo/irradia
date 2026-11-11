import { describe, expect, it } from 'vitest'
import { shadingNote } from './sourceNote'

describe('shadingNote', () => {
  it('con orizzonte: ombre del terreno sì, edifici e alberi no, spettrale no', () => {
    const text = shadingNote(true)
    expect(text).toContain('Considera le ombre di montagne e colline')
    expect(text).toContain('non quelle di edifici e alberi vicini')
    expect(text).toContain('effetto spettrale (±1 %)')
  })

  it('senza orizzonte: nessuna ombra e nessun effetto spettrale', () => {
    const text = shadingNote(false)
    expect(text).toBe("Non considera le ombre di montagne, colline, edifici e alberi né l’effetto spettrale (±1 %).")
    expect(text).not.toContain('Considera le ombre')
  })
})
