# Irradia

Simulatore **deterministico** della produzione di un impianto fotovoltaico residenziale.

Imposta la posizione della casa, l'inclinazione e l'orientamento dei pannelli,
il loro numero e la loro potenza, e vedi quanta energia produrrà l'impianto,
sulla base di modelli fisici documentati e di dati storici di irraggiamento.

## Stato

| Fase | Stato |
|---|---|
| 1. Fondamenta del progetto + posizione del sole | ✅ |
| 2. Dati di irraggiamento (PVGIS) | ⏳ |
| 3. Modello di produzione e validazione | ⏳ |
| 4. Interfaccia con slider e grafici | ⏳ |
| 5. Scelta della posizione su mappa | ⏳ |
| 6. Pubblicazione online | ⏳ |

## Avvio in locale

Richiede [Node.js](https://nodejs.org/) 22 o superiore.

```bash
npm install
npm run dev
```

Poi apri http://localhost:5173.

## Test

```bash
npm test
```

I test del motore di calcolo confrontano i risultati con valori di riferimento
pubblicati (NREL, NOAA). Le fonti sono indicate in ogni file di test.

## Fonti scientifiche

- J. Meeus, *Astronomical Algorithms*, 2ª ed., Willmann-Bell, 1998.
- NOAA Global Monitoring Laboratory, *Solar Calculator*.
- I. Reda, A. Andreas, *Solar Position Algorithm for Solar Radiation Applications*,
  NREL/TP-560-34302, 2008.
