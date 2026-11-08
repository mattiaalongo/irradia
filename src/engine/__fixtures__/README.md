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

## Irradiazione mensile reale di ogni anno (MRcalc), Roma

Serve a confrontare ogni mese dell'anno tipo con il **mese reale** da cui PVGIS l'ha preso
(stesso anno), invece che con la media 2005-2023: così la "fortuna" dell'anno tipo (mesi
più o meno soleggiati della media) non si confonde con gli errori del nostro calcolo.
Letto da `pvgisMonthly.ts`.

| File | Cosa contiene | Scaricato il | Byte | SHA-256 |
|---|---|---|---|---|
| `pvgis-mrcalc-roma-s35.json` | Ogni mese 2005-2023: irradiazione sul piano orizzontale H(h)_m e sul piano **Sud inclinato 35°** H(i)_m, kWh/m², senza orizzonte | 8/11/2026 | 14 331 | `3902419cc1e4149084ffdbbaabb676b8b65a9d419fb7b3daddb202a758b35b56` |

Piano Sud 35° come `pvgis-pvcalc-roma-s35.json` e `pvgis-series-roma-2020-s35.json`: lo
stesso piano permette di verificare che la media dei 19 anni di MRcalc coincida con H(i)_m
di PVcalc (controllo in `pvgisMonthly.test.ts`). MRcalc non ha il parametro `aspect`: il suo
piano inclinato è sempre rivolto all'equatore (Sud).

```bash
B="https://re.jrc.ec.europa.eu/api/v5_3"; L="lat=41.9028&lon=12.4964"
curl -sS -f -A irradia-dev-proxy -o pvgis-mrcalc-roma-s35.json \
  "$B/MRcalc?$L&horirrad=1&selectrad=1&angle=35&usehorizon=0&startyear=2005&endyear=2023&outputformat=json"
```

## Milano (issue #10)

Scaricati l'**8/11/2026**, Milano (lat 45,4642 — lon 9,19), banche dati PVGIS-SARAH3 ed
ERA5, **senza ombre dell'orizzonte** (`usehorizon=0`; per questo punto PVGIS dà lo stesso
E_y con e senza orizzonte: l'orizzonte è nullo). È la località del caso segnalato
nell'issue #10 (8,6 kWp a Sud 35°, +3,5 % rispetto a PVcalc): una seconda città, più a
Nord e con più luce diffusa di Roma, su cui ripetere tutta la validazione.

| File | Cosa contiene | Byte | SHA-256 |
|---|---|---|---|
| `pvgis-tmy-milano.json` | Anno meteorologico tipo (TMY) | 1 269 321 | `8649623946ba97f11238ad8374438bfa0925f6a44361717d5e2c794a8b929ffa` |
| `pvgis-series-milano-2020-horiz.json` | Anno 2020 ora per ora, piano **orizzontale** | 967 555 | `19d536f9e5d88a0fa165895a1181e6adfe7f22aab75de93f80719bb76ab74e91` |
| `pvgis-series-milano-2020-s35.json` | Anno 2020 ora per ora, **Sud 35°**, 1 kWp, perdite 14 % | 1 059 574 | `9e946a14e6a3e9c38f0f5df300dbb0abd587204a81ee969f61de793e26668e29` |
| `pvgis-pvcalc-milano-s35.json` | PVcalc, media 2005-2023, **8,6 kWp**, Sud 35°, **perdite 0** (l'impianto dell'issue) | 5 239 | `6ff14ac3634607cb1fafefa337d72185c8f717be432cbff87043d89305805e74` |
| `pvgis-mrcalc-milano-s35.json` | MRcalc 2005-2023, orizzontale e Sud 35° | 14 290 | `a945111de3045d7f6f548c74ec8224d8ea3719447f58476671903619bcb473ec` |

```bash
B="https://re.jrc.ec.europa.eu/api/v5_3"; L="lat=45.4642&lon=9.19"; UA="irradia-dev-proxy"
curl -sS -f -A $UA -o pvgis-tmy-milano.json "$B/tmy?$L&outputformat=json"
curl -sS -f -A $UA -o pvgis-series-milano-2020-horiz.json \
  "$B/seriescalc?$L&startyear=2020&endyear=2020&usehorizon=0&angle=0&aspect=0&components=1&outputformat=json"
curl -sS -f -A $UA -o pvgis-series-milano-2020-s35.json \
  "$B/seriescalc?$L&startyear=2020&endyear=2020&usehorizon=0&pvcalculation=1&peakpower=1&loss=14&angle=35&aspect=0&components=1&outputformat=json"
curl -sS -f -A $UA -o pvgis-pvcalc-milano-s35.json \
  "$B/PVcalc?$L&usehorizon=0&peakpower=8.6&loss=0&angle=35&aspect=0&outputformat=json"
curl -sS -f -A $UA -o pvgis-mrcalc-milano-s35.json \
  "$B/MRcalc?$L&horirrad=1&selectrad=1&angle=35&usehorizon=0&startyear=2005&endyear=2023&outputformat=json"
```

**User-Agent:** dall'8/11/2026 il firewall di PVGIS può rispondere a curl con una pagina
HTML "Request Rejected" **con codice 200** (quindi `-f` non la ferma): per questo i comandi
usano `-A irradia-dev-proxy`, come il proxy di Vite. Dopo lo scaricamento controllare che il
file sia JSON e che l'hash coincida. Richieste troppo ravvicinate possono ricevere una
risposta vuota: basta riprovare dopo qualche secondo.

Se riscaricandoli il contenuto è diverso, il JRC ha aggiornato le banche dati: vanno
rimisurati i valori attesi in `simulate.test.ts` (compreso il valore di non regressione).
