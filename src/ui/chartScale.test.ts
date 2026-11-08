import { describe, expect, it } from 'vitest'
import { niceScale } from './chartScale'

// Riferimento: metodo dei "nice numbers" (Heckbert, Graphics Gems, 1990). I valori attesi
// si verificano a mano: passo = il più piccolo tra {1, 2, 2,5, 5} × 10ⁿ ≥ massimo / 5.
describe('niceScale', () => {
  it('sceglie tacche tonde che contengono il massimo', () => {
    // 612 / 5 = 122,4 → passo 200 → 0…800
    expect(niceScale(612)).toEqual({ top: 800, step: 200, ticks: [0, 200, 400, 600, 800] })
    // 180 / 5 = 36 → passo 50 → 0…200
    expect(niceScale(180)).toEqual({ top: 200, step: 50, ticks: [0, 50, 100, 150, 200] })
    // 11 / 5 = 2,2 → passo 2,5 → 0…12,5
    expect(niceScale(11).ticks).toEqual([0, 2.5, 5, 7.5, 10, 12.5])
  })

  it('non aggiunge una tacca in più se il massimo cade esattamente su una tacca', () => {
    expect(niceScale(1000)).toEqual({ top: 1000, step: 200, ticks: [0, 200, 400, 600, 800, 1000] })
  })

  it('evita errori di arrotondamento (0,1 + 0,2)', () => {
    expect(niceScale(0.3).ticks).toEqual([0, 0.1, 0.2, 0.3])
  })

  it('gestisce un massimo nullo o non valido', () => {
    expect(niceScale(0).ticks).toEqual([0, 1])
    expect(niceScale(Number.NaN).ticks).toEqual([0, 1])
  })
})
