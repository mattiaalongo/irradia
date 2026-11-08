/**
 * Simulazione della produzione di un impianto fotovoltaico ora per ora e aggregazione
 * in kWh mensili e annuali.
 *
 * Catena di calcolo per ogni ora:
 *   posizione del sole → irradianza sul piano dei pannelli (diretta, diffusa, riflessa)
 *   → perdite per riflessione sul vetro → temperatura del modulo → potenza DC (Huld)
 *   → perdite di sistema (inverter, cavi, sporcizia, …) → potenza AC.
 *
 * Differenze note rispetto a PVGIS 5.3 (spiegate in README e CLAUDE.md):
 * - nessuna correzione spettrale (PVGIS: circa ±1 % in Italia);
 * - nessuna ombra dell'orizzonte (montagne, edifici).
 */

import { DEFAULT_ALBEDO, extraterrestrialIrradiance, planeOfArrayIrradiance } from './irradiance'
import {
  faimanModuleTemperature,
  huldDcPower,
  martinRuizBeamFactor,
  martinRuizDiffuseFactor,
  martinRuizGroundFactor,
} from './pvModule'
import type { Tmy } from './pvgisTmy'
import { solarPosition } from './solarPosition'

/** Perdite di sistema predefinite, %: lo stesso valore suggerito da PVGIS. */
export const DEFAULT_SYSTEM_LOSS_PCT = 14

export interface PvSystem {
  /** Inclinazione dei pannelli, gradi: 0 = piatti, 90 = verticali. */
  tiltDeg: number
  /** Azimut verso cui guardano i pannelli, da Nord in senso orario: 180 = Sud, 90 = Est. */
  azimuthDeg: number
  /** Numero di pannelli. */
  panelCount: number
  /** Potenza di targa di un pannello in condizioni STC, W (Wp). */
  panelPowerWp: number
  /**
   * Perdite di sistema in %: inverter, cavi, sporcizia, differenze tra moduli…
   * Si applicano alla potenza DC. Predefinite: 14 %.
   */
  systemLossPct?: number
  /** Riflettanza del suolo, 0-1. Predefinita: 0,2. */
  albedo?: number
}

/** Condizioni meteo di un'ora, nell'istante a cui si riferiscono le irradianze. */
export interface WeatherSample {
  /** Istante a cui si riferiscono le irradianze (serve per la posizione del sole). */
  time: Date
  ghiWm2: number
  dniWm2: number
  dhiWm2: number
  airTemperatureC: number
  /** Vento a 10 m, m/s. */
  windSpeedMs: number
}

export interface HourResult {
  /** Diretta, diffusa e riflessa sul piano dei pannelli, prima delle perdite del vetro, W/m². */
  poaBeamWm2: number
  poaDiffuseWm2: number
  poaReflectedWm2: number
  poaGlobalWm2: number
  /** Irradianza che entra davvero nelle celle (dopo la riflessione sul vetro), W/m². */
  effectiveIrradianceWm2: number
  /** Temperatura dei moduli, °C. */
  moduleTemperatureC: number
  /** Potenza in corrente continua, W. */
  dcPowerW: number
  /** Potenza in uscita dall'impianto, dopo le perdite di sistema, W. */
  acPowerW: number
}

function validateSystem(system: PvSystem): void {
  const { tiltDeg, azimuthDeg, panelCount, panelPowerWp } = system
  const loss = system.systemLossPct ?? DEFAULT_SYSTEM_LOSS_PCT
  if (!(tiltDeg >= 0 && tiltDeg <= 90)) throw new RangeError('Inclinazione fuori da [0, 90]')
  if (!(azimuthDeg >= 0 && azimuthDeg < 360)) throw new RangeError('Azimut fuori da [0, 360)')
  if (!(Number.isInteger(panelCount) && panelCount >= 0)) {
    throw new RangeError('Il numero di pannelli deve essere un intero ≥ 0')
  }
  if (!(panelPowerWp >= 0)) throw new RangeError('La potenza di un pannello deve essere ≥ 0')
  if (!(loss >= 0 && loss < 100)) throw new RangeError('Perdite di sistema fuori da [0, 100)')
}

/**
 * Produzione di una singola ora. Funzione pura.
 * `latitude`/`longitude` in gradi (positive a Nord e a Est).
 */
export function simulateHour(
  weather: WeatherSample,
  latitude: number,
  longitude: number,
  system: PvSystem,
): HourResult {
  validateSystem(system)
  const sun = solarPosition(weather.time, latitude, longitude)
  // Zenit geometrico (senza rifrazione), come nel modello r.sun di PVGIS.
  const poa = planeOfArrayIrradiance({
    dniWm2: weather.dniWm2,
    dhiWm2: weather.dhiWm2,
    ghiWm2: weather.ghiWm2,
    sunZenithDeg: sun.zenith,
    sunAzimuthDeg: sun.azimuth,
    extraterrestrialWm2: extraterrestrialIrradiance(weather.time),
    tiltDeg: system.tiltDeg,
    panelAzimuthDeg: system.azimuthDeg,
    albedo: system.albedo ?? DEFAULT_ALBEDO,
  })

  const effectiveIrradianceWm2 =
    poa.beamWm2 * martinRuizBeamFactor(poa.aoiDeg) +
    poa.diffuseWm2 * martinRuizDiffuseFactor(system.tiltDeg) +
    poa.reflectedWm2 * martinRuizGroundFactor(system.tiltDeg)

  // Faiman usa l'irradianza sul piano PRIMA delle perdite del vetro (vedi pvModule.ts).
  const moduleTemperatureC = faimanModuleTemperature(weather.airTemperatureC, poa.globalWm2, weather.windSpeedMs)
  const peakPowerW = system.panelCount * system.panelPowerWp
  const dcPowerW = huldDcPower(peakPowerW, effectiveIrradianceWm2, moduleTemperatureC)
  const acPowerW = dcPowerW * (1 - (system.systemLossPct ?? DEFAULT_SYSTEM_LOSS_PCT) / 100)

  return {
    poaBeamWm2: poa.beamWm2,
    poaDiffuseWm2: poa.diffuseWm2,
    poaReflectedWm2: poa.reflectedWm2,
    poaGlobalWm2: poa.globalWm2,
    effectiveIrradianceWm2,
    moduleTemperatureC,
    dcPowerW,
    acPowerW,
  }
}

export interface YearResult {
  /** Potenza AC di ogni ora dell'anno tipo, W (stesso ordine di `tmy.hours`). */
  hourlyAcPowerW: number[]
  /** Energia prodotta in ciascun mese, kWh: indice 0 = gennaio. */
  monthlyKwh: number[]
  /** Energia prodotta nell'anno, kWh. */
  annualKwh: number
  /** Irradiazione annua sul piano dei pannelli, kWh/m² (utile per il confronto con PVGIS). */
  annualPoaKwhM2: number
  /** Potenza nominale dell'impianto, kWp. */
  peakPowerKwp: number
}

/**
 * Simula un anno tipo (TMY) di PVGIS.
 * Ogni valore orario di potenza vale per un'ora intera, quindi W × 1 h = Wh.
 * Il mese di un'ora è il mese UTC di `time`: il TMY è composto proprio per mesi UTC.
 */
export function simulateYear(tmy: Tmy, system: PvSystem): YearResult {
  validateSystem(system)
  const offsetMs = tmy.irradianceTimeOffsetH * 3_600_000
  const monthlyWh = new Array<number>(12).fill(0)
  let poaWhM2 = 0
  const hourlyAcPowerW = tmy.hours.map((h) => {
    // Le irradianze di PVGIS si riferiscono a `time + irradianceTimeOffsetH` (vedi CLAUDE.md).
    const r = simulateHour({ ...h, time: new Date(h.time.getTime() + offsetMs) }, tmy.latitude, tmy.longitude, system)
    monthlyWh[h.time.getUTCMonth()] += r.acPowerW
    poaWhM2 += r.poaGlobalWm2
    return r.acPowerW
  })
  const monthlyKwh = monthlyWh.map((wh) => wh / 1000)
  return {
    hourlyAcPowerW,
    monthlyKwh,
    annualKwh: monthlyKwh.reduce((a, b) => a + b, 0),
    annualPoaKwhM2: poaWhM2 / 1000,
    peakPowerKwp: (system.panelCount * system.panelPowerWp) / 1000,
  }
}
