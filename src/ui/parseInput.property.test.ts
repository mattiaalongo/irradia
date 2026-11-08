import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { parseDecimal, validationMessage } from './parseInput'

// Timeout esplicito (Vitest: 5000 ms di default) per i test di proprietà che qui durano più di ~100 ms.
// Regola: >= 20x la durata misurata nel cloud, arrotondata (qui 30 s; il più lento misura ~1,2 s).
// Motivo: macchine più lente o cariche (PC Windows del PO ~4,4x, runner CI a 2 core, più processi in
// parallelo) superavano i 5 s. Resta comunque un limite: una lentezza vera (cicli infiniti, costo
// per caso esploso) fallisce lo stesso.
const TIMEOUT_MS = 30_000

describe('parseDecimal (proprietà)', () => {
  it('non lancia mai e restituisce null oppure un numero (non NaN) per qualunque testo', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 40 }), (t) => {
        const n = parseDecimal(t)
        expect(n === null || !Number.isNaN(n)).toBe(true)
      }),
      { numRuns: 300 },
    )
  }, TIMEOUT_MS)

  it('ogni numero scritto con toFixed, con virgola o punto e spazi attorno, torna uguale', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e6, max: 1e6, noNaN: true }),
        fc.integer({ min: 0, max: 6 }),
        fc.constantFrom(',', '.'),
        fc.constantFrom('', ' ', '  ', '\t'),
        (x, d, sep, spazi) => {
          const base = x.toFixed(d)
          const testo = spazi + base.replace('.', sep) + spazi
          expect(parseDecimal(testo)).toBe(Number(base))
        },
      ),
      { numRuns: 300 },
    )
  })

  it('rifiuta (null) ogni testo con lettere, esponente, due separatori o simboli', () => {
    const cattivo = fc.oneof(
      fc.tuple(fc.integer({ min: 0, max: 999 }), fc.constantFrom('e', 'E'), fc.integer({ min: -9, max: 9 })).map(([a, e, b]) => `${a}${e}${b}`),
      fc.constantFrom('NaN', 'Infinity', '-Infinity', 'abc', '0x10', '1,2,3', '1.2.3', '1,2.3', '1.2,3', '--1', '+-1', '1-', ',', '.', '-', '', '   ', '1 2', '١٢', '1_000'),
      fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /[^\d.,\s+-]/.test(s)),
    )
    fc.assert(
      fc.property(cattivo, (t) => {
        expect(parseDecimal(t)).toBeNull()
      }),
      { numRuns: 300 },
    )
  })

  it('un testo di sole cifre molto lungo non produce un valore accettabile (Infinity viene respinto dal controllo)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 300, max: 2000 }), (len) => {
        const t = '9'.repeat(len)
        // Il valore è Infinity, ma validationMessage lo respinge sempre: non arriva mai all'app.
        expect(validationMessage(t, 0, 1e300, false)).not.toBeNull()
        expect(validationMessage(t, 34, 72, false)).not.toBeNull()
      }),
      { numRuns: 20 },
    )
  })
})

describe('validationMessage (proprietà)', () => {
  const limiti = fc.tuple(fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: 1, max: 1000 })).map(([min, w]) => [min, min + w] as const)

  it('è null se e solo se il testo è un numero nell\'intervallo (e intero, se richiesto): confronto con un oracolo indipendente', () => {
    fc.assert(
      fc.property(
        limiti,
        fc.boolean(),
        fc.oneof(
          fc.double({ min: -1500, max: 1500, noNaN: true }).map((x) => x.toFixed(2).replace('.', ',')),
          fc.integer({ min: -1500, max: 1500 }).map(String),
          fc.string({ maxLength: 8 }),
        ),
        ([min, max], intero, testo) => {
          const msg = validationMessage(testo, min, max, intero)
          const t = testo.trim().replace(',', '.')
          const sintassiOk = /^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)
          const n = Number(t)
          const accettabile = sintassiOk && n >= min && n <= max && (!intero || Number.isInteger(n))
          expect(msg === null).toBe(accettabile)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('i messaggi sono quelli previsti e non contengono mai "NaN" o "undefined"', () => {
    fc.assert(
      fc.property(limiti, fc.boolean(), fc.string({ maxLength: 12 }), ([min, max], intero, testo) => {
        const msg = validationMessage(testo, min, max, intero)
        if (msg === null) return
        expect(msg).not.toMatch(/NaN|undefined|Infinity/)
        expect(msg).toMatch(/^(Inserisci un numero( intero)?|Il valore deve essere tra .+ e .+)$/)
      }),
      { numRuns: 300 },
    )
  })

  it('i limiti stessi sono accettati, un passo fuori no', () => {
    fc.assert(
      fc.property(limiti, ([min, max]) => {
        expect(validationMessage(String(min), min, max, true)).toBeNull()
        expect(validationMessage(String(max), min, max, true)).toBeNull()
        expect(validationMessage(String(min - 1), min, max, true)).not.toBeNull()
        expect(validationMessage(String(max + 1), min, max, true)).not.toBeNull()
      }),
      { numRuns: 200 },
    )
  })
})
