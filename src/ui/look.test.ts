import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LOOK,
  LOOK_STORAGE_KEY,
  applyLook,
  browserStorage,
  isLook,
  readStoredLook,
  storeLook,
  type LookStorage,
} from './look'

/** Memoria finta: una mappa, con la possibilità di far lanciare lettura o scrittura. */
function fakeStorage(initial: Record<string, string> = {}, opts: { failGet?: boolean; failSet?: boolean } = {}) {
  const data = new Map(Object.entries(initial))
  const storage: LookStorage = {
    getItem(key) {
      if (opts.failGet) throw new DOMException('negato', 'SecurityError')
      return data.get(key) ?? null
    },
    setItem(key, value) {
      if (opts.failSet) throw new DOMException('pieno', 'QuotaExceededError')
      data.set(key, value)
    },
  }
  return { storage, data }
}

describe('aspetto della pagina', () => {
  it('A è il predefinito e la chiave è una sola, quella citata nel piè di pagina', () => {
    expect(DEFAULT_LOOK).toBe('a')
    expect(LOOK_STORAGE_KEY).toBe('irradia.look')
  })

  it('isLook riconosce solo "a" e "b"', () => {
    expect(isLook('a')).toBe(true)
    expect(isLook('b')).toBe(true)
    for (const v of ['A', 'B', 'c', '', ' b', 'b ', null, undefined, 1, {}]) expect(isLook(v)).toBe(false)
  })

  it('readStoredLook: valore salvato, oppure A se manca, è sconosciuto, la memoria manca o la lettura lancia', () => {
    expect(readStoredLook(fakeStorage({ 'irradia.look': 'b' }).storage)).toBe('b')
    expect(readStoredLook(fakeStorage({ 'irradia.look': 'a' }).storage)).toBe('a')
    expect(readStoredLook(fakeStorage().storage)).toBe('a')
    expect(readStoredLook(fakeStorage({ 'irradia.look': 'giornata' }).storage)).toBe('a')
    expect(readStoredLook(fakeStorage({ 'irradia.look': 'B' }).storage)).toBe('a')
    expect(readStoredLook(null)).toBe('a')
    expect(readStoredLook(fakeStorage({ 'irradia.look': 'b' }, { failGet: true }).storage)).toBe('a')
  })

  it('storeLook scrive la sola chiave; se la scrittura lancia restituisce false senza propagare', () => {
    const ok = fakeStorage()
    expect(storeLook(ok.storage, 'b')).toBe(true)
    expect([...ok.data.entries()]).toEqual([['irradia.look', 'b']])
    expect(storeLook(ok.storage, 'a')).toBe(true)
    expect(ok.data.get('irradia.look')).toBe('a')

    const full = fakeStorage({}, { failSet: true })
    expect(storeLook(full.storage, 'b')).toBe(false)
    expect(full.data.size).toBe(0)
    expect(storeLook(null, 'b')).toBe(false)
  })

  it('andata e ritorno: ciò che si salva si rilegge', () => {
    const { storage } = fakeStorage()
    for (const look of ['b', 'a', 'b'] as const) {
      storeLook(storage, look)
      expect(readStoredLook(storage)).toBe(look)
    }
  })

  it('applyLook imposta data-look sulla radice', () => {
    const attrs: Record<string, string> = {}
    const root = { setAttribute: (name: string, value: string) => void (attrs[name] = value) }
    applyLook(root, 'b')
    expect(attrs).toEqual({ 'data-look': 'b' })
    applyLook(root, 'a')
    expect(attrs).toEqual({ 'data-look': 'a' })
  })

  it('browserStorage senza browser (Node) restituisce null invece di lanciare', () => {
    expect(browserStorage()).toBeNull()
  })
})
