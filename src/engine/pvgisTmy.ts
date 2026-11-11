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
  /**
   * Vero se PVGIS ha tolto la luce diretta nelle ore in cui il sole è dietro il profilo del
   * terreno (montagne, colline) attorno al punto, calcolato da PVGIS su un modello digitale
   * del terreno (`inputs.meteo_data.horizon_db`: "DEM-calculated"). PVGIS: `use_horizon`.
   * Lo chiediamo sempre (`usehorizon=1` in `pvgisTmyUrl`): un `false` vorrebbe dire che PVGIS
   * ha ignorato la richiesta. Il calcolo prosegue comunque; l'interfaccia ne tiene conto nella
   * nota sotto i risultati (decisione del PO dell'11/11/2026, issue #25).
   * Le ombre di ostacoli vicini (edifici, alberi) non sono mai comprese.
   */
  usesHorizon: boolean
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

/**
 * Tipo di un `PvgisError`: dice PERCHÉ non abbiamo l'anno tipo, così l'interfaccia può
 * scegliere un testo adatto senza leggere il messaggio tecnico. Unione chiusa: aggiungere
 * un tipo fa fallire la compilazione dove i tipi sono elencati con uno `switch` esaustivo.
 * - `seaLocation`: PVGIS dice che il punto è in mare (risposta 4xx, vedi `PVGIS_SEA_PHRASE`).
 * - `outsideCoverage`: PVGIS dice che il punto è fuori dalla sua zona coperta
 *   (risposta 4xx, vedi `PVGIS_COVERAGE_PHRASE`).
 * - `rejected`: qualunque altra risposta di errore HTTP con un corpo JSON (es. parametri
 *   sbagliati, errori del server, o un testo di PVGIS che non riconosciamo più).
 * - `notJson`: la risposta non è JSON (es. pagina HTML del firewall, anche con codice 200).
 * - `network`: la richiesta non è arrivata a una risposta (rete assente, proxy spento…).
 * - `invalidData`: risposta JSON con esito positivo ma contenuto non valido per il lettore.
 */
export type PvgisErrorKind = 'seaLocation' | 'outsideCoverage' | 'rejected' | 'notJson' | 'network' | 'invalidData'

/** Errore di lettura o di scaricamento dei dati PVGIS. */
export class PvgisError extends Error {
  /** Perché non abbiamo i dati (vedi `PvgisErrorKind`). */
  readonly kind: PvgisErrorKind
  /** Codice HTTP della risposta, se l'errore viene da una risposta del server. */
  readonly status?: number
  /** Errore originale che ha causato questo (es. l'errore di rete). */
  readonly cause?: unknown

  /**
   * `message` è un testo tecnico (con il dettaglio originale di PVGIS quando c'è), utile per
   * la diagnosi: i testi per l'utente li sceglie l'interfaccia in base a `kind`.
   * `kind` è obbligatorio: ogni punto che lancia l'errore deve dichiararne il tipo.
   */
  constructor(message: string, options: { kind: PvgisErrorKind; status?: number; cause?: unknown }) {
    super(message)
    this.name = 'PvgisError'
    this.kind = options.kind
    this.status = options.status
    this.cause = options.cause
  }
}

/** Errore del lettore: la risposta è arrivata ma il suo contenuto non è valido. */
function invalidData(message: string): PvgisError {
  return new PvgisError(message, { kind: 'invalidData' })
}

/**
 * Frasi con cui PVGIS spiega perché rifiuta un punto, nel campo `message` della risposta JSON.
 * Fonte: risposte reali di PVGIS v5_3 (strumento "tmy") verificate il 10/11/2026, entrambe con
 * HTTP 400 e `Content-Type: application/json` (salvate in `__fixtures__/pvgis-error-*.json`):
 * - lat 36, lon −20 (Atlantico): "Location over the sea. Please, select another location".
 *   PVGIS dà lo stesso testo anche per terre emerse fuori copertura (es. Svalbard).
 * - lat 70,98, lon −8,5 (Jan Mayen): "Location out of the spatial coverage of PVGIS5".
 * Cerchiamo solo una parte stabile della frase (senza "PVGIS5", che cambierebbe con la
 * versione), ignorando maiuscole e spazi multipli. Se il JRC cambia il testo, l'errore
 * diventa `rejected`: il messaggio torna generico, ma nulla si rompe.
 */
export const PVGIS_SEA_PHRASE = 'over the sea'
export const PVGIS_COVERAGE_PHRASE = 'out of the spatial coverage'

/** Minuscole e spazi (anche a capo, tabulazioni) ridotti a uno solo: per confrontare le frasi. */
const normalizePhrase = (text: string): string => text.toLowerCase().replace(/\s+/g, ' ')

/**
 * Tipo di una risposta di errore HTTP con corpo JSON. Mare e copertura solo per i codici
 * 4xx (errore della richiesta: il punto scelto): un 5xx è un guasto del server anche se
 * il testo contenesse una delle frasi.
 */
function rejectionKind(status: number, detail: string | undefined): PvgisErrorKind {
  if (status >= 400 && status < 500 && detail !== undefined) {
    const text = normalizePhrase(detail)
    if (text.includes(PVGIS_SEA_PHRASE)) return 'seaLocation'
    if (text.includes(PVGIS_COVERAGE_PHRASE)) return 'outsideCoverage'
  }
  return 'rejected'
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
  if (!isObj(v)) throw invalidData(`Risposta PVGIS non valida: manca l'oggetto "${path}"`)
  return v
}

function arr(parent: Obj, key: string, path: string): unknown[] {
  const v = parent[key]
  if (!Array.isArray(v)) throw invalidData(`Risposta PVGIS non valida: manca l'elenco "${path}"`)
  return v
}

function num(parent: Obj, key: string, path: string): number {
  const v = parent[key]
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw invalidData(`Risposta PVGIS non valida: "${path}" non è un numero finito`)
  }
  return v
}

function bool(parent: Obj, key: string, path: string): boolean {
  const v = parent[key]
  if (typeof v !== 'boolean') throw invalidData(`Risposta PVGIS non valida: "${path}" non è un valore vero/falso`)
  return v
}

function str(parent: Obj, key: string, path: string): string {
  const v = parent[key]
  if (typeof v !== 'string') throw invalidData(`Risposta PVGIS non valida: "${path}" non è un testo`)
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
  throw invalidData(`Risposta PVGIS non valida: data "${text}" in "${path}" non riconosciuta`)
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
      throw invalidData(`Unità inattesa per ${c.key}: PVGIS dichiara "${unit}", atteso "${c.unit}"`)
    }
  }

  // 2. Mesi scelti: esattamente uno per ciascun mese 1-12
  const monthsSelected = arr(outputs, 'months_selected', 'outputs.months_selected').map((x, i) => {
    const path = `outputs.months_selected[${i}]`
    if (!isObj(x)) throw invalidData(`Risposta PVGIS non valida: "${path}" non è un oggetto`)
    return { month: num(x, 'month', `${path}.month`), year: num(x, 'year', `${path}.year`) }
  })
  const months = monthsSelected.map((m) => m.month).sort((a, b) => a - b)
  if (months.length !== 12 || months.some((m, i) => m !== i + 1)) {
    throw invalidData('Risposta PVGIS non valida: i mesi scelti non sono esattamente 1-12')
  }
  const yearOfMonth = new Map(monthsSelected.map((m) => [m.month, m.year]))

  // 3. Dati orari
  const rows = arr(outputs, 'tmy_hourly', 'outputs.tmy_hourly')
  if (rows.length !== TMY_HOURS) {
    throw invalidData(`Risposta PVGIS non valida: ${rows.length} ore invece di ${TMY_HOURS}`)
  }

  // Calendario atteso: tutte le ore di un anno non bisestile, nell'ordine. Lo usiamo
  // per controllare che ogni riga sia al suo posto (nessuna ora mancante o duplicata).
  const expected = new Date(Date.UTC(2001, 0, 1)) // 2001: anno non bisestile qualsiasi
  const windSpeedClamped: Tmy['windSpeedClamped'] = []

  const hours = rows.map((row, i): TmyHour => {
    const path = `outputs.tmy_hourly[${i}]`
    if (!isObj(row)) throw invalidData(`Risposta PVGIS non valida: "${path}" non è un oggetto`)

    const time = parsePvgisTime(str(row, 'time(UTC)', `${path}.time(UTC)`), path)
    const month = time.getUTCMonth() + 1
    if (
      month !== expected.getUTCMonth() + 1 ||
      time.getUTCDate() !== expected.getUTCDate() ||
      time.getUTCHours() !== expected.getUTCHours() ||
      time.getUTCMinutes() !== 0
    ) {
      throw invalidData(`Risposta PVGIS non valida: ora fuori sequenza in "${path}"`)
    }
    if (time.getUTCFullYear() !== yearOfMonth.get(month)) {
      throw invalidData(`Risposta PVGIS non valida: l'anno in "${path}" non coincide con i mesi scelti`)
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
          throw invalidData(
            `Risposta PVGIS non valida: "${path}.${c.key}" è negativo (${v}) lontano da un cambio ` +
              `di mese (accettato solo nelle ${MONTH_JUNCTION_HOURS} ore prima e dopo)`,
          )
        } else {
          throw invalidData(`Risposta PVGIS non valida: "${path}.${c.key}" è negativo (${v})`)
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
    usesHorizon: bool(meteo, 'use_horizon', 'inputs.meteo_data.use_horizon'),
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

/**
 * Costruisce l'indirizzo della richiesta TMY. Esportata per poterla verificare nei test.
 *
 * `usehorizon=1`: chiediamo ESPLICITAMENTE le ombre del terreno. Fonte: JRC, "PVGIS API —
 * non-interactive service" (indirizzo in testa al file), parametro `usehorizon` ("Calculate
 * taking into account shadows from high horizon. Value of 1 for 'yes'"); senza parametro
 * PVGIS usa già 1 come valore predefinito. Misurato il 10/11/2026 (issue #25):
 * - con `usehorizon=1` la risposta è identica byte per byte a quella senza parametro (stesso
 *   SHA-256 per Roma, Milano, Livorno e Aosta): cambia solo che la scelta è scritta qui;
 * - con l'orizzonte PVGIS porta la DNI a 0 nelle ore in cui il sole è dietro il profilo del
 *   terreno (Aosta: 531 ore, DNI −12,6 %, energia a Sud 35° −6,5 %; Roma: 66 ore al
 *   tramonto, −0,07 %; Milano e Livorno: nessuna ora);
 * - le ombre di ostacoli vicini (edifici, alberi) non ci sono comunque.
 * Ordine dei parametri: lat, lon, usehorizon, outputformat (lo stesso dei comandi nel README
 * dei fixture).
 */
export function pvgisTmyUrl(baseUrl: string, latitude: number, longitude: number): string {
  if (!(latitude >= -90 && latitude <= 90)) throw new RangeError('Latitudine fuori da [-90, 90]')
  if (!(longitude >= -180 && longitude <= 180)) throw new RangeError('Longitudine fuori da [-180, 180]')
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    usehorizon: '1',
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
    throw new PvgisError('Impossibile contattare PVGIS (rete non disponibile?)', { kind: 'network', cause: err })
  }

  let body: unknown
  try {
    body = await response.json()
  } catch (err) {
    throw new PvgisError(`Risposta PVGIS non leggibile come JSON (HTTP ${response.status})`, {
      kind: 'notJson',
      status: response.status,
      cause: err,
    })
  }

  if (!response.ok) {
    // PVGIS spiega l'errore nel campo "message" (es. "Location over the sea...").
    const detail = isObj(body) && typeof body.message === 'string' ? body.message : undefined
    throw new PvgisError(`PVGIS ha rifiutato la richiesta (HTTP ${response.status}): ${detail ?? 'nessun dettaglio'}`, {
      kind: rejectionKind(response.status, detail),
      status: response.status,
    })
  }

  return parsePvgisTmy(body)
}
