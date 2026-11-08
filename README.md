# Irradia

Simulatore **deterministico** della produzione di un impianto fotovoltaico residenziale.

Imposta la posizione della casa, l'inclinazione e l'orientamento dei pannelli,
il loro numero e la loro potenza, e vedi quanta energia produrrà l'impianto,
sulla base di modelli fisici documentati e di dati storici di irraggiamento.

## Stato

| Fase | Stato |
|---|---|
| 1. Fondamenta del progetto + posizione del sole | ✅ |
| 2. Dati di irraggiamento (PVGIS) | ✅ |
| 3. Modello di produzione e validazione | ✅ |
| 4. Interfaccia con slider e grafici | ⏳ |
| 5. Scelta della posizione su mappa | ⏳ |
| 6. Pubblicazione online | ⏳ |

## Come si calcola la produzione

Per ognuna delle 8760 ore dell'anno tipo di PVGIS:

1. posizione del sole (algoritmo NOAA);
2. luce sul piano dei pannelli: diretta (geometria), diffusa dal cielo (modello di Muneer,
   come PVGIS) e riflessa dal suolo (albedo 0,2);
3. perdite per riflessione sul vetro dei moduli (Martin & Ruiz);
4. temperatura dei moduli (Faiman) e potenza in corrente continua (Huld);
5. perdite di sistema (inverter, cavi…: 14 % predefinito);

poi si sommano le ore in kWh mensili e annuali.

**Validazione** (Roma, 1 kWp): rifacendo ora per ora l'anno 2020 di PVGIS, l'energia annua
coincide entro l'1 % (Sud 35°: +0,6 %; Est 20°: +0,3 %). Con l'anno tipo otteniamo
1511 kWh/anno contro i 1505 della media 2005-2023 di PVGIS (+0,4 %).

Differenze note rispetto a PVGIS: non consideriamo l'effetto dello spettro della luce
(circa ±1 %) né le ombre di montagne ed edifici all'orizzonte.

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
pubblicati (NREL, NOAA, PVGIS). Le fonti sono indicate in ogni file di test.
I dati PVGIS usati nei test sono salvati in `src/engine/__fixtures__/`: i test non usano la rete.

## Fonti scientifiche

- J. Meeus, *Astronomical Algorithms*, 2ª ed., Willmann-Bell, 1998.
- NOAA Global Monitoring Laboratory, *Solar Calculator*.
- I. Reda, A. Andreas, *Solar Position Algorithm for Solar Radiation Applications*,
  NREL/TP-560-34302, 2008.
- JRC, Commissione Europea, *PVGIS 5.3* — anno meteorologico tipo e irradiazione mensile
  (banche dati PVGIS-SARAH3 ed ERA5).
- J. A. Duffie, W. A. Beckman, *Solar Engineering of Thermal Processes*, 4ª ed., Wiley, 2013.
- T. Muneer, *Solar radiation model for Europe*, Building Services Engineering Research
  and Technology 11 (1990), pp. 153-163.
- J. Hofierka, M. Šúri, *The solar radiation model for Open source GIS: implementation and
  applications*, Open Source GIS – GRASS users conference, Trento, 2002.
- N. Martin, J. M. Ruiz, *Calculation of the PV modules angular losses under field conditions
  by means of an analytical model*, Solar Energy Materials & Solar Cells 70 (2001), pp. 25-38.
- D. Faiman, *Assessing the outdoor operating temperature of photovoltaic modules*,
  Progress in Photovoltaics 16 (2008), pp. 307-315.
- T. Huld et al., *A power-rating model for crystalline silicon PV modules*, Solar Energy
  Materials & Solar Cells 95 (2011), pp. 3359-3369.
