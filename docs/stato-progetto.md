# Stato del progetto Irradia

## Data

8/11/2026 (aggiornato dopo l'unione della PR #13). Fonti: `git log origin/main`, `CLAUDE.md` e i fatti su PR, issue ed esiti
dei controlli forniti dalla sessione principale (verificati l'8/11/2026 sera). Non ho eseguito test, lint o build né interrogato
GitHub direttamente: gli esiti indicati (187 test verdi, lint, build e CI verdi) sono quelli riferiti, non verificati da me.

## In una riga

Fasi 1-4 unite (motore validato su Roma e Milano, interfaccia con totale annuo e grafico), CI attiva, squadra di agenti
collaudata con successo su un issue reale; nessuna PR aperta, prossimo passo la PR "Strumenti del tester".

## Fasi

| Fase | Contenuto | Stato | PR |
|---|---|---|---|
| 1 | Fondamenta e posizione del sole | Unita | #1 |
| 2 | Anno tipo (TMY) da PVGIS e proxy di sviluppo | Unita | #2 |
| 3 | Modello di produzione e validazione contro PVGIS | Unita | #3 |
| 4 | Interfaccia: slider, totale annuo, grafico dei 12 mesi | Unita | #4 |
| 5 | Mappa per scegliere la posizione (e ombre dell'orizzonte) | Non iniziata | - |
| 6 | Intermediario di produzione per PVGIS (CORS, User-Agent) e pubblicazione | Non iniziata | - |

Lavori trasversali già uniti: squadra di agenti (#5), CI e Dependabot (#6), protezione di `main` per disciplina (#8, issue #7),
tester con browser integrato (#9), validazione Roma+Milano, nota sull'anno tipo, regola della PR in bozza e skill
`/prova-locale` (#13, issue #10).

Le fasi 5 e 6 sono dedotte da `CLAUDE.md`; non esiste un piano scritto più dettagliato.

## Lavori in corso

- **Nessuna PR aperta** (prima di quella che conterrà questo aggiornamento).
- **Issue #10 chiuso**: il +3,5 % di Milano rispetto a PVcalc non è un errore del motore. L'anno tipo è più soleggiato della
  media 2005-2023 (+3,9 % di luce), l'effetto spettrale vale -0,5 %, l'orizzonte è nullo. Ora c'è una nota sotto il totale annuo.
- **Primo collaudo della squadra completato** su #10: analisi del TL, sviluppo (SWD + Designer), prove del tester nel cloud
  (al primo giro DIFETTI: un buco nei test sui mesi e punti deboli di sicurezza della skill, corretti), PR in bozza, prova
  locale sul PC del PO (OK), bozza tolta, unione. Il flusso funziona.
- **Stato dei controlli**: 187 test verdi, lint, build e CI verdi su `main` (riferito, non verificato da me).
- **Issue aperti**: #7 (protezione di `main`, attende il PO, entro la fase 6); #11 (messaggio d'errore di PVGIS in inglese,
  bug, priorità bassa); #12 (sul telefono il risultato non si vede muovendo gli slider, funzione, bassa); #15 (con PVGIS in
  errore il riepilogo dei kWp non si aggiorna cambiando i pannelli, bug, bassa, trovato dal tester locale).

## Decisioni che aspettano il PO

1. **Issue #7**: protezione di `main` a lungo termine (disciplina, repository pubblico, GitHub Pro). Le regole sui rami non
   sono disponibili su un repository privato gratuito; per ora vale la disciplina. Da decidere al più tardi prima della fase 6.

(Il passaggio allo step successivo è già deciso: PR "Strumenti del tester".)

## Rischi

| # | Rischio | Prob. | Impatto | Mitigazione | Chi |
|---|---|---|---|---|---|
| 1 | Si può ancora unire con la CI rossa: `main` non è protetto da GitHub | Bassa | Medio | CI attiva; vale la disciplina (si unisce solo con CI verde); soluzione a lungo termine nell'issue #7 | PO / CI/CD |
| 2 | PVGIS: firewall che rifiuta lo User-Agent del browser rispondendo 200 con HTML, assenza di CORS, possibili cambi di formato. In sviluppo è risolto dal proxy di Vite; in produzione l'intermediario non esiste | Alta (produzione) / Bassa (sviluppo) | Alto | Fase 6; il parser fissa `v5_3` e controlla le unità; provare con PVGIS vero nel browser (i test non rilevano il firewall) | TL / SWD |
| 3 | La prova nel browser (L4) è ancora manuale: la fa il PO con `/prova-locale`. Il comportamento dell'interfaccia non è coperto da prove automatiche in browser | Media | Medio | PR "Strumenti del tester": Playwright nella CI e fast-check. La prova con PVGIS vero resterà comunque manuale | ST |
| 4 | Dipendenze npm: `npm audit` segnala vulnerabilità moderate in `minimatch` (solo ESLint, strumento di sviluppo) | Bassa | Basso | Dependabot attivo (settimanale); prima di unire verificare che ESLint non torni indietro | CI/CD |
| 5 | Il ramo locale `main` nella cartella principale non è aggiornato: mansionari e skill si leggono da lì | Media | Basso | Il PO fa `git pull` nella cartella principale dopo ogni unione che li modifica (anche dopo la #13, per avere `/prova-locale`) | PO |
| 6 | Fixture di PVGIS (Roma e Milano) aggiungono circa 3 MB al repository | Bassa | Basso | Accettato: servono ai test senza rete. Non aggiungere altre località senza valutare il peso | SWD |
| 7 | Difetti minori dell'interfaccia noti: #11, #12, #15 | Media | Basso | Issue aperti, priorità bassa; da pianificare con il TL | TL / Designer |
| 8 | Scarto Milano rispetto a PVcalc (+3,5 %) | - | - | **Chiuso** (issue #10): non è un errore, è l'anno tipo più soleggiato. Spiegato dalla nota sotto il totale; se cambia la versione di PVGIS la nota va aggiornata | - |
| 9 | Flusso della squadra di agenti mai provato | - | - | **Chiuso**: collaudato su #10 | - |

Restano i limiti noti del modello (nessun effetto spettrale, nessuna ombra dell'orizzonte): documentati in `CLAUDE.md`, le ombre arriveranno con la mappa.

## Prossimi passi

1. PR **"Strumenti del tester"** (decisa dal PO): Playwright nella CI per le prove nel browser e fast-check per le prove su
   input casuali, in una nuova sessione cloud.
2. Il PO decide sull'**issue #7** prima della fase 6.
3. Fase 5 (mappa) e fase 6 (intermediario di produzione e pubblicazione), da pianificare con il TL.
4. Sistemare quando conviene gli issue #11, #12, #15 (bassa priorità).
5. Il PO fa `git pull` nella cartella principale per avere skill e mansionari aggiornati.
