import { describe, expect, it } from 'vitest'
import {
  angleOfIncidence,
  cosAngleOfIncidence,
  extraterrestrialIrradiance,
  planeOfArrayIrradiance,
  SOLAR_CONSTANT_WM2,
  type PoaInput,
} from './irradiance'

const DEG = Math.PI / 180

describe('extraterrestrialIrradiance', () => {
  // Riferimento: Duffie & Beckman, 4ª ed., eq. 1.4.1a: G_on = G_sc (1 + 0,033 cos(360 n / 365)).
  // È una formula diversa da quella di r.sun: r.sun usa un anno di 365,25 giorni e sposta il
  // coseno di 0,048869 rad (≈ 2,8 giorni, perché il perielio cade il 3-4 gennaio). Nei giorni
  // degli equinozi, dove il coseno cambia più in fretta, le due differiscono di
  // ≈ 0,033 · sin(0,048869) ≈ 0,16 %: tolleranza 0,2 %.
  it.each([1, 80, 172, 266, 355])('giorno %i: coincide con Duffie & Beckman entro 0,2 %', (n) => {
    const date = new Date(Date.UTC(2021, 0, n, 12))
    const reference = SOLAR_CONSTANT_WM2 * (1 + 0.033 * Math.cos((360 * n * DEG) / 365))
    expect(Math.abs(extraterrestrialIrradiance(date) / reference - 1)).toBeLessThan(0.002)
  })

  it('massima a inizio gennaio (perielio) e minima a inizio luglio (afelio), ±3,3 %', () => {
    const jan = extraterrestrialIrradiance(new Date('2021-01-03T12:00:00Z'))
    const jul = extraterrestrialIrradiance(new Date('2021-07-04T12:00:00Z'))
    expect(jan / SOLAR_CONSTANT_WM2).toBeCloseTo(1.0334, 3)
    expect(jul / SOLAR_CONSTANT_WM2).toBeCloseTo(0.9666, 3)
  })

  it('rifiuta una data non valida', () => {
    expect(() => extraterrestrialIrradiance(new Date(NaN))).toThrow(RangeError)
  })
})

describe('angolo di incidenza', () => {
  // Duffie & Beckman, 4ª ed., esempio 1.6.1: Madison (φ = 43°), 13 febbraio (δ = −14°),
  // ore 10:30 solari (ω = −22,5°), pannello inclinato di 45° e ruotato di 15° verso Ovest
  // rispetto a Sud. Risultato pubblicato: θ = 35°.
  it('esempio 1.6.1 di Duffie & Beckman: θ = 35°', () => {
    const phi = 43, delta = -14, omega = -22.5
    const sinD = (x: number) => Math.sin(x * DEG)
    const cosD = (x: number) => Math.cos(x * DEG)
    // Posizione del sole da φ, δ, ω (Duffie & Beckman eq. 1.6.5; azimut da Nord come in solarPosition.ts).
    const zenith = Math.acos(cosD(phi) * cosD(delta) * cosD(omega) + sinD(phi) * sinD(delta)) / DEG
    const azimuth =
      180 + Math.atan2(sinD(omega), cosD(omega) * sinD(phi) - Math.tan(delta * DEG) * cosD(phi)) / DEG
    // Pannello: 15° verso Ovest rispetto a Sud → azimut 195° nella nostra convenzione.
    expect(angleOfIncidence(zenith, azimuth, 45, 195)).toBeCloseTo(35, 0)
  })

  it('sole perpendicolare al pannello: θ = 0', () => {
    expect(angleOfIncidence(30, 180, 30, 180)).toBeCloseTo(0, 6)
  })

  it('sole dietro il pannello: cos θ negativo', () => {
    // Pannello verticale verso Sud, sole a Nord 10° sopra l'orizzonte.
    expect(cosAngleOfIncidence(80, 0, 90, 180)).toBeLessThan(0)
  })
})

describe('planeOfArrayIrradiance', () => {
  const base: PoaInput = {
    dniWm2: 800,
    dhiWm2: 120,
    ghiWm2: 800 * Math.cos(40 * DEG) + 120,
    sunZenithDeg: 40,
    sunAzimuthDeg: 180,
    extraterrestrialWm2: 1367,
    tiltDeg: 30,
    panelAzimuthDeg: 180,
  }

  it('pannello orizzontale: diretta + diffusa = GHI e niente riflessa', () => {
    // Con β = 0 il modello di Muneer deve restituire la diffusa orizzontale (F = 1, cos θ = sin h).
    const r = planeOfArrayIrradiance({ ...base, tiltDeg: 0 })
    expect(r.beamWm2).toBeCloseTo(800 * Math.cos(40 * DEG), 9)
    expect(r.diffuseWm2).toBeCloseTo(120, 9)
    expect(r.reflectedWm2).toBe(0)
    expect(r.globalWm2).toBeCloseTo(base.ghiWm2, 9)
  })

  it('pannello rivolto al sole: diretta = DNI', () => {
    const r = planeOfArrayIrradiance({ ...base, tiltDeg: 40 })
    // arccos vicino a 1 amplifica gli arrotondamenti dell'ultima cifra (θ ≈ √(2·ε)):
    // 1e-6° è comunque una precisione molto superiore al necessario.
    expect(r.aoiDeg).toBeCloseTo(0, 4)
    expect(r.beamWm2).toBeCloseTo(800, 9)
  })

  it('riflessa isotropa: pannello verticale vede metà del suolo → albedo · GHI / 2', () => {
    const r = planeOfArrayIrradiance({ ...base, tiltDeg: 90, albedo: 0.3 })
    expect(r.reflectedWm2).toBeCloseTo((0.3 * base.ghiWm2) / 2, 9)
  })

  it('sole dietro il pannello: diretta nulla, diffusa con la formula "in ombra"', () => {
    const r = planeOfArrayIrradiance({ ...base, tiltDeg: 90, panelAzimuthDeg: 0 })
    expect(r.beamWm2).toBe(0)
    // F(90°) con N = 0,25227: 0,5 + 0,25227 · (1 − 0 − π/2) = 0,35593
    expect(r.diffuseWm2).toBeCloseTo(120 * (0.5 + 0.25227 * (1 - Math.PI / 2)), 9)
  })

  it('di notte: solo la diffusa eventualmente presente, nessuna diretta', () => {
    const r = planeOfArrayIrradiance({ ...base, sunZenithDeg: 95, dniWm2: 0, dhiWm2: 0, ghiWm2: 0 })
    expect(r).toMatchObject({ beamWm2: 0, diffuseWm2: 0, reflectedWm2: 0, globalWm2: 0 })
  })

  it('sole radente (0,5°) con un po\' di diretta: risultato finito', () => {
    const r = planeOfArrayIrradiance({ ...base, sunZenithDeg: 89.5, sunAzimuthDeg: 120, dniWm2: 30, dhiWm2: 10, ghiWm2: 10.3 })
    expect(Number.isFinite(r.diffuseWm2)).toBe(true)
    expect(r.diffuseWm2).toBeGreaterThan(0)
  })

  it('rifiuta valori fuori intervallo', () => {
    expect(() => planeOfArrayIrradiance({ ...base, tiltDeg: -1 })).toThrow(RangeError)
    expect(() => planeOfArrayIrradiance({ ...base, tiltDeg: 91 })).toThrow(RangeError)
    expect(() => planeOfArrayIrradiance({ ...base, albedo: 1.5 })).toThrow(RangeError)
    expect(() => planeOfArrayIrradiance({ ...base, dniWm2: -1 })).toThrow(RangeError)
    expect(() => planeOfArrayIrradiance({ ...base, dhiWm2: NaN })).toThrow(RangeError)
  })
})
