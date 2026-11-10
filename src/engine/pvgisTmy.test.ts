import { describe, expect, it } from 'vitest'
import raw from './__fixtures__/pvgis-tmy-roma.json'
import livornoRaw from './__fixtures__/pvgis-tmy-livorno.json'
import milanoRaw from './__fixtures__/pvgis-tmy-milano.json'
import { fetchPvgisTmy, parsePvgisTmy, PvgisError, pvgisTmyUrl, TMY_HOURS, type Tmy } from './pvgisTmy'
import { solarPosition } from './solarPosition'

// File di esempio: risposta reale di PVGIS 5.3 (strumento "tmy") per Roma centro,
// scaricata il 7/11/2026. Come riscaricarla: vedi __fixtures__/README.md.
const tmy = parsePvgisTmy(raw)

/** Copia profonda del file di esempio, da alterare nei test degli errori. */
const rawCopy = (): any => structuredClone(raw) // eslint-disable-line @typescript-eslint/no-explicit-any

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('parsePvgisTmy — lettura del file PVGIS di Roma', () => {
  it('ha 8760 ore', () => {
    expect(tmy.hours).toHaveLength(TMY_HOURS)
  })

  it('riporta i metadati di PVGIS', () => {
    expect(tmy.latitude).toBe(41.9028)
    expect(tmy.longitude).toBe(12.4964)
    expect(tmy.elevationM).toBe(65)
    expect(tmy.irradianceTimeOffsetH).toBe(0.1723)
    expect(tmy.radiationDb).toBe('PVGIS-SARAH3')
    expect(tmy.meteoDb).toBe('ERA5')
    expect(tmy.yearMin).toBe(2005)
    expect(tmy.yearMax).toBe(2023)
  })

  it('riporta i mesi scelti da PVGIS', () => {
    expect(tmy.monthsSelected).toEqual([
      { month: 1, year: 2018 }, { month: 2, year: 2009 }, { month: 3, year: 2015 },
      { month: 4, year: 2020 }, { month: 5, year: 2005 }, { month: 6, year: 2020 },
      { month: 7, year: 2005 }, { month: 8, year: 2023 }, { month: 9, year: 2009 },
      { month: 10, year: 2012 }, { month: 11, year: 2005 }, { month: 12, year: 2020 },
    ])
  })

  // Valori copiati a mano dal file PVGIS: verificano che nessuna colonna venga scambiata.
  it('prima ora: "20180101:0000" → 1/1/2018 00:00 UTC, notte', () => {
    expect(tmy.hours[0]).toEqual({
      time: new Date('2018-01-01T00:00:00Z'),
      ghiWm2: 0, dniWm2: 0, dhiWm2: 0, airTemperatureC: 8.52, windSpeedMs: 2.68,
    })
  })

  it('21 giugno ore 11 UTC: "20200621:1100"', () => {
    const h = tmy.hours.find((x) => x.time.getTime() === Date.parse('2020-06-21T11:00:00Z'))
    expect(h).toEqual({
      time: new Date('2020-06-21T11:00:00Z'),
      ghiWm2: 974, dniWm2: 852.92, dhiWm2: 165, airTemperatureC: 26.58, windSpeedMs: 2.21,
    })
  })

  it('ultima ora: "20201231:2300"', () => {
    expect(tmy.hours[TMY_HOURS - 1].time).toEqual(new Date('2020-12-31T23:00:00Z'))
    expect(tmy.hours[TMY_HOURS - 1].airTemperatureC).toBe(8.22)
  })
})

describe('parsePvgisTmy — confronto con l\'irradiazione mensile pubblicata da PVGIS', () => {
  // Fonte: PVGIS 5.3, strumento "radiazione mensile" (MRcalc, horirrad=1), stesso punto,
  // scaricato il 7/11/2026: irradiazione mensile sul piano orizzontale H(h)_m, kWh/m².
  // Ogni mese del TMY è un mese reale, quindi la sua somma deve coincidere col valore
  // pubblicato per QUEL mese e QUELL'anno.
  // Tolleranza 0,5 %: PVGIS raccorda le ultime ore di ogni mese con l'inizio del
  // successivo (EN ISO 15927-4), quindi qualche ora proviene da un altro anno.
  // Scarti osservati: tra 0,00 % e 0,18 %.
  const reference: Record<number, number> = {
    1: 64.14, 2: 84.06, 3: 118.86, 4: 172.48, 5: 205.15, 6: 222.41,
    7: 238.05, 8: 203.71, 9: 143.56, 10: 101.33, 11: 64.37, 12: 50.19,
  }

  for (const [month, kWhPerM2] of Object.entries(reference)) {
    it(`mese ${month}: ${kWhPerM2} kWh/m²`, () => {
      // Ore da 1 h: la somma delle irradianze in W/m² dà Wh/m²; /1000 → kWh/m².
      const hours = tmy.hours.filter((h) => h.time.getUTCMonth() + 1 === Number(month))
      const monthly = sum(hours.map((h) => h.ghiWm2)) / 1000
      expect(Math.abs(monthly / kWhPerM2 - 1)).toBeLessThan(0.005)
    })
  }

  it('anno: vicino alla media 2005-2023 (1650,3 kWh/m²)', () => {
    // Stessa fonte: media delle 19 somme annuali. L'anno tipo non è la media, ma deve
    // esserle vicino: tolleranza 5 % (circa la variabilità tra un anno e l'altro, ±4 %).
    const annual = sum(tmy.hours.map((h) => h.ghiWm2)) / 1000
    expect(Math.abs(annual / 1650.3 - 1)).toBeLessThan(0.05)
  })
})

describe('parsePvgisTmy — coerenza fisica con la posizione del sole (fase 1)', () => {
  // Relazione geometrica: GHI = DNI · cos(zenit) + DHI.
  // Fonte: J. A. Duffie, W. A. Beckman, "Solar Engineering of Thermal Processes", 4ª ed., §1.8.
  // Lo zenit è calcolato con solarPosition all'istante time + irradianceTimeOffsetH.
  //
  // Indicatore: somma degli scarti |GHI − (DNI·cos z + DHI)| ora per ora, divisa per
  // la somma di GHI (ore con sole > 5°: vicino all'orizzonte cos z è troppo sensibile).
  // NON si usa lo scarto tra le somme annue, perché un errore di orario sposta il sole
  // in avanti al mattino e indietro al pomeriggio e i due errori si compensano.
  // Valori misurati su questo file: 0,11 % con il ritardo di PVGIS, 2,0 % senza ritardo,
  // 3,8 % con mezz'ora di ritardo.
  // Tolleranza 0,5 %: copre gli arrotondamenti dei dati (2 decimali) e la differenza tra
  // il nostro algoritmo solare e quello di PVGIS, ma fallisce con un errore di orario.

  it('ora per ora, con il ritardo di PVGIS: scarto < 0,5 %', () => {
    expect(relativeAbsError(tmy, tmy.irradianceTimeOffsetH)).toBeLessThan(0.005)
  })

  it('senza il ritardo lo scarto supera l\'1 % (il ritardo serve davvero)', () => {
    expect(relativeAbsError(tmy, 0)).toBeGreaterThan(0.01)
  })

  it('un errore di un\'ora intera (es. ora locale scambiata per UTC) verrebbe scoperto', () => {
    expect(relativeAbsError(tmy, tmy.irradianceTimeOffsetH + 1)).toBeGreaterThan(0.05)
  })
})

/** Σ|GHI − (DNI·cos z + DHI)| / ΣGHI sulle ore con sole > 5°, con lo zenit calcolato a time + offsetH. */
function relativeAbsError(t: Tmy, offsetH: number): number {
  let err = 0
  let ghi = 0
  for (const h of t.hours) {
    const p = solarPosition(new Date(h.time.getTime() + offsetH * 3_600_000), t.latitude, t.longitude)
    if (p.elevation <= 5) continue
    err += Math.abs(h.dniWm2 * Math.cos((p.zenith * Math.PI) / 180) + h.dhiWm2 - h.ghiWm2)
    ghi += h.ghiWm2
  }
  return err / ghi
}

describe('parsePvgisTmy — risposte non valide', () => {
  const expectError = (json: unknown, message: RegExp) => {
    expect(() => parsePvgisTmy(json)).toThrow(PvgisError)
    expect(() => parsePvgisTmy(json)).toThrow(message)
  }

  it('non è un oggetto', () => expectError('ciao', /inputs/))

  it('manca una sezione', () => {
    const j = rawCopy()
    delete j.outputs
    expectError(j, /outputs/)
  })

  it('manca un\'ora', () => {
    const j = rawCopy()
    j.outputs.tmy_hourly.splice(100, 1)
    expectError(j, /8759 ore/)
  })

  it('ore fuori sequenza', () => {
    const j = rawCopy()
    const rows = j.outputs.tmy_hourly
    ;[rows[10], rows[11]] = [rows[11], rows[10]]
    expectError(j, /fuori sequenza/)
  })

  it('unità diversa da quella attesa', () => {
    const j = rawCopy()
    j.meta.outputs.tmy_hourly.variables['G(h)'].units = 'kW/m2'
    expectError(j, /Unità inattesa per G\(h\)/)
  })

  it('valore non numerico', () => {
    const j = rawCopy()
    j.outputs.tmy_hourly[5].T2m = null
    expectError(j, /T2m" non è un numero finito/)
  })

  it('irradianza negativa', () => {
    const j = rawCopy()
    j.outputs.tmy_hourly[5]['Gb(n)'] = -1
    expectError(j, /negativo/)
  })

  it('data malformata', () => {
    const j = rawCopy()
    j.outputs.tmy_hourly[0]['time(UTC)'] = '2018-01-01 00:00'
    expectError(j, /non riconosciuta/)
  })

  it('data impossibile (31 aprile)', () => {
    const j = rawCopy()
    j.outputs.tmy_hourly[0]['time(UTC)'] = '20180431:0000'
    expectError(j, /non riconosciuta/)
  })

  it('anno della riga diverso dal mese scelto', () => {
    const j = rawCopy()
    j.outputs.tmy_hourly[0]['time(UTC)'] = '20190101:0000'
    expectError(j, /non coincide con i mesi scelti/)
  })

  it('mesi scelti incompleti', () => {
    const j = rawCopy()
    j.outputs.months_selected.pop()
    expectError(j, /1-12/)
  })
})

describe('parsePvgisTmy — vento negativo vicino ai cambi di mese (issue #28)', () => {
  // Fonte: risposta reale di PVGIS 5.3 (strumento "tmy") per Livorno centro, scaricata il
  // 10/11/2026 (vedi __fixtures__/README.md). Nel file stesso, il 1/8/2020 alle 6 e alle 7
  // UTC (ore 5094 e 5095, prime ore di agosto) WS10m vale −0,25 e −0,52 m/s: la rampa di
  // raccordo tra luglio 2010 e agosto 2020 attraversa lo zero.
  const livorno = parsePvgisTmy(livornoRaw)
  const rows = livornoRaw.outputs.tmy_hourly

  it('Livorno viene accettato e le due ore negative diventano 0 m/s', () => {
    expect(livorno.hours).toHaveLength(TMY_HOURS)
    expect(rows[5094]['time(UTC)']).toBe('20200801:0600')
    expect(livorno.hours[5094].windSpeedMs).toBe(0)
    expect(livorno.hours[5095].windSpeedMs).toBe(0)
  })

  it('le ore corrette sono registrate con il valore originale', () => {
    expect(livorno.windSpeedClamped).toEqual([
      { index: 5094, originalMs: -0.25 },
      { index: 5095, originalMs: -0.52 },
    ])
  })

  it('tutto il resto è identico al file PVGIS', () => {
    rows.forEach((r, i) => {
      const h = livorno.hours[i]
      expect(h.ghiWm2).toBe(r['G(h)'])
      expect(h.dniWm2).toBe(r['Gb(n)'])
      expect(h.dhiWm2).toBe(r['Gd(h)'])
      expect(h.airTemperatureC).toBe(r.T2m)
      if (i !== 5094 && i !== 5095) expect(h.windSpeedMs).toBe(r.WS10m)
    })
  })

  it('Roma e Milano non hanno vento negativo: elenco vuoto', () => {
    expect(tmy.windSpeedClamped).toEqual([])
    expect(parsePvgisTmy(milanoRaw).windSpeedClamped).toEqual([])
  })

  it('un negativo lontano dal cambio di mese resta un errore (ora 100, 5/1 alle 4 UTC)', () => {
    const j = rawCopy()
    j.outputs.tmy_hourly[100].WS10m = -0.3
    expect(() => parsePvgisTmy(j)).toThrow(PvgisError)
    expect(() => parsePvgisTmy(j)).toThrow(/WS10m" è negativo \(-0\.3\) lontano da un cambio di mese/)
  })

  // Bordi della finestra (8 ore prima e dopo il cambio di mese), su una copia di Roma.
  // Indici nel calendario non bisestile: 31/1 = ore 720-743, 1/2 = ore 744-767;
  // 28/2 = ore 1392-1415 (febbraio finisce il 28 anche se l'anno reale fosse bisestile).
  const accepted: [number, string][] = [
    [0, 'prima ora dell\'anno (1/1 00:00)'],
    [7, '1/1 07:00, ultima delle prime 8 ore'],
    [736, '31/1 16:00, prima delle ultime 8 ore di gennaio'],
    [751, '1/2 07:00'],
    [1408, '28/2 16:00'],
    [8752, '31/12 16:00'],
    [8759, 'ultima ora dell\'anno (31/12 23:00)'],
  ]
  for (const [index, label] of accepted) {
    it(`negativo accettato e portato a 0 dentro la finestra: ora ${index}, ${label}`, () => {
      const j = rawCopy()
      j.outputs.tmy_hourly[index].WS10m = -1.5
      const t = parsePvgisTmy(j)
      expect(t.hours[index].windSpeedMs).toBe(0)
      expect(t.windSpeedClamped).toEqual([{ index, originalMs: -1.5 }])
    })
  }

  const rejected: [number, string][] = [
    [8, '1/1 08:00, subito dopo le prime 8 ore'],
    [735, '31/1 15:00, subito prima delle ultime 8 ore'],
    [752, '1/2 08:00'],
    [1407, '28/2 15:00'],
    [8751, '31/12 15:00'],
  ]
  for (const [index, label] of rejected) {
    it(`negativo rifiutato appena fuori dalla finestra: ora ${index}, ${label}`, () => {
      const j = rawCopy()
      j.outputs.tmy_hourly[index].WS10m = -1.5
      expect(() => parsePvgisTmy(j)).toThrow(PvgisError)
    })
  }

  it('febbraio preso da un anno bisestile: la finestra finisce comunque il 28 (ora 1408)', () => {
    // Copia di Roma con febbraio "spostato" nel 2008 (bisestile): PVGIS non mette il 29
    // febbraio nel TMY, quindi dopo il 28/2 23:00 viene il 1/3 e la finestra deve seguirlo.
    const j = rawCopy()
    j.outputs.months_selected.find((m: { month: number }) => m.month === 2).year = 2008
    for (const r of j.outputs.tmy_hourly) {
      if (r['time(UTC)'].slice(4, 6) === '02') r['time(UTC)'] = '2008' + r['time(UTC)'].slice(4)
    }
    j.outputs.tmy_hourly[1408].WS10m = -0.4
    const t = parsePvgisTmy(j)
    expect(t.hours[1408].time).toEqual(new Date('2008-02-28T16:00:00Z'))
    expect(t.windSpeedClamped).toEqual([{ index: 1408, originalMs: -0.4 }])
  })

  it('la finestra vale solo per il vento: un\'irradianza negativa al cambio di mese resta un errore', () => {
    const j = rawCopy()
    j.outputs.tmy_hourly[0]['G(h)'] = -1
    expect(() => parsePvgisTmy(j)).toThrow(/G\(h\)" è negativo/)
  })
})

describe('pvgisTmyUrl', () => {
  it('costruisce l\'indirizzo della versione 5.3', () => {
    expect(pvgisTmyUrl('/api/pvgis', 41.9028, 12.4964)).toBe(
      '/api/pvgis/v5_3/tmy?lat=41.9028&lon=12.4964&outputformat=json',
    )
  })

  it('ignora la "/" finale dell\'indirizzo di base', () => {
    expect(pvgisTmyUrl('https://re.jrc.ec.europa.eu/api/', 0, 0)).toBe(
      'https://re.jrc.ec.europa.eu/api/v5_3/tmy?lat=0&lon=0&outputformat=json',
    )
  })

  it('rifiuta coordinate fuori intervallo', () => {
    expect(() => pvgisTmyUrl('/api/pvgis', 91, 0)).toThrow(RangeError)
    expect(() => pvgisTmyUrl('/api/pvgis', 0, -181)).toThrow(RangeError)
    expect(() => pvgisTmyUrl('/api/pvgis', NaN, 0)).toThrow(RangeError)
  })
})

describe('fetchPvgisTmy — con una finta fetch (nessuna rete)', () => {
  /** Finta fetch che registra gli indirizzi richiesti e risponde sempre allo stesso modo. */
  function fakeFetch(respond: () => Promise<Response>) {
    const calls: string[] = []
    const fn = ((url: string) => {
      calls.push(url)
      return respond()
    }) as typeof fetch
    return { fn, calls }
  }

  it('scarica e converte la risposta', async () => {
    const f = fakeFetch(async () => Response.json(raw))
    const result = await fetchPvgisTmy(41.9028, 12.4964, { baseUrl: '/api/pvgis', fetch: f.fn })
    expect(f.calls).toEqual(['/api/pvgis/v5_3/tmy?lat=41.9028&lon=12.4964&outputformat=json'])
    expect(result).toEqual(tmy)
  })

  it('riporta il messaggio di errore di PVGIS (punto sul mare)', async () => {
    // Risposta reale di PVGIS per lat=0, lon=-30 (verificata il 7/11/2026).
    const f = fakeFetch(async () =>
      Response.json({ message: 'Location over the sea. Please, select another location', status: 400 }, { status: 400 }),
    )
    const p = fetchPvgisTmy(0, -30, { baseUrl: '/api/pvgis', fetch: f.fn })
    await expect(p).rejects.toThrow(PvgisError)
    await expect(p).rejects.toThrow(/HTTP 400.*Location over the sea/)
    await expect(p).rejects.toMatchObject({ status: 400 })
  })

  it('risposta non JSON', async () => {
    const f = fakeFetch(async () => new Response('<html>Bad Gateway</html>', { status: 502 }))
    await expect(fetchPvgisTmy(0, 0, { baseUrl: '/api/pvgis', fetch: f.fn })).rejects.toThrow(/non leggibile.*HTTP 502/)
  })

  it('errore di rete', async () => {
    const f = fakeFetch(async () => {
      throw new TypeError('fetch failed')
    })
    await expect(fetchPvgisTmy(0, 0, { baseUrl: '/api/pvgis', fetch: f.fn })).rejects.toThrow(/Impossibile contattare PVGIS/)
  })

  it('annullamento: rilancia l\'errore originale, non un PvgisError', async () => {
    const controller = new AbortController()
    controller.abort()
    const abortError = new DOMException('Annullata', 'AbortError')
    const f = fakeFetch(async () => {
      throw abortError
    })
    await expect(
      fetchPvgisTmy(0, 0, { baseUrl: '/api/pvgis', fetch: f.fn, signal: controller.signal }),
    ).rejects.toBe(abortError)
  })

  it('coordinate non valide: nessuna richiesta parte', async () => {
    const f = fakeFetch(async () => Response.json(raw))
    await expect(fetchPvgisTmy(100, 0, { baseUrl: '/api/pvgis', fetch: f.fn })).rejects.toThrow(RangeError)
    expect(f.calls).toHaveLength(0)
  })
})
