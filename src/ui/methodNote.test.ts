import { describe, expect, it } from 'vitest'
import { DEFAULT_ALBEDO } from '../engine/irradiance'
import { PVGIS_API_VERSION, TMY_HOURS, parsePvgisTmy, pvgisTmyUrl } from '../engine/pvgisTmy'
import { FAIMAN_FREE_STANDING_CSI, HULD_CSI_PVGIS5, MARTIN_RUIZ_AR_CSI } from '../engine/pvModule'
import { DEFAULT_SYSTEM_LOSS_PCT, simulateHour } from '../engine/simulate'
import romaTmyRaw from '../engine/__fixtures__/pvgis-tmy-roma.json'
import { ANNUAL_NOTE } from './AnnualTotal'
import { DIFFERENCES_PARAGRAPHS, METHOD_INTRO, excludedItems, includedItems } from './methodNote'
import { shadingNote } from './sourceNote'

const ALLARME = 'Hai cambiato il modello: aggiorna src/ui/methodNote.ts (e ANNUAL_NOTE).'
const tutto = (h: boolean) => [METHOD_INTRO, ...includedItems(h, 2005, 2023), ...excludedItems(h), ...DIFFERENCES_PARAGRAPHS].join('\n')

describe('methodNote: contenuto', () => {
  it('le due varianti differiscono solo per le ombre del terreno', () => {
    const con = includedItems(true, 2005, 2023)
    const senza = includedItems(false, 2005, 2023)
    expect(con.length).toBe(senza.length + 1)
    expect(con.filter((t) => t.includes('Le ombre di montagne e colline'))).toHaveLength(1)
    expect(senza.some((t) => t.includes('Le ombre di montagne e colline'))).toBe(false)
    expect(excludedItems(true)[0]).toContain('ostacoli vicini')
    expect(excludedItems(false)[0]).toContain('non ha applicato il profilo del terreno')
    expect(excludedItems(true)).toHaveLength(excludedItems(false).length)
  })

  it('gli anni passati compaiono nel testo', () => {
    expect(includedItems(true, 2007, 2021)[0]).toContain('tra il 2007 e il 2021')
  })

  it('nessun link e nessuna frase sull\'aumentare le perdite', () => {
    expect(tutto(true)).not.toMatch(/https?:|www\./)
    expect(tutto(true)).not.toMatch(/aument\w+ le perdite|perdite[^.]*aument/)
  })
})

describe('methodNote: allineamento col motore', () => {
  it('i valori scritti derivano dalle costanti del motore', () => {
    const t = tutto(true)
    expect(t, ALLARME).toContain('albedo 0,2')
    expect(DEFAULT_ALBEDO, ALLARME).toBe(0.2)
    expect(t, ALLARME).toContain('14 %')
    expect(DEFAULT_SYSTEM_LOSS_PCT, ALLARME).toBe(14)
    expect(t, ALLARME).toContain('8.760')
    expect(TMY_HOURS, ALLARME).toBe(8760)
  })

  it('costanti dei modelli citati nei testi', () => {
    expect(MARTIN_RUIZ_AR_CSI, ALLARME).toBe(0.16)
    expect(FAIMAN_FREE_STANDING_CSI, ALLARME).toEqual({ u0: 26.9, u1: 6.2 })
    expect(HULD_CSI_PVGIS5, ALLARME).toEqual([-0.017237, -0.040465, -0.004702, 0.000149, 0.00017, 0.000005])
    expect(PVGIS_API_VERSION, ALLARME).toBe('v5_3')
  })

  it('le perdite di sistema si tolgono dalla produzione di ogni ora', () => {
    const tmy = parsePvgisTmy(romaTmyRaw)
    const h = tmy.hours.reduce((a, b) => (b.ghiWm2 > a.ghiWm2 ? b : a)) // l'ora più luminosa dell'anno
    const weather = { ...h, time: new Date(h.time.getTime() + tmy.irradianceTimeOffsetH * 3_600_000) }
    const sys = { tiltDeg: 35, azimuthDeg: 180, panelCount: 10, panelPowerWp: 430, systemLossPct: 14 }
    const r = simulateHour(weather, tmy.latitude, tmy.longitude, sys)
    expect(r.dcPowerW).toBeGreaterThan(0)
    // Tolleranza: solo l'errore di arrotondamento dei double.
    expect(r.acPowerW, ALLARME).toBeCloseTo(r.dcPowerW * (1 - 14 / 100), 9)
  })

  it('le ombre del terreno sono richieste a PVGIS ed è coerente con la nota delle fonti', () => {
    expect(pvgisTmyUrl('/api/pvgis', 41.9, 12.5), ALLARME).toContain('usehorizon=1')
    expect(shadingNote(true)).toContain('Considera le ombre di montagne e colline')
    expect(shadingNote(false)).toContain('Non considera le ombre di montagne')
    expect(includedItems(true, 2005, 2023).join(' ')).toContain('montagne e colline')
    expect(excludedItems(false)[0]).toContain('non ha applicato')
  })

  it('gli anni dell\'anno tipo di Roma sono quelli scritti in ANNUAL_NOTE', () => {
    const tmy = parsePvgisTmy(romaTmyRaw)
    expect(ANNUAL_NOTE, ALLARME).toContain(`tra il ${tmy.yearMin} e il ${tmy.yearMax}`)
    expect(includedItems(tmy.usesHorizon, tmy.yearMin, tmy.yearMax)[0]).toContain(`tra il ${tmy.yearMin} e il ${tmy.yearMax}`)
  })
})
