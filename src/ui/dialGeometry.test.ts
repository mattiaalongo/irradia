import { describe, expect, it } from 'vitest'
import {
  AZIMUTH_MAX,
  AZIMUTH_MIN,
  TILT_MAX,
  TILT_MIN,
  dialKeyValue,
  dialPoint,
  dialValueFromPoint,
  dialValueText,
} from './dialGeometry'

// Riferimento: trigonometria elementare (cos/sin di 0°, 30°, 45°, 90°, 180°, 270°); i valori sono
// calcolati a mano nel commento di ogni caso. Tolleranza 1e-9 unità: solo l'arrotondamento in
// virgola mobile di Math.cos/Math.sin (es. cos 90° = 6,1e-17 invece di 0), su raggi ≤ 100.
const EPS_DIGITS = 9

// Quadrante di prova: centro (100, 100), raggio 50.
const CX = 100
const CY = 100
const R = 50

describe('dialPoint', () => {
  it('inclinazione: 0° a "ore 3", 90° a "ore 12", 30° nel quarto in alto a destra', () => {
    // β = 0: (100 + 50·1, 100 − 50·0) = (150, 100).
    let p = dialPoint('tilt', 0, CX, CY, R)
    expect(p.x).toBeCloseTo(150, EPS_DIGITS)
    expect(p.y).toBeCloseTo(100, EPS_DIGITS)
    // β = 90: (100 + 50·0, 100 − 50·1) = (100, 50).
    p = dialPoint('tilt', 90, CX, CY, R)
    expect(p.x).toBeCloseTo(100, EPS_DIGITS)
    expect(p.y).toBeCloseTo(50, EPS_DIGITS)
    // β = 30: (100 + 50·cos 30°, 100 − 50·0,5) = (100 + 25·√3, 75) = (143,30127…, 75).
    p = dialPoint('tilt', 30, CX, CY, R)
    expect(p.x).toBeCloseTo(100 + 25 * Math.sqrt(3), EPS_DIGITS)
    expect(p.y).toBeCloseTo(75, EPS_DIGITS)
  })

  it('orientamento: Nord in alto, Est a destra, Sud in basso, Ovest a sinistra', () => {
    // α = 0: (100 + 0, 100 − 50) = (100, 50).
    const n = dialPoint('azimuth', 0, CX, CY, R)
    expect(n.x).toBeCloseTo(100, EPS_DIGITS)
    expect(n.y).toBeCloseTo(50, EPS_DIGITS)
    // α = 90: (100 + 50, 100 − 0) = (150, 100).
    const e = dialPoint('azimuth', 90, CX, CY, R)
    expect(e.x).toBeCloseTo(150, EPS_DIGITS)
    expect(e.y).toBeCloseTo(100, EPS_DIGITS)
    // α = 180: (100 + 0, 100 − 50·(−1)) = (100, 150), il punto più basso.
    const s = dialPoint('azimuth', 180, CX, CY, R)
    expect(s.x).toBeCloseTo(100, EPS_DIGITS)
    expect(s.y).toBeCloseTo(150, EPS_DIGITS)
    // α = 270: (100 − 50, 100) = (50, 100).
    const w = dialPoint('azimuth', 270, CX, CY, R)
    expect(w.x).toBeCloseTo(50, EPS_DIGITS)
    expect(w.y).toBeCloseTo(100, EPS_DIGITS)
    // α = 45: (100 + 50·√2/2, 100 − 50·√2/2) = (135,355…, 64,644…).
    const ne = dialPoint('azimuth', 45, CX, CY, R)
    expect(ne.x).toBeCloseTo(100 + 25 * Math.SQRT2, EPS_DIGITS)
    expect(ne.y).toBeCloseTo(100 - 25 * Math.SQRT2, EPS_DIGITS)
  })
})

describe('dialValueFromPoint', () => {
  it('zona morta: entro il 15 % del raggio restituisce il valore precedente', () => {
    // 15 % di 50 = 7,5. Centro esatto (distanza 0) e distanza 7 → precedente.
    expect(dialValueFromPoint('tilt', CX, CY, CX, CY, R, 35)).toBe(35)
    expect(dialValueFromPoint('azimuth', CX, CY, CX, CY, R, 180)).toBe(180)
    expect(dialValueFromPoint('azimuth', CX + 7, CY, CX, CY, R, 180)).toBe(180)
    // Distanza 8 (> 7,5): punto a destra = Est → 90.
    expect(dialValueFromPoint('azimuth', CX + 8, CY, CX, CY, R, 180)).toBe(90)
  })

  it('al centro con raggio 0 non dà NaN', () => {
    // r = 0 → zona morta vuota; atan2(0, 0) = 0.
    expect(dialValueFromPoint('tilt', CX, CY, CX, CY, 0, 35)).toBe(0)
    expect(dialValueFromPoint('azimuth', CX, CY, CX, CY, 0, 35)).toBe(0)
  })

  it('inclinazione nel quadrante: angolo arrotondato', () => {
    // (150, 100): θ = atan2(0, 50) = 0 → 0.
    expect(dialValueFromPoint('tilt', 150, 100, CX, CY, R, 35)).toBe(0)
    // (100, 50): θ = atan2(50, 0) = 90 → 90.
    expect(dialValueFromPoint('tilt', 100, 50, CX, CY, R, 35)).toBe(90)
    // (140, 60): θ = atan2(40, 40) = 45 → 45.
    expect(dialValueFromPoint('tilt', 140, 60, CX, CY, R, 0)).toBe(45)
    // (140, 70): θ = atan2(30, 40) = 36,87° → 37.
    expect(dialValueFromPoint('tilt', 140, 70, CX, CY, R, 0)).toBe(37)
  })

  it('inclinazione: in alto a sinistra → 90, in basso a destra → 0', () => {
    // (60, 70): θ = atan2(30, −40) = 143,13° → 90.
    expect(dialValueFromPoint('tilt', 60, 70, CX, CY, R, 0)).toBe(90)
    // (50, 100): θ = atan2(0, −50) = 180 → 90.
    expect(dialValueFromPoint('tilt', 50, 100, CX, CY, R, 0)).toBe(90)
    // (140, 130): θ = atan2(−30, 40) = −36,87° → 0.
    expect(dialValueFromPoint('tilt', 140, 130, CX, CY, R, 90)).toBe(0)
    // (100, 150): θ = atan2(−50, 0) = −90 → 0 (bordo del quadrante in basso a destra).
    expect(dialValueFromPoint('tilt', 100, 150, CX, CY, R, 90)).toBe(0)
  })

  it('inclinazione: nel quadrante opposto resta all\'estremo più vicino al precedente', () => {
    // (60, 130): θ = atan2(−30, −40) = −143,13°, quadrante in basso a sinistra.
    expect(dialValueFromPoint('tilt', 60, 130, CX, CY, R, 80)).toBe(90)
    expect(dialValueFromPoint('tilt', 60, 130, CX, CY, R, 45)).toBe(90)
    expect(dialValueFromPoint('tilt', 60, 130, CX, CY, R, 44)).toBe(0)
    expect(dialValueFromPoint('tilt', 60, 130, CX, CY, R, 10)).toBe(0)
  })

  it('inclinazione: θ = −180 (y = cy con −0) vale come 180 → 90', () => {
    // cy − y = 0 − 0 = 0, ma con cy = −0 e y = 0: −0 − 0 = −0, atan2(−0, −50) = −180.
    expect(dialValueFromPoint('tilt', -50, 0, 0, -0, R, 0)).toBe(90)
  })

  it('orientamento: punti cardinali e 360 → 0', () => {
    // (100, 50): atan2(0, 50) = 0 → 0.
    expect(dialValueFromPoint('azimuth', 100, 50, CX, CY, R, 180)).toBe(0)
    // (150, 100): atan2(50, 0) = 90.
    expect(dialValueFromPoint('azimuth', 150, 100, CX, CY, R, 0)).toBe(90)
    // (100, 150): atan2(0, −50) = 180.
    expect(dialValueFromPoint('azimuth', 100, 150, CX, CY, R, 0)).toBe(180)
    // (50, 100): atan2(−50, 0) = −90 → (−90 + 360) mod 360 = 270.
    expect(dialValueFromPoint('azimuth', 50, 100, CX, CY, R, 0)).toBe(270)
    // (99,9, 50): atan2(−0,1, 50) = −0,1146° → round = −0 → (−0 + 360) mod 360 = 0 (non 360).
    expect(dialValueFromPoint('azimuth', 99.9, 50, CX, CY, R, 180)).toBe(0)
    // (99, 50): atan2(−1, 50) = −1,146° → −1 → 359.
    expect(dialValueFromPoint('azimuth', 99, 50, CX, CY, R, 180)).toBe(359)
    // (100 − 0,4, 150): atan2(−0,4, −50) = −179,54° → −180 → 180.
    expect(dialValueFromPoint('azimuth', 99.6, 150, CX, CY, R, 0)).toBe(180)
  })
})

describe('dialKeyValue', () => {
  it('inclinazione: frecce ±1, pagine ±10, Home/End, limiti 0 e 90', () => {
    expect(dialKeyValue('tilt', 'ArrowRight', 35)).toBe(36)
    expect(dialKeyValue('tilt', 'ArrowUp', 35)).toBe(36)
    expect(dialKeyValue('tilt', 'ArrowLeft', 35)).toBe(34)
    expect(dialKeyValue('tilt', 'ArrowDown', 35)).toBe(34)
    expect(dialKeyValue('tilt', 'PageUp', 35)).toBe(45)
    expect(dialKeyValue('tilt', 'PageDown', 35)).toBe(25)
    expect(dialKeyValue('tilt', 'Home', 35)).toBe(0)
    expect(dialKeyValue('tilt', 'End', 35)).toBe(90)
    expect(dialKeyValue('tilt', 'ArrowUp', 90)).toBe(90)
    expect(dialKeyValue('tilt', 'ArrowDown', 0)).toBe(0)
    expect(dialKeyValue('tilt', 'PageUp', 85)).toBe(90)
    expect(dialKeyValue('tilt', 'PageDown', 5)).toBe(0)
  })

  it('orientamento: gira attorno a 0/359, tranne Home ed End', () => {
    expect(dialKeyValue('azimuth', 'ArrowRight', 359)).toBe(0)
    expect(dialKeyValue('azimuth', 'ArrowLeft', 0)).toBe(359)
    expect(dialKeyValue('azimuth', 'PageUp', 355)).toBe(5)
    expect(dialKeyValue('azimuth', 'PageDown', 5)).toBe(355)
    expect(dialKeyValue('azimuth', 'ArrowUp', 180)).toBe(181)
    expect(dialKeyValue('azimuth', 'Home', 180)).toBe(0)
    expect(dialKeyValue('azimuth', 'End', 180)).toBe(359)
  })

  it('altri tasti → null', () => {
    for (const key of ['Enter', ' ', 'Tab', 'a', 'Escape', 'arrowup']) {
      expect(dialKeyValue('tilt', key, 35)).toBeNull()
      expect(dialKeyValue('azimuth', key, 180)).toBeNull()
    }
  })

  it('limiti esportati uguali a quelli degli slider', () => {
    expect([TILT_MIN, TILT_MAX, AZIMUTH_MIN, AZIMUTH_MAX]).toEqual([0, 90, 0, 359])
  })
})

describe('dialValueText', () => {
  it('testi approvati dal PO', () => {
    expect(dialValueText('tilt', 35)).toBe('35°')
    expect(dialValueText('tilt', 0)).toBe('0°, piatti')
    expect(dialValueText('tilt', 90)).toBe('90°, verticali')
    expect(dialValueText('azimuth', 180)).toBe('180°, Sud')
    expect(dialValueText('azimuth', 0)).toBe('0°, Nord')
    expect(dialValueText('azimuth', 90)).toBe('90°, Est')
    expect(dialValueText('azimuth', 225)).toBe('225°, Sud-Ovest')
    expect(dialValueText('azimuth', 359)).toBe('359°, Nord')
  })
})
