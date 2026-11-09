import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import romaRaw from './__fixtures__/pvgis-tmy-roma.json'
import { PvgisError, fetchPvgisTmy, parsePvgisTmy } from './pvgisTmy'

// Il lettore deve RIFIUTARE (PvgisError) qualunque risposta malformata invece di restituire numeri
// sbagliati, e non deve mai lasciar uscire un TypeError/RangeError generico.

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const raw = romaRaw as unknown as Json
const RAW_TEXT = JSON.stringify(raw)

// Timeout esplicito (Vitest: 5000 ms di default) per i test di proprietà che qui durano più di ~100 ms.
// Regola: >= 20x la durata misurata nel cloud, arrotondata (qui 30 s; il più lento misura ~1,2 s).
// Motivo: macchine più lente o cariche (PC Windows del PO ~4,4x, runner CI a 2 core, più processi in
// parallelo) superavano i 5 s. Resta comunque un limite: una lentezza vera (cicli infiniti, costo
// per caso esploso) fallisce lo stesso.
const TIMEOUT_MS = 30_000

/** Un punto del JSON che il lettore controlla, con il modo di raggiungerlo. */
interface Target {
  nome: string
  /** `true` se un numero negativo è comunque non valido (irradianze e vento). */
  nonNegative: boolean
  kind: 'number' | 'string'
  holder: () => Json
  key: string
}

const HOURLY_KEYS = [
  { key: 'G(h)', nonNegative: true },
  { key: 'Gb(n)', nonNegative: true },
  { key: 'Gd(h)', nonNegative: true },
  { key: 'T2m', nonNegative: false },
  { key: 'WS10m', nonNegative: true },
] as const

function buildTargets(row: number, monthIdx: number): Target[] {
  const t: Target[] = []
  const loc = () => raw.inputs.location
  const meteo = () => raw.inputs.meteo_data
  for (const k of ['latitude', 'longitude', 'elevation', 'irradiance_time_offset']) {
    t.push({ nome: `inputs.location.${k}`, nonNegative: false, kind: 'number', holder: loc, key: k })
  }
  for (const k of ['year_min', 'year_max']) {
    t.push({ nome: `inputs.meteo_data.${k}`, nonNegative: false, kind: 'number', holder: meteo, key: k })
  }
  for (const k of ['radiation_db', 'meteo_db']) {
    t.push({ nome: `inputs.meteo_data.${k}`, nonNegative: false, kind: 'string', holder: meteo, key: k })
  }
  for (const c of HOURLY_KEYS) {
    t.push({
      nome: `meta unità ${c.key}`, nonNegative: false, kind: 'string',
      holder: () => raw.meta.outputs.tmy_hourly.variables[c.key], key: 'units',
    })
    t.push({
      nome: `tmy_hourly[${row}].${c.key}`, nonNegative: c.nonNegative, kind: 'number',
      holder: () => raw.outputs.tmy_hourly[row], key: c.key,
    })
  }
  t.push({ nome: `tmy_hourly[${row}].time(UTC)`, nonNegative: false, kind: 'string', holder: () => raw.outputs.tmy_hourly[row], key: 'time(UTC)' })
  for (const k of ['month', 'year']) {
    t.push({ nome: `months_selected[${monthIdx}].${k}`, nonNegative: false, kind: 'number', holder: () => raw.outputs.months_selected[monthIdx], key: k })
  }
  return t
}

/** Valori sbagliati per il TIPO del campo: per i numeri testi/null/NaN/…, per i testi numeri/null/…. */
const BAD_FOR_NUMBER: unknown[] = ['abc', '12.5', '', null, Number.NaN, Infinity, -Infinity, {}, [], [1], true]
const BAD_FOR_STRING: unknown[] = [12, 0, null, Number.NaN, {}, [], false]

describe('parsePvgisTmy (proprietà)', () => {
  it('il fixture non modificato è valido (controllo di partenza)', () => {
    expect(() => parsePvgisTmy(raw)).not.toThrow()
  })

  it('una modifica casuale (tipo sbagliato, null, NaN, chiave tolta, negativo) dà sempre PvgisError', () => {
    const bersaglio = buildTargets(0, 0).length
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: bersaglio - 1 }),
        fc.integer({ min: 0, max: 8759 }),
        fc.integer({ min: 0, max: 11 }),
        fc.constantFrom('tipo', 'rimossa', 'negativo'),
        fc.nat(20),
        (ti, row, monthIdx, modo, scelta) => {
          const target = buildTargets(row, monthIdx)[ti]
          const holder = target.holder()
          const originale = holder[target.key]
          try {
            if (modo === 'rimossa') delete holder[target.key]
            else if (modo === 'negativo' && target.nonNegative) holder[target.key] = -(Math.abs(Number(originale)) + 0.01)
            else {
              const lista = target.kind === 'number' ? BAD_FOR_NUMBER : BAD_FOR_STRING
              holder[target.key] = lista[scelta % lista.length]
            }
            // `negativo` su un campo che ammette negativi non è una modifica invalida: la saltiamo.
            fc.pre(!(modo === 'negativo' && !target.nonNegative))
            expect(() => parsePvgisTmy(raw), target.nome).toThrow(PvgisError)
          } finally {
            holder[target.key] = originale
          }
        },
      ),
      { numRuns: 50 },
    )
    expect(() => parsePvgisTmy(raw)).not.toThrow() // il fixture è stato ripristinato
  }, TIMEOUT_MS)

  it('data impossibile, fuori sequenza o righe mancanti/duplicate/scambiate → PvgisError', () => {
    const rows = raw.outputs.tmy_hourly as Json[]
    const IMPOSSIBILI = ['20180431:0000', '20180230:0000', '20181301:0000', '20180101:2500', '20180101:0060', '2018-01-01', '', '20180101:00', '20180101:0000 ']
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 8759 }),
        fc.constantFrom('data', 'rimuovi', 'duplica', 'scambia'),
        fc.nat(50),
        (i, modo, scelta) => {
          const copia = rows.slice()
          const json = { ...raw, outputs: { ...raw.outputs, tmy_hourly: copia } }
          if (modo === 'data') copia[i] = { ...rows[i], 'time(UTC)': IMPOSSIBILI[scelta % IMPOSSIBILI.length] }
          else if (modo === 'rimuovi') copia.splice(i, 1)
          else if (modo === 'duplica') copia.splice(i, 0, rows[i])
          else {
            const j = (i + 1 + (scelta % 8000)) % 8760
            fc.pre(j !== i)
            ;[copia[i], copia[j]] = [copia[j], copia[i]]
          }
          expect(() => parsePvgisTmy(json)).toThrow(PvgisError)
        },
      ),
      { numRuns: 50 },
    )
  }, TIMEOUT_MS)

  it('qualunque JSON arbitrario → PvgisError, mai TypeError', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (j) => {
        try {
          parsePvgisTmy(j)
          throw new Error('un JSON arbitrario non dovrebbe essere accettato')
        } catch (e) {
          expect(e).toBeInstanceOf(PvgisError)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('anche con la struttura giusta e contenuti arbitrari → PvgisError, mai TypeError', () => {
    const sezione = fc.oneof(fc.jsonValue(), fc.dictionary(fc.constantFrom('location', 'meteo_data', 'tmy_hourly', 'months_selected', 'outputs', 'tmy_hourly', 'variables'), fc.jsonValue()))
    fc.assert(
      fc.property(sezione, sezione, sezione, (inputs, outputs, meta) => {
        try {
          parsePvgisTmy({ inputs, outputs, meta })
          throw new Error('non dovrebbe essere accettato')
        } catch (e) {
          expect(e).toBeInstanceOf(PvgisError)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('valori non oggetto in input (null, numeri, testi, array) → PvgisError', () => {
    for (const v of [null, undefined, 0, 'x', [], [raw], true]) expect(() => parsePvgisTmy(v)).toThrow(PvgisError)
  })
})

describe('fetchPvgisTmy (proprietà, con fetch finta)', () => {
  // Stati ammessi dal costruttore di Response con un corpo (esclusi 204/205/304, che non lo ammettono).
  const stato = fc.integer({ min: 200, max: 599 }).filter((s) => ![204, 205, 304].includes(s))
  const finta = (status: number, body: string): typeof fetch => async () => new Response(body, { status })

  it('con un TMY valido risolve solo per gli stati 2xx; altrimenti PvgisError con lo stato', async () => {
    await fc.assert(
      fc.asyncProperty(stato, async (status) => {
        const p = fetchPvgisTmy(41.9, 12.5, { baseUrl: '/api/pvgis', fetch: finta(status, RAW_TEXT) })
        if (status >= 200 && status < 300) {
          expect((await p).hours).toHaveLength(8760)
        } else {
          const err = await p.catch((e: unknown) => e)
          expect(err).toBeInstanceOf(PvgisError)
          expect((err as PvgisError).status).toBe(status)
        }
      }),
      { numRuns: 100 },
    )
  }, TIMEOUT_MS)

  it('con un corpo arbitrario (testo, JSON qualsiasi) e uno stato qualsiasi → sempre PvgisError', async () => {
    await fc.assert(
      fc.asyncProperty(stato, fc.oneof(fc.string(), fc.jsonValue().map((j) => JSON.stringify(j))), async (status, body) => {
        const err = await fetchPvgisTmy(41.9, 12.5, { baseUrl: '/api/pvgis', fetch: finta(status, body) }).catch((e: unknown) => e)
        expect(err).toBeInstanceOf(PvgisError)
      }),
      { numRuns: 100 },
    )
  })

  it('errore di rete qualunque (anche non Error) → PvgisError', async () => {
    await fc.assert(
      fc.asyncProperty(fc.anything(), async (motivo) => {
        const rifiuta: typeof fetch = () => Promise.reject(motivo)
        const err = await fetchPvgisTmy(41.9, 12.5, { baseUrl: '/api/pvgis', fetch: rifiuta }).catch((e: unknown) => e)
        expect(err).toBeInstanceOf(PvgisError)
      }),
      { numRuns: 100 },
    )
  })

  it('risposta senza corpo (204) → PvgisError', async () => {
    const f: typeof fetch = async () => new Response(null, { status: 204 })
    await expect(fetchPvgisTmy(41.9, 12.5, { baseUrl: '/api/pvgis', fetch: f })).rejects.toBeInstanceOf(PvgisError)
  })

  it('coordinate fuori intervallo o NaN → RangeError prima di qualunque richiesta', async () => {
    let chiamate = 0
    const f: typeof fetch = async () => (chiamate++, new Response(RAW_TEXT))
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.double({ min: 90, minExcluded: true }), fc.double({ max: -90, maxExcluded: true }), fc.constant(Number.NaN)),
        async (lat) => {
          await expect(fetchPvgisTmy(lat, 0, { baseUrl: '/api/pvgis', fetch: f })).rejects.toBeInstanceOf(RangeError)
        },
      ),
      { numRuns: 100 },
    )
    expect(chiamate).toBe(0)
  })
})
