import { describe, expect, it } from 'vitest'
import {
  faimanModuleTemperature,
  huldDcPower,
  huldRelativeEfficiency,
  martinRuizBeamFactor,
  martinRuizDiffuseFactor,
  martinRuizGroundFactor,
} from './pvModule'

// I valori attesi sono calcolati dalle formule pubblicate (fonti in pvModule.ts) in modo
// indipendente dal codice TypeScript (a mano o con Python).
// La verifica "di insieme" contro PVGIS (perdite angolari e termiche annue) è in simulate.test.ts.

describe('Martin & Ruiz — riflessione sul vetro', () => {
  it('incidenza perpendicolare: nessuna perdita', () => {
    expect(martinRuizBeamFactor(0)).toBeCloseTo(1, 12)
  })

  it('incidenza radente (90°) o da dietro: entra nulla', () => {
    expect(martinRuizBeamFactor(90)).toBe(0)
    expect(martinRuizBeamFactor(120)).toBe(0)
  })

  it('60°: 1 − [e^(−0,5/0,16) − e^(−1/0,16)] / [1 − e^(−1/0,16)] = 0,957912', () => {
    expect(martinRuizBeamFactor(60)).toBeCloseTo(0.957912, 6)
  })

  it('la perdita cresce con l\'angolo', () => {
    const f = [0, 30, 50, 70, 85].map((a) => martinRuizBeamFactor(a))
    for (let i = 1; i < f.length; i++) expect(f[i]).toBeLessThan(f[i - 1])
  })

  it('diffusa e riflessa: fattori tra 0 e 1, la riflessa perde di più (luce più radente)', () => {
    for (const tilt of [10, 35, 60, 90]) {
      const d = martinRuizDiffuseFactor(tilt)
      const g = martinRuizGroundFactor(tilt)
      expect(d).toBeGreaterThan(0.85)
      expect(d).toBeLessThan(1)
      expect(g).toBeGreaterThan(0)
      // A 90° il pannello vede metà cielo e metà suolo in modo simmetrico: i due fattori coincidono.
      if (tilt < 90) expect(g).toBeLessThan(d)
      else expect(g).toBeCloseTo(d, 12)
    }
  })

  // Valori ricalcolati indipendentemente (Python) dalle formule di Martin & Ruiz 2001.
  it('β = 35°: diffusa 0,955709, riflessa 0,832568', () => {
    // diffusa: x = sin β + (π − β − sin β)/(1 + cos β) = 1,649435
    // riflessa: x = sin β + (β − sin β)/(1 − cos β) = 0,779765
    // F = 1 − exp(−(c1·x + c2·x²)/a_r), c1 = 4/(3π), c2 = 0,5·0,16 − 0,154 = −0,074
    expect(martinRuizDiffuseFactor(35)).toBeCloseTo(0.955709, 6)
    expect(martinRuizGroundFactor(35)).toBeCloseTo(0.832568, 6)
  })

  it('pannello piatto: niente divisione 0/0 per la riflessa', () => {
    expect(Number.isFinite(martinRuizGroundFactor(0))).toBe(true)
  })
})

describe('Faiman — temperatura del modulo', () => {
  it('Tm = Ta + G / (U0 + U1·v): 25 °C, 1000 W/m², 1 m/s → 25 + 1000/33,1', () => {
    expect(faimanModuleTemperature(25, 1000, 1)).toBeCloseTo(25 + 1000 / 33.1, 10)
  })

  it('senza sole il modulo è alla temperatura dell\'aria', () => {
    expect(faimanModuleTemperature(12.3, 0, 4)).toBe(12.3)
  })

  it('più vento → modulo più freddo', () => {
    expect(faimanModuleTemperature(25, 800, 5)).toBeLessThan(faimanModuleTemperature(25, 800, 1))
  })

  it('rifiuta un vento negativo', () => {
    expect(() => faimanModuleTemperature(25, 800, -1)).toThrow(RangeError)
  })
})

describe('Huld — rendimento e potenza DC', () => {
  it('condizioni STC (1000 W/m², 25 °C): rendimento relativo esattamente 1', () => {
    expect(huldRelativeEfficiency(1000, 25)).toBe(1)
    expect(huldDcPower(3000, 1000, 25)).toBe(3000)
  })

  it('200 W/m², 25 °C: 1 + k1·ln 0,2 + k2·(ln 0,2)² = 0,922926', () => {
    expect(huldRelativeEfficiency(200, 25)).toBeCloseTo(0.922926, 6)
  })

  it('1000 W/m², 50 °C: 1 + 25·k3 + 625·k6 = 0,88558', () => {
    expect(huldRelativeEfficiency(1000, 50)).toBeCloseTo(1 - 25 * 0.004702 + 625 * 0.000005, 10)
  })

  it('al buio la potenza è zero (niente logaritmo di zero)', () => {
    expect(huldRelativeEfficiency(0, 10)).toBe(0)
    expect(huldDcPower(3000, 0, 10)).toBe(0)
  })

  it('a irradianze bassissime il rendimento non diventa negativo', () => {
    expect(huldRelativeEfficiency(0.001, 25)).toBeGreaterThanOrEqual(0)
  })

  it('rifiuta una potenza nominale negativa', () => {
    expect(() => huldDcPower(-1, 500, 25)).toThrow(RangeError)
  })
})
