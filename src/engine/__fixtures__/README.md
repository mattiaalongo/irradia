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
curl -sS -f -A irradia-dev-proxy -o pvgis-tmy-roma.json \
  "https://re.jrc.ec.europa.eu/api/v5_3/tmy?lat=41.9028&lon=12.4964&usehorizon=1&outputformat=json"
```

Il file fu scaricato il 7/11/2026 **senza** il parametro `usehorizon` (PVGIS usa allora il suo
valore predefinito, 1 = con le ombre del terreno). Dal 10/11/2026 l'app chiede `usehorizon=1`
esplicitamente (issue #25): **verificato il 10/11/2026, stesso hash** (la risposta non contiene
l'indirizzo della richiesta). Il comando qui sopra è quello dell'app.

**Ombre del terreno a Roma** (misurato il 10/11/2026 confrontando questo file con la stessa
richiesta con `usehorizon=0`): PVGIS azzera la DNI in **66 ore**, tutte al tramonto (sole
verso 233-297° da Nord, alto al più 4,2°): diretta annua −0,70 %; energia con il nostro motore
−0,07 % a Sud 35°, −0,70 % a Ovest 35°, 0,00 % a Est 20°. Per questo i test di Roma che
confrontano questo anno tipo (con orizzonte) con MRcalc e PVcalc scaricati con `usehorizon=0`
hanno uno **scarto noto di circa −0,07 %** sul piano Sud 35°, molto dentro le loro tolleranze
(±0,5-1,5 %): non è un errore del motore e i file non vanno riscaricati.

Se riscaricandolo oggi il file è diverso, è probabile che il JRC abbia aggiornato le
banche dati: in quel caso vanno aggiornati anche i valori attesi in `pvgisTmy.test.ts`.

Il file è segnato in `.gitattributes` come generato, così GitHub non ne mostra il contenuto
nelle differenze delle Pull Request.

## File per la validazione del modello di produzione (fase 3)

Scaricati l'**8/11/2026**, Roma centro (lat 41,9028 — lon 12,4964), banche dati
PVGIS-SARAH3 ed ERA5, **senza ombre dell'orizzonte** (`usehorizon=0`). Le serie orarie
(`seriescalc`) danno da sole sia gli ingressi (piano orizzontale) sia i risultati attesi (piano
inclinato), quindi il confronto ora per ora è coerente comunque. PVcalc invece si confronta con
l'anno tipo, che ha le ombre del terreno: a Roma lo scarto che ne viene è noto e piccolo
(−0,07 %, vedi sopra).

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
curl -sS -f -A $UA -o pvgis-tmy-milano.json "$B/tmy?$L&usehorizon=1&outputformat=json"
curl -sS -f -A $UA -o pvgis-series-milano-2020-horiz.json \
  "$B/seriescalc?$L&startyear=2020&endyear=2020&usehorizon=0&angle=0&aspect=0&components=1&outputformat=json"
curl -sS -f -A $UA -o pvgis-series-milano-2020-s35.json \
  "$B/seriescalc?$L&startyear=2020&endyear=2020&usehorizon=0&pvcalculation=1&peakpower=1&loss=14&angle=35&aspect=0&components=1&outputformat=json"
curl -sS -f -A $UA -o pvgis-pvcalc-milano-s35.json \
  "$B/PVcalc?$L&usehorizon=0&peakpower=8.6&loss=0&angle=35&aspect=0&outputformat=json"
curl -sS -f -A $UA -o pvgis-mrcalc-milano-s35.json \
  "$B/MRcalc?$L&horirrad=1&selectrad=1&angle=35&usehorizon=0&startyear=2005&endyear=2023&outputformat=json"
```

Il TMY di Milano fu scaricato senza `usehorizon` (valore predefinito di PVGIS: 1); con
`usehorizon=1`, il comando qui sopra, **verificato il 10/11/2026: stesso hash**. A Milano
l'orizzonte non toglie nessuna ora (con `usehorizon=0` le righe orarie sono identiche).

**User-Agent:** dall'8/11/2026 il firewall di PVGIS può rispondere a curl con una pagina
HTML "Request Rejected" **con codice 200** (quindi `-f` non la ferma): per questo i comandi
usano `-A irradia-dev-proxy`, come il proxy di Vite. Dopo lo scaricamento controllare che il
file sia JSON e che l'hash coincida. Richieste troppo ravvicinate possono ricevere una
risposta vuota: basta riprovare dopo qualche secondo.

Se riscaricandoli il contenuto è diverso, il JRC ha aggiornato le banche dati: vanno
rimisurati i valori attesi in `simulate.test.ts` (compreso il valore di non regressione).

## Livorno (issue #28)

Anno meteorologico tipo (TMY) di PVGIS 5.3 per **Livorno centro**: è un punto in cui PVGIS dà
un vento `WS10m` **negativo** in 2 ore (1/8/2020 alle 6 e alle 7 UTC, indici 5094 e 5095:
−0,25 e −0,52 m/s), subito dopo un cambio di mese. Serve a verificare che il parser porti
quelle ore a 0 m/s e le registri in `windSpeedClamped` (spiegazione in `pvgisTmy.ts`).
Usato in `pvgisTmy.test.ts` e per un valore di non regressione in `simulate.test.ts`.

| | |
|---|---|
| Scaricato il | 10/11/2026 (due volte, dal tech-lead e dal SWD: stesso hash) |
| Posizione | lat 43,5485 — lon 10,3106 (centro città) |
| Banche dati | PVGIS-SARAH3 (radiazione), ERA5 (meteo), anni 2005–2023; orizzonte predefinito di PVGIS |
| Dimensione | 1 269 736 byte |
| SHA-256 | `ebd4388f927ddb8c6b6f3e5a96517d2b0c1d8e6595d6e269f4ef707c76cd4ba1` |

```bash
curl -sS -A irradia-dev-proxy -o pvgis-tmy-livorno.json \
  "https://re.jrc.ec.europa.eu/api/v5_3/tmy?lat=43.5485&lon=10.3106&usehorizon=1&outputformat=json"
```

Scaricato senza `usehorizon` (valore predefinito: 1); con `usehorizon=1` **verificato il
10/11/2026: stesso hash**. Anche a Livorno l'orizzonte non toglie nessuna ora.

Come per gli altri file: controllare che sia JSON e che l'hash coincida. Se cambia, il JRC ha
aggiornato le banche dati: vanno rimisurati le ore negative attese in `pvgisTmy.test.ts` e il
valore di non regressione di Livorno in `simulate.test.ts`.

## Risposte di errore di PVGIS (issue #11)

Corpi delle risposte con cui PVGIS 5.3 (strumento "tmy") rifiuta un punto. Servono a verificare
che `fetchPvgisTmy` riconosca il **punto in mare** e il **punto fuori copertura**
(`PvgisError.kind`, frasi `PVGIS_SEA_PHRASE` e `PVGIS_COVERAGE_PHRASE` in `pvgisTmy.ts`).
Usati in `pvgisTmy.test.ts`, serviti da una finta `fetch` con lo stesso codice HTTP.

Scaricati il **10/11/2026** due volte (dal tech-lead e dal SWD: stessi byte e stesso hash).
Entrambe le risposte: **HTTP 400**, `Content-Type: application/json`, nessun a capo finale.

| File | Posizione | Testo di PVGIS (`message`) | Byte | SHA-256 |
|---|---|---|---|---|
| `pvgis-error-sea.json` | lat 36 — lon −20 (Oceano Atlantico, mare aperto) | "Location over the sea. Please, select another location" | 82 | `4006ef4198934c03060a21eb9831b2faedb0e47aac5225cb7e1eb3750f7fc12a` |
| `pvgis-error-coverage.json` | lat 70,98 — lon −8,5 (Jan Mayen, terra fuori copertura) | "Location out of the spatial coverage of PVGIS5" | 74 | `bd35ca15f5e9cbbbbe2aaf97bd7e370abb62b6e534d4a220062c6cbbd91d7993` |

```bash
B="https://re.jrc.ec.europa.eu/api/v5_3"
curl -sS -A irradia-dev-proxy -w '%{http_code} %{content_type}\n' -o pvgis-error-sea.json \
  "$B/tmy?lat=36&lon=-20&outputformat=json"
curl -sS -A irradia-dev-proxy -w '%{http_code} %{content_type}\n' -o pvgis-error-coverage.json \
  "$B/tmy?lat=70.98&lon=-8.5&outputformat=json"
```

**Senza `-f`**: con `-f` curl non salverebbe il corpo di una risposta 400, che è proprio ciò che
serve. Il comando stampa codice e tipo: devono essere `400 application/json`.

Nota: PVGIS dà il testo "over the sea" anche per terre emerse fuori dalla sua zona (es.
Svalbard), quindi l'interfaccia non può distinguerle dal mare. Se il JRC cambia questi testi,
l'errore diventa `rejected` (messaggio generico): riscaricare i file e aggiornare le frasi.

## Aosta: ombre del terreno (issue #25)

Aosta è, tra le città provate, quella in cui le montagne attorno tolgono più luce diretta.
Questi file servono a verificare che le ombre del terreno contenute nell'anno tipo di PVGIS
(che l'app chiede con `usehorizon=1`) siano coerenti con il **profilo dell'orizzonte** di PVGIS
e con l'**irradiazione mensile reale** con e senza orizzonte. Usati in `pvgisTmy.test.ts`,
`pvgisHorizon.test.ts` e `simulate.test.ts` (blocco "orizzonte del terreno (Aosta)").

Scaricati il **10/11/2026** dal tech-lead; l'11/11/2026 il SWD ha riscaricato il TMY con
orizzonte e il profilo: **stesso hash** (e lo stesso per il TMY di Roma con `usehorizon=1`).
Posizione: lat 45,737 — lon 7,3201 (centro città), quota 584 m; banche dati PVGIS-SARAH3
(radiazione) ed ERA5 (meteo), anni 2005-2023. Mesi dell'anno tipo: 1/2008, 2/2009, 3/2011,
4/2008, 5/2009, 6/2007, 7/2009, 8/2010, 9/2009, 10/2007, 11/2011, 12/2016 (uguali con e senza
orizzonte).

| File | Cosa contiene | Byte | SHA-256 |
|---|---|---|---|
| `pvgis-tmy-aosta.json` | Anno tipo **con** ombre del terreno (`usehorizon=1`, `use_horizon: true`) | 1 261 729 | `6ed5854c7afb65f308a0a73e14c6bbb64c5fc7f857f6ad84041029e49b3a0910` |
| `pvgis-tmy-aosta-nohorizon.json` | Stesso anno tipo **senza** ombre (`usehorizon=0`, `use_horizon: false`) | 1 263 316 | `7b9a5f151c0b9672e9493d2312bdb26d71b016524e28c43cbbe1a6c0c053ec9b` |
| `pvgis-horizon-aosta.json` | Profilo dell'orizzonte (strumento `printhorizon`): 49 punti ogni 7,5°, altezza in gradi (risoluzione 0,1°), "DEM-calculated" | 5 862 | `6323e73b20287000a912c8c3aaf7d8570d351791a9e0f1972f80ce6fb13bc4f7` |
| `pvgis-mrcalc-aosta-s35.json` | MRcalc 2005-2023, orizzontale e **Sud 35°**, con orizzonte | 14 314 | `c57629fc0c48fd987838e1aa4e024c269648fa9a04eda0da5341074a422de879` |
| `pvgis-mrcalc-aosta-s35-nohorizon.json` | Come sopra, senza orizzonte | 14 310 | `16a5f9361f8ca75c92cb8b9cd9a3a63b00220319f852b61c3d14fce5bfc4de81` |

```bash
B="https://re.jrc.ec.europa.eu/api/v5_3"; L="lat=45.737&lon=7.3201"; UA="irradia-dev-proxy"
curl -sS -f -A $UA -o pvgis-tmy-aosta.json "$B/tmy?$L&usehorizon=1&outputformat=json"
curl -sS -f -A $UA -o pvgis-tmy-aosta-nohorizon.json "$B/tmy?$L&usehorizon=0&outputformat=json"
curl -sS -f -A $UA -o pvgis-horizon-aosta.json "$B/printhorizon?$L&outputformat=json"
curl -sS -f -A $UA -o pvgis-mrcalc-aosta-s35.json \
  "$B/MRcalc?$L&horirrad=1&selectrad=1&angle=35&usehorizon=1&startyear=2005&endyear=2023&outputformat=json"
curl -sS -f -A $UA -o pvgis-mrcalc-aosta-s35-nohorizon.json \
  "$B/MRcalc?$L&horirrad=1&selectrad=1&angle=35&usehorizon=0&startyear=2005&endyear=2023&outputformat=json"
```

Senza `usehorizon` il TMY di Aosta è identico byte per byte a quello con `usehorizon=1`.
Il profilo usa la convenzione di PVGIS per l'azimut (0 = Sud, 90 = Ovest, −90 = Est, come
dichiara il suo `meta`): la conversione nella convenzione del motore è solo in
`pvgisHorizon.ts`, il lettore usato dai test. Profilo ed effemeridi dei solstizi
(`winter_solstice`, `summer_solstice`) non servono all'app: l'app non scarica `printhorizon`,
perché PVGIS applica già l'ombra nell'anno tipo.

Cosa cambia tra i due anni tipo (misurato il 10/11/2026): stessi mesi e stessi istanti;
temperatura, vento, diffusa orizzontale e le altre colonne identiche in tutte le ore; GHI e DNI
cambiano nelle stesse **531 ore**, e lì la DNI con orizzonte è **esattamente 0** (quindi
GHI = DHI). DNI annua −12,65 %, GHI −2,65 %; energia con il nostro motore, 1 kWp a Sud 35°,
perdite 0: −6,45 %.

Se riscaricandoli i file sono diversi, il JRC ha aggiornato le banche dati, il modello del
terreno (DEM) o il calcolo della posizione del sole: vanno rimisurati i valori attesi in
`simulate.test.ts` (compreso il valore di non regressione di Aosta) e in `pvgisHorizon.test.ts`.

### Bolzano e Sondrio: misure una tantum, file non salvati

Decisione del PO dell'11/11/2026 (issue #25, domanda Q3): nei test basta Aosta, la città con
l'effetto più forte (ogni coppia di anni tipo pesa ~2,5 MB). Le stesse misure, fatte dal
tech-lead il 10/11/2026 con gli stessi comandi, su Bolzano (lat 46,4983 — lon 11,3548) e
Sondrio (lat 46,1699 — lon 9,8715), restano qui come prova:

| Misura | Aosta | Bolzano | Sondrio |
|---|---|---|---|
| Ore con la DNI azzerata dall'orizzonte | 531 | 529 | 485 |
| DNI annua, con / senza orizzonte | −12,65 % | −9,55 % | −9,77 % |
| GHI annua, con / senza orizzonte | −2,65 % | −2,19 % | −1,51 % |
| Energia, nostro motore, 1 kWp Sud 35°, perdite 0 | −6,45 % | −5,38 % | −3,99 % |
| Ore classificate male rispetto al profilo (interpolazione lineare, sole a `time` + ritardo) / scarto massimo dal profilo | 5 / 0,11° | 3 / 0,11° | 5 / 0,11° |
| Idem, gradino di 7,5° più vicino invece dell'interpolazione | 22 / 1,91° | 30 / 1,39° | 27 / 0,80° |
| Idem, interpolazione lineare ma **senza** il ritardo di ~10 minuti | 109 / 2,21° | 134 / 2,51° | 93 / 2,31° |
| Rapporto con/senza orizzonte, luce sul piano Sud 35°: nostro motore sull'anno tipo contro MRcalc sullo stesso mese reale (scarto peggiore fra i mesi; anno) | ±0,26 %; −0,01 % | ±0,34 %; +0,001 % | – |
| Rapporto con/senza orizzonte dell'energia contro PVcalc (media 2005-2023): **non** usato come test | −1,55 % | −0,47 % | −0,52 % |

L'ultima riga misura la "fortuna" dei mesi invernali dell'anno tipo (l'ombra delle montagne
conta solo d'inverno), non un errore del motore: per questo la validazione usa MRcalc sullo
stesso mese reale (decisione del PO dell'11/11/2026, domanda Q1).
