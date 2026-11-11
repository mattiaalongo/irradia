import { describe, expect, it } from 'vitest'
import aostaRaw from './pvgis-horizon-aosta.json'
import { parsePvgisHorizon } from './pvgisHorizon'

// Profilo dell'orizzonte di PVGIS 5.3 ("printhorizon") per Aosta centro, scaricato il
// 10/11/2026 (README.md). I valori attesi sono copiati a mano dal file: per esempio
// {"A": 0.0, "H_hor": 14.9} (Sud), {"A": -90.0, "H_hor": 2.7} (Est), {"A": 90.0, "H_hor": 10.3}
// (Ovest), {"A": -180.0, "H_hor": 8.0} e {"A": 180.0, "H_hor": 8.0} (Nord, ripetuto).

/** Copia profonda modificabile del file reale, per costruire i casi d'errore. */
const clone = (): any => structuredClone(aostaRaw) // eslint-disable-line @typescript-eslint/no-explicit-any

describe('parsePvgisHorizon — file reale di PVGIS 5.3 (Aosta)', () => {
  const profile = parsePvgisHorizon(aostaRaw)

  it('legge posizione e origine del profilo', () => {
    expect(profile.latitude).toBe(45.737)
    expect(profile.longitude).toBe(7.3201)
    expect(profile.elevationM).toBe(584)
    expect(profile.horizonDb).toBe('DEM-calculated')
  })

  it('48 punti distinti ogni 7,5°, dal Nord, Nord una volta sola', () => {
    expect(profile.stepDeg).toBe(7.5)
    expect(profile.points).toHaveLength(48)
    expect(profile.points.map((p) => p.azimuthDeg)).toEqual(Array.from({ length: 48 }, (_, i) => i * 7.5))
  })

  // Conversione dell'azimut: PVGIS A (0 = S, 90 = O, −90 = E) → motore (0 = N, 90 = E, 180 = S).
  it.each([
    ['Nord (A = ±180)', 0, 8.0],
    ['Est (A = −90)', 90, 2.7],
    ['Sud (A = 0)', 180, 14.9],
    ['Ovest (A = 90)', 270, 10.3],
    ['A = −172,5 (primo punto dopo il Nord, verso Est)', 7.5, 9.5],
    ['A = 172,5 (ultimo punto prima del Nord, verso Ovest)', 352.5, 8.0],
  ])('%s → azimut %s°, altezza %s°', (_name, azimuth, height) => {
    expect(profile.points.find((p) => p.azimuthDeg === azimuth)?.heightDeg).toBe(height)
    expect(profile.heightAt(azimuth)).toBeCloseTo(height, 12)
  })

  it('il segno della conversione non è scambiato: Est basso (2,7°), Ovest alto (10,3°)', () => {
    // Se si sbagliasse il verso (azimut = 180 − A), Est e Ovest sarebbero invertiti.
    expect(profile.heightAt(90)).toBeLessThan(profile.heightAt(270))
  })

  it('interpolazione lineare a metà fra due punti', () => {
    // Fra Sud (180°, 14,9°) e A = 7,5 (187,5°, 13,0°): media 13,95°.
    expect(profile.heightAt(183.75)).toBeCloseTo(13.95, 12)
    // A un quarto fra A = −60 (120°, 14,9°) e A = −52,5 (127,5°, 16,8°): 14,9 + 0,25 × 1,9 = 15,375°.
    expect(profile.heightAt(121.875)).toBeCloseTo(15.375, 12)
  })

  it('passa per il Nord senza salti (profilo periodico)', () => {
    // Fra 352,5° (8,0°) e 360° = 0° (8,0°), poi fra 0° (8,0°) e 7,5° (9,5°).
    expect(profile.heightAt(356.25)).toBeCloseTo(8.0, 12)
    expect(profile.heightAt(3.75)).toBeCloseTo(8.75, 12)
    expect(profile.heightAt(360)).toBeCloseTo(profile.heightAt(0), 12)
    expect(profile.heightAt(-3.75)).toBeCloseTo(profile.heightAt(356.25), 12)
    expect(profile.heightAt(720 + 183.75)).toBeCloseTo(13.95, 12)
  })

  it('azimut non finito → errore', () => {
    expect(() => profile.heightAt(NaN)).toThrow(RangeError)
  })
})

describe('parsePvgisHorizon — risposte non valide', () => {
  const cases: [string, (j: any) => void, RegExp][] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
    ['convenzione dell\'azimut cambiata', (j) => (j.meta.outputs.horizon_profile.variables.A.description = 'Azimuth (0 = N, 90 = E)'), /Convenzione dell'azimut/],
    ['unità dell\'azimut cambiata', (j) => (j.meta.outputs.horizon_profile.variables.A.units = 'radian'), /Unità inattesa per A/],
    ['unità dell\'altezza cambiata', (j) => (j.meta.outputs.horizon_profile.variables.H_hor.units = 'radian'), /Unità inattesa per H_hor/],
    ['manca il meta', (j) => delete j.meta, /manca/],
    ['manca il profilo', (j) => delete j.outputs.horizon_profile, /meno di 3 punti/],
    ['Nord con due altezze diverse', (j) => (j.outputs.horizon_profile.at(-1).H_hor = 8.1), /due altezze diverse/],
    ['profilo che non finisce al Nord', (j) => j.outputs.horizon_profile.pop(), /da −180 a 180/],
    ['passo irregolare', (j) => (j.outputs.horizon_profile[5].A = -140), /passo costante/],
    ['altezza non numerica', (j) => (j.outputs.horizon_profile[3].H_hor = null), /non è un numero/],
    ['altezza impossibile', (j) => (j.outputs.horizon_profile[3].H_hor = 95), /altezza 95/],
  ]
  it.each(cases)('%s', (_name, alter, message) => {
    const j = clone()
    alter(j)
    expect(() => parsePvgisHorizon(j)).toThrow(message)
  })
})
