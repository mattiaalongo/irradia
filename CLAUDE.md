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
| Test su risposte PVGIS reali salvate in `engine/__fixtures__/` (Roma centro e Milano; Livorno centro per il vento negativo, #28; Aosta per le ombre del terreno, #25) | Deterministici e senza rete. Coordinate di una città, non di casa del proprietario. |
| Modello di produzione = quello di PVGIS 5.3: diffusa di **Muneer** (forma r.sun), albedo 0,2, riflessione sul vetro **Martin-Ruiz** (a_r 0,16), temperatura **Faiman** (U0 26,9, U1 6,2, moduli liberi c-Si), potenza **Huld 2011** (coefficienti "pvgis5") | Con lo stesso modello il confronto con PVGIS misura i nostri errori, non la differenza tra modelli. |
| Faiman riceve l'irradianza sul piano **prima** delle perdite del vetro | È la definizione originale (piranometro sul piano) e riproduce meglio PVGIS. |
| Diffusa: **niente** formula speciale di r.sun per sole < 5,7°; sin h limitato a sin 1° | Misurato: PVGIS 5.3 non la applica (con essa ~10 W/m² di scarto). Limite come in pvlib (haydavies). |
| Riflessa: modello isotropo con GHI anche quando il sole è dietro il pannello | Fisicamente corretto. PVGIS in quel caso usa solo la diffusa: +1,7 % di riflessa per un pannello a Est (≈ 0,2 kWh/m² l'anno). |
| **Nessun effetto spettrale** e **nessuna ombra di ostacoli vicini** (edifici, alberi, `userhorizon`: servirà una decisione del PO a parte) | Lo spettrale di PVGIS non è riproducibile in modo verificabile (±1 %). |
| **Ombre del terreno incluse**: `pvgisTmyUrl` chiede `usehorizon=1` e l'anno tipo arriva da PVGIS con la luce diretta già a 0 quando il sole è dietro il profilo del terreno (modello digitale del terreno di PVGIS); il motore non conosce il profilo. `Tmy.usesHorizon` legge `use_horizon` della risposta (booleano obbligatorio, altrimenti `invalidData`); se è `false` il calcolo prosegue e la nota sotto i risultati (`ui/sourceNote.ts`) dice che nessuna ombra è considerata. Decisioni del PO del 9 e dell'11/11/2026 (issue #25) | Più vicino alla realtà e stesso valore predefinito del sito PVGIS. Misurato il 10/11/2026: con `usehorizon=1` le risposte di Roma, Milano e Livorno sono **identiche byte per byte** ai fixture (nessun fixture riscaricato). Nelle ore in ombra PVGIS mette DNI = 0 e GHI = DHI, il resto non cambia. Effetto sull'energia (1 kWp, Sud 35°): Aosta −6,45 % (531 ore), Bolzano −5,4 %, Sondrio −4,0 %, **Roma −0,07 %** (66 ore al tramonto, orizzonte a Ovest; Ovest 35°: −0,70 %), Milano e Livorno 0. Il profilo (`printhorizon`) si legge **solo nei test** (`__fixtures__/pvgisHorizon.ts`): in produzione costerebbe una seconda richiesta e peso, per un dato che nessuno mostra; si sposterà in `engine/` se #26 o gli ostacoli vicini lo richiederanno. |
| Validazione su **due località** (Roma, Milano) e tre livelli: ora per ora contro `seriescalc` 2020 (somme: diretta ±0,3 %, diffusa ±0,2 %, riflessa ±0,2-0,3 %, energia ±1 %); ogni mese dell'anno tipo contro **lo stesso mese reale** di `MRcalc` (H(i) ±1 %, GHI ±0,5 %, somma annua ±0,5 %); conversione luce → energia contro `PVcalc` (E/H(i) ±1,5 %; energia corretta per la luce dell'anno tipo: anno ±1,5 %, mesi ±4 %). Più due valori di non regressione (Milano 8,6 kWp, Sud 35°, perdite 0: 14.122 ± 1 kWh; Livorno 1 kWp, Sud 35°, perdite 0: 1669,197 ± 0,01 kWh, #28). Gli anni tipo hanno l'orizzonte, le serie, MRcalc e PVcalc di Roma e Milano no: a Roma scarto noto di −0,07 % (Sud 35°), dentro le tolleranze | L'anno tipo non è la media 2005-2023: confrontarlo direttamente con PVcalc mescola la "fortuna" dei 12 mesi scelti con gli errori del motore (a Milano +3,5 % di energia e settembre a 2,03 deviazioni standard con il motore corretto). MRcalc misura quella fortuna da sola, quindi nessun test può fallire per essa. Tolto il controllo "mesi entro 2 deviazioni standard" (issue #10). |
| Validazione delle ombre del terreno su **Aosta** (#25), anno tipo con e senza orizzonte: (1) cambiano solo GHI e DNI, nelle stesse 531 ore, con DNI = 0 e GHI = DHI; (2) le ore in ombra coincidono con il profilo `printhorizon` (sole all'istante `time + irradiance_time_offset`, profilo interpolato linearmente): ogni ora a più di **0,25°** dal profilo è classificata come PVGIS, al massimo 1 ora di confine al giorno (misurate 5, entro 0,11°); un test controlla che togliendo il ritardo, usando i gradini di 7,5° o scambiando Est e Ovest la prova fallisca; (3) rapporto con/senza orizzonte della luce sul piano (Sud 35°) contro **lo stesso mese reale** di `MRcalc` con `usehorizon` 1/0: mesi ±0,5 %, anno ±0,1 % (misurati +0,26 % e −0,015 %); (4) non regressione 1 kWp, Sud 35°, perdite 0: 1524,29 ± 0,01 kWh. Una sola città di montagna nei fixture; le misure di Bolzano e Sondrio sono nel README dei fixture. Decisione del PO dell'11/11/2026 | Il rapporto con/senza contro **PVcalc** (±1 % nell'issue) è scartato: ad Aosta differisce dell'1,55 % (d'inverno fino al 7,5 %) per la "fortuna" dei mesi scelti, come nel #10, non per un errore. La tolleranza di 0,25° = arrotondamento del profilo (±0,05°) + differenza fra il nostro sole e quello di PVGIS (≤ 0,11° misurati), con margine. Se i test falliscono dopo un riscaricamento, può essere cambiato il modello del terreno o l'algoritmo del sole di PVGIS. |
| Milano (45,4642 N, 9,19 E), Sud 35°: +3,5 % di energia rispetto a PVcalc **non è un errore** (issue #10, verificato 8/11/2026) | L'anno tipo ha il 3,9-4,0 % di luce sul piano in più della media 2005-2023. Orizzonte nullo (PVGIS dà lo stesso E_y con e senza). Conversione E/H(i) −0,5 % rispetto a PVGIS: effetto spettrale non modellato (PVGIS l_spec +1,16 %). Ora per ora contro `seriescalc` 2020: energia +0,42 %. |
| **Vento negativo di PVGIS portato a 0 m/s solo nelle 16 ore attorno a ogni cambio di mese** (ultime 8 di un mese e prime 8 del successivo, compreso 31/12 → 1/1; finestra calcolata sul calendario non bisestile del TMY), ore corrette registrate in `Tmy.windSpeedClamped`; fuori finestra un negativo resta `PvgisError`. Solo in `engine/pvgisTmy.ts`: la protezione v ≥ 0 di `faimanModuleTemperature` resta. Nessun avviso nell'interfaccia. Piano approvato dal PO il 10/11/2026 (issue #28) | Verificato il 10/11/2026 su 20 punti: 8 rifiutati (fino a −2,35 m/s, anche nell'entroterra), **tutti** entro 8 h da un cambio di mese. Inferenza dai dati (nessuna fonte JRC/ERA5 trovata): la rampa lineare con cui PVGIS raccorda mesi di anni diversi (EN ISO 15927-4) a volte attraversa lo zero. 0 = limite fisico (calma) e scelta prudente; effetto sull'energia ≤ 2 ppm (Livorno 0,0035 kWh/kWp l'anno). Scartati: correggere sempre (nasconderebbe un cambio di formato, es. "-999"), rifiutare (40 % dei punti inutilizzabili), soglia fissa, valore assoluto o copia dell'ora vicina (nessuna base fisica). **Rischio residuo:** la stessa rampa altera in modo non rilevabile anche valori positivi di vento e `T2m` (~190 ore l'anno); è coerente con l'uso del TMY così com'è. Non segnalato al JRC per ora. |
| Mesi aggregati sul mese UTC di `TmyHour.time` | Il TMY è composto per mesi UTC: così ogni ora resta nel mese da cui proviene. |
| Fase 4: mostrare **totale annuo + grafico a barre dei 12 mesi** (il motore calcola anche le 8760 ore, per ora non mostrate) | Scelta del proprietario (8/11/2026, domanda sulla PR #3): basta per dimensionare e fa vedere la differenza estate/inverno senza complicare la pagina. |
| Grafico in **SVG scritto a mano** (`ui/MonthlyChart.tsx`), niente librerie di grafici | 12 barre sono un disegno semplice: zero dipendenze, testi in italiano e tema chiaro/scuro sotto controllo, si testa senza browser. Scartate Recharts (~100 kB, da personalizzare comunque), Chart.js (canvas, meno accessibile), D3/visx (sovradimensionati). Da rivalutare se i grafici diventano molti o interattivi. |
| Regole del grafico dalla guida *dataviz*: barre ≤ 24 px con cima arrotondata, valori scritti solo sul mese massimo e minimo, valore di ogni mese al passaggio del mouse/Tab, **tabella dei valori** sempre disponibile, **anello di focus da tastiera** (#20: un `<rect class="chart-focus">` per mese, senza riempimento, tratto 2 px `non-scaling-stroke` colore `--focus-ring` = `--fg`, solo con `:focus-visible`, attorno all'intera fascia del mese senza toccare la barra; `CanvasText` in `forced-colors`; la stessa variabile vale per `.map-toggle`, `.map`, `.reload-button` e i pulsanti di zoom) | Il colore delle barre sul fondo chiaro ha contrasto 2,7:1 (< 3:1): la tabella garantisce che i valori siano leggibili comunque. Colore del tema scuro (`#c4810f`) scelto col validatore della guida. Anello in `--fg` (16,15:1 chiaro, 14,99:1 scuro; WCAG 1.4.11 chiede ≥ 3:1), **non** `--accent` (2,65:1 in chiaro) e non sulla barra (`--fg` sulla barra scura: 2,73:1): resta ≈ 9 unità SVG libere per lato. Prima c'era un tratto di 1 px quasi invisibile. |
| Download PVGIS **automatico dopo 0,8 s** dall'ultima modifica della posizione; la richiesta superata viene annullata | Scelta del proprietario (8/11/2026). Scrivendo una coordinata cifra per cifra parte una sola richiesta. |
| Lo stato è diviso: **posizione** → `useTmy` (unico motivo di download); **impianto** → solo `simulateYear` (~15 ms, locale) | I parametri dei pannelli non possono provocare download. Scartati: Web Worker (inutile per 15 ms) e lo sfruttare la proporzionalità a kWp/perdite (errore silenzioso se un giorno il modello cambia). |
| Memoria dei download **in RAM** (`ui/tmyLoader.ts`), chiave = coordinate arrotondate a 4 decimali (≈ 11 m); si salva la richiesta in corso, non solo il risultato | Tornando a una posizione già vista non si riscarica nulla; due richieste uguali ravvicinate ne fanno una. Niente localStorage: un TMY pesa 1-2 MB, il limite è ~5 MB. |
| Orientamento nell'interfaccia = **azimut 0-359° da Nord** (convenzione del motore) con il punto cardinale scritto accanto | Scelta del proprietario (8/11/2026): nessuna conversione, nessun rischio di errori di segno. |
| Area di lavoro latitudine 34-72° e longitudine −25-45° (Europa) per slider, campi e mappa; i limiti stanno **in un solo punto** (`ui/mapArea.ts`, costanti `AREA_*`) | Area di lavoro del progetto. Una sola fonte: slider e mappa non possono divergere. |
| Sotto il totale annuo una **nota fissa** (`ui/AnnualTotal.tsx`): il totale è su un anno tipo di mesi reali 2005-2023, il sito PVGIS (PVcalc) mostra la media di tutti gli anni e le cifre possono differire di qualche punto percentuale. Niente numeri di città; colore secondario (contrasto 5,1:1 chiaro, 6,3:1 scuro) | A Milano anno tipo e PVcalc differiscono del +3,5 % senza errori del motore: senza spiegazione chi confronta app e sito penserebbe a un errore. Decisione del PO dell'8/11/2026 (issue #10). Gli anni sono scritti fissi perché valgono per PVGIS `v5_3`: **se si cambia versione di PVGIS, aggiornare la nota.** |
| Numeri sempre con separatore delle migliaia ("6.498"), anche a 4 cifre | Per default l'italiano scrive "6498" ma "11.077": incoerente sulla stessa pagina. Per questo `tsconfig.app.json` include `ES2023.Intl` (solo tipi). |
| Telefono (< 820 px): **barra fissa in basso con il totale annuo** (`ui/StickyTotal.tsx`, PR #27, issue #12), nascosta ai lettori di schermo (`aria-hidden`); stati: risultato, "Aggiorno…", "Scarico…", "Dati non disponibili", "Dati non aggiornati (errore)" | Chi muove uno slider vede il risultato senza scorrere. Scartati: risultati sopra i campi, sezioni richiudibili, barra in alto. Il totale accessibile resta uno solo: nessun annuncio a ogni passo di slider. |
| Fase 5, mappa: **Leaflet 1.9.4** (BSD-2) usato direttamente in `ui/MapPicker.tsx`, **niente react-leaflet** (decisione del PO del 9/11/2026, piano in #24) | Leggera (+44 kB gzip), stabile, senza WebGL (gira nella CI). Scartati: MapLibre GL (~7× più pesante, WebGL), OpenLayers (più pesante e complesso), pigeon-maps (fermo da 2 anni), nessuna libreria (troppo codice nostro), react-leaflet (licenza Hippocratic non standard). La 2.0 di Leaflet (beta) arriverà come PR separata di Dependabot: da leggere con calma. |
| Tessere **OpenStreetMap standard** (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`, in `ui/config.ts`), senza chiave. Condizioni d'uso **lette sulla pagina ufficiale il 10/11/2026** (dettagli in #24): obblighi rispettati (URL esatto, attribuzione visibile, Referer non bloccato, cache del browser, niente prescaricamento) | Gratuite e senza account. **Non impostare mai** `referrerPolicy` restrittive né togliere il Referer (anche nell'intermediario della fase 6): OSM blocca. Raccomandazioni per la fase 6: link "segnala un errore" a openstreetmap.org/fixthemap, email di contatto, URL delle tessere cambiabile senza ricompilare. |
| La mappa è **controllata**: lo stato della posizione resta in `App.tsx`; clic, tocco e fine trascinamento del marcatore cambiano la posizione (arrotondata a 4 decimali con `pointFromMap`), spostare e zoomare no; doppio clic per zoom **disattivato**, rotella solo con la mappa a fuoco | Un solo download PVGIS dopo 0,8 s come con i campi. Il doppio clic sposterebbe anche la posizione; la rotella senza focus bloccherebbe lo scorrimento della pagina. |
| Mappa **caricata solo quando mostrata** (`React.lazy` in `ui/LocationMap.tsx`); sul telefono **chiusa per default** dietro "Scegli sulla mappa". Limite del JS iniziale in `scripts/check-bundle-size.ts` (unico posto del valore), **controllato in automatico nella CI** (#37; misurato con gzip livello 6 di Node, ~1 % sotto il numero stampato da Vite). Storia: alzato da 80 a 82 kB con #26, decisione del PO dell'11/11/2026 (80,61 kB dopo #26, margine ~1,4 kB) | Il primo caricamento resta leggero; il dito che scorre la pagina non sposta la mappa. Alzato invece di differire la sezione #26: sono 1,5 kB di testo (una frazione di secondo anche su rete mobile lenta), mentre caricarla all'apertura toglieva la ricerca con Ctrl+F, aggiungeva un "Carico…" per i lettori di schermo e un caso di errore senza protezione (#38). |
| **Controllo automatico del JS iniziale** (#37): `scripts/check-bundle-size.ts`, lanciato con `node` puro (`npm run size`, passo dopo la build nel job dei controlli della CI, **non** dentro `build`); somma il gzip (livello 6) dei file JS citati in `dist/index.html` (`<script type="module">` e `modulepreload`) e fallisce se supera `INITIAL_JS_LIMIT_KB`; stampa per informazione CSS e JS differito (nessun limite); se `GITHUB_STEP_SUMMARY` esiste vi scrive il riepilogo. Si rifiuta di dare un verde se manca `dist/index.html` o non c'è nessuno script. Test in `scripts/*.test.ts` (inclusi in `vite.config.ts`). Decisione del PO del 12/11/2026 (limite invariato, solo il JS iniziale è vincolato) | Nessuna dipendenza nuova e nessun permesso in più. Il numero di Vite (Rolldown nativo) non si riproduce da Node (~1 % più alto): il limite vale per la misura dello script. Scartati: `size-limit` e `bundlesize` (dipendenze con molti pacchetti di terzi per un controllo da 100 righe), action di terzi che commentano la PR (richiedono permessi di scrittura), plugin di Vite che fa fallire la build (la dimensione diventerebbe un errore di compilazione e si mescolerebbe con `npm run build`). |
| Stili che correggono Leaflet in `ui/map.css`, importato **dopo** `leaflet.css` e con selettori `.map-picker .map` | Il CSS di Leaflet arriva nel file differito, dopo `index.css`, e a parità di specificità vinceva (difetto del tema scuro trovato dal tester nella PR #29). Tessere sempre chiare nel tema scuro, senza filtri (decisione del PO). |
| **Piè di pagina sulla privacy** (`ui/SiteFooter.tsx`, testo approvato dal PO il 10/11/2026): niente account, cookie o salvataggi; coordinate (≈ 11 m) a PVGIS; IP e zona guardata a OpenStreetMap | Richiesta del PO. **Da aggiornare in fase 6**: in produzione PVGIS vedrà l'IP dell'intermediario, l'hosting vedrà quello dell'utente. Non è un'informativa legale (GDPR): quella servirà alla pubblicazione. |
| Errori di PVGIS **classificati nel motore** con `PvgisError.kind` (unione chiusa: `seaLocation`, `outsideCoverage`, `rejected`, `unavailable`, `notJson`, `network`, `invalidData`) e **tradotti nell'interfaccia** da `ui/errorMessage.ts` (`describeTmyError`, `switch` esaustivo: un `kind` senza testo fa fallire la build). Mare/fuori copertura riconosciuti solo con risposta 4xx **e** frase di PVGIS nel `message` (maiuscole e spazi ignorati); altrimenti `rejected` con il messaggio generico di prima. Fixture con le risposte vere (`pvgis-error-sea.json`, `pvgis-error-coverage.json`). Testi e posizione approvati dal PO il 10/11/2026 (issue #11). **`unavailable`** (#21): risposta 502, 503 o 504 **senza** corpo JSON (RFC 9110 §15.6.3-15.6.5; es. il proxy di Vite che non raggiunge PVGIS: 502, `text/plain`, corpo vuoto); con corpo JSON resta `rejected`, gli altri codici senza JSON restano `notJson`. `unavailable` e `network` hanno lo stesso testo ("I dati non sono disponibili in questo momento… Riprova tra qualche secondo.", barra "Dati non disponibili ora") e `retry: true` in `TmyErrorText`. Mare ("Per il punto scelto non ci sono dati: risulta in mare…") e fuori zona ("…è fuori dalla zona coperta…", barra "Fuori zona coperta") **senza nominare PVGIS** nei messaggi d'errore: decisione del PO del 12/11/2026. **Requisito per la fase 6:** l'intermediario di produzione deve rispondere 502/503/504 quando non raggiunge PVGIS o scade il tempo; se gli si darà un corpo JSON, la classificazione va rivista (oggi diventerebbe `rejected`, testo generico) | Il motore non sa che esiste una mappa e va riusato nell'app per telefono: niente testi per l'utente nel motore. Solo il codice 400 non basta (PVGIS lo usa anche per i parametri errati); solo il testo rischierebbe di scambiare per "mare" un errore 5xx del futuro intermediario. Se PVGIS cambia la frase, si torna al messaggio generico: nessun malfunzionamento. Verificato il 10/11/2026: PVGIS risponde "over the sea" anche per terre fuori copertura (Svalbard); laghi, lagune e mare entro ~14 km dalla costa danno dati normali (quota 0 m) e **non** vengono scartati (decisione del PO: nessun danno per l'utente, utili per il fotovoltaico galleggiante). Restano in italiano nel `message` del motore alcuni testi tecnici mostrati solo come dettaglio degli errori generici. |
| **Barriera d'errore** (`ui/ErrorBoundary.tsx`, classe scritta a mano con `getDerivedStateFromError`, nessuna dipendenza) attorno alla mappa differita (dentro il riquadro, stessa altezza, la pagina non salta) **e** attorno a tutta `<App/>` in `main.tsx`. Messaggio in `role="alert"` + pulsante "Ricarica la pagina" (fuori dall'avviso, focus non spostato) che avvisa che i parametri tornano ai valori iniziali; **nessun "riprova" nella pagina**. Testi in `ui/errorBoundaryText.ts`. Decisioni D1-D3 del PO del 12/11/2026 (issue #38) | Senza barriera, il file `MapPicker-*.js` non caricato smontava tutta l'app (pagina bianca, parametri persi). Verificato l'11/11/2026 in Chromium: dopo un `import()` fallito il browser ricorda il fallimento per quell'indirizzo finché la pagina è aperta (anche ricreando `React.lazy`), e se fallisce solo il CSS l'helper di Vite rifiuta e un nuovo tentativo mostrerebbe una mappa senza stile: solo il ricaricamento funziona. Scartata `react-error-boundary` (dipendenza per 20 righe). Costo: +0,2 kB gzip. |
| **Rimandati**: ricerca per indirizzo (Nominatim: 1 richiesta/s per tutti gli utenti, indirizzo in chiaro a terzi), vista satellitare (chiavi e condizioni non verificate) | Decisioni del PO del 9/11/2026. |
| Sezione **"Come è calcolata la stima"** (#26, `ui/EstimateMethod.tsx`, testi in `ui/methodNote.ts`): `<details>` nativo **chiuso per default**, subito dopo la nota delle fonti; tre gruppi (compreso, non compreso, perché può differire dal sito PVGIS); **nessun link esterno**; anni dell'anno tipo e voci sulle ombre del terreno dinamici (`usesHorizon`), albedo, perdite suggerite e numero di ore presi dalle costanti del motore. Testi e forma approvati dal PO l'11/11/2026. **Se cambia il modello o la versione di PVGIS, aggiornare `methodNote.ts` e `ANNUAL_NOTE`**: `methodNote.test.ts` fallisce se cambiano coefficienti, versione API, `usehorizon=1`, formula delle perdite o anni dell'anno tipo | Il PO voleva una spiegazione disponibile ma non in primo piano. `<details>`: tastiera, lettori di schermo e Ctrl+F senza codice nostro. Scartati: finestra sovrapposta (copre i risultati, focus da gestire, si sovrappone alla barra fissa), pagina separata (posizione e parametri stanno solo in memoria), piè di pagina (lontano dai numeri). Tolta la frase "puoi aumentare le perdite di sistema" per il degrado: il manuale PVGIS non era verificabile dal cloud. Le voci descrittive (neve, file di pannelli, inverter) non hanno costanti da controllare: restano affidate alla rilettura. |

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
Per scaricare i fixture con curl serve `-A irradia-dev-proxy`: senza, il firewall può rispondere
HTML con codice 200 e `-f` non lo ferma. Controllare sempre che il file sia JSON e il suo hash.
Richieste ravvicinate possono avere una risposta vuota: riprovare dopo qualche secondo.

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
    __fixtures__/  Risposte reali di PVGIS usate dai test (Roma centro, Milano, Livorno e Aosta;
                   origine e hash nel README.md), `pvgisSeries.ts` (serie orarie), `pvgisMonthly.ts`
                   (MRcalc, irradiazione mensile di ogni anno) e `pvgisHorizon.ts` (profilo
                   dell'orizzonte, `printhorizon`): lettori usati solo dai test.
  ui/          Pezzi dell'interfaccia (React) e loro logica pura, con i test accanto.
    config.ts      Indirizzo di PVGIS visto dal browser, attesa prima del download, tessere OSM.
    mapArea.ts     Area di lavoro (limiti `AREA_*`) e conversione del clic in coordinate (puro).
    ErrorBoundary.tsx Barriera d'errore generica + `ReloadFallback`; testi in `errorBoundaryText.ts` (#38).
    MapPicker.tsx  Mappa Leaflet controllata (+ `map.css`); LocationMap.tsx la carica e la apre.
    StickyTotal.tsx   Barra fissa del totale sul telefono.
    SiteFooter.tsx    Piè di pagina sulla privacy.
    tmyLoader.ts   Memoria dei download dell'anno tipo (TypeScript puro).
    useTmy.ts      Hook React: anno tipo per una posizione (attesa, annullamento, stato).
    NumberSlider.tsx  Campo numerico + slider collegati; `parseInput.ts` controlla il testo.
    AnnualTotal.tsx   Totale annuo con la nota sull'anno tipo.
    sourceNote.ts     Frase sulle ombre nella nota delle fonti (dipende da `Tmy.usesHorizon`).
    EstimateMethod.tsx  Sezione richiudibile "Come è calcolata la stima"; testi in `methodNote.ts`.
    MonthlyChart.tsx  Grafico a barre dei 12 mesi in SVG; `chartScale.ts` sceglie le tacche.
    format.ts      Numeri in italiano, nomi dei mesi, punti cardinali.
  App.tsx      Pagina principale: parametri a sinistra, totale annuo e grafico a destra.
  test/        `fastCheckSetup.ts`: seme fisso di fast-check per tutti i test.
  **/*.property.test.ts  Proprietà con fast-check (input casuali), accanto ai moduli.
scripts/       Strumenti di controllo per la CI, eseguiti con `node` puro (`check-bundle-size.ts`
               + test): dimensione del JS iniziale.
e2e/           Prove nel browser (Playwright) con PVGIS e tessere OSM simulati.
    fixtures.ts    Simulazione di PVGIS e delle tessere (PNG generata nel codice), blocco delle
                   richieste non simulate, controllo della console.
    *.spec.ts      calcolo, rete (attesa, memoria, errori), campi e tastiera, impaginazione,
                   barra fissa, mappa. Con l'orologio fermo (`page.clock`) anche le animazioni di
                   Leaflet e il caricamento differito avanzano solo facendo correre l'orologio.
playwright.config.ts  Solo Chromium, contro la build di produzione (`vite preview`, porta 4173).
.github/       CI (workflows/ci.yml), Dependabot, modelli di issue e di PR.
```

Il motore deve restare **separato** dall'interfaccia: così si testa da solo e
si riuserà identico nell'app mobile.

### Catena di calcolo prevista

1. Posizione del sole (`engine/solarPosition.ts`, algoritmo NOAA/Meeus) — **fatto**
2. Dati di irraggiamento orari di un anno tipo (TMY) da PVGIS: GHI, DNI, DHI, temperatura,
   vento, con le ombre del terreno già applicate da PVGIS (`usehorizon=1`) (`engine/pvgisTmy.ts`) — **fatto**
3. Trasposizione sul piano dei pannelli (`engine/irradiance.ts`) — **fatto**
4. Potenza DC con perdite per temperatura delle celle, poi perdite di sistema
   (`engine/pvModule.ts`, `engine/simulate.ts`) — **fatto**
5. Aggregazione: kWh mensili e annuali (`engine/simulate.ts`) — **fatto**
6. Validazione contro PVGIS (`engine/simulate.test.ts`, Roma e Milano) — **fatto**

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
npm run size       # dopo la build: controlla il JS iniziale (gzip) contro il limite
npm run test:e2e   # prove nel browser (Playwright); nel cloud anteporre
                   # PW_CHROMIUM_PATH=/opt/pw-browsers/chromium (browser preinstallato)
FC_SEED=123 npm test  # proprietà fast-check con un altro seme (solo per esplorare)
```

Prima di ogni commit: `npm test`, `npm run lint` e `npm run build` devono passare.

## Come lavorare con il proprietario del progetto

- Scrivi **in italiano** (codice e identificatori in inglese, commenti e testi in italiano).
- **Su GitHub tutto in inglese** (decisione del PO dell'8/11/2026): titoli e descrizioni di PR
  e issue, commenti, messaggi di commit, **nomi dei rami** (es. `claude/negative-wind`, aggiunto dal
  PO il 10/11/2026; i rami già uniti con nomi italiani restano com'erano), modelli di PR e di
  issue, etichette. Motivo: lo storico
  deve essere comprensibile anche a persone esterne. Con il PO si parla in italiano; restano in
  italiano i file del repository (questo file, mansionari, skill, commenti nel codice, `docs/`)
  e i testi dell'app. Se il PO apre un issue in italiano, la sessione aggiunge un commento con
  la traduzione inglese.
- Per ogni azione proposta o eseguita **spiega il motivo** della scelta e le alternative
  scartate. Non dare nulla per scontato.
- Le formule si possono mostrare; i concetti di sviluppo software vanno spiegati in modo
  semplice. (Il profilo personale del PO non sta nel repository: lo trovi nelle preferenze del suo
  account, che le sessioni ricevono da sole.)
- **Descrizioni delle Pull Request ad alto livello**, senza dettagli tecnici (li chiede
  lui se servono), **in inglese** con le sezioni *What was done*, *Why it was needed*, *Risks*,
  *What to look at*, *Next steps*. In fondo, lo **stesso testo in italiano** in un blocco
  richiudibile `<details><summary>🇮🇹 Versione italiana</summary> … </details>` (sezioni *Cosa è
  stato fatto*, *Perché serviva*, *Rischi*, *A cosa prestare attenzione*, *Prossimi passi*):
  serve al PO, mentre l'inglese serve a chi leggerà lo storico. Il modello è in
  `.github/pull_request_template.md`.
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
- **Dependabot proporrà ESLint e `minimatch`** (aggiornamenti settimanali): prima di unire,
  verifica che `npm audit` migliori davvero e che ESLint non torni indietro di versione.
- **I mansionari degli agenti si leggono dalla cartella principale del progetto**
  (`<cartella principale del progetto>`), non dalle copie di lavoro (`.claude/worktrees/…`) in cui
  girano le sessioni (verificato 8/11/2026). Una modifica a `.claude/agents/` vale solo quando
  la cartella principale è su un ramo che la contiene: tenerla su `main` aggiornato (`git pull`).
- **Nelle prove (anche `/prova-locale`) solo coordinate di città**: i commenti delle prove finiscono
  su GitHub. Con la mappa è facile cliccare un punto preciso; per un caso particolare (es. vento
  negativo, #28) scrivere il nome del paese più vicino e coordinate arrotondate a 2 decimali.
- Il frontmatter dei mansionari è **YAML**: mai `: ` (due punti e spazio) dentro una descrizione
  senza virgolette, altrimenti l'agente sparisce senza alcun errore (successo al tester l'8/11/2026).

## Squadra di agenti (decisa l'8/11/2026)

Il proprietario è il **Project Owner (PO)**: decide cosa fare e unisce le PR; riceve
solo informazioni ad alto livello (PR, issue, report del PJM). Il lavoro è diviso fra
**subagenti** definiti in `.claude/agents/` (un file Markdown per ruolo, versionato):

| Agente | Ruolo | Modello | Può modificare |
|---|---|---|---|
| `pjm` | Project Manager: stato, rischi, decisioni in attesa del PO | Sonnet | nulla nel repo: prepara il testo dell'issue di stato (#22), lo pubblica la sessione |
| `tech-lead` | Technical Leader: analizza gli issue, piano tecnico, assegna, rivede le PR | Opus | nulla nel repo (commenti ed etichette su GitHub) |
| `software-developer` | SWD: motore e logica | Opus | codice e test |
| `designer` | interfaccia, accessibilità, mobile | Sonnet | codice e test dell'interfaccia |
| `software-tester` | ST: prove a livelli crescenti, sicurezza, browser | Sonnet | solo file di test |
| `cicd` | dipendenze, GitHub Actions, pubblicazione | Sonnet | configurazione e strumenti |

**Flusso di un obiettivo:** issue → `tech-lead` scrive piano, criteri di accettazione e
assegnazione → `software-developer` e/o `designer` implementano su un ramo → `software-tester`
prova a livelli (si torna indietro se trova difetti) → PR **in bozza** → prova nel browser
in locale → la bozza viene tolta → il PO rivede e unisce → `pjm` prepara lo stato aggiornato e la
sessione lo pubblica nell'**issue fisso "📊 Project status" (#22)**: riscrive il testo dell'issue e
aggiunge un breve commento con cosa è cambiato. Nessuna PR.

**Regola della PR in bozza (decisa l'8/11/2026).** La CI su GitHub non conosce il giudizio
del tester; questa regola fa sì che una PR "pronta" significhi "provata anche nel browser".

1. La sessione cloud apre la PR **in bozza** (*draft*) e la segue (`subscribe_pr_activity`).
2. Il tester nel cloud fa i livelli 1-3 e le prove automatiche nel browser (4a, Playwright);
   la sessione pubblica sulla PR un commento che inizia con `🧪 Cloud tester (L1-L3)`, con le
   righe `Tested commit: <sha>`, `Local L4: required` oppure `Local L4: not required (<motivo>)`
   (vedi il punto 7) e `RESULT: OK|DEFECTS`.
3. Solo se serve la prova locale (punto 7), la sessione avvisa il PO, che apre una
   **sessione locale** e scrive `/prova-locale <n>`
   (skill in `.claude/skills/prova-locale/`): controlla che la PR sia della squadra, mostra al PO
   cosa verrà eseguito sul PC (dipendenze, configurazione) e chiede conferma, prova
   **lo stesso commit** nel browser integrato e commenta con `🖥️ Local tester (L4)`.
4. Quando i commenti richiesti dicono `RESULT: OK` **sullo stesso commit**, che è anche
   l'ultimo della PR, e la CI è verde (compreso il job delle prove nel browser), la sessione
   cloud **toglie la bozza** e lo scrive
   sulla PR. Ogni nuovo commit annulla gli esiti: si riprova.
5. Il PO unisce solo PR **non in bozza e con CI verde**.
6. **Eccezione: PR che non toccano l'app** (documentazione, regole, mansionari, skill, modelli
   di GitHub, Dependabot; nessun file in `src/`, `public/`, `index.html`, `package*.json`,
   `vite.config.ts`, `tsconfig*`, `.github/workflows/`, `e2e/`, `playwright.config.ts`).
   Non vanno provate nel browser: si aprono già pronte, con la CI verde.
   Così le piccole PR di documentazione non riaprono il ciclo (ogni commit annullerebbe gli
   esiti dei tester; corretto l'8/11/2026 dopo la PR #13).

> ⏸️ **Prova locale (L4) SOSPESA** (decisione del PO del 10/11/2026, issue #33), fino a nuovo
> avviso del PO: costa troppo tempo e utilizzo nella fase di sviluppo attuale. Finché è sospesa,
> il commento del tester cloud dice sempre `Local L4: not required (suspended by the PO, #33)` e la
> bozza si toglie con il solo esito OK del tester cloud sull'ultimo commit e la CI verde (punto 4).
> Se la PR tocca il lettore di PVGIS, la sessione cloud prova i casi cambiati anche con PVGIS vero
> (curl con `-A irradia-dev-proxy`). Le PR che avrebbero richiesto L4 si annotano nell'issue #33.
> Le regole qui sotto restano valide e tornano in vigore quando il PO toglie la sospensione.

7. **Quando serve la prova locale (`Local L4: required`)** — decisione del PO dell'8/11/2026,
   issue #17. Si decide in modo meccanico dall'elenco dei file cambiati
   (`git diff --name-only origin/main...HEAD`); nel dubbio, `required`.
   - **Required** se la PR tocca ciò che le prove automatiche non coprono: `vite.config.ts`
     (proxy), `src/engine/pvgisTmy.ts` (rete), `src/ui/**` e `src/App.tsx` (esclusi i file di
     test), `src/index.css` e altri stili, `src/main.tsx`, `index.html`, `public/**`,
     `.claude/launch.json`, le `dependencies` di `package.json` o le versioni di `vite` e
     `@vitejs/plugin-react`.
   - **Not required** per tutte le altre PR che toccano l'app (solo motore, solo test, solo
     CI o dipendenze di sviluppo): bastano il commento del tester cloud e la CI verde,
     che esegue anche le prove nel browser.
   - In `/prova-locale` restano solo i controlli che la CI non può o non deve fare: PVGIS
     vero (firewall), giudizio visivo in chiaro e scuro, Windows.

| Decisione | Motivo |
|---|---|
| Stato del progetto in un **issue fisso su GitHub** ("📊 Project status", #22), non più in `docs/stato-progetto.md` (decisione del PO del 9/11/2026). Testo in inglese con la versione italiana richiudibile, come le PR | Ogni aggiornamento del file richiedeva una PR da rivedere e unire per un testo da leggere soltanto. L'issue non passa da PR né CI, manda una notifica al PO (anche sul telefono) e GitHub conserva la cronologia delle modifiche. Scartate: pagina su claude.ai (fuori da GitHub), solo chat (non resta), aggiornare il file dentro la PR (il commit in più annullerebbe gli esiti dei tester). |
| Esito del tester come **commento sulla PR** + bozza, non come "check" di GitHub | Un check scritto da un agente sarebbe un'auto-certificazione non ripetibile e richiederebbe permessi di scrittura in più. Il segno verde della CI resta solo per test, lint e build. |
| Prova nel browser **in locale, avviata dal PO** con `/prova-locale`, non una sessione locale sempre in ascolto | Una sessione sempre in ascolto (`/loop`) richiede PC acceso, consuma utilizzo anche a vuoto ed eseguirebbe codice sul PC senza chiedere. Avviarla costa al PO pochi secondi e lascia a lui il controllo. Da rivalutare con Remote Control (la sessione cloud "bussa" a quella locale). |
| La sessione locale prova nella **propria copia di lavoro** (`git checkout --detach <sha>`), mai nella cartella principale | Il server di `.claude/launch.json` parte nella cartella della sessione; la cartella principale deve restare su `main` (da lì si leggono i mansionari). |
| Le skill del progetto (`.claude/skills/`) si leggono **probabilmente dalla cartella della sessione** (la sua copia di lavoro), non dalla cartella principale come i mansionari | Primo collaudo (PR #13, 8/11/2026): nella sessione locale `/prova-locale` all'inizio non c'era, poi è comparsa, verosimilmente quando la sessione ha portato nella sua copia di lavoro il commit della PR che la conteneva. **Da confermare.** Ora la skill è su `main`: basta che la copia di lavoro parta da un `main` aggiornato (`git pull` nella cartella principale). |
| Prove del browser automatiche con **Playwright nella CI** (fatto, issue #17): job separato "Browser tests (Playwright)", in parallelo agli altri controlli | Il verde vuol dire anche "il browser funziona sui dati simulati". Job separato: su GitHub si vede subito cosa è fallito e i tempi non si sommano. La prova con PVGIS vero (firewall) resta manuale: la CI non deve dipendere da un servizio esterno. |
| PVGIS simulato **intercettando le richieste nel browser** (`page.route`, `e2e/fixtures.ts`) con i fixture di Roma e Milano; ogni richiesta non simulata fa fallire la prova | Nessun processo né dipendenza in più; ogni prova sceglie il proprio scenario (errori, firewall, lentezza) e conta le richieste. Scartati: server finto dietro il proxy (secondo processo, da rivalutare in fase 6), MSW (codice di prova dentro l'app), registrazioni HAR (file grandi che duplicano i fixture). Il proxy di Vite resta provato solo a mano. |
| Le prove girano sulla **build di produzione** (`vite preview`), non sul server di sviluppo | Si prova ciò che verrà pubblicato; in sviluppo React esegue due volte gli effetti e i tempi variano di più (prove instabili). |
| **Solo Chromium** (decisione del PO dell'8/11/2026) | WebKit di Playwright su Linux non è il Safari dell'iPhone; da rivalutare nella fase mobile con Firefox. I telefoni si simulano con le dimensioni dello schermo (360/390/412 px). |
| Prove nel browser **senza attese fisse** e **senza nuovi tentativi** (`retries: 0`); orologio controllato (`page.clock`) per l'attesa di 0,8 s; lingua `it-IT` e fuso `Europe/Rome` fissi | Un nuovo tentativo automatico nasconderebbe l'instabilità. Collaudo: 5 esecuzioni consecutive tutte verdi (410/410). |
| **Niente confronto automatico di screenshot** | I caratteri di Linux (CI) e Windows (PC del PO) differiscono: le immagini di riferimento andrebbero rifatte spesso. Il giudizio visivo resta in `/prova-locale`. |
| Nel cloud le prove usano il **Chromium preinstallato** (`PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`), nella CI `playwright install --only-shell chromium` | Nel cloud non si scarica nulla; nella CI la versione del browser segue quella di `@playwright/test` nel lock. Niente cache del browser nella CI (la documentazione di Playwright la sconsiglia). |
| Proprietà con **fast-check**, **seme fisso** 20261108 (`src/test/fastCheckSetup.ts`), numero di casi scelto in ogni test; `FC_SEED` per esplorare in locale; ogni controesempio diventa un caso fisso | Le prove su input casuali restano deterministiche e riproducibili. Scartato `@fast-check/vitest`: una dipendenza in più senza vantaggi reali. |
| Difetti noti dei casi estremi trovati con fast-check (irradianza denormale, potenza infinita, scala del grafico con valori estremi), prima documentati come **fallimenti attesi** (`it.fails`), **corretti** (#19, decisione del PO del 12/11/2026): Huld usa ln G − ln 1000 solo quando G/1000 va a 0 (risultato identico bit per bit negli altri casi) e `huldDcPower` rifiuta una potenza non finita; il motore accetta al massimo **1000 Wp per pannello** (`MAX_PANEL_POWER_WP`) e **1000 pannelli** (`MAX_PANEL_COUNT`), altrimenti `RangeError`; `niceScale` non lancia mai eccezioni (passo 0 per underflow → scala 0-1, tacche oltre `Number.MAX_VALUE` → un solo intervallo da 0 al massimo). Ora sono prove normali. Un nuovo difetto non raggiungibile dall'interfaccia si documenta di nuovo con `it.fails` | Non raggiungibili dall'interfaccia, ma un motore riusato (app mobile) non deve dare NaN in silenzio. 1000 Wp: margine sopra i moduli più potenti in commercio (~700-770 Wp) e sopra il limite dell'interfaccia (700 Wp); 1000 pannelli (1 MWp) superano qualsiasi tetto senza legare il motore agli slider (50). Nessuna eccezione nel grafico: farebbe scattare la barriera d'errore. |
| `@types/node` fermo alla **24** (Dependabot ignora ≥ 25); i tipi di Node valgono solo per test e configurazione, non per `src/` | Allineato alla versione di Node della CI; l'app gira nel browser e non deve poter usare funzioni di Node. |

| Decisione | Motivo |
|---|---|
| **Subagenti**, non "agent teams" | Gli agent teams sono sperimentali e consumano 5-7 volte di più; per un progetto di questa taglia una sessione che coordina basta. |
| La **sessione principale coordina**; i subagenti non chiamano altri agenti | Le chiamate annidate sarebbero invisibili al PO. Il TL scrive le assegnazioni, la sessione le esegue. |
| Solo dal desktop: **niente @claude su GitHub** | Richiederebbe una chiave API Anthropic a pagamento separata. GitHub Actions solo per test/lint/build. |
| Modelli misti: **Opus** per TL e SWD, **Sonnet** per gli altri | Le scelte architetturali e il codice del motore sono la parte più delicata; il resto costa meno con Sonnet. |
| Chi verifica (ST) non corregge il codice di prodotto | Chi scrive e chi controlla restano distinti, come in un gruppo reale. |
| Mansionari scritti per Irradia, collezioni della community solo come ispirazione | Gli agenti già pronti sono generici, in inglese, e non conoscono le regole del motore. |
| Il tester (ST) prova l'app nel **browser integrato dell'app desktop** (strumenti `mcp__Claude_Browser__*` nel suo elenco `tools:`) per i soli casi manuali (4b), e con **Playwright** nel cloud e nella CI (4a) | Decisione dell'8/11/2026: il livello 4 (browser) non era eseguibile perché il tester non aveva strumenti del browser. Dall'issue #17 la parte ripetibile è automatica. |
| Skill ufficiali previste: `frontend-design` (Designer), `webapp-testing` (ST) da `anthropics/skills`; `/security-review`, `/code-review`, `/simplify` integrate | Fonti affidabili; da installare e leggere prima di usarle. |
| **CI su GitHub Actions** (`.github/workflows/ci.yml`): `npm ci`, `npm test`, `npm run lint`, `npm run build` su ogni PR e su ogni push a `main` | Gli stessi controlli richiesti prima di ogni commit, ma su una macchina pulita: un errore non arriva su `main` senza essere visto. I test non usano la rete (fixture e finta `fetch`). |
| Action **fissate allo SHA del commit** (con la versione in commento) | Un tag può essere spostato da chi controlla l'action, uno SHA no. Dependabot le tiene aggiornate. |
| Workflow con **permessi minimi** (`contents: read`), `timeout-minutes: 15`, esecuzioni superate annullate sulle PR | Un'action compromessa non potrebbe scrivere nel repository; un blocco non consuma minuti per ore. |
| CI su **Node 24** esplicito (non `lts/*`) | È la LTS in uso in locale; `lts/*` cambierebbe da solo e potrebbe rompere i controlli senza modifiche nel repository. Si cambia a mano. |
| **Dependabot settimanale** (lunedì, Europe/Rome) per npm e GitHub Actions, aggiornamenti minor/patch **raggruppati** (produzione, sviluppo); i major restano PR separate; `typescript` **< 6.1** | Poche PR da rivedere; i major possono avere cambiamenti incompatibili; typescript-eslint supporta al massimo TS < 6.1. |
| **Modelli di issue** (`.github/ISSUE_TEMPLATE/`): in inglese: market request (per il PO, senza dettagli tecnici), bug, technical task; issue vuoti disattivati | Il PO descrive il bisogno, il Technical Leader trova sempre le stesse informazioni. |
| **Etichette** a gruppi con prefisso, **in inglese** dall'8/11/2026: `type:` (bug, feature, market, technical; viola), `agent:` (swd, designer, st, cicd; blu), `priority:` (high, medium, low; dal rosso al giallo), `status:` (triage, waiting-po, ready, in-progress, blocked; colori "a semaforo"). Create con `gh label create` l'8/11/2026 in italiano (`tipo:`, `agente:`, `priorità:`, `stato:`), rinominate con `gh label edit` (gli issue restano etichettati); le etichette predefinite di GitHub restano | Smistare e ritrovare il lavoro a colpo d'occhio; i modelli di issue e Dependabot le assegnano da soli. |
| **Protezione del ramo `main`: per ora solo disciplina** (si unisce solo con la CI verde; GitHub non lo impone). Decisione del PO dell'8/11/2026; soluzione a lungo termine nell'issue #7 | Le regole sui rami non sono disponibili su un repository privato col piano gratuito (verificato 8/11/2026: GitHub risponde "Upgrade to GitHub Pro or make this repository public"). Con un solo autore il rischio è basso. Le impostazioni di sicurezza le cambia solo il PO, mai i subagenti. |

Piano completo: vedi la PR che ha introdotto questa sezione. CI su GitHub e strumenti del
tester (fast-check, Playwright) sono fatti; restano i modelli di issue da collaudare.
