import { describe, expect, it } from 'vitest'
import romaRaw from './__fixtures__/pvgis-mrcalc-roma-s35.json'
import milanoTmyRaw from './__fixtures__/pvgis-tmy-milano.json'
import { parsePvgisMonthly } from './__fixtures__/pvgisMonthly'
import { parsePvgisTmy } from './pvgisTmy'
import { simulateHour, simulateYear, type PvSystem } from './simulate'

// Prove del Software Tester (L1/L2) sul commit dell'issue #10.

const clone = () => structuredClone(romaRaw) as unknown as {
  inputs: { meteo_data: Record<string, unknown> }
  outputs: { monthly: Record<string, unknown>[] }
}

describe('parsePvgisMonthly — casi limite aggiuntivi (ST)', () => {
  it.each([
    ['H(h)_m negativo', (j: ReturnType<typeof clone>) => { j.outputs.monthly[0]['H(h)_m'] = -0.01 }, /negativa/],
    ['H(i)_m negativo', (j: ReturnType<typeof clone>) => { j.outputs.monthly[5]['H(i)_m'] = -1 }, /negativa/],
    ['valore stringa', (j: ReturnType<typeof clone>) => { j.outputs.monthly[1]['H(i)_m'] = '120.5' }, /non è un numero/],
    ['mese 0', (j: ReturnType<typeof clone>) => { j.outputs.monthly[0].month = 0 }, /non valido/],
    ['mese 13', (j: ReturnType<typeof clone>) => { j.outputs.monthly[0].month = 13 }, /non valido/],
    ['mese frazionario', (j: ReturnType<typeof clone>) => { j.outputs.monthly[0].month = 1.5 }, /intero/],
    ['anno 2004 nei dati', (j: ReturnType<typeof clone>) => { j.outputs.monthly[0].year = 2004 }, /fuori da/],
    ['year_max 2024', (j: ReturnType<typeof clone>) => { j.inputs.meteo_data.year_max = 2024 }, /fuori da/],
    ['year_min > year_max', (j: ReturnType<typeof clone>) => { j.inputs.meteo_data.year_min = 2023; j.inputs.meteo_data.year_max = 2022 }, /fuori da/],
    ['monthly non array', (j: ReturnType<typeof clone>) => { (j.outputs as Record<string, unknown>).monthly = {} }, /manca/],
    ['riga null', (j: ReturnType<typeof clone>) => { (j.outputs.monthly as unknown[])[2] = null }, /manca/],
  ])('rifiuta: %s', (_n, mutate, re) => {
    const j = clone()
    mutate(j)
    expect(() => parsePvgisMonthly(j)).toThrow(re)
  })

  it('rifiuta NaN/Infinity (non serializzabili in JSON, ma possibili in memoria)', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const j = clone()
      j.outputs.monthly[0]['H(h)_m'] = bad
      expect(() => parsePvgisMonthly(j)).toThrow()
    }
  })

  it('accetta zero (notte polare) come valore valido', () => {
    const j = clone()
    j.outputs.monthly[0]['H(h)_m'] = 0
    expect(parsePvgisMonthly(j).get(2005, 1).horizontalKwhM2).toBe(0)
  })
})

describe('simulateYear — mesi UTC (ST)', () => {
  const tmy = parsePvgisTmy(milanoTmyRaw)
  const system: PvSystem = { tiltDeg: 35, azimuthDeg: 180, panelCount: 20, panelPowerWp: 430, systemLossPct: 0 }

  it('ogni mese di monthlyKwh è la somma delle ore con quel mese UTC di time', () => {
    const offsetMs = tmy.irradianceTimeOffsetH * 3_600_000
    const wh = new Array<number>(12).fill(0)
    for (const h of tmy.hours) {
      wh[h.time.getUTCMonth()] += simulateHour(
        { ...h, time: new Date(h.time.getTime() + offsetMs) }, tmy.latitude, tmy.longitude, system,
      ).acPowerW
    }
    const year = simulateYear(tmy, system)
    year.monthlyKwh.forEach((k, i) => expect(k).toBeCloseTo(wh[i] / 1000, 6))
  })

  it('i 12 mesi sommano al totale annuo e nessun mese è negativo o NaN', () => {
    const year = simulateYear(tmy, system)
    expect(year.monthlyKwh.reduce((a, b) => a + b, 0)).toBeCloseTo(year.annualKwh, 6)
    year.monthlyKwh.forEach((k) => { expect(Number.isFinite(k)).toBe(true); expect(k).toBeGreaterThanOrEqual(0) })
  })

  it('raddoppiando i pannelli raddoppia la produzione (perdite uguali)', () => {
    const a = simulateYear(tmy, system).annualKwh
    const b = simulateYear(tmy, { ...system, panelCount: 40 }).annualKwh
    expect(b / a).toBeCloseTo(2, 9)
  })
})
