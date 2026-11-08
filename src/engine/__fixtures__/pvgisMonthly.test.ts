import { describe, expect, it } from 'vitest'
import romaRaw from './pvgis-mrcalc-roma-s35.json'
import milanoRaw from './pvgis-mrcalc-milano-s35.json'
import pvcalcRomaRaw from './pvgis-pvcalc-roma-s35.json'
import pvcalcMilanoRaw from './pvgis-pvcalc-milano-s35.json'
import { MRCALC_FIRST_YEAR, MRCALC_LAST_YEAR, parsePvgisMonthly } from './pvgisMonthly'

/** Copia profonda modificabile del file reale, per costruire i casi d'errore. */
const clone = (): typeof romaRaw => structuredClone(romaRaw)

describe('parsePvgisMonthly — file reali di PVGIS 5.3 MRcalc (README.md)', () => {
  const roma = parsePvgisMonthly(romaRaw)

  it('legge posizione, piano e anni (Roma, Sud 35°, senza orizzonte)', () => {
    expect(roma.latitude).toBe(41.9028)
    expect(roma.longitude).toBe(12.4964)
    expect(roma.tiltDeg).toBe(35)
    expect(roma.azimuthDeg).toBe(180) // aspect 0 di PVGIS = Sud = azimut 180
    expect(roma.usesHorizon).toBe(false)
    expect(roma.firstYear).toBe(MRCALC_FIRST_YEAR)
    expect(roma.lastYear).toBe(MRCALC_LAST_YEAR)
    expect(roma.months).toHaveLength(19 * 12)
  })

  it('legge i valori così come sono nel file (gennaio 2005, prima riga)', () => {
    // Valori copiati dal file: {"year": 2005, "month": 1, "H(h)_m": 64.74, "H(i)_m": 120.69}.
    expect(roma.get(2005, 1)).toEqual({ year: 2005, month: 1, horizontalKwhM2: 64.74, inclinedKwhM2: 120.69 })
    expect(() => roma.get(2024, 1)).toThrow(/assente/)
  })

  // Controllo di coerenza fra due strumenti di PVGIS: H(i)_m di PVcalc è la media dei 19 anni
  // di MRcalc per lo stesso piano (verificato: uguali al centesimo, salvo un arrotondamento).
  // Tolleranza 0,01 kWh/m²: l'ultima cifra che PVGIS scrive.
  it.each([
    { name: 'Roma', mr: romaRaw, pv: pvcalcRomaRaw },
    { name: 'Milano', mr: milanoRaw, pv: pvcalcMilanoRaw },
  ])('$name: la media 2005-2023 di ogni mese coincide con H(i)_m di PVcalc', ({ mr, pv }) => {
    const data = parsePvgisMonthly(mr)
    pv.outputs.monthly.fixed.forEach((ref) => {
      const values = data.months.filter((m) => m.month === ref.month).map((m) => m.inclinedKwhM2)
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      expect(Math.abs(mean - ref['H(i)_m'])).toBeLessThanOrEqual(0.01 + 1e-9)
    })
  })
})

describe('parsePvgisMonthly — rifiuta file non conformi', () => {
  it('unità diverse da kWh/m²/mese', () => {
    const j = clone()
    j.meta.outputs.monthly.variables['H(i)_m'].units = 'Wh/m2/mo'
    expect(() => parsePvgisMonthly(j)).toThrow(/Unità inattesa per H\(i\)_m/)
  })

  it('un mese mancante', () => {
    const j = clone()
    j.outputs.monthly = j.outputs.monthly.filter((m) => !(m.year === 2010 && m.month === 7))
    expect(() => parsePvgisMonthly(j)).toThrow(/Manca il mese 7\/2010/)
  })

  it('un mese ripetuto', () => {
    const j = clone()
    j.outputs.monthly.push({ ...j.outputs.monthly[0] })
    expect(() => parsePvgisMonthly(j)).toThrow(/ripetuto/)
  })

  it('anni fuori da 2005-2023, nei dati o dichiarati', () => {
    const extra = clone()
    extra.outputs.monthly.push({ year: 2024, month: 1, 'H(h)_m': 60, 'H(i)_m': 110 })
    expect(() => parsePvgisMonthly(extra)).toThrow(/2024/)

    const declared = clone()
    declared.inputs.meteo_data.year_min = 2004
    expect(() => parsePvgisMonthly(declared)).toThrow(/fuori da 2005-2023/)
  })

  it('un valore che non è un numero, o un JSON senza la struttura attesa', () => {
    const j = clone() as unknown as { outputs: { monthly: Record<string, unknown>[] } }
    j.outputs.monthly[3]['H(h)_m'] = null
    expect(() => parsePvgisMonthly(j)).toThrow(/non è un numero/)
    expect(() => parsePvgisMonthly({})).toThrow(/manca/)
  })
})
