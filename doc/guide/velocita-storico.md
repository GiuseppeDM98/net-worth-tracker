# Velocità — la baseline storica

> **When to open this guide** — whoever needs the measure the fourteen PERF specs of 2026-09-26 all started from.
> Moved here from `doc/guide/velocita.md` on 2026-11-19 (NOVE-24: that guide was 518 lines, past what a guide
> holds); the tools, the baseline in force and the register of raised ceilings stay there. The body is in Italian,
> as the manual was written.

## Baseline storica (2026-09-26, macchina Windows, mirror, nessun throttling CPU)

La misura usa-e-getta da cui sono partite le quattordici spec PERF (dossier `doc/perf/`, 2026-09-26 → 2026-10-08), presa su
`develop` PRIMA dei contributi del 2026-09-27 (#400, #401, #403) e della nuova Esposizione (PERF-00, #407), con uno script
Playwright usa-e-getta poi diventato `scripts/perfBenchmark.mjs`: 3 run cold, 2 warm, mediane; i grezzi restano in git
(`git show d8d3d98:doc/perf/reference/baseline-2026-09-26-cold.log`, e `…-warm.json`). Superata il 2026-09-28 dalla
baseline in vigore sopra; resta come «prima» di tutto il lavoro. I «46 caratteri di testo» dell'HTML erano il `<title>`:
il `body` ne aveva 0.

**Le tre domande di partenza, con le risposte.** Firebase non è il limite: con Firestore emulato (round trip ~1 ms)
Cashflow impiegava 2,1 s a mostrare un numero, Storico 2,3 s, Analisi 1,7 s — CPU del browser (deserializzare 1533
documenti, ridurli, montare la pagina) e catena d'avvio (HTML vuoto → JS → Firebase Auth → query); in produzione ogni
round trip vale 50–150 ms, quindi contano i round trip IN SERIE (Rendimenti ne faceva 4–5 con 17 chiamate API; la
Panoramica ricalcolava il riepilogo in sei stadi sequenziali con le funzioni Vercel a Washington). Non serviva migrare
(AGENTS.md § React Query and Derived State): le due leve lato Firebase erano la regione delle funzioni e i riassunti
materializzati per pagina. Lato codice stava quasi tutto: la shell che non esisteva finché Auth non risolveva, la cache
che moriva al reload, 460 KB gz di JS su ogni pagina con recharts quattro volte e il PDF nel grafo di Storico, le stesse
collezioni lette con meccanismi diversi, le spese intere per mostrare un mese, N grafici montati al buio su Patrimonio,
il React Compiler mai acceso e 70 stati in un componente, il lavoro di layout e colori a ogni mount.

**Cold** — reload della route dopo il login (ms; mediane di 3):

| Pagina | primo numero | LCP | long task | Firestore | API | note |
|---|---|---|---|---|---|---|
| Panoramica | 150 | 680 | 93 | 3 | 1 | un payload materializzato |
| Patrimonio | 790 | 1230 | 270 | 8 | 1 | N sparkline montate; waterfall mutuo e ledger |
| Cashflow › Tracciamento | 2110 | 2200 | 400 | 3 | 0 | tutta E (1533 doc) |
| Analisi | 1690 | 1710 | 565 | 3 | 0 | tutta E |
| Rendimenti | 1110 (1000–2070) | 1140 | 144–377 | 10–14 | 17 | 5 collezioni lette due volte + 10 route yield |
| Storico | 2285 | 2300 | 670 | 3 | 0 | tutta E; PDF nel bundle |
| Allocazione | 590 | 610 | 165 | 4 | 1 | Esposizione → Yahoo ogni volta |
| Previdenza | 584 | 600 | 96 | 4 | 0 | il modello: tutto su React Query |
| FIRE | 2040 | 2050 | 300 | 7–8 | 0–1 | catena a 3 |
| Hall of Fame | 510 | 530 | 88 | 3 | 0 | un documento |
| Impostazioni | 527 | 548 | 93 | 5 | 0 | 71 `useState` |

Lo spinner di `ProtectedRoute` (Firebase Auth) se ne andava fra 86 e 228 ms dal `navigationStart`.

**Warm** — navigazione client dalla sidebar, stessa sessione (ms dal click; mediane di 2):

| Pagina | skeleton mostrato | primo numero | long task | Firestore | API |
|---|---|---|---|---|---|
| Panoramica | no | 141 | 0 | 5 | 0 |
| Patrimonio | sì | 314 | 83 | 11 | 0 |
| Cashflow | sì | 1226 | 124 | 4 | 0 |
| Analisi (spese già in cache) | **no** | **242** | 153 | 2 | 0 |
| Rendimenti | sì | 574 | 0 | 13 | 17 |
| Storico | sì | 1250 | 255 | 8 | 0 |
| Allocazione | sì | 606 | 55 | 4 | 1 |
| Previdenza | sì | 131 | 0 | 2 | 0 |
| FIRE | sì | 1757 | 75 | 6 | 0 |
| Hall of Fame | sì | 127 | 0 | 2 | 0 |

Analisi con le spese già in cache (242 ms, nessuno skeleton) contro Analisi a freddo (1690 ms): la stessa pagina, con lo
stesso dato già in memoria, sette volte più veloce — la misura che ha giustificato la cache persistita e un solo binario
per i dati (doc/guide/cache-persistita.md, AGENTS.md § React Query and Derived State).

**Bundle** (gzip, chunk iniziali per route): condivisi da ogni pagina 460 KB (21 chunk; 136 KB firebase, 69 react-dom, 43
framer-motion) · login 415 · Panoramica 535 · Patrimonio 717 · Cashflow 726 · Analisi 734 · Rendimenti 681 · **Storico
1192** · Allocazione 510 · Previdenza 589 · FIRE 743 · Hall of Fame 534 · Impostazioni 610 · Assistente 657; recharts in
QUATTRO chunk da 350 KB raw (uno per pagina); lucide-react intero (575 KB raw / 143 KB gz) alla prima icona di
categoria; 93 chunk su disco, 9,0 MB raw.
