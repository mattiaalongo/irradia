/**
 * Lettore del profilo dell'orizzonte di PVGIS 5.3 (strumento "printhorizon"), usato SOLO dai
 * test di validazione: l'app non scarica il profilo, perché PVGIS applica già le ombre del
 * terreno nell'anno tipo (`usehorizon=1`, vedi `pvgisTmyUrl`). Issue #25.
 *
 * Fonte: JRC, Commissione Europea, "PVGIS API — non-interactive service", strumento
 * "printhorizon" (stesso indirizzo citato in `pvgisTmy.ts`). Il profilo è calcolato da PVGIS
 * su un modello digitale del terreno ("DEM-calculated"): per ogni direzione, l'altezza in gradi
 * della linea dell'orizzonte vista dal punto. PVGIS lo dà ogni 7,5° di azimut, con le altezze
 * arrotondate a 0,1°, e ripete il Nord all'inizio (A = −180) e alla fine (A = 180).
 *
 * Qui, e solo qui per questo strumento, si converte l'azimut dalla convenzione di PVGIS
 * (0 = Sud, 90 = Ovest, −90 = Est, come dichiara il suo `meta`) a quella del motore (da Nord in
 * senso orario: 0 = N, 90 = E, 180 = S, 270 = O): azimut = A + 180, riportato in [0, 360).
 *
 * Quando servirà nell'app (es. #26, disegno del profilo, o un orizzonte dell'utente) il lettore
 * potrà passare in `engine/` così com'è.
 */

export interface HorizonPoint {
  /** Azimut nella convenzione del motore, gradi da Nord in senso orario, in [0, 360). */
  azimuthDeg: number
  /** Altezza dell'orizzonte in quella direzione, gradi sopra il piano orizzontale. */
  heightDeg: number
}

export interface HorizonProfile {
  latitude: number
  longitude: number
  elevationM: number
  /** Origine del profilo dichiarata da PVGIS (es. "DEM-calculated"). */
  horizonDb: string
  /** Punti distinti (il Nord una volta sola), ordinati per azimut da 0 (Nord). */
  points: HorizonPoint[]
  /** Passo fra due punti, gradi (7,5 per PVGIS 5.3). */
  stepDeg: number
  /**
   * Altezza dell'orizzonte nella direzione data (azimut del motore, gradi, qualunque valore
   * finito: viene riportato in [0, 360)), per interpolazione LINEARE fra i due punti vicini,
   * passando per il Nord senza salti (il profilo è periodico).
   */
  heightAt(azimuthDeg: number): number
}

/**
 * Descrizione e unità che PVGIS deve dichiarare in `meta` per le colonne lette: se il JRC
 * cambiasse la convenzione dell'azimut o le unità, la lettura fallisce invece di sbagliare.
 * Testi copiati dalla risposta reale del 10/11/2026 (`pvgis-horizon-aosta.json`).
 */
const PVGIS_AZIMUTH_DESCRIPTION = 'Azimuth (0 = S, 90 = W, -90 = E)'
const UNITS: Record<string, string> = { A: 'degree', H_hor: 'degree' }

type Obj = Record<string, unknown>
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)

function get(o: unknown, path: string): unknown {
  let cur: unknown = o
  for (const k of path.split('/')) {
    if (!isObj(cur)) throw new Error(`Orizzonte PVGIS non valido: manca "${path}"`)
    cur = cur[k]
  }
  return cur
}

function num(o: unknown, path: string): number {
  const v = get(o, path)
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`Orizzonte PVGIS non valido: "${path}" non è un numero`)
  }
  return v
}

function str(o: unknown, path: string): string {
  const v = get(o, path)
  if (typeof v !== 'string') throw new Error(`Orizzonte PVGIS non valido: "${path}" non è un testo`)
  return v
}

/** Riporta un angolo in [0, 360). */
const normalize360 = (x: number) => ((x % 360) + 360) % 360

/**
 * Tolleranza sul passo fra i punti, gradi: PVGIS scrive gli azimut con una cifra decimale
 * (es. −172.5), quindi i passi sono esatti; 1e-9 assorbe solo gli arrotondamenti binari.
 */
const STEP_TOLERANCE_DEG = 1e-9

export function parsePvgisHorizon(json: unknown): HorizonProfile {
  const variables = get(json, 'meta/outputs/horizon_profile/variables')
  for (const [name, unit] of Object.entries(UNITS)) {
    const declared = str(variables, `${name}/units`)
    if (declared !== unit) throw new Error(`Unità inattesa per ${name}: "${declared}", atteso "${unit}"`)
  }
  const description = str(variables, 'A/description')
  if (description !== PVGIS_AZIMUTH_DESCRIPTION) {
    throw new Error(`Convenzione dell'azimut inattesa: "${description}", atteso "${PVGIS_AZIMUTH_DESCRIPTION}"`)
  }

  const rows = get(json, 'outputs/horizon_profile')
  if (!Array.isArray(rows) || rows.length < 3) {
    throw new Error('Orizzonte PVGIS non valido: "outputs/horizon_profile" ha meno di 3 punti')
  }
  const raw = rows.map((row, i) => {
    const a = num(row, 'A')
    const h = num(row, 'H_hor')
    if (h < -90 || h > 90) throw new Error(`Orizzonte PVGIS non valido: altezza ${h}° al punto ${i}`)
    return { a, h }
  })

  // Il primo e l'ultimo punto sono il Nord (A = −180 e A = 180): stessa direzione, stessa altezza.
  const first = raw[0]
  const last = raw[raw.length - 1]
  if (first.a !== -180 || last.a !== 180) {
    throw new Error(`Orizzonte PVGIS non valido: il profilo va da ${first.a} a ${last.a}, atteso da −180 a 180`)
  }
  if (first.h !== last.h) {
    throw new Error(`Orizzonte PVGIS non valido: il Nord ha due altezze diverse (${first.h}° e ${last.h}°)`)
  }

  // Passo costante e crescente: l'interpolazione lo usa per trovare i due punti vicini.
  const stepDeg = 360 / (raw.length - 1)
  raw.forEach(({ a }, i) => {
    if (Math.abs(a - (-180 + i * stepDeg)) > STEP_TOLERANCE_DEG) {
      throw new Error(`Orizzonte PVGIS non valido: azimut ${a} al punto ${i}, atteso un passo costante di ${stepDeg}°`)
    }
  })

  // Conversione PVGIS → motore: A = −180 (Nord) → 0, A = −90 (Est) → 90, A = 0 (Sud) → 180,
  // A = 90 (Ovest) → 270. Si toglie il Nord ripetuto alla fine.
  const points: HorizonPoint[] = raw.slice(0, -1).map(({ a, h }) => ({ azimuthDeg: normalize360(a + 180), heightDeg: h }))

  return {
    latitude: num(json, 'inputs/location/latitude'),
    longitude: num(json, 'inputs/location/longitude'),
    elevationM: num(json, 'inputs/location/elevation'),
    horizonDb: str(json, 'inputs/horizon_db'),
    points,
    stepDeg,
    heightAt(azimuthDeg) {
      if (!Number.isFinite(azimuthDeg)) throw new RangeError('Azimut non finito')
      const position = normalize360(azimuthDeg) / stepDeg
      const i = Math.floor(position) % points.length
      const fraction = position - Math.floor(position)
      const a = points[i].heightDeg
      const b = points[(i + 1) % points.length].heightDeg
      return a + (b - a) * fraction
    },
  }
}
