import { describe, expect, it, vi } from 'vitest'
import tmyRaw from '../engine/__fixtures__/pvgis-tmy-roma.json'
import { parsePvgisTmy, type Tmy } from '../engine/pvgisTmy'
import { createTmyLoader, roundCoord, tmyKey, type LoadTmy } from './tmyLoader'

// Anno tipo reale di Roma centro (vedi engine/__fixtures__/README.md): qui serve solo come
// "dato qualsiasi" restituito dalla finta funzione di download.
const tmy = parsePvgisTmy(tmyRaw)

/** Finta funzione di download che conta le chiamate e risponde subito. */
function fakeLoad(result: Promise<Tmy> | (() => Promise<Tmy>) = () => Promise.resolve(tmy)) {
  return vi.fn<LoadTmy>(() => (typeof result === 'function' ? result() : result))
}

describe('chiave della memoria', () => {
  it('arrotonda le coordinate a 4 decimali (≈ 11 m)', () => {
    expect(roundCoord(41.902_849)).toBe(41.9028)
    expect(roundCoord(-0.000_04)).toBe(-0)
    expect(tmyKey(41.902_849, 12.4964)).toBe('41.9028,12.4964')
    // Due punti che differiscono meno della precisione usano la stessa memoria.
    expect(tmyKey(41.902_801, 12.496_401)).toBe(tmyKey(41.9028, 12.4964))
  })
})

describe('createTmyLoader', () => {
  it('scarica una sola volta la stessa posizione', async () => {
    const load = fakeLoad()
    const loader = createTmyLoader(load)
    expect(loader.peek(41.9028, 12.4964)).toBeUndefined()
    await loader.get(41.9028, 12.4964)
    await loader.get(41.9028, 12.4964)
    expect(load).toHaveBeenCalledTimes(1)
    expect(loader.peek(41.9028, 12.4964)).toBe(tmy)
  })

  it('riusa il download in corso se la stessa posizione viene chiesta di nuovo', async () => {
    const load = fakeLoad()
    const loader = createTmyLoader(load)
    const a = loader.get(41.9028, 12.4964)
    const b = loader.get(41.9028, 12.4964)
    expect(a).toBe(b)
    await a
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('scarica di nuovo per una posizione diversa, con le coordinate arrotondate', async () => {
    const load = fakeLoad()
    const loader = createTmyLoader(load)
    await loader.get(41.9028, 12.4964)
    await loader.get(45.464_211, 9.19)
    expect(load).toHaveBeenCalledTimes(2)
    expect(load.mock.calls[1].slice(0, 2)).toEqual([45.4642, 9.19])
  })

  it('dopo un errore dimentica la posizione, così si può riprovare', async () => {
    let fail = true
    const load = fakeLoad(() => (fail ? Promise.reject(new Error('rete assente')) : Promise.resolve(tmy)))
    const loader = createTmyLoader(load)
    await expect(loader.get(41.9028, 12.4964)).rejects.toThrow('rete assente')
    expect(loader.peek(41.9028, 12.4964)).toBeUndefined()
    fail = false
    await expect(loader.get(41.9028, 12.4964)).resolves.toBe(tmy)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('non riusa un download annullato', async () => {
    const load = fakeLoad()
    const loader = createTmyLoader(load)
    const controller = new AbortController()
    const first = loader.get(41.9028, 12.4964, controller.signal)
    controller.abort()
    // Richiesta subito dopo l'annullamento: deve partire un download nuovo.
    const second = loader.get(41.9028, 12.4964)
    expect(second).not.toBe(first)
    await Promise.allSettled([first, second])
    expect(load).toHaveBeenCalledTimes(2)
  })
})
