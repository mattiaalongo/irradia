/**
 * Anno meteorologico tipo (TMY) da PVGIS, ora per ora.
 *
 * Questo è l'UNICO modulo del motore che conosce il formato di PVGIS.
 * Fonte: JRC, Commissione Europea, "PVGIS API — non-interactive service"
 * (https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/getting-started-pvgis/api-non-interactive-service_en),
 * strumento "tmy", versione API 5.3. Le unità sono quelle dichiarate da PVGIS nella
 * sezione `meta` della risposta e vengono verificate a ogni lettura.
 *
 * Il TMY è costruito scegliendo, per ogni mese dell'anno, il mese più "tipico" tra
 * gli anni disponibili (es. gennaio 2018, febbraio 2009, …): le ore di mesi diversi
 * appartengono quindi ad anni diversi. Normativa di riferimento: EN ISO 15927-4.
 */

/** Versione dell'API PVGIS per cui è scritto (e verificato) questo modulo. */
export const PVGIS_API_VERSION = 'v5_3'

/** Numero di ore di un anno tipo: 365 × 24 (PVGIS esclude il 29 febbraio). */
export const TMY_HOURS = 8760

export interface TmyHour {
  /** Istante UTC di inizio dell'ora, nell'anno reale da cui PVGIS ha preso quel mese. */
  time: Date
  /** Irradianza globale sul piano orizzontale (GHI), W/m². PVGIS: `G(h)`. */
  ghiWm2: number
  /** Irradianza diretta su un piano sempre perpendicolare al sole (DNI), W/m². PVGIS: `Gb(n)`. */
  dniWm2: number
  /** Irradianza diffusa sul piano orizzontale (DHI), W/m². PVGIS: `Gd(h)`. */
  dhiWm2: number
  /** Temperatura dell'aria a 2 m dal suolo, °C. PVGIS: `T2m`. */
  airTemperatureC: number
  /** Velocità del vento a 10 m dal suolo, m/s. PVGIS: `WS10m`. */
  windSpeedMs: number
}

export interface Tmy {
  /** Latitudine usata da PVGIS, gradi (positiva a Nord). */
  latitude: number
  /** Longitudine usata da PVGIS, gradi (positiva a Est). */
  longitude: number
  /** Quota del terreno sul livello del mare, m. */
  elevationM: number
  /**
   * Ritardo, in ORE, dell'istante a cui si riferiscono le irradianze rispetto
   * all'inizio dell'ora indicato in `time` (es. 0,17 h ≈ 10 minuti).
   * Dipende dall'orario di passaggio dei satelliti usati da PVGIS-SARAH: va
   * sommato a `time` quando si calcola la posizione del sole per quell'ora.
   */
  irradianceTimeOffsetH: number
  /** Banca dati della radiazione solare (es. "PVGIS-SARAH3"). */
  radiationDb: string
  /** Banca dati delle altre grandezze meteo (es. "ERA5"). */
  meteoDb: string
  /** Primo e ultimo anno tra cui PVGIS ha scelto i mesi tipo. */
  yearMin: number
  yearMax: number
  /** Per ogni mese (1-12), l'anno da cui è stato preso. */
  monthsSelected: { month: number; year: number }[]
  /** Le 8760 ore, ordinate per mese, giorno e ora. */
  hours: TmyHour[]
  /**
   * Ore in cui PVGIS ha dato un vento `WS10m` negativo, vicino a un cambio di mese, e che
   * abbiamo portato a 0 m/s (vedi `MONTH_JUNCTION_HOURS`): posizione in `hours` e valore
   * originale, m/s. Vuoto per la gran parte delle località (es. Roma e Milano).
   */
  windSpeedClamped: { index: number; originalMs: number }[]
}

/** Errore di lettura o di scaricamento dei dati PVGIS. */
export class PvgisError extends Error {
  /** Codice HTTP della risposta, se l'errore viene da una risposta del server. */
  readonly status?: number
  /** Errore originale che ha causato questo (es. l'errore di rete). */
  readonly cause?: unknown

  constructor(message: string, options?: { status?: number; cause?: unknown }) {
    super(message)
    this.name = 'PvgisError'
    this.status = options?.status
    this.cause = options?.cause
  }
}

/**
 * Colonne di PVGIS che leggiamo, il campo corrispondente e l'unità che PVGIS
 * deve dichiarare in `meta`. Se PVGIS cambiasse unità, la lettura fallisce
 * invece di produrre silenziosamente numeri sbagliati.
 */
const COLUMNS = [
  { key: 'G(h)', field: 'ghiWm2', unit: 'W/m2', nonNegative: true },
  { key: 'Gb(n)', field: 'dniWm2', unit: 'W/m2', nonNegative: true },
  { key: 'Gd(h)', field: 'dhiWm2', unit: 'W/m2', nonNegative: true },
  { key: 'T2m', field: 'airTemperatureC', unit: 'degree Celsius', nonNegative: false },
  { key: 'WS10m', field: 'windSpeedMs', unit: 'm/s', nonNegative: true },
] as const

/**
 * Vento negativo vicino ai cambi di mese (issue #28).
 *
 * Il vento `WS10m` è una velocità (un modulo): non può essere negativo. Eppure in alcuni
 * TMY di PVGIS 5.3 compaiono valori negativi (Livorno: −0,25 e −0,52 m/s il 1/8 alle 6 e
 * alle 7 UTC; altri punti fino a −2,35 m/s). Verificato il 10/11/2026 su 20 punti: 8
 * avevano valori negativi, **tutti entro 8 ore da un cambio di mese**.
 *
 * Spiegazione (inferenza dai dati, nessuna fonte JRC/ERA5 trovata): ogni mese del TMY
 * viene da un anno diverso; per evitare salti alle giunzioni PVGIS raccorda le ultime 8
 * ore di un mese e le prime 8 del successivo con una rampa lineare (si vede su `WS10m` e
 * `T2m`), come prevede EN ISO 15927-4, la norma che PVGIS dichiara di seguire (JRC, sito
 * PVGIS, pagina "PVGIS TMY generator", sezione PVGIS tools).
 * A volte la rampa attraversa lo zero: è un artefatto di costruzione, non una misura.
 *
 * Scelta: dentro quella finestra un vento negativo diventa 0 m/s, il limite fisico (calma)
 * e la scelta prudente (celle un po' più calde, produzione un po' sottostimata; effetto
 * ≤ 2 ppm sull'energia annua). FUORI dalla finestra un negativo resta un errore: lì non c'è
 * una spiegazione nota e potrebbe essere un cambio di formato (es. un valore "-999" per
 * "dato mancante") da non accettare in silenzio.
 * Scartati: correggere sempre (nasconderebbe un cambio di formato), rifiutare (40 % dei
 * punti provati inutilizzabili per un effetto invisibile), soglia fissa, valore assoluto o
 * copia dell'ora vicina (nessuna base fisica).
 */
const MONTH_JUNCTION_HOURS = 8

const HOUR_MS = 3_600_000

/**
 * Vero se l'ora del calendario tipo è tra le ultime `MONTH_JUNCTION_HOURS` del suo mese o
 * tra le prime del mese, compreso il passaggio 31/12 → 1/1 (indici 8752-8759 e 0-7).
 * Va usato il calendario NON bisestile dell'anno tipo, non l'anno reale della riga: un
 * febbraio preso da un anno bisestile finisce comunque il 28 nel TMY (PVGIS toglie il 29),
 * e con l'anno reale le sue ultime 8 ore non risulterebbero vicine al cambio di mese.
 */
function isNearMonthJunction(calendarHour: Date): boolean {
  const month = calendarHour.getUTCMonth()
  const shift = MONTH_JUNCTION_HOURS * HOUR_MS
  return (
    new Date(calendarHour.getTime() - shift).getUTCMonth() !== month ||
    new Date(calendarHour.getTime() + shift).getUTCMonth() !== month
  )
}

type Obj = Record<string, unknown>

const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)

function obj(parent: unknown, key: string, path: string): Obj {
  const v = isObj(parent) ? parent[key] : undefined
  if (!isObj(v)) throw new PvgisError(`Risposta PVGIS non valida: manca l'oggetto "${path}"`)
  return v
}

function arr(parent: Obj, key: string, path: string): unknown[] {
  const v = parent[key]
  if (!Array.isArray(v)) throw new PvgisError(`Risposta PVGIS non valida: manca l'elenco "${path}"`)
  return v
}

function num(parent: Obj, key: string, path: string): number {
  const v = parent[key]
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new PvgisError(`Risposta PVGIS non valida: "${path}" non è un numero finito`)
  }
  return v
}

function str(parent: Obj, key: string, path: string): string {
  const v = parent[key]
  if (typeof v !== 'string') throw new PvgisError(`Risposta PVGIS non valida: "${path}" non è un testo`)
  return v
}

/** Legge "AAAAMMGG:HHMM" (ora UTC, formato PVGIS) e lo trasforma in un istante. */
function parsePvgisTime(text: string, path: string): Date {
  const m = /^(\d{4})(\d{2})(\d{2}):(\d{2})(\d{2})$/.exec(text)
  if (m) {
    const [y, mo, d, h, mi] = m.slice(1).map(Number)
    const date = new Date(Date.UTC(y, mo - 1, d, h, mi))
    // Date.UTC accetta anche date impossibili (es. 31 aprile → 1 maggio): le scartiamo.
    if (
      date.getUTCFullYear() === y &&
      date.getUTCMonth() === mo - 1 &&
      date.getUTCDate() === d &&
      date.getUTCHours() === h &&
      date.getUTCMinutes() === mi
    ) {
      return date
    }
  }
  throw new PvgisError(`Risposta PVGIS non valida: data "${text}" in "${path}" non riconosciuta`)
}

/**
 * Converte la risposta JSON dello strumento "tmy" di PVGIS in una struttura tipizzata.
 * Funzione pura: non usa la rete. Accetta `unknown` perché il JSON arriva dall'esterno
 * e ogni campo viene controllato prima dell'uso.
 */
export function parsePvgisTmy(json: unknown): Tmy {
  const inputs = obj(json, 'inputs', 'inputs')
  const location = obj(inputs, 'location', 'inputs.location')
  const meteo = obj(inputs, 'meteo_data', 'inputs.meteo_data')
  const outputs = obj(json, 'outputs', 'outputs')
  const meta = obj(json, 'meta', 'meta')
  const metaVars = obj(
    obj(obj(meta, 'outputs', 'meta.outputs'), 'tmy_hourly', 'meta.outputs.tmy_hourly'),
    'variables',
    'meta.outputs.tmy_hourly.variables',
  )

  // 1. Unità dichiarate da PVGIS
  for (const c of COLUMNS) {
    const path = `meta.outputs.tmy_hourly.variables.${c.key}`
    const unit = str(obj(metaVars, c.key, path), 'units', `${path}.units`)
    if (unit !== c.unit) {
      throw new PvgisError(`Unità inattesa per ${c.key}: PVGIS dichiara "${unit}", atteso "${c.unit}"`)
    }
  }

  // 2. Mesi scelti: esattamente uno per ciascun mese 1-12
  const monthsSelected = arr(outputs, 'months_selected', 'outputs.months_selected').map((x, i) => {
    const path = `outputs.months_selected[${i}]`
    if (!isObj(x)) throw new PvgisError(`Risposta PVGIS non valida: "${path}" non è un oggetto`)
    return { month: num(x, 'month', `${path}.month`), year: num(x, 'year', `${path}.year`) }
  })
  const months = monthsSelected.map((m) => m.month).sort((a, b) => a - b)
  if (months.length !== 12 || months.some((m, i) => m !== i + 1)) {
    throw new PvgisError('Risposta PVGIS non valida: i mesi scelti non sono esattamente 1-12')
  }
  const yearOfMonth = new Map(monthsSelected.map((m) => [m.month, m.year]))

  // 3. Dati orari
  const rows = arr(outputs, 'tmy_hourly', 'outputs.tmy_hourly')
  if (rows.length !== TMY_HOURS) {
    throw new PvgisError(`Risposta PVGIS non valida: ${rows.length} ore invece di ${TMY_HOURS}`)
  }

  // Calendario atteso: tutte le ore di un anno non bisestile, nell'ordine. Lo usiamo
  // per controllare che ogni riga sia al suo posto (nessuna ora mancante o duplicata).
  const expected = new Date(Date.UTC(2001, 0, 1)) // 2001: anno non bisestile qualsiasi
  const windSpeedClamped: Tmy['windSpeedClamped'] = []

  const hours = rows.map((row, i): TmyHour => {
    const path = `outputs.tmy_hourly[${i}]`
    if (!isObj(row)) throw new PvgisError(`Risposta PVGIS non valida: "${path}" non è un oggetto`)

    const time = parsePvgisTime(str(row, 'time(UTC)', `${path}.time(UTC)`), path)
    const month = time.getUTCMonth() + 1
    if (
      month !== expected.getUTCMonth() + 1 ||
      time.getUTCDate() !== expected.getUTCDate() ||
      time.getUTCHours() !== expected.getUTCHours() ||
      time.getUTCMinutes() !== 0
    ) {
      throw new PvgisError(`Risposta PVGIS non valida: ora fuori sequenza in "${path}"`)
    }
    if (time.getUTCFullYear() !== yearOfMonth.get(month)) {
      throw new PvgisError(`Risposta PVGIS non valida: l'anno in "${path}" non coincide con i mesi scelti`)
    }
    // Qui `expected` coincide con mese, giorno e ora della riga (controllato sopra), ma
    // nel calendario non bisestile: è quello giusto per la finestra dei cambi di mese.
    const nearMonthJunction = isNearMonthJunction(expected)
    expected.setUTCHours(expected.getUTCHours() + 1)

    const values = {} as Record<(typeof COLUMNS)[number]['field'], number>
    for (const c of COLUMNS) {
      let v = num(row, c.key, `${path}.${c.key}`)
      if (c.nonNegative && v < 0) {
        if (c.key === 'WS10m' && nearMonthJunction) {
          // Artefatto della rampa di raccordo tra mesi: vedi MONTH_JUNCTION_HOURS.
          windSpeedClamped.push({ index: i, originalMs: v })
          v = 0
        } else if (c.key === 'WS10m') {
          throw new PvgisError(
            `Risposta PVGIS non valida: "${path}.${c.key}" è negativo (${v}) lontano da un cambio ` +
              `di mese (accettato solo nelle ${MONTH_JUNCTION_HOURS} ore prima e dopo)`,
          )
        } else {
          throw new PvgisError(`Risposta PVGIS non valida: "${path}.${c.key}" è negativo (${v})`)
        }
      }
      values[c.field] = v
    }
    return { time, ...values }
  })

  return {
    latitude: num(location, 'latitude', 'inputs.location.latitude'),
    longitude: num(location, 'longitude', 'inputs.location.longitude'),
    elevationM: num(location, 'elevation', 'inputs.location.elevation'),
    irradianceTimeOffsetH: num(location, 'irradiance_time_offset', 'inputs.location.irradiance_time_offset'),
    radiationDb: str(meteo, 'radiation_db', 'inputs.meteo_data.radiation_db'),
    meteoDb: str(meteo, 'meteo_db', 'inputs.meteo_data.meteo_db'),
    yearMin: num(meteo, 'year_min', 'inputs.meteo_data.year_min'),
    yearMax: num(meteo, 'year_max', 'inputs.meteo_data.year_max'),
    monthsSelected,
    hours,
    windSpeedClamped,
  }
}

export interface FetchPvgisTmyOptions {
  /**
   * Indirizzo di base dell'API PVGIS, senza la versione e senza "/" finale.
   * In sviluppo: "/api/pvgis" (proxy di Vite). Il browser non può usare
   * direttamente "https://re.jrc.ec.europa.eu/api" perché PVGIS non invia header CORS.
   */
  baseUrl: string
  /** Funzione `fetch` da usare (di default quella globale). Nei test se ne passa una finta. */
  fetch?: typeof fetch
  /** Permette di annullare la richiesta (es. se l'utente cambia posizione nel frattempo). */
  signal?: AbortSignal
}

/** Costruisce l'indirizzo della richiesta TMY. Esportata per poterla verificare nei test. */
export function pvgisTmyUrl(baseUrl: string, latitude: number, longitude: number): string {
  if (!(latitude >= -90 && latitude <= 90)) throw new RangeError('Latitudine fuori da [-90, 90]')
  if (!(longitude >= -180 && longitude <= 180)) throw new RangeError('Longitudine fuori da [-180, 180]')
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    outputformat: 'json',
  })
  return `${baseUrl.replace(/\/+$/, '')}/${PVGIS_API_VERSION}/tmy?${params}`
}

/** Scarica da PVGIS l'anno tipo per la posizione indicata e lo converte con `parsePvgisTmy`. */
export async function fetchPvgisTmy(
  latitude: number,
  longitude: number,
  options: FetchPvgisTmyOptions,
): Promise<Tmy> {
  const url = pvgisTmyUrl(options.baseUrl, latitude, longitude)
  const doFetch = options.fetch ?? globalThis.fetch

  let response: Response
  try {
    response = await doFetch(url, { signal: options.signal })
  } catch (err) {
    // Un annullamento voluto non è un errore di PVGIS: lo lasciamo passare così com'è.
    if (options.signal?.aborted) throw err
    throw new PvgisError('Impossibile contattare PVGIS (rete non disponibile?)', { cause: err })
  }

  let body: unknown
  try {
    body = await response.json()
  } catch (err) {
    throw new PvgisError(`Risposta PVGIS non leggibile come JSON (HTTP ${response.status})`, {
      status: response.status,
      cause: err,
    })
  }

  if (!response.ok) {
    // PVGIS spiega l'errore nel campo "message" (es. "Location over the sea...").
    const detail = isObj(body) && typeof body.message === 'string' ? body.message : 'nessun dettaglio'
    throw new PvgisError(`PVGIS ha rifiutato la richiesta (HTTP ${response.status}): ${detail}`, {
      status: response.status,
    })
  }

  return parsePvgisTmy(body)
}
