/**
 * Lettore delle serie orarie di PVGIS 5.3 (strumento "seriescalc"), usato SOLO dai test
 * di validazione: l'app non scarica queste serie.
 *
 * Qui, e solo qui, si converte l'orientamento dalla convenzione di PVGIS ("aspect":
 * 0 = Sud, −90 = Est, +90 = Ovest) a quella del motore (azimut da Nord in senso orario:
 * 180 = Sud, 90 = Est, 270 = Ovest): azimut = aspect + 180.
 */

export interface SeriesHour {
  /** Istante a cui si riferiscono le irradianze (PVGIS lo dà già con il ritardo di ~10 min). */
  time: Date
  /** Diretta, diffusa e riflessa sul piano (con angle=0: sul piano orizzontale), W/m². */
  beamWm2: number
  diffuseWm2: number
  reflectedWm2: number
  /** Altezza del sole calcolata da PVGIS, gradi. */
  sunHeightDeg: number
  airTemperatureC: number
  windSpeedMs: number
  /** Potenza dell'impianto, W (solo se la serie è stata chiesta con pvcalculation=1). */
  powerW?: number
}

export interface Series {
  tiltDeg: number
  /** Azimut nella convenzione del motore (180 = Sud). */
  azimuthDeg: number
  peakPowerKwp?: number
  systemLossPct?: number
  hours: SeriesHour[]
}

type Obj = Record<string, unknown>
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)

function get(o: unknown, path: string): unknown {
  let cur: unknown = o
  for (const k of path.split('/')) {
    if (!isObj(cur)) throw new Error(`Serie PVGIS non valida: manca "${path}"`)
    cur = cur[k]
  }
  return cur
}

function num(o: unknown, path: string): number {
  const v = get(o, path)
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`Serie PVGIS non valida: "${path}" non è un numero`)
  return v
}

/** Unità attese per ogni colonna (verificate su `meta`, come in pvgisTmy.ts). */
const UNITS: Record<string, string> = {
  'Gb(i)': 'W/m2',
  'Gd(i)': 'W/m2',
  'Gr(i)': 'W/m2',
  H_sun: 'degree',
  T2m: 'degree Celsius',
  WS10m: 'm/s',
  P: 'W',
}

export function parsePvgisSeries(json: unknown): Series {
  const vars = get(json, 'meta/outputs/hourly/variables')
  const hasPower = isObj(vars) && 'P' in vars
  for (const [key, unit] of Object.entries(UNITS)) {
    if (key === 'P' && !hasPower) continue
    const declared = get(vars, `${key}/units`)
    if (declared !== unit) throw new Error(`Unità inattesa per ${key}: "${String(declared)}", atteso "${unit}"`)
  }

  const fixed = get(json, 'inputs/mounting_system/fixed')
  const aspect = num(fixed, 'azimuth/value')
  const rows = get(json, 'outputs/hourly')
  if (!Array.isArray(rows)) throw new Error('Serie PVGIS non valida: manca "outputs/hourly"')

  const hours = rows.map((row, i): SeriesHour => {
    const text = get(row, 'time')
    const m = typeof text === 'string' ? /^(\d{4})(\d{2})(\d{2}):(\d{2})(\d{2})$/.exec(text) : null
    if (!m) throw new Error(`Serie PVGIS non valida: data della riga ${i}`)
    const [y, mo, d, h, mi] = m.slice(1).map(Number)
    return {
      time: new Date(Date.UTC(y, mo - 1, d, h, mi)),
      beamWm2: num(row, 'Gb(i)'),
      diffuseWm2: num(row, 'Gd(i)'),
      reflectedWm2: num(row, 'Gr(i)'),
      sunHeightDeg: num(row, 'H_sun'),
      airTemperatureC: num(row, 'T2m'),
      windSpeedMs: num(row, 'WS10m'),
      ...(hasPower ? { powerW: num(row, 'P') } : {}),
    }
  })

  const pv = isObj(json) && isObj(json.inputs) ? json.inputs.pv_module : undefined
  return {
    tiltDeg: num(fixed, 'slope/value'),
    azimuthDeg: aspect + 180,
    // Nelle serie senza calcolo PV (pvcalculation=0) PVGIS mette questi campi a null.
    ...(isObj(pv) && pv.peak_power !== null ? { peakPowerKwp: num(pv, 'peak_power'), systemLossPct: num(pv, 'system_loss') } : {}),
    hours,
  }
}
