# Stato del progetto Irradia

## Data

8/11/2026 (aggiornato con la PR "GitHub e CI"). Fonti: `git`, `gh pr list/view/issue list/run list` (sola lettura) e
`CLAUDE.md` del ramo `fase-4/interfaccia`. Non ho eseguito test, lint o build: gli esiti
indicati sono quelli dichiarati nelle PR, non verificati da me.

## In una riga

Motore di calcolo completo e validato (fasi 1-3 unite); fase 4 (interfaccia) pronta nella PR #4
in attesa della revisione del PO; controlli automatici (CI) pronti nella PR "GitHub e CI", attivi per tutti dopo l'unione.

## Fasi

| Fase | Contenuto | Stato | PR |
|---|---|---|---|
| 1 | Fondamenta e posizione del sole | Unita | #1 |
| 2 | Anno tipo (TMY) da PVGIS e proxy di sviluppo | Unita | #2 |
| 3 | Modello di produzione e validazione contro PVGIS | Unita | #3 |
| 4 | Interfaccia: slider, totale annuo, grafico dei 12 mesi | Pronta, **PR aperta, in attesa di revisione** | #4 |
| 5 | Mappa per scegliere la posizione (e ombre dell'orizzonte) | Non iniziata | - |
| 6 | Intermediario di produzione per PVGIS (CORS, User-Agent) e pubblicazione | Non iniziata | - |

Le fasi 5 e 6 sono dedotte da `CLAUDE.md` (cenni alla "fase 5" per la mappa e alla "fase 6" per
l'intermediario di produzione); non esiste un piano scritto più dettagliato.

## Lavori in corso

- **PR #4 (fase 4)**, ramo `fase-4/interfaccia`: aperta, risulta unibile senza conflitti, nessuna
  revisione registrata, nessun controllo automatico associato (non ce ne sono).
- **Squadra di agenti** (ramo `setup/squadra-agenti`, creato da `main`): mansionari in
  `.claude/agents/` e sezione in fondo a `CLAUDE.md`, nella **PR #5**, in attesa di unione.
  Questo file è la prima uscita del PJM.
- **PR "GitHub e CI"** (ramo `setup/github-ci`): workflow test/lint/build, Dependabot, modelli di issue e di PR. In attesa di unione dopo la #5.
- Issue aperti su GitHub: nessuno. Controlli automatici: girano già sulla PR "GitHub e CI" stessa; su `main` e sulle altre PR partono dopo l'unione.

## Decisioni che aspettano il PO

1. Revisione e unione della **PR #4** (fase 4).
2. Via libera alla **PR #5** (squadra di agenti).
3. Unire la PR "GitHub e CI" **dopo la #5** (squadra di agenti) e poi applicare **a mano** la protezione del ramo `main` (PR obbligatoria, controllo CI verde): le istruzioni passo-passo sono nella descrizione della PR.
4. Quando la PR #4 sarà unita, per regola del 8/11/2026: passare allo step successivo?
   Nota: la fase 4 introduce questa regola anche in `CLAUDE.md`; le due PR modificano lo stesso
   file e potrebbero richiedere di sistemare un conflitto (vedi rischi).

## Rischi

| # | Rischio | Prob. | Impatto | Mitigazione | Chi |
|---|---|---|---|---|---|
| 1 | Nessun controllo automatico: test, lint e build girano solo sul PC. Un errore può arrivare su `main` | Media | Medio | **Mitigato dalla PR "GitHub e CI" (workflow test/lint/build), in attesa di unione**; poi protezione di `main` da parte del PO | CI/CD |
| 2 | Conflitto in `CLAUDE.md` tra PR #4 (decisioni fase 4) e ramo squadra (nuova sezione in fondo) | Media | Basso | Unire prima la #4, poi aggiornare il ramo squadra da `main` | PO / sessione principale |
| 3 | PVGIS: firewall che rifiuta lo User-Agent del browser rispondendo 200 con HTML, assenza di CORS, possibili cambi di formato. In sviluppo è risolto dal proxy di Vite; in produzione l'intermediario non esiste | Alta (produzione) / Bassa (sviluppo) | Alto | Fase 6; il parser fissa `v5_3` e controlla le unità; provare nel browser, i test non rilevano il firewall | TL / SWD |
| 4 | Il comportamento nel browser (download automatico, annullamenti, grafico) è coperto da test di logica ma non da prove in browser | Media | Medio | PR "Strumenti del tester" (Playwright, fast-check) e prova manuale del PO sulla #4 | ST |
| 5 | Dipendenze npm: `npm audit` segnala vulnerabilità moderate in `minimatch` (solo ESLint, strumento di sviluppo); non c'è aggiornamento automatico | Bassa | Basso | Dependabot (nella PR "GitHub e CI") **attivo dopo l'unione**; ricontrollo agli aggiornamenti | CI/CD |
| 6 | Scarti dalla validazione PVGIS: annuo entro ±2 %, ma singoli mesi fino al 13 % (l'anno tipo non è la media 2005-2023). Nessuno spettrale né ombre | Media | Medio | Già documentato; mostrare con chiarezza che è una stima; ombre con la mappa | PO / TL |
| 7 | Flusso della squadra di agenti mai provato su un issue reale | Media | Basso | Collaudo su un issue reale (già pianificato) | PO / PJM |
| 8 | Il ramo locale `main` non è aggiornato rispetto a `origin/main` (in locale mostra solo "Initial commit") | Bassa | Basso | `git pull` prima di creare nuovi rami; i miei dati usano `origin/main` | PO |

Non verificato: stato effettivo di test/lint/build della #4 (nessun controllo automatico che lo attesti).

## Prossimi passi

1. Il PO rivede e unisce la **PR #4**.
2. Committare e aprire la PR della **squadra di agenti** (`setup/squadra-agenti`), dopo
   aver allineato il ramo a `main`.
3. PR **"GitHub e CI"**: **in corso** (workflow test/lint/build, Dependabot, modelli di issue e PR, etichette); da unire dopo la #5.
4. PR **"Strumenti del tester"**: fast-check (prove su input casuali) e Playwright (prove nel browser).
5. **Collaudo del flusso** su un issue reale (TL, SWD/Designer, ST, PR, aggiornamento di questo file).
6. Poi fase 5 (mappa) e fase 6 (intermediario di produzione), da pianificare con il TL.
