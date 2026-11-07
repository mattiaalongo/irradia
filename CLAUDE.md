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

Da verificare quando lavoreremo ai dati: PVGIS potrebbe non accettare chiamate dirette
dal browser (CORS). In quel caso servirà un piccolo intermediario lato server
(es. funzione serverless sull'hosting).

## Architettura

```
src/
  engine/      Motore di calcolo: TypeScript puro, nessuna dipendenza da React o dal DOM.
               Ogni modulo ha il suo file *.test.ts accanto.
  App.tsx      Interfaccia (per ora una pagina di prova della posizione solare).
```

Il motore deve restare **separato** dall'interfaccia: così si testa da solo e
si riuserà identico nell'app mobile.

### Catena di calcolo prevista

1. Posizione del sole (`engine/solarPosition.ts`, algoritmo NOAA/Meeus) — **fatto**
2. Dati di irraggiamento orari di un anno tipo (TMY) da PVGIS: GHI, DNI, DHI, temperatura
3. Trasposizione sul piano dei pannelli (inclinazione + orientamento)
4. Potenza DC con perdite per temperatura delle celle, poi perdite di sistema (inverter, cavi)
5. Aggregazione: kWh mensili e annuali
6. Validazione contro il calcolo PV di PVGIS per gli stessi parametri

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
- Lavora su un **ramo separato** per ogni obiettivo. Non scrivere direttamente su `main`.
- Una sessione = un obiettivo. A fine sessione aggiorna questo file se sono state
  prese nuove decisioni.

## Avvisi noti

- `npm audit` segnala vulnerabilità **moderate** in `minimatch`, usata solo da ESLint
  (strumento di sviluppo: non finisce nell'app pubblicata). La correzione proposta
  da npm farebbe tornare indietro di versione ESLint. Ricontrolla quando aggiorni
  le dipendenze.
