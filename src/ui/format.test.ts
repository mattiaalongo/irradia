import { describe, expect, it } from 'vitest'
import { cardinalDirection, formatNumber } from './format'
import { parseDecimal, validationMessage } from './parseInput'

describe('cardinalDirection (azimut da Nord in senso orario, convenzione del motore)', () => {
  it('riconosce le otto direzioni principali', () => {
    expect([0, 45, 90, 135, 180, 225, 270, 315].map(cardinalDirection)).toEqual([
      'Nord', 'Nord-Est', 'Est', 'Sud-Est', 'Sud', 'Sud-Ovest', 'Ovest', 'Nord-Ovest',
    ])
  })

  it('usa settori di 45° centrati sulla direzione', () => {
    expect(cardinalDirection(158)).toBe('Sud')
    expect(cardinalDirection(157)).toBe('Sud-Est')
    expect(cardinalDirection(202)).toBe('Sud')
    expect(cardinalDirection(359)).toBe('Nord')
  })
})

describe('formatNumber', () => {
  it('usa il formato italiano', () => {
    expect(formatNumber(4870.4)).toBe('4.870')
    expect(formatNumber(612)).toBe('612')
    expect(formatNumber(14870.4)).toBe('14.870')
    expect(formatNumber(4.3, 2)).toBe('4,30')
  })
})

describe('lettura dei campi numerici', () => {
  it('accetta virgola e punto decimali', () => {
    expect(parseDecimal('41,9028')).toBe(41.9028)
    expect(parseDecimal(' 12.5 ')).toBe(12.5)
    expect(parseDecimal('-3')).toBe(-3)
  })

  it('rifiuta testo che non è un numero', () => {
    for (const t of ['', '-', ',', '1,2,3', 'abc', '1e3']) expect(parseDecimal(t)).toBeNull()
  })

  it('segnala valori fuori intervallo o non interi', () => {
    expect(validationMessage('35', 0, 90, true)).toBeNull()
    expect(validationMessage('95', 0, 90, true)).toBe('Il valore deve essere tra 0 e 90')
    expect(validationMessage('2,5', 1, 50, true)).toBe('Inserisci un numero intero')
    expect(validationMessage('', 1, 50, true)).toBe('Inserisci un numero')
  })
})
