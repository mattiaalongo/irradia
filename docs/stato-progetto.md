# Stato del progetto Irradia

## Data

8/11/2026 (aggiornato dopo l'unione della PR #6 "GitHub e CI"). Fonti: `git`, `gh pr list/view/issue list/run list` (sola lettura) e
`CLAUDE.md` del ramo `fase-4/interfaccia`. Non ho eseguito test, lint o build: gli esiti
indicati sono quelli dichiarati nelle PR, non verificati da me.

## In una riga

Motore di calcolo completo e validato (fasi 1-3 unite); fase 4 (interfaccia) pronta nella PR #4
in attesa della revisione del PO; controlli automatici (CI) attivi su `main` e su ogni PR (PR #6, unita).

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

- **PR #4 (fase 4)**, ramo `fase-4/interfaccia`: aperta, allineata a `main` l'8/11/2026 (risolto il conflitto in `CLAUDE.md`,
  inviata la correzione del proxy di Vite per il firewall di PVGIS); **CI verde**, unibile senza conflitti.
- **Squadra di agenti**: mansionari in `.claude/agents/` e sezione in fondo a `CLAUDE.md`,
  **unita su `main`** con la PR #5 (8/11/2026).
- **CI e Dependabot** (PR #6): **unita** l'8/11/2026. CI verde su `main`; il primo giro di Dependabot non ha trovato aggiornamenti.
- Issue aperti su GitHub: #7 (protezione di `main` a lungo termine, attende il PO).

## Decisioni che aspettano il PO

1. Revisione e unione della **PR #4** (fase 4).
2. **Issue #7**: protezione di `main` a lungo termine (disciplina, repository pubblico, GitHub Pro). Le regole sui rami non sono disponibili su un repository privato gratuito; per ora vale la disciplina. Da decidere al più tardi prima della fase 6.
3. Quando la PR #4 sarà unita, per regola del 8/11/2026: passare allo step successivo?

## Rischi

| # | Rischio | Prob. | Impatto | Mitigazione | Chi |
|---|---|---|---|---|---|
| 1 | Nessun controllo automatico: test, lint e build girano solo sul PC. Un errore può arrivare su `main` | Media | Medio | **Mitigato**: CI attiva (PR #6). Resta possibile unire con la CI rossa finché `main` non è protetto (issue #7) | CI/CD |
| 2 | Conflitto in `CLAUDE.md` tra PR #4 e `main` | - | - | **Chiuso** l'8/11/2026: ramo della #4 allineato a `main`, CI verde | - |
| 3 | PVGIS: firewall che rifiuta lo User-Agent del browser rispondendo 200 con HTML, assenza di CORS, possibili cambi di formato. In sviluppo è risolto dal proxy di Vite; in produzione l'intermediario non esiste | Alta (produzione) / Bassa (sviluppo) | Alto | Fase 6; il parser fissa `v5_3` e controlla le unità; provare nel browser, i test non rilevano il firewall | TL / SWD |
| 4 | Il comportamento nel browser (download automatico, annullamenti, grafico) è coperto da test di logica ma non da prove in browser | Media | Medio | PR "Strumenti del tester" (Playwright, fast-check) e prova manuale del PO sulla #4 | ST |
| 5 | Dipendenze npm: `npm audit` segnala vulnerabilità moderate in `minimatch` (solo ESLint, strumento di sviluppo); non c'è aggiornamento automatico | Bassa | Basso | Dependabot **attivo** (settimanale); ricontrollo agli aggiornamenti | CI/CD |
| 6 | Scarti dalla validazione PVGIS: annuo entro ±2 %, ma singoli mesi fino al 13 % (l'anno tipo non è la media 2005-2023). Nessuno spettrale né ombre | Media | Medio | Già documentato; mostrare con chiarezza che è una stima; ombre con la mappa | PO / TL |
| 7 | Flusso della squadra di agenti mai provato su un issue reale | Media | Basso | Collaudo su un issue reale (già pianificato) | PO / PJM |
| 8 | Il ramo locale `main` non è aggiornato rispetto a `origin/main` (in locale mostra solo "Initial commit") | Bassa | Basso | `git pull` prima di creare nuovi rami; i miei dati usano `origin/main` | PO |

Test, lint e build della #4 sono attestati dalla CI (verde l'8/11/2026, dopo l'allineamento a `main`).

## Prossimi passi

1. Il PO rivede e unisce la **PR #4**.
2. ~~PR della squadra di agenti~~: **unita** (#5).
3. ~~PR "GitHub e CI"~~: **unita** (#6).
4. PR **"Strumenti del tester"**: fast-check (prove su input casuali) e Playwright (prove nel browser).
5. **Collaudo del flusso** su un issue reale (TL, SWD/Designer, ST, PR, aggiornamento di questo file).
6. Poi fase 5 (mappa) e fase 6 (intermediario di produzione), da pianificare con il TL.
