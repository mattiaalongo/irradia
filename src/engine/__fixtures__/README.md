# File di esempio per i test

File salvati così come sono arrivati dal server, senza alcuna modifica: i test li usano
al posto della rete, così sono deterministici e funzionano anche offline.

## `pvgis-tmy-roma.json`

Anno meteorologico tipo (TMY) di PVGIS 5.3 per Roma centro.

| | |
|---|---|
| Scaricato il | 7/11/2026 |
| Posizione | lat 41,9028 — lon 12,4964 |
| Banche dati | PVGIS-SARAH3 (radiazione), ERA5 (meteo), anni 2005–2023 |
| Dimensione | 1 271 323 byte |
| SHA-256 | `c83575cb7294d6a469ca529045a1fd6eca983fc2e97d5469be7188ed4c8c34a4` |

Comando usato:

```bash
curl -sS -f -o pvgis-tmy-roma.json \
  "https://re.jrc.ec.europa.eu/api/v5_3/tmy?lat=41.9028&lon=12.4964&outputformat=json"
```

Se riscaricandolo oggi il file è diverso, è probabile che il JRC abbia aggiornato le
banche dati: in quel caso vanno aggiornati anche i valori attesi in `pvgisTmy.test.ts`.

Il file è segnato in `.gitattributes` come generato, così GitHub non ne mostra il contenuto
nelle differenze delle Pull Request.

## File per la validazione del modello di produzione (fase 3)

Scaricati l'**8/11/2026**, Roma centro (lat 41,9028 — lon 12,4964), banche dati
PVGIS-SARAH3 ed ERA5, **senza ombre dell'orizzonte** (`usehorizon=0`): il nostro modello
non le considera ancora, quindi le togliamo anche da PVGIS per confrontare cose uguali.

| File | Cosa contiene | Byte | SHA-256 |
|---|---|---|---|
| `pvgis-series-roma-2020-horiz.json` | Anno 2020 ora per ora, piano **orizzontale**: diretta e diffusa orizzontali (sono gli ingressi del nostro calcolo) | 970 003 | `cfe8f6d1a7258371bafece8f3e681a408cecae192e5028f54165b5478b910e54` |
| `pvgis-series-roma-2020-s35.json` | Anno 2020 ora per ora, pannelli a **Sud inclinati 35°**, 1 kWp, perdite 14 %: diretta, diffusa, riflessa sul piano e potenza | 1 062 729 | `6685881d8ad2c6dbcffbb723b6c9f00f3d17ae73184b74c19abb488f122f3227` |
| `pvgis-series-roma-2020-e20.json` | Come sopra, pannelli a **Est inclinati 20°** | 1 059 879 | `f65b9cb02fce1935dc656f2e912d51d89dcc536d6a598e6a4939deeb7c995a84` |
| `pvgis-pvcalc-roma-s35.json` | Risultato di PVGIS "PVcalc": kWh mensili e annuali **medi 2005-2023** per 1 kWp a Sud 35°, perdite 14 % | 5 205 | `e00a901c9e50c009cef9d8630720e66971a98feb14df902c695887d373ba7891` |

Nelle richieste a PVGIS l'orientamento è l'"aspect" di PVGIS (0 = Sud, −90 = Est), non
l'azimut del motore: la conversione è in `pvgisSeries.ts`, il lettore usato dai test.

Comandi usati:

```bash
B="https://re.jrc.ec.europa.eu/api/v5_3"; L="lat=41.9028&lon=12.4964"
curl -sS -f -o pvgis-series-roma-2020-horiz.json \
  "$B/seriescalc?$L&startyear=2020&endyear=2020&usehorizon=0&angle=0&aspect=0&components=1&outputformat=json"
curl -sS -f -o pvgis-series-roma-2020-s35.json \
  "$B/seriescalc?$L&startyear=2020&endyear=2020&usehorizon=0&pvcalculation=1&peakpower=1&loss=14&angle=35&aspect=0&components=1&outputformat=json"
curl -sS -f -o pvgis-series-roma-2020-e20.json \
  "$B/seriescalc?$L&startyear=2020&endyear=2020&usehorizon=0&pvcalculation=1&peakpower=1&loss=14&angle=20&aspect=-90&components=1&outputformat=json"
curl -sS -f -o pvgis-pvcalc-roma-s35.json \
  "$B/PVcalc?$L&usehorizon=0&peakpower=1&loss=14&angle=35&aspect=0&outputformat=json"
```

Perché il 2020: è un anno recente e completo; l'anno tipo usa anche aprile, giugno e
dicembre 2020, ma la validazione oraria non dipende da questa coincidenza.
