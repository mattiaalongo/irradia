import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import romaRaw from './__fixtures__/pvgis-tmy-roma.json'
import { PvgisError, parsePvgisTmy } from './pvgisTmy'
import { simulateYear } from './simulate'

// Vento negativo vicino ai cambi di mese (issue #28), proprietà con fast-check (seme fisso).
// La finestra è ricalcolata qui in modo INDIPENDENTE dal prodotto: giorni per mese di un anno non
// bisestile, ore 0-7 e ultime 8 di ogni mese (compreso 31/12 -> 1/1).

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const raw = romaRaw as unknown as Json

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const IN_WINDOW = new Set<number>()
{
  let start = 0
  for (const d of DAYS) {
    const end = start + d * 24
    for (let k = 0; k < 8; k++) {
      IN_WINDOW.add(start + k)
      IN_WINDOW.add(end - 1 - k)
    }
    start = end
  }
}
const INSIDE = [...IN_WINDOW].sort((a, b) => a - b)
const OUTSIDE = Array.from({ length: 8760 }, (_, i) => i).filter((i) => !IN_WINDOW.has(i))

// Timeout esplicito: simulateYear costa ~15 ms, il parse con la copia del JSON qualche decina di ms.
// Regola come gli altri test lenti: >= 20x la durata misurata.
const TIMEOUT_MS = 30_000

/** Copia profonda delle sole righe orarie (il resto del JSON è condiviso e non viene toccato). */
function withWind(changes: Map<number, number>): Json {
  const rows = (raw.outputs.tmy_hourly as Json[]).map((r, i) => (changes.has(i) ? { ...r, WS10m: changes.get(i) } : r))
  return { ...raw, outputs: { ...raw.outputs, tmy_hourly: rows } }
}

// Negativi veri (anche enormi); -0 è trattato a parte perché -0 < 0 è falso.
const negativeWind = fc.oneof(
  fc.double({ min: -50, max: 0, noNaN: true }).filter((x) => x < 0),
  fc.constantFrom(-0.01, -0.25, -0.52, -2.35, -50, -1e6, -Number.MAX_VALUE, -Number.MIN_VALUE),
)

describe('parsePvgisTmy, vento negativo (proprietà)', () => {
  it('la finestra calcolata qui ha 16 ore per giunzione (12 giunzioni -> 192 ore)', () => {
    expect(IN_WINDOW.size).toBe(192)
  })

  it('(a) negativi (anche -0) iniettati DENTRO la finestra: accettati, vento >= 0, registro esatto, resto invariato', () => {
    const injection = fc.uniqueArray(fc.tuple(fc.constantFrom(...INSIDE), fc.oneof(negativeWind, fc.constant(-0))), {
      minLength: 1,
      maxLength: 12,
      selector: ([i]) => i,
    })
    fc.assert(
      fc.property(injection, (inj) => {
        const t = parsePvgisTmy(withWind(new Map(inj)))
        const rows = raw.outputs.tmy_hourly as Json[]
        const injected = new Map(inj)
        // Un solo ciclo semplice che raccoglie le ore sbagliate: un expect per ora (8760 x 60 casi
        // x 6) costava ~11 s nel cloud e oltre 30 s su Windows. L'asserzione finale resta una sola.
        const errori: string[] = []
        t.hours.forEach((h, i) => {
          const r = rows[i]
          if (!(h.windSpeedMs >= 0)) errori.push(`${i}: vento ${h.windSpeedMs} non >= 0`)
          if (h.ghiWm2 !== r['G(h)'] || h.dniWm2 !== r['Gb(n)'] || h.dhiWm2 !== r['Gd(h)'] || h.airTemperatureC !== r.T2m) {
            errori.push(`${i}: irradianza o temperatura alterate`)
          }
          if (injected.has(i)) {
            if (h.windSpeedMs !== 0) errori.push(`${i}: vento iniettato non azzerato (${h.windSpeedMs})`) // 0 oppure -0
          } else if (h.windSpeedMs !== r.WS10m) errori.push(`${i}: vento non iniettato alterato`)
        })
        expect(errori).toEqual([])
        // Registrate esattamente le ore con valore < 0 (-0 non è < 0: nessuna registrazione).
        const attesi = inj.filter(([, v]) => v < 0).sort((x, y) => x[0] - y[0]).map(([index, originalMs]) => ({ index, originalMs }))
        expect(t.windSpeedClamped).toEqual(attesi)
      }),
      { numRuns: 60 },
    )
  }, TIMEOUT_MS)

  it('(b) un negativo in un\'ora FUORI finestra -> sempre PvgisError', () => {
    fc.assert(
      fc.property(fc.constantFrom(...OUTSIDE), negativeWind, (i, v) => {
        expect(() => parsePvgisTmy(withWind(new Map([[i, v]])))).toThrow(PvgisError)
      }),
      { numRuns: 100 },
    )
  }, TIMEOUT_MS)

  it('(b2) un negativo fuori finestra insieme ad altri dentro -> comunque PvgisError', () => {
    fc.assert(
      fc.property(fc.constantFrom(...OUTSIDE), fc.constantFrom(...INSIDE), negativeWind, negativeWind, (o, d, v1, v2) => {
        expect(() => parsePvgisTmy(withWind(new Map([[d, v1], [o, v2]])))).toThrow(PvgisError)
      }),
      { numRuns: 50 },
    )
  }, TIMEOUT_MS)

  it('(c) ogni TMY accettato dà una simulazione con valori finiti e >= 0', () => {
    const injection = fc.uniqueArray(fc.tuple(fc.constantFrom(...INSIDE), negativeWind), {
      minLength: 1,
      maxLength: 40,
      selector: ([i]) => i,
    })
    fc.assert(
      fc.property(injection, fc.double({ min: 0, max: 90, noNaN: true }), fc.double({ min: 0, max: 360, maxExcluded: true, noNaN: true }), (inj, tilt, az) => {
        const t = parsePvgisTmy(withWind(new Map(inj)))
        const y = simulateYear(t, { tiltDeg: tilt, azimuthDeg: az, panelCount: 10, panelPowerWp: 430, systemLossPct: 14 })
        expect(Number.isFinite(y.annualKwh)).toBe(true)
        expect(y.annualKwh).toBeGreaterThanOrEqual(0)
        for (const m of y.monthlyKwh) {
          expect(Number.isFinite(m)).toBe(true)
          expect(m).toBeGreaterThanOrEqual(0)
        }
        expect(Number.isFinite(y.annualPoaKwhM2)).toBe(true)
      }),
      { numRuns: 8 },
    )
  }, TIMEOUT_MS)
})

describe('parsePvgisTmy, vento negativo (casi limite)', () => {
  it('-0 nella finestra e fuori: accettato, nessuna registrazione (-0 < 0 è falso: è una calma, corretto)', () => {
    const dentro = parsePvgisTmy(withWind(new Map([[5094, -0]])))
    expect(dentro.windSpeedClamped).toEqual([])
    // -0 resta -0 (non è < 0): innocuo, -0 === 0 e passa il controllo v >= 0 del motore.
    expect(dentro.hours[5094].windSpeedMs === 0).toBe(true)
    const fuori = parsePvgisTmy(withWind(new Map([[100, -0]])))
    expect(fuori.windSpeedClamped).toEqual([])
  })

  it('NaN, Infinity, testo, null nel vento (anche nella finestra) -> PvgisError', () => {
    for (const i of [5094, 100]) {
      for (const v of [Number.NaN, Infinity, -Infinity, '-0.3', 'abc', null, undefined, {}]) {
        expect(() => parsePvgisTmy(withWind(new Map([[i, v as number]]))), `${i}:${String(v)}`).toThrow(PvgisError)
      }
    }
  })

  it('più negativi nella stessa finestra: tutti azzerati e registrati in ordine', () => {
    const t = parsePvgisTmy(withWind(new Map([[5090, -3], [5094, -0.1], [5088, -9], [5095, -0.2]])))
    expect(t.windSpeedClamped).toEqual([
      { index: 5088, originalMs: -9 },
      { index: 5090, originalMs: -3 },
      { index: 5094, originalMs: -0.1 },
      { index: 5095, originalMs: -0.2 },
    ])
    expect([5088, 5090, 5094, 5095].map((i) => t.hours[i].windSpeedMs)).toEqual([0, 0, 0, 0])
  })

  it('febbraio 2008 (bisestile), ultime ore del 28/2: dentro la finestra; 28/2 15:00 fuori', () => {
    const j = withWind(new Map())
    j.outputs = { ...j.outputs, months_selected: (j.outputs.months_selected as Json[]).map((m) => (m.month === 2 ? { ...m, year: 2008 } : m)) }
    j.outputs.tmy_hourly = (j.outputs.tmy_hourly as Json[]).map((r) =>
      r['time(UTC)'].slice(4, 6) === '02' ? { ...r, 'time(UTC)': '2008' + r['time(UTC)'].slice(4) } : r,
    )
    for (const i of [1408, 1415]) {
      const rows = (j.outputs.tmy_hourly as Json[]).slice()
      rows[i] = { ...rows[i], WS10m: -2 }
      const t = parsePvgisTmy({ ...j, outputs: { ...j.outputs, tmy_hourly: rows } })
      expect(t.windSpeedClamped).toEqual([{ index: i, originalMs: -2 }])
    }
    const rows = (j.outputs.tmy_hourly as Json[]).slice()
    rows[1407] = { ...rows[1407], WS10m: -2 }
    expect(() => parsePvgisTmy({ ...j, outputs: { ...j.outputs, tmy_hourly: rows } })).toThrow(PvgisError)
  })

  it('irradianza negativa nella finestra (G(h), Gb(n), Gd(h)) -> PvgisError', () => {
    for (const key of ['G(h)', 'Gb(n)', 'Gd(h)']) {
      const rows = (raw.outputs.tmy_hourly as Json[]).slice()
      rows[5094] = { ...rows[5094], [key]: -0.5 }
      expect(() => parsePvgisTmy({ ...raw, outputs: { ...raw.outputs, tmy_hourly: rows } }), key).toThrow(PvgisError)
    }
  })
})
