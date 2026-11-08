/**
 * Lettore delle irradiazioni mensili di PVGIS 5.3 (strumento "MRcalc", "Monthly radiation"),
 * usato SOLO dai test di validazione: l'app non scarica questi dati.
 *
 * MRcalc dà, per ogni mese di ogni anno della banca dati (PVGIS-SARAH3: 2005-2023),
 * l'irradiazione sul piano orizzontale H(h)_m e su un piano inclinato H(i)_m, in kWh/m²
 * al mese. Serve a confrontare ogni mese dell'anno tipo con il mese REALE da cui proviene
 * (stesso anno), invece che con la media di 19 anni.
 *
 * Il piano inclinato di MRcalc è sempre rivolto all'equatore: "aspect" di PVGIS 0 = Sud.
 * Qui, come in pvgisSeries.ts, si converte nella convenzione del motore: azimut = aspect + 180.
 */

/** Primo e ultimo anno della banca dati PVGIS-SARAH3 usata da PVGIS 5.3 (vedi `inputs.meteo_data`). */
export const MRCALC_FIRST_YEAR = 2005
export const MRCALC_LAST_YEAR = 2023

export interface MonthlyIrradiation {
  year: number
  /** 1 = gennaio. */
  month: number
  /** Irradiazione sul piano orizzontale, kWh/m² nel mese (H(h)_m di PVGIS). */
  horizontalKwhM2: number
  /** Irradiazione sul piano inclinato, kWh/m² nel mese (H(i)_m di PVGIS). */
  inclinedKwhM2: number
}

export interface MonthlyRadiation {
  latitude: number
  longitude: number
  tiltDeg: number
  /** Azimut nella convenzione del motore (180 = Sud). */
  azimuthDeg: number
  usesHorizon: boolean
  firstYear: number
  lastYear: number
  /** Tutti i mesi, in ordine di anno e mese. */
  months: MonthlyIrradiation[]
  /** Il mese richiesto; errore se l'anno o il mese non sono nei dati. */
  get(year: number, month: number): MonthlyIrradiation
}

type Obj = Record<string, unknown>
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)

function get(o: unknown, path: string): unknown {
  let cur: unknown = o
  for (const k of path.split('/')) {
    if (!isObj(cur)) throw new Error(`MRcalc PVGIS non valido: manca "${path}"`)
    cur = cur[k]
  }
  return cur
}

function num(o: unknown, path: string): number {
  const v = get(o, path)
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`MRcalc PVGIS non valido: "${path}" non è un numero`)
  return v
}

function int(o: unknown, path: string): number {
  const v = num(o, path)
  if (!Number.isInteger(v)) throw new Error(`MRcalc PVGIS non valido: "${path}" non è un intero`)
  return v
}

/** Unità attese (verificate su `meta`, come in pvgisTmy.ts e pvgisSeries.ts). */
const UNITS: Record<string, string> = {
  'H(h)_m': 'kWh/m2/mo',
  'H(i)_m': 'kWh/m2/mo',
}

const key = (year: number, month: number) => year * 100 + month

export function parsePvgisMonthly(json: unknown): MonthlyRadiation {
  for (const [name, unit] of Object.entries(UNITS)) {
    const declared = get(json, `meta/outputs/monthly/variables/${name}/units`)
    if (declared !== unit) throw new Error(`Unità inattesa per ${name}: "${String(declared)}", atteso "${unit}"`)
  }

  const firstYear = int(json, 'inputs/meteo_data/year_min')
  const lastYear = int(json, 'inputs/meteo_data/year_max')
  if (firstYear < MRCALC_FIRST_YEAR || lastYear > MRCALC_LAST_YEAR || firstYear > lastYear) {
    throw new Error(`Anni ${firstYear}-${lastYear} fuori da ${MRCALC_FIRST_YEAR}-${MRCALC_LAST_YEAR}`)
  }

  const rows = get(json, 'outputs/monthly')
  if (!Array.isArray(rows)) throw new Error('MRcalc PVGIS non valido: manca "outputs/monthly"')
  const byKey = new Map<number, MonthlyIrradiation>()
  for (const row of rows) {
    const year = int(row, 'year')
    const month = int(row, 'month')
    if (year < firstYear || year > lastYear) throw new Error(`Anno ${year} fuori da ${firstYear}-${lastYear}`)
    if (month < 1 || month > 12) throw new Error(`Mese ${month} non valido`)
    if (byKey.has(key(year, month))) throw new Error(`Mese ${month}/${year} ripetuto`)
    const horizontalKwhM2 = num(row, 'H(h)_m')
    const inclinedKwhM2 = num(row, 'H(i)_m')
    if (horizontalKwhM2 < 0 || inclinedKwhM2 < 0) throw new Error(`Irradiazione negativa in ${month}/${year}`)
    byKey.set(key(year, month), { year, month, horizontalKwhM2, inclinedKwhM2 })
  }

  // Ogni mese di ogni anno dichiarato deve esserci: un buco renderebbe i confronti incompleti.
  const months: MonthlyIrradiation[] = []
  for (let year = firstYear; year <= lastYear; year++) {
    for (let month = 1; month <= 12; month++) {
      const m = byKey.get(key(year, month))
      if (!m) throw new Error(`Manca il mese ${month}/${year}`)
      months.push(m)
    }
  }

  const plane = get(json, 'inputs/plane/fixed_inclined')
  return {
    latitude: num(json, 'inputs/location/latitude'),
    longitude: num(json, 'inputs/location/longitude'),
    tiltDeg: num(plane, 'slope/value'),
    azimuthDeg: num(plane, 'azimuth/value') + 180,
    usesHorizon: get(json, 'inputs/meteo_data/use_horizon') === true,
    firstYear,
    lastYear,
    months,
    get(year, month) {
      const m = byKey.get(key(year, month))
      if (!m) throw new Error(`Mese ${month}/${year} assente nei dati MRcalc`)
      return m
    },
  }
}
