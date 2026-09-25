---
target: Hall of Fame (app/dashboard/hall-of-fame/page.tsx)
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/app/dashboard/hall-of-fame/page.tsx"
target_fingerprint: "sha256:48a7a5ad4792d040a78cae67a3f3e2c7aeba02679db5823e167296988d5d169e"
target_path: /Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/app/dashboard/hall-of-fame/page.tsx
timestamp: 2026-09-24T10-30-42Z
slug: app-dashboard-hall-of-fame-page-tsx
closed: true
---
# Critique — Hall of Fame (`app/dashboard/hall-of-fame/page.tsx`)

**Method: dual-agent** (A: sub-agent design review su 19 screenshot Playwright a 1440/768/390, chiaro e scuro, più una sonda propria per bounding box, ordine di Tab e ARIA · B: sub-agent detector CLI + overlay `detect.js` in pagina via live server + misure Playwright: overflow, target, contrasto, console, tastiera, finestre). Estensione Chrome non connessa: tutta l'evidenza in browser è di Playwright sul dev server degli emulatori, su un account usa-e-getta (`hof@example.com`: 46 mesi dic 2022 → set 2026, il documento costruito dalla route reale «Aggiorna i record», tre note con parole civetta). Sessione in sola lettura: nessuna nota salvata, nessun controllo che spende. Data: 2026-09-24.

## Design Health Score

| # | Euristica | Punteggio | Problema chiave |
|---|---|---|---|
| 1 | Visibilità dello stato | 3 | Skeleton, «Ricalcolo…», toast, `ErrorNotice` con la clausola «non toccate». Manca la DATA dell'ultimo ricalcolo: un documento fermo da mesi (il cron non sana un account senza asset) è identico a uno fresco |
| 2 | Corrispondenza col mondo reale | 2 | «il 88,5% sopra la tua media» (misurato a tutte le larghezze), «Gli 10 anni con…», «dal migliore» su una classifica di spese e di cali, «Leggi la nota di 3/2024» dove la pagina scrive «marzo 2024», «Ranking Mensili» |
| 3 | Controllo e libertà | 3 | Escape, Annulla, eliminazione armata senza timer; ma il fuoco cade su `body` alla chiusura di ENTRAMBE le finestre (misurato a 1440: nessun `returnFocusTo`) |
| 4 | Coerenza e standard | 2 | Tre vocabolari per la stessa classifica: eyebrow «Record del patrimonio», pillola «Crescita», etichetta nota «Miglior Mese: Crescita Patrimonio»; due `tablist` senza `tabpanel` quando `SegmentedPill` ha `semantics="radio"` per questo caso |
| 5 | Prevenzione degli errori | 3 | «Salva» disabilitato finché la nota non è valida, contatore, guardia `totalIncome > 0` dichiarata nel footer; il form accetta però un anno+mese che non è in nessuna classifica, senza dirlo |
| 6 | Riconoscimento vs ricordo | 2 | L'asse del grafico stampa `mar · lug · nov · gen · mar · mag · giu · lug · ago · set · ott · set` (misurato: tre coppie identiche, nessun anno; su touch l'anno esiste solo nell'`aria-label`); l'anno in corso nella tessera Anni è «20…» |
| 7 | Flessibilità ed efficienza | 2 | Nessun «aggiungi nota» dalla riga del record: l'utente rifà anno, mese e sceglie fra 10 checkbox (27 opzioni per una frase); 24 Tab per il Dettaglio (15 sono la shell); una seconda nota sullo stesso periodo+classifica dalla riga non si apre (`matching[0]`) |
| 8 | Estetica e minimalismo | 3 | Tessere pulite, vuoti ≤ 5 px, overflow 0; ma «+18.400 €» e «+14,5%» tre volte in 200 px (verdetto, lettura Record, riga 1) e «+18.341 €» col rango del 2026 due volte (verdetto, lettura Anni) — misurati come duplicati fra regioni |
| 9 | Recupero dagli errori | 3 | La lettura fallita è esemplare; i fallimenti di salvataggio della nota sono stringhe fisse («Errore nel salvataggio della nota»), non `describeWriteError` |
| 10 | Aiuto e documentazione | 3 | I footer dichiarano le guardie; due sono a due righe (Risparmio, Dettaglio) dove la regola è UNA riga più «Come si calcola» — nessun `TileMethodNote` in pagina |
| | **Totale** | **26/40** | **Accettabile** |

## Verdetto di specificità del design

**Valutazione LLM (A, non ancorata).** Autoriale nell'impianto, intercambiabile nel dettaglio. Il verdetto che nomina un mese, il peggiore relegato al footer per non stampare due volte la stessa cifra, il mese in corso semitrasparente e bordato, il costo senza colore di segno, una classifica assente resa come `null` e spiegata: nessun tracker generico lo scriverebbe. Ma sotto la tessera la voce cambia: le etichette delle classifiche in Title Case con i due punti (`lib/constants/hallOfFame.ts`), il form nota («Ranking Mensili», «Sezioni * (seleziona almeno una)», dieci checkbox da 16 px con `ml-4`) sono un CRUD di libreria, non la mano del verdetto. E la pagina che dovrebbe celebrare è visivamente indistinguibile da Storico: stesse tessere, stesse barre da 3 px, stesso footer grigio — l'unico segnale «Hall of Fame» è il trofeo nella sidebar.

**Scansione deterministica (B).** CLI `detect` su `app/dashboard/hall-of-fame`, `components/hall-of-fame` e la narrativa: **0 finding**. Overlay in pagina: 42 hit a 1440 e 38 a 390, letti prima di citarli — sulla superficie ne restano 34/33, quasi tutti «per scala» (20 «undersized 10px» sono eyebrow, aside e asse del grafico a 10 px, 6 «tiny body» sono i footer a 11 px: la rampa enumerata di DESIGN.md), 5 «nested cards» sono le cinque tessere lette come card dentro il contenitore, 5 «layout animation» e la «hairline+shadow» sono della shell (sidebar, pillola mobile). Non banali: i tre testi a **9 px** (le due chip «ORA», il sotto-eyebrow «I 12 record nel tempo» — nel ramo, ma sotto i 10 dell'eyebrow) e la **line-length** del footer della tessera Note a 1144 px di larghezza. Nessun falso positivo da discutere oltre a questi.

**Overlay visivo.** L'iniezione è riuscita in Playwright headless, non in un tab dell'utente: nessuna sovrapposizione è visibile nel browser (estensione non connessa). I conteggi sopra sono quelli della console.

## Impressione generale

Il verdetto è il momento migliore della pagina e dura una riga. Poi la tessera dominante lo ripete, il podio lo ripete di nuovo, e l'unica riga che il lettore vive («set 2026 ORA», «2026 ORA») è quella troncata in «20…». Il grafico dei dodici record è l'oggetto più bello (il mese corrente bordato, onesto) e non sa dire in che anno sono avvenuti. L'opportunità più grande è una sola: **far dire a ogni superficie ciò che la superficie sopra non dice** — la lettura della tessera Record il quinto e la somma dei tre, l'asse del grafico l'anno, il form nota il periodo già scritto dalla riga che lo ha aperto.

## Cosa funziona

1. **Il verdetto e il footer non si contendono la stessa cifra** (`hallOfFameNarrative.ts`): il migliore in alto, il peggiore in basso, «finora» sull'anno in corso, «oggi» sul mese in corso. Onestà narrativa fatta di grammatica, non di disclaimer.
2. **Il mese in corso è disegnato come tale** (`RecordBars.tsx`: fill 0,55 + bordo `--foreground`; «ORA» nelle righe): un record non chiuso è dentro la classifica ma non comparabile, e lo si vede senza legenda. Contrasti tutti sopra la soglia in entrambi i modi (minimo 4,74:1 per il muted sulla card, 4,77 il rosso del footer); dark mode in parità piena; overflow 0 a 1440/768/390 con e senza Dettaglio; console senza un warning.
3. **Il costo senza colore** (`RecordRows.tsx`, misurato: la colonna Spese in foreground): la pagina resiste alla tentazione di dipingere di rosso una spesa, e una classifica che il documento non ha è `null`, non zero.

## Priority Issues

**[P1] «20…»: l'anno in corso è troncato nella tessera Anni a ogni larghezza.**
- **Perché conta**: misurato `2026` con `scrollWidth 32` in `clientWidth 30` (wrapper 58 px) a 1440 e a 390. È la riga con «ORA», l'unica che riguarda l'anno che il lettore sta vivendo, e l'unica illeggibile: un anno tagliato si legge come nessun anno.
- **Fix**: `page.tsx` passa `labelClassName="w-[58px]"` e `RecordRows.tsx` mette periodo + chip «ORA» nella stessa larghezza fissa con `truncate`: usare `min-w-` invece di `w-` sul periodo con `whitespace-nowrap`, e portare «ORA» fuori dalla colonna del periodo (dopo la barra, come fa l'aside), su tutte e quattro le tessere.
- **Suggested command**: /impeccable polish

**[P1] Tre articoli scritti a mano davanti a una cifra: «il 88,5%», «Gli 10 anni», «dal migliore» sulle spese.**
- **Perché conta**: `describeIncomeRecords` e `describeSavingsRecords` scrivono `prose(', il ')` prima della quota; `rankingSubject` scrive `Gli ${total} anni`; `describeFullRanking` chiude con «dal migliore» anche su Calo e Spese («I 20 mesi con le spese più alte, dal migliore.»). Nove moduli narrativi usano `articleForPercent`/`pluralArticleFor` (`patrimonioNarrative.ts`), questo no. Su un prodotto che vende fedeltà italiana, un errore di grammatica accanto alla cifra è un difetto di fiducia, non di stile (The Comma Rule).
- **Fix**: `articleForPercent(gap)` e `pluralArticleFor(total)`; «dal più alto» / «dal più forte» per Spese e Calo, «dal migliore» solo dove il primo È il migliore; test che pinnano «l'88,5%», «i 10 anni», «l'11,2%».
- **Suggested command**: /impeccable clarify

**[P2] La stessa cifra tre volte in 200 px, e il rango dell'anno due volte.**
- **Perché conta**: B ha misurato «+18.400 €» e «+14,5%» come duplicati fra Verdetto e Record del patrimonio, «+18.341 €» fra Verdetto e Anni; la riga 1 del podio li ripete una terza volta. La regola che la guida rivendica («never the same figure twice») è applicata al footer e violata alla riga sopra: l'attenzione, invece di crescere dal verdetto alla tessera, ristagna.
- **Fix**: la lettura della tessera Record dice ciò che il verdetto non dice — la somma dei tre e il quinto («I tre migliori valgono insieme +45.500 €; il quinto è già a +2195 €»); la lettura Anni parla del distacco dal posto sopra («a −8600 € dal secondo, e non è ancora finito») invece del rango che il verdetto ha già dato. Le funzioni sono già separate (`describeNetWorthRecords`, `describeYearRecords`): cambiano le clausole, non la struttura.
- **Suggested command**: /impeccable distill

**[P2] L'asse del grafico senza anno: «mar … mar», «lug … lug», «set … set».**
- **Perché conta**: il grafico esiste per rispondere «QUANDO sono avvenuti i record» (`buildRecordTimeline`) e non può: 12 etichette, 3 coppie identiche, l'anno solo nell'`aria-label` e nel tip hover, che monta solo sotto `pointer: fine` — su un telefono il grafico non è databile.
- **Fix**: `buildRecordTimeline` etichetta il primo mese di ogni anno con l'anno («mar 24», poi «lug», «nov», «gen 25»…), e `RecordBars` lo mette in `font-semibold` come già fa per il mese in corso; nessun `<text>` nel plot (le etichette restano fuori dall'SVG).
- **Suggested command**: /impeccable clarify

**[P2] Il form nota è fuori vocabolario e fa rifare all'utente ciò che la riga già sa.**
- **Perché conta**: misurati 10 checkbox 16×16 in righe da 14 px, gruppi «Ranking Mensili/Annuali» come `<p>` e non `fieldset/legend`, etichette con asterischi, placeholder «22.000 euro», «Salvataggio...» con tre punti; nessun `returnFocusTo` su nessuna delle due finestre (fuoco su `body` dopo Escape, misurato); errori di scrittura come stringhe fisse. Il marcatore sulla riga apre SOLO una nota esistente (`NoteTrigger`): per annotare marzo 2024 l'utente sceglie anno, mese e classifica fra 27 opzioni, mentre `RecordRows` ha già `row.year`, `row.month` e `sectionKey`. La guida dice che le due finestre «keep their pre-redesign chrome»: non è più vero (sono su `ResponsiveModal`, eyebrow 10 px, titolo 20 px, lettura come Description) — è il CORPO a essere rimasto quello vecchio.
- **Fix**: (a) «Aggiungi una nota» dalla riga, con periodo e classifica precompilati, così le checkbox diventano una conferma; (b) `fieldset` + `legend`, etichette dal vocabolario delle tessere («Crescita del patrimonio · mese»), `returnFocusTo` dall'`event.currentTarget` su entrambe le finestre, `describeWriteError`; (c) aggiornare la guida.
- **Suggested command**: /impeccable harden

## Carico cognitivo

Checklist a 8 voci, **5 fallite** (alto): una cifra stampata più volte; etichette non autoesplicative (Title Case, «Ranking», «Sezioni»); punti di decisione oltre le 4 opzioni; affidamento alla memoria (asse senza anni, «20…», il form che chiede di ricordare la classifica della riga); tre vocabolari per una classifica. Passate: progressive disclosure (Dettaglio chiuso di default, come Storico e Dividendi), un'azione primaria per superficie, scansione a blocchi uniforme. Punti di decisione > 4: la pillola «Categoria» del Dettaglio (5 opzioni, tollerabile: è una vista, e a 390 sta in 316 px senza scroll); il form nota (10 checkbox + 5 anni + 12 mesi = 27 opzioni per scrivere una frase, la decisione più costosa della pagina).

## Percorso emotivo

Ingresso caldo: il verdetto nomina un mese e il punto verde chiude la frase. Sviluppo piatto: la tessera dominante ripete il verdetto, il podio lo ripete ancora. Nessun secondo picco: il grafico potrebbe esserlo e non sa dire l'anno. Fine (peak-end): la tessera dominante chiude su «−9800 €» in rosso, la tessera Note su un disclaimer, il Dettaglio su una nota a piè di pagina di due righe sul primo mese che non entra in nessuna classifica — la pagina che dovrebbe celebrare finisce tre volte su una nota difensiva. «Il prodotto riporta, non esulta» è rispettato; ma riportare un record e riportare un'assenza con lo stesso peso non è deferenza, è appiattimento. Rassicurazione presente (guardie dichiarate, «Nessun anno in perdita.»), ma senza una data di ricalcolo è a metà.

## Persona red flags

**Alex (power user)**: nessun «aggiungi nota» dalla riga; seconda nota sullo stesso periodo+classifica irraggiungibile dalla riga; stato del Dettaglio (periodo, categoria, aperto) non nell'URL; 24 Tab per il Dettaglio.

**Sam (screen reader / tastiera)**: fuoco su `body` alla chiusura delle due finestre (1440; sotto 769 px il drawer non prende il fuoco per decisione registrata in doc/guide/dialog.md); due `tablist` senza `tabpanel`; gruppi di checkbox senza `fieldset/legend`; `CollapsibleTrigger aria-label="Dettaglio"` sovrascrive il testo visibile («La classifica completa — 20 mesi e 10 anni…»); «Leggi la nota di 3/2024» col mese numerico. Bene: h1 → h2 (verdetto) → h3 (sei tessere) misurata, `aria-label` del grafico con i 12 valori e gli anni, ogni bottone con un nome, anello di fuoco su ogni stop.

**Marco (accumulatore, lettura mensile e fidata)**: «il 88,5%» e «20…» sono i due punti in cui la lettura rapida inciampa; nessuna data di ricalcolo; su telefono il grafico non è databile.

**Giulia (co-owner su account condiviso)**: la pagina legge `hall-of-fame/{ownerId}` e non lo dice mai; «La tua nota» / «Hai annotato 3 periodi» in seconda persona singolare — una nota scritta dal partner le appare come propria (`NoteEntry` non porta un autore). Inferito dal codice, non misurato su un account condiviso.

## Osservazioni minori

- Tessera Note a 1440 e 390: «mar 2024» va a capo (misurato: etichetta 39 px vs 20 delle altre righe) perché `NoteTile.tsx` non ha `whitespace-nowrap` e la colonna da 240 px cede all'etichetta delle classifiche.
- Marcatori nota `NoteTrigger` 28×28 su touch (3 su 23 target sotto 44 a 390); il «+» del navbar mobile 36×36 (pattern di shell, come Storico).
- Tabella del Dettaglio a 390: `min-w-[520px]` in 356 px, scroll interno senza alcun indizio (`box-shadow: none`, `mask-image: none`): «Variazione», «Patrimonio prima» e «Nota» spariscono a destra.
- Le due pillole del Dettaglio a 1440 sono alte 25 px (`py-1`): sopra i 24 di un mouse, ma sotto i 32 del pavimento delle liste dense.
- Dettaglio vuoto: due frasi consecutive per un'assenza («Nessun record in questa classifica.» + «Nessun periodo è entrato in questa classifica.»); la vista nota ripete la classifica nella lettura E nel corpo.
- «46» stampato tre volte (header, aside Record, footer Entrate); il sotto-eyebrow «I 12 record nel tempo» sopra una classifica di 20, senza dire che 8 sono stati tolti (i più piccoli).
- Il primo anno parziale (2022, un solo mese) è classificato quinto con «+937 €, +0,8%» accanto ad anni interi: «finora» esiste per l'anno in corso, il primo anno non ha una parola.
- Tre stop di Tab con lo stesso nome «Aggiungi una nota» a 390 (icona navbar, bottone impilato, aside Note).
- Footer Risparmio e nota del Dettaglio a due righe; footer Note a 1144 px di misura.
- La guida § Files non elenca `RecordRows/RecordBars/NoteTrigger`, e la riga sui «pre-redesign chrome» è superata. Nessuno spec Playwright: la sonda di oggi era, di fatto, il primo.

## Domande da considerare

1. Se la pagina celebra, perché la sua tessera dominante finisce in rosso? Un footer «Il peggiore resta ottobre 2023, −9800 €: da allora 23 mesi su 35 in crescita» racconta la stessa verità con la fine giusta.
2. Il 2022 con un mese è un anno? Il modulo dei record lo classifica; la pagina è dove si legge.
3. Perché la classifica dice a chi legge di annotare, invece di chiedergli cosa è successo? Aperto dalla riga con periodo e classifica già scritti, il form diventa una risposta a «cosa è successo a marzo 2024?» — e l'archivio un diario.
