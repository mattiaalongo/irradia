import fc from 'fast-check'

// Eseguito da Vitest prima di ogni file di test (`test.setupFiles`).
// Seme fisso: le prove "a proprietà" generano input casuali, ma con un seme
// costante la sequenza è sempre la stessa. Così un errore nella CI si
// riproduce identico in locale e i test sono deterministici, come chiede il
// progetto. Per esplorare altri casi: `FC_SEED=123 npm test`.
// Il numero di casi (numRuns) NON si imposta qui: lo sceglie ogni test, perché
// dipende dal costo della singola prova.
fc.configureGlobal({ seed: Number(process.env.FC_SEED ?? 20261108) })
