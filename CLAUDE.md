# Irradia — istruzioni per Claude

## Cos'è il progetto

App web che aiuta un privato a dimensionare un impianto fotovoltaico sul tetto di casa.
L'utente imposta i parametri (posizione, inclinazione e orientamento dei pannelli,
numero e potenza dei pannelli, perdite) con campi numerici o slider e vede subito
la produzione di energia stimata.

**Principio cardine: calcoli deterministici.** Nessuna intelligenza artificiale né
modello statistico opaco nel calcolo. Ogni risultato deve derivare da formule fisiche
documentate e da dati storici misurati, ed essere riproducibile e verificabile.

## Decisioni prese (con il motivo)

| Decisione | Motivo |
|---|---|
| Solo browser per ora; iPhone/Android in futuro | Partire semplici. React permetterà di riusare il codice per il mobile. |
| Un solo utente (il proprietario), niente login | Gli account arriveranno in futuro. Ora sarebbero complessità inutile. |
| Area: **Italia/Europa** | Il proprietario vuole iniziare da qui. |
| Fonte dati principale: **PVGIS** (JRC, Commissione Europea) | La più accurata in Europa, gratuita, senza chiave. È anche il riferimento per validare i nostri risultati. |
| In futuro: **interruttore manuale** per passare a **NASA POWER** se la casa è fuori dall'Europa | Copertura mondiale. L'utente lo attiva a mano, non automaticamente. |
| Risultati: **solo energia prodotta** (kWh) per ora | La parte economica (costi, risparmio, rientro) è rimandata. |
| TypeScript (versione 6.0, non la 7) | typescript-eslint supporta al massimo TS < 6.1. |
| React + Vite, test con Vitest | Ecosistema più diffuso. Vitest si integra con Vite. |
| Dal TMY leggiamo GHI, DNI, DHI, temperatura **e vento a 10 m** | Il modello termico delle celle di PVGIS (Faiman) usa il vento: serve in fase 3 per validare. |
| `fetchPvgisTmy` riceve l'indirizzo di base (`baseUrl`) come parametro | Il motore non deve sapere se dietro c'è il proxy di Vite o una funzione serverless. |
| Lettura (`parsePvgisTmy`, pura) separata dallo scaricamento (`fetchPvgisTmy`) | Tutta la logica si testa senza rete. |
| `TmyHour.time` è l'istante UTC **reale** (anno da cui PVGIS ha preso quel mese) | È il dato originale; nessun anno fittizio inventato. |
| Unità nel nome dei campi (`ghiWm2`, `airTemperatureC`, …) e verificate sul `meta` di PVGIS | Impossibile confonderle; se PVGIS le cambia, la lettura fallisce invece di sbagliare. |
| Versione API PVGIS `v5_3` fissata in `engine/pvgisTmy.ts` | Il parser è verificato su quel formato. |
| Test su risposte PVGIS reali salvate in `engine/__fixtures__/` (Roma centro) | Deterministici e senza rete. Coordinate di una città, non di casa del proprietario. |
| Modello di produzione = quello di PVGIS 5.3: diffusa di **Muneer** (forma r.sun), albedo 0,2, riflessione sul vetro **Martin-Ruiz** (a_r 0,16), temperatura **Faiman** (U0 26,9, U1 6,2, moduli liberi c-Si), potenza **Huld 2011** (coefficienti "pvgis5") | Con lo stesso modello il confronto con PVGIS misura i nostri errori, non la differenza tra modelli. |
| Faiman riceve l'irradianza sul piano **prima** delle perdite del vetro | È la definizione originale (piranometro sul piano) e riproduce meglio PVGIS. |
| Diffusa: **niente** formula speciale di r.sun per sole < 5,7°; sin h limitato a sin 1° | Misurato: PVGIS 5.3 non la applica (con essa ~10 W/m² di scarto). Limite come in pvlib (haydavies). |
| Riflessa: modello isotropo con GHI anche quando il sole è dietro il pannello | Fisicamente corretto. PVGIS in quel caso usa solo la diffusa: +1,7 % di riflessa per un pannello a Est (≈ 0,2 kWh/m² l'anno). |
| **Nessun effetto spettrale** e **nessuna ombra dell'orizzonte** (per ora) | Lo spettrale di PVGIS non è riproducibile in modo verificabile (±1 %). Le ombre arriveranno con la mappa. |
| Validazione su due livelli: ora per ora contro `seriescalc` 2020 (somme ±0,2-1 %), anno tipo contro `PVcalc` (annuo ±2 %, mesi entro 2 deviazioni standard di PVGIS) | Il primo isola ogni formula; il secondo è il risultato che vede l'utente. L'anno tipo non è la media 2005-2023, quindi i mesi possono differire anche del 13 %. |
| Mesi aggregati sul mese UTC di `TmyHour.time` | Il TMY è composto per mesi UTC: così ogni ora resta nel mese da cui proviene. |
| Fase 4: mostrare **totale annuo + grafico a barre dei 12 mesi** (il motore calcola anche le 8760 ore, per ora non mostrate) | Scelta del proprietario (8/11/2026, domanda sulla PR #3): basta per dimensionare e fa vedere la differenza estate/inverno senza complicare la pagina. |
| Grafico in **SVG scritto a mano** (`ui/MonthlyChart.tsx`), niente librerie di grafici | 12 barre sono un disegno semplice: zero dipendenze, testi in italiano e tema chiaro/scuro sotto controllo, si testa senza browser. Scartate Recharts (~100 kB, da personalizzare comunque), Chart.js (canvas, meno accessibile), D3/visx (sovradimensionati). Da rivalutare se i grafici diventano molti o interattivi. |
| Regole del grafico dalla guida *dataviz*: barre ≤ 24 px con cima arrotondata, valori scritti solo sul mese massimo e minimo, valore di ogni mese al passaggio del mouse/Tab, **tabella dei valori** sempre disponibile | Il colore delle barre sul fondo chiaro ha contrasto 2,7:1 (< 3:1): la tabella garantisce che i valori siano leggibili comunque. Colore del tema scuro (`#c4810f`) scelto col validatore della guida. |
| Download PVGIS **automatico dopo 0,8 s** dall'ultima modifica della posizione; la richiesta superata viene annullata | Scelta del proprietario (8/11/2026). Scrivendo una coordinata cifra per cifra parte una sola richiesta. |
| Lo stato è diviso: **posizione** → `useTmy` (unico motivo di download); **impianto** → solo `simulateYear` (~15 ms, locale) | I parametri dei pannelli non possono provocare download. Scartati: Web Worker (inutile per 15 ms) e lo sfruttare la proporzionalità a kWp/perdite (errore silenzioso se un giorno il modello cambia). |
| Memoria dei download **in RAM** (`ui/tmyLoader.ts`), chiave = coordinate arrotondate a 4 decimali (≈ 11 m); si salva la richiesta in corso, non solo il risultato | Tornando a una posizione già vista non si riscarica nulla; due richieste uguali ravvicinate ne fanno una. Niente localStorage: un TMY pesa 1-2 MB, il limite è ~5 MB. |
| Orientamento nell'interfaccia = **azimut 0-359° da Nord** (convenzione del motore) con il punto cardinale scritto accanto | Scelta del proprietario (8/11/2026): nessuna conversione, nessun rischio di errori di segno. |
| Slider di latitudine 34-72° e longitudine −25-45° (Europa); i campi accettano lo stesso intervallo | Area di lavoro del progetto. Con la mappa (fase 5) la posizione si sceglierà cliccando. |
| Numeri sempre con separatore delle migliaia ("6.498"), anche a 4 cifre | Per default l'italiano scrive "6498" ma "11.077": incoerente sulla stessa pagina. Per questo `tsconfig.app.json` include `ES2023.Intl` (solo tipi). |

**Verificato (7/11/2026): PVGIS non invia header CORS**, quindi il browser non può
leggere direttamente le sue risposte. Serve un piccolo intermediario lato server
(es. funzione serverless sull'hosting; in sviluppo basta il proxy di Vite).
Endpoint dell'anno tipo: `https://re.jrc.ec.europa.eu/api/v5_3/tmy?lat=..&lon=..&outputformat=json`.
In sviluppo il proxy di Vite (`vite.config.ts`) inoltra `/api/pvgis/...` a
`https://re.jrc.ec.europa.eu/api/...`: usare `baseUrl: '/api/pvgis'`.

**Firewall di PVGIS (verificato 8/11/2026, sul PC del proprietario):** se l'intermediario
inoltra lo User-Agent del browser (es. Chrome), PVGIS risponde con una pagina HTML
"Request Rejected" **con codice 200**. Il proxy di Vite si presenta quindi come
`irradia-dev-proxy`. Lo stesso dovrà fare l'intermediario di produzione (fase 6).
I test del parser non lo rilevano perché usano risposte salvate: va provato nel browser.

**Altezza del sole di PVGIS (verificato 8/11/2026):** il campo `H_sun` delle serie di PVGIS
differisce dal nostro calcolo NOAA fino a 0,4° anche col sole alto: è un'approssimazione
di PVGIS. Spiega buona parte degli scarti orari della diretta col sole basso.

**Orari di PVGIS (verificato 7/11/2026):** `time(UTC)` è l'inizio dell'ora in UTC; le
irradianze si riferiscono a `time + irradiance_time_offset` (≈ 10 minuti, campo
`Tmy.irradianceTimeOffsetH`). Per la posizione del sole di un'ora va usato quell'istante:
con il ritardo GHI = DNI·cos z + DHI torna ora per ora entro lo 0,11 %, senza sale al 2 %.

L'ambiente cloud `irradia` consente l'accesso a `re.jrc.ec.europa.eu` e installa
le dipendenze all'avvio. Le sessioni di questo progetto vanno avviate su quell'ambiente.

## Architettura

```
src/
  engine/      Motore di calcolo: TypeScript puro, nessuna dipendenza da React o dal DOM.
               Ogni modulo ha il suo file *.test.ts accanto.
    irradiance.ts  Trasposizione: luce diretta, diffusa e riflessa sul piano dei pannelli.
    pvModule.ts    Riflessione sul vetro, temperatura e rendimento dei moduli.
    simulate.ts    Simulazione oraria e kWh mensili/annuali (`simulateHour`, `simulateYear`).
    __fixtures__/  Risposte reali di PVGIS usate dai test (origine e hash nel README.md)
                   e `pvgisSeries.ts`, lettore delle serie orarie usato solo dai test.
  ui/          Pezzi dell'interfaccia (React) e loro logica pura, con i test accanto.
    config.ts      Indirizzo di PVGIS visto dal browser e attesa prima del download.
    tmyLoader.ts   Memoria dei download dell'anno tipo (TypeScript puro).
    useTmy.ts      Hook React: anno tipo per una posizione (attesa, annullamento, stato).
    NumberSlider.tsx  Campo numerico + slider collegati; `parseInput.ts` controlla il testo.
    MonthlyChart.tsx  Grafico a barre dei 12 mesi in SVG; `chartScale.ts` sceglie le tacche.
    format.ts      Numeri in italiano, nomi dei mesi, punti cardinali.
  App.tsx      Pagina principale: parametri a sinistra, totale annuo e grafico a destra.
```

Il motore deve restare **separato** dall'interfaccia: così si testa da solo e
si riuserà identico nell'app mobile.

### Catena di calcolo prevista

1. Posizione del sole (`engine/solarPosition.ts`, algoritmo NOAA/Meeus) — **fatto**
2. Dati di irraggiamento orari di un anno tipo (TMY) da PVGIS: GHI, DNI, DHI, temperatura,
   vento (`engine/pvgisTmy.ts`) — **fatto**
3. Trasposizione sul piano dei pannelli (`engine/irradiance.ts`) — **fatto**
4. Potenza DC con perdite per temperatura delle celle, poi perdite di sistema
   (`engine/pvModule.ts`, `engine/simulate.ts`) — **fatto**
5. Aggregazione: kWh mensili e annuali (`engine/simulate.ts`) — **fatto**
6. Validazione contro PVGIS (`engine/simulate.test.ts`) — **fatto**

## Convenzioni del motore (OBBLIGATORIE)

- Angoli in **gradi** in tutte le funzioni pubbliche; i radianti solo all'interno.
- Latitudine positiva a **Nord**, longitudine positiva a **Est**.
- Azimut misurato **da Nord in senso orario**: 0 = N, 90 = E, 180 = S, 270 = O.
  ⚠️ PVGIS usa una convenzione diversa per l'orientamento dei pannelli ("aspect":
  0 = Sud, −90 = Est, +90 = Ovest). Converti **solo** nel modulo che parla con PVGIS.
- Gli istanti sono `Date` (momenti assoluti in UTC). Il fuso orario locale serve
  solo per mostrare i valori all'utente.
- Ogni costante e ogni formula deve citare la fonte in un commento.
- Ogni funzione del motore ha test con **valori di riferimento pubblicati**
  (es. NREL, NOAA, PVGIS), indicando la fonte nel test. Tolleranze esplicite e motivate.

## Comandi

```bash
npm install        # installa le dipendenze
npm run dev        # avvia l'app in sviluppo (http://localhost:5173)
npm test           # esegue tutti i test una volta
npm run test:watch # riesegue i test a ogni modifica
npm run lint       # controllo stilistico
npm run build      # controllo dei tipi + build di produzione in dist/
```

Prima di ogni commit: `npm test`, `npm run lint` e `npm run build` devono passare.

## Come lavorare con il proprietario del progetto

- Scrivi **in italiano** (codice e identificatori in inglese, commenti e testi in italiano).
- Per ogni azione proposta o eseguita **spiega il motivo** della scelta e le alternative
  scartate. Non dare nulla per scontato.
- Le formule si possono mostrare; i concetti di sviluppo software vanno spiegati in modo
  semplice. (Il profilo personale del PO non sta nel repository: lo trovi nelle preferenze del suo
  account, che le sessioni ricevono da sole.)
- **Descrizioni delle Pull Request ad alto livello**, senza dettagli tecnici (li chiede
  lui se servono). Sezioni: *Cosa è stato fatto*, *Perché serviva*, *Rischi*,
  *A cosa prestare attenzione*, *Prossimi passi*.
- Lavora su un **ramo separato** per ogni obiettivo. Non scrivere direttamente su `main`.
- Una sessione = un obiettivo. A fine sessione aggiorna questo file se sono state
  prese nuove decisioni.
- **Passaggio allo step successivo** (regola del 8/11/2026): alla fine di ogni sessione,
  quando la PR è stata unita, chiedi al proprietario se vuole passare allo step successivo.
  Se risponde sì, apri tu una nuova sessione cloud sull'ambiente **"irradia"** (id con
  `list_environments`, poi `create_session` con il repository) con il primo messaggio già
  inviato, scritto nello stesso stile di quello con cui è iniziata la fase 4: obiettivo
  dello step, cosa è già fatto, decisioni già prese da rispettare, le domande a cui il piano
  deve rispondere prima di scrivere codice, "lavora su un ramo nuovo e alla fine apri una
  Pull Request".

## Avvisi noti

- `npm audit` segnala vulnerabilità **moderate** in `minimatch`, usata solo da ESLint
  (strumento di sviluppo: non finisce nell'app pubblicata). La correzione proposta
  da npm farebbe tornare indietro di versione ESLint. Ricontrolla quando aggiorni
  le dipendenze.
