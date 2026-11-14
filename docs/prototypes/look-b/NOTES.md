# Prototipo B — "Giornata di sole"

**Idea.** La pagina si apre con una scena: una fascia di cielo a tutta larghezza con il pannello 3D grande, il totale annuo accanto e i due comandi circolari subito sotto il totale, così si vede che muovono proprio quel pannello. Sotto, una pagina calma a due colonne (posizione e altri parametri | grafico e note). Cielo azzurro di giorno, crepuscolo blu di sera; giallo-sole solo per ciò che si tocca.

## Piano di design

Palette (chiaro / scuro)
| Nome | Chiaro | Scuro | Ruolo |
|---|---|---|---|
| Cielo (sfumatura, solo nella scena) | #b7d8f4 → #e7f3fc | #0a1738 → #27488a | fascia della scena |
| Fondo pagina | #f5f9fd | #0b1530 | corpo |
| Inchiostro | #0e2a4a | #eaf1fb | testo |
| Inchiostro secondario | #40566f | #a9bcd8 | aiuti, note |
| Blu-pannello | #2a62b8 | #7db4f2 | barre, parte piena degli archi |
| Giallo-sole | #ffc83d (bordo #0e2a4a) | #ffd25a (bordo #0b1530) | cursori, solo tocco |
Carattere: Figtree variabile (corpo e titoli, pesi 400-800), `tabular-nums lining-nums` per i numeri; niente maiuscole per etichette, niente monospazio.

Schema desktop
```
+--------------------------------------------------------------+
| Irradia  Stima della produzione...        (cielo, bordo       |
|  [ pannello 3D su disco di terreno ]   Produzione in un anno  |
|  [        grande, N E S O          ]   6.498 kWh  · nota      |
|                                        Pannelli               |
|                                        (quarto)  (cerchio)    |
+---------------------- bordo morbido ------ ------------------+
| Parametri                     | Produzione mese per mese      |
|  Posizione: mappa + lat/lon   |  grafico, tabella, fonti      |
|  slider (n., Wp, perdite)     |  Come è calcolata             |
+ Privacy ------------------------------------------------------+
```
Telefono: scena (3D, totale, nota, due comandi affiancati con campi) → Parametri (Scegli sulla mappa, lat/lon, slider) → grafico → piè; barra fissa in basso.

Principi: una sola cosa memorabile (la scena); sfumatura solo nel cielo; nessuna griglia di schede con ombra (sezioni separate da spazio, un solo bordo morbido sotto la scena); niente sole né ombre disegnati (la proiezione sul terreno è verticale e neutra).

## Rilettura critica
- Prima versione = "titolo + grande numero + gradiente": ho tolto ogni sfumatura fuori dal cielo e ho dato al totale un ruolo di pari importanza con il 3D, ma lo scopo della scena è il pannello.
- Disco di terreno troppo piccolo/pannello gigante, ellisse tagliata, lettera N sopra le celle, "90°" sull'arco, S coperta dal cursore: corretti (disco R 2,4 m, elevazione 40°, alone sulle lettere, cursore su cerchio più piccolo).
- Il "default" dello slider giallo su chiaro (1,46:1): bordo inchiostro da 3,5 px (9,4:1).
- Testi del grafico illeggibili a 360 px: scala maggiore sotto 820 px.

## Contrasti misurati (kit/contrast.cjs)
| Coppia | Chiaro | Scuro |
|---|---|---|
| Inchiostro su cielo (alto) | 9,76 | 15,49 |
| Secondario su cielo (peggiore: alto in chiaro / basso in scuro) | 5,09 | 4,57 |
| Secondario su fondo pagina | 7,14 | 9,34 |
| Bordo campi (#5a7391 / #7a93b8) su campo | 4,89 | 4,87 |
| Arco vuoto dei comandi (#52698a / #8aa2c6) su cielo | 3,77 (peggiore) | 3,39 (peggiore) |
| Arco pieno / barre su fondo | 5,61 | 8,32 (su cielo 4,07) |
| Cursore giallo vs bordo | 9,37 | cursore su fondo 12,6 |
| Anello di focus (inchiostro / bianco) su fondo | 13,7 | 15,9-18 |
| Barra fissa (bianco su #0e2a4a / #eaf1fb su #1b3470) | 14,5 | 10,4 |
Le barre hanno ≥ 3:1 in entrambi i temi: nessun compenso dalla tabella necessario. Lettere N/E/S/O: secondario (≥ 4,5).

## Caratteri
`@fontsource-variable/figtree`, licenza OFL-1.1: `fonts/figtree-latin-wght-normal.woff2`, 20 kB (verificato nel pacchetto). `font-display: swap`. Valutati ma non usati: Nunito Sans, Outfit (più geometrico, cifre meno sobrie).

## Verifiche
- `scrollOrizzontalePx` = 0 a 1440, 390, 360 e 320 px, chiaro e scuro; nessun errore in console.
- Comandi: tastiera e puntatore dal kit; anello di focus 3,5 px sul cursore (shots/focus-light.png). Tab sul grafico mostra il valore (non ripreso in screenshot).
- Anteprima 3D e totale si aggiornano dal vivo (controls-*.png a 135°/20°).
- Stato "non aggiornato": `index.html?stale` mostra cornice tratteggiata, etichetta e totale in secondario (verificato a occhio, nessuno shot consegnato).

## Pro e contro
Pro: chi apre la pagina capisce subito la cosa (pannello + numero); i comandi stanno accanto a ciò che muovono; tema scuro come "sera", non solo inversione; contrasti alti.
Contro: la scena occupa quasi tutta la prima schermata desktop, il grafico parte sotto la piega; sul telefono la scena è alta (~3 schermi di comandi prima di Posizione); il totale (che oggi sta in Risultati) passa nella scena, quindi cambia la struttura di `App.tsx`; mappa e sliders restano lontano dai comandi circolari; allontanamento dalla pagina attuale: alto (nuovo carattere, tutti i colori, impaginazione). Rischi React: gradiente e disco del terreno nel componente della scena, la barra fissa duplica il totale (come oggi), grafico con scala maggiore su mobile da ricontrollare con valori estremi. Può non piacere: il giallo (poco "serio"), l'azzurro molto saturo in chiaro.

## Scelte da segnalare
- Il comando dell'orientamento ha un piccolo pannello dall'alto al centro che ruota con il valore.
- Il gruppo "Pannelli" (con i comandi) sta nella scena; gli slider, senza titolo di gruppo, sotto "Parametri".

## Testi nuovi da far approvare al PO
Etichette accessibili: "Ingrandisci" e "Riduci" (pulsanti zoom della mappa); "Mappa"; "Numero, potenza e perdite" (gruppo sliders); aria-label dell'anteprima ("Anteprima 3D del pannello: inclinazione …"); "Grafico a barre della produzione mensile". Nessun altro testo visibile.

## Giro di correzioni (2)
- Anteprima 3D con `yaw: 20` (osservatore leggermente a Est): il pannello Sud/35° si vede ora di lato, con i sostegni (più alti sul lato Nord) e la proiezione verticale neutra. Scala ridotta (84) ed elevazione 40°.
- N/E/S/O disegnate prima del pannello, a 1,5 volte il raggio del disco (fuori dal terreno), con posizione limitata al riquadro SVG: tutte e quattro visibili in posa predefinita e a 135°/20°; la N resta a distanza dal pannello (a tilt 90° potrebbe avvicinarsi, non verificato a mano).
- Desktop: il totale annuo e la nota stanno ora sotto l'anteprima (colonna sinistra), nella colonna destra solo i due comandi: il cielo vuoto a sinistra è sparito e la fascia è più bassa (circa 655 px invece di circa 700 a 1440 px; il grafico inizia comunque sotto la prima schermata da 900 px, ma più vicino).
- Telefono: le etichette dei comandi riservano due righe (≤ 480 px), così i due campi numerici stanno sulla stessa riga.
- Sommario della tabella: `Tabella dei valori mensili`.
- Verifiche: `scrollOrizzontalePx` 0 a 1440, 390, 360, 320 (chiaro e scuro); nessun errore in console. Tutti gli screenshot rifatti.
