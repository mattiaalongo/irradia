import { describe, expect, it } from 'vitest'
import horizRaw from './__fixtures__/pvgis-series-roma-2020-horiz.json'
import s35Raw from './__fixtures__/pvgis-series-roma-2020-s35.json'
import e20Raw from './__fixtures__/pvgis-series-roma-2020-e20.json'
import tmyRaw from './__fixtures__/pvgis-tmy-roma.json'
import pvcalcRaw from './__fixtures__/pvgis-pvcalc-roma-s35.json'
import { parsePvgisSeries, type Series } from './__fixtures__/pvgisSeries'
import { parsePvgisTmy, TMY_HOURS } from './pvgisTmy'
import { simulateHour, simulateYear, type PvSystem } from './simulate'
import { solarPosition } from './solarPosition'

// Dati reali di PVGIS 5.3 per Roma centro, senza ombre dell'orizzonte (usehorizon=0),
// scaricati l'8/11/2026: origine, comandi e hash in __fixtures__/README.md.
const LAT = 41.9028
const LON = 12.4964
const horiz = parsePvgisSeries(horizRaw)
const tmy = parsePvgisTmy(tmyRaw)
const pvcalc = pvcalcRaw.outputs

/** 4 pannelli da 250 W = 1 kWp, come i calcoli PVGIS (peakpower=1). */
const oneKwp = (tiltDeg: number, azimuthDeg: number): PvSystem => ({
  tiltDeg,
  azimuthDeg,
  panelCount: 4,
  panelPowerWp: 250,
  systemLossPct: 14,
})

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const relDiff = (ours: number, ref: number) => ours / ref - 1

/**
 * Rifà ora per ora il calcolo di PVGIS partendo dalle stesse componenti orizzontali
 * (serie con angle=0) e restituisce, per ogni ora, i nostri valori e quelli di PVGIS.
 */
function compareHourly(tilted: Series) {
  expect(tilted.hours).toHaveLength(horiz.hours.length)
  const system = oneKwp(tilted.tiltDeg, tilted.azimuthDeg)
  return horiz.hours.map((h, i) => {
    const pvgis = tilted.hours[i]
    // Stesso istante nelle due serie (PVGIS lo dà già con il ritardo di ~10 minuti).
    expect(pvgis.time.getTime()).toBe(h.time.getTime())
    // PVGIS dà la diretta sul piano orizzontale: la riportiamo a DNI con il NOSTRO zenit.
    const cosZ = Math.cos((solarPosition(h.time, LAT, LON).zenith * Math.PI) / 180)
    const ours = simulateHour(
      {
        time: h.time,
        ghiWm2: h.beamWm2 + h.diffuseWm2,
        dniWm2: cosZ > 0 ? h.beamWm2 / cosZ : 0,
        dhiWm2: h.diffuseWm2,
        airTemperatureC: h.airTemperatureC,
        windSpeedMs: h.windSpeedMs,
      },
      LAT,
      LON,
      system,
    )
    return { ours, pvgis }
  })
}

describe.each([
  // Sud 35°: il caso più comune su un tetto italiano.
  { name: 'Sud, 35°', raw: s35Raw, tilt: 35, azimuth: 180, reflectedTol: 0.002 },
  // Est 20°: controlla anche la conversione dell'orientamento (aspect −90 → azimut 90).
  // Riflessa: PVGIS, quando il sole è dietro il pannello, la calcola con la sola diffusa
  // (come se anche il suolo fosse in ombra): sono ~0,18 kWh/m² l'anno su un pannello
  // rivolto a Est. Noi teniamo il modello fisico (suolo illuminato da GHI): +1,7 %.
  { name: 'Est, 20°', raw: e20Raw, tilt: 20, azimuth: 90, reflectedTol: 0.02 },
])('validazione ora per ora contro PVGIS seriescalc, Roma 2020 — $name', ({ raw, tilt, azimuth, reflectedTol }) => {
  const tilted = parsePvgisSeries(raw)
  const rows = compareHourly(tilted)

  it('il file PVGIS ha l\'orientamento atteso (conversione aspect → azimut)', () => {
    expect(tilted.tiltDeg).toBe(tilt)
    expect(tilted.azimuthDeg).toBe(azimuth)
    expect(tilted.peakPowerKwp).toBe(1)
    expect(tilted.systemLossPct).toBe(14)
  })

  // Tolleranze sulle somme annue. Misurate l'8/11/2026: diretta +0,15/+0,13 %,
  // diffusa +0,04/0,00 %. Margine 2×: un cambiamento del modello che sposti il risultato
  // anche di pochi decimi di punto fa fallire il test.
  it('diretta annua sul piano entro ±0,3 %', () => {
    const d = relDiff(sum(rows.map((r) => r.ours.poaBeamWm2)), sum(rows.map((r) => r.pvgis.beamWm2)))
    expect(Math.abs(d)).toBeLessThan(0.003)
  })

  it('diffusa annua sul piano (Muneer) entro ±0,2 %', () => {
    const d = relDiff(sum(rows.map((r) => r.ours.poaDiffuseWm2)), sum(rows.map((r) => r.pvgis.diffuseWm2)))
    expect(Math.abs(d)).toBeLessThan(0.002)
  })

  it('riflessa annua entro la tolleranza motivata sopra', () => {
    const d = relDiff(sum(rows.map((r) => r.ours.poaReflectedWm2)), sum(rows.map((r) => r.pvgis.reflectedWm2)))
    expect(Math.abs(d)).toBeLessThan(reflectedTol)
  })

  // Energia: misurato +0,60 % (Sud) e +0,32 % (Est). Il residuo è l'effetto spettrale,
  // che PVGIS calcola e noi no: pesa circa ±1 % e cambia segno con le condizioni del cielo.
  it('energia annua entro ±1 %', () => {
    const d = relDiff(sum(rows.map((r) => r.ours.acPowerW)), sum(rows.map((r) => r.pvgis.powerW!)))
    expect(Math.abs(d)).toBeLessThan(0.01)
  })

  // Singole ore con molta luce (> 200 W/m² o > 200 W). Massimi misurati: diretta 2,7 %,
  // diffusa 0,6 %, potenza 2,7 %. Le differenze orarie nascono soprattutto dall'altezza
  // del sole: quella di PVGIS differisce dalla nostra fino a 0,4° (la nostra è l'algoritmo
  // NOAA, verificato in solarPosition.test.ts entro 0,01°), e dall'effetto spettrale.
  it('ore soleggiate: diretta ±3 %, diffusa ±1 %, potenza ±3 %', () => {
    for (const { ours, pvgis } of rows) {
      if (pvgis.beamWm2 > 200) expect(Math.abs(relDiff(ours.poaBeamWm2, pvgis.beamWm2))).toBeLessThan(0.03)
      if (pvgis.diffuseWm2 > 200) expect(Math.abs(relDiff(ours.poaDiffuseWm2, pvgis.diffuseWm2))).toBeLessThan(0.01)
      if (pvgis.powerW! > 200) expect(Math.abs(relDiff(ours.acPowerW, pvgis.powerW!))).toBeLessThan(0.03)
    }
  })
})

describe('anno tipo di Roma contro PVGIS PVcalc (1 kWp, Sud 35°, perdite 14 %)', () => {
  const system = oneKwp(35, 180)
  const year = simulateYear(tmy, system)
  const pv = pvcalc.totals.fixed

  // Attenzione: PVcalc è la MEDIA degli anni 2005-2023, l'anno tipo è fatto di 12 mesi
  // reali scelti tra quegli anni. Non possono coincidere: i confronti sono più larghi.
  it('energia annua entro ±2 % (misurato: 1511,2 contro 1504,64 kWh, +0,4 %)', () => {
    expect(Math.abs(relDiff(year.annualKwh, pv.E_y))).toBeLessThan(0.02)
  })

  it('irradiazione annua sul piano entro ±2 % (misurato: +0,9 %)', () => {
    expect(Math.abs(relDiff(year.annualPoaKwhM2, pv['H(i)_y']))).toBeLessThan(0.02)
  })

  // Per ogni mese PVGIS indica anche la deviazione standard tra un anno e l'altro (SD_m).
  // Un mese dell'anno tipo è un mese reale, quindi deve stare dentro la variabilità
  // naturale: entro 2 deviazioni standard (dove cade ~95 % degli anni, se la distribuzione
  // è circa normale). Massimo misurato: 1,24 SD ad aprile; dicembre −12,8 % = −1,01 SD.
  it('ogni mese entro 2 deviazioni standard interannuali di PVGIS', () => {
    expect(pvcalc.monthly.fixed).toHaveLength(12)
    pvcalc.monthly.fixed.forEach((m, i) => {
      expect(m.month).toBe(i + 1)
      expect(Math.abs(year.monthlyKwh[i] - m.E_m)).toBeLessThan(2 * m.SD_m)
    })
  })

  // Perdite annue per tipo, definite come in PVGIS (l_aoi e l_tg, in catena).
  // Misurato: riflessione −2,78 % (PVGIS −2,66 %), temperatura/irradianza −7,50 % (PVGIS −8,12 %).
  it('perdite annue per riflessione (±0,2 punti) e per temperatura/irradianza (±1 punto) come PVGIS', () => {
    const offsetMs = tmy.irradianceTimeOffsetH * 3_600_000
    const hours = tmy.hours.map((h) =>
      simulateHour({ ...h, time: new Date(h.time.getTime() + offsetMs) }, tmy.latitude, tmy.longitude, system),
    )
    const poa = sum(hours.map((h) => h.poaGlobalWm2))
    const eff = sum(hours.map((h) => h.effectiveIrradianceWm2))
    expect(Math.abs((eff / poa - 1) * 100 - pv.l_aoi)).toBeLessThan(0.2)

    // Temperatura e bassa irradianza: PVGIS −8,12 %. Tolleranza 1 punto: anno tipo
    // contro media di 19 anni, e PVGIS applica prima l'effetto spettrale.
    const dc = sum(hours.map((h) => h.dcPowerW))
    // Energia DC rispetto a quella che darebbe un modulo sempre al rendimento di targa.
    const lossTg = (dc / eff - 1) * 100
    expect(Math.abs(lossTg - pv.l_tg)).toBeLessThan(1)
  })
})

describe('simulateYear — proprietà generali', () => {
  const base = oneKwp(35, 180)
  const year = simulateYear(tmy, base)

  it('8760 valori orari, nessuno negativo, zero di notte', () => {
    expect(year.hourlyAcPowerW).toHaveLength(TMY_HOURS)
    expect(year.hourlyAcPowerW.every((p) => p >= 0)).toBe(true)
    tmy.hours.forEach((h, i) => {
      if (h.ghiWm2 === 0) expect(year.hourlyAcPowerW[i]).toBe(0)
    })
  })

  it('la somma dei mesi è l\'anno, e l\'anno è la somma delle ore', () => {
    expect(sum(year.monthlyKwh)).toBeCloseTo(year.annualKwh, 9)
    expect(sum(year.hourlyAcPowerW) / 1000).toBeCloseTo(year.annualKwh, 6)
    expect(year.peakPowerKwp).toBe(1)
  })

  it('il doppio dei pannelli produce il doppio dell\'energia', () => {
    const double = simulateYear(tmy, { ...base, panelCount: 8 })
    expect(double.annualKwh).toBeCloseTo(2 * year.annualKwh, 6)
  })

  it('le perdite di sistema si applicano in proporzione', () => {
    const noLoss = simulateYear(tmy, { ...base, systemLossPct: 0 })
    expect(year.annualKwh).toBeCloseTo(noLoss.annualKwh * 0.86, 6)
  })

  it('perdite predefinite = 14 %, albedo predefinita = 0,2', () => {
    const defaults = simulateYear(tmy, { tiltDeg: 35, azimuthDeg: 180, panelCount: 4, panelPowerWp: 250 })
    expect(defaults.annualKwh).toBe(year.annualKwh)
    expect(simulateYear(tmy, { ...base, albedo: 0.2 }).annualKwh).toBe(year.annualKwh)
  })

  it('a Roma un tetto a Sud produce più di uno a Nord', () => {
    expect(year.annualKwh).toBeGreaterThan(simulateYear(tmy, { ...base, azimuthDeg: 0 }).annualKwh)
  })

  it('rifiuta parametri impossibili', () => {
    expect(() => simulateYear(tmy, { ...base, tiltDeg: 95 })).toThrow(RangeError)
    expect(() => simulateYear(tmy, { ...base, azimuthDeg: 360 })).toThrow(RangeError)
    expect(() => simulateYear(tmy, { ...base, panelCount: 2.5 })).toThrow(RangeError)
    expect(() => simulateYear(tmy, { ...base, panelPowerWp: -1 })).toThrow(RangeError)
    expect(() => simulateYear(tmy, { ...base, systemLossPct: 100 })).toThrow(RangeError)
  })
})
