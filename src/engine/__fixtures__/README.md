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
