---
target: critique Cashflow › Divisione
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
target_identity: "file:/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/components/cashflow/ExpenseSplitTab.tsx"
target_fingerprint: "sha256:7e7d9ffaaafedd28f2a18fb7769c2249d4b63f94693ad9d96e0c535659e21494"
target_path: /Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/components/cashflow/ExpenseSplitTab.tsx
timestamp: 2026-09-21T18-10-00Z
slug: components-cashflow-expensesplittab-tsx
closed: true
---
Method: dual-agent (A: design review sub-agent · B: detector/browser sub-agent). Estensione Chrome non connessa: l'evidenza live è di **Playwright headless** sugli emulatori, sulla fixture `divisione@example.com` (conto `test-user-divisione`, parole-civetta Ghiandaia/Tarsio/Quaglia/Lemure/Bradipo/Okapi/Narvalo/Pangolino/Vombato/Axolotl/Suricato), a 1440 e 390, light e dark, sui tre periodi (settembre calcolato · agosto `missing-salary` · luglio vuoto). L'overlay `detect.js` ha girato in una pagina headless: non c'è nessuna scheda visibile nel browser del proprietario. La feature non era mai stata eseguita end-to-end con il flag acceso (doc/guide/cashflow-divisione.md § Per-page blind spots): questa critique è la prima volta che la superficie è stata vista funzionare.

# Critique — Cashflow › Divisione (`components/cashflow/ExpenseSplitTab.tsx`)

## Design Health Score — modo Operate

| # | Euristica | Voto | Problema chiave |
|---|---|---|---|
| 1 | Visibilità dello stato | 3 | `SKELETON_CELLS` dichiara 3 celle 5/7/7, la griglia ne atterra 4 a 5/7/6/6: salta, e il commento sopra promette il contrario (`:48-54`). I 210 € «in calendario» sono dichiarati nel verdetto e marcati in nessuna delle cifre che alimentano |
| 2 | Corrispondenza col mondo reale | 3 | «8 **voci**» qui contro «19 **movimenti**» su Tracciamento per le stesse righe; «Quota» non dice mai quota *di che cosa*; «mancano» detto di denaro non ancora uscito |
| 3 | Controllo e libertà | 1 | **Un solo elemento operabile** in un pannello di 1144×757 (il PeriodPicker, misurato). Nessuna attribuzione, nessun drill, nessun link alle righe |
| 4 | Coerenza e standard | 2 | Unica delle cinque tab Cashflow senza azione d'intestazione (`page.tsx:253-300`); stato vuoto fatto a mano invece di `EmptyState`; la stessa categoria stampa 8× la cifra sulla tab accanto |
| 5 | Prevenzione degli errori | 2 | `resolveSplitBasis` che rifiuta invece di regalare il 100% a chi ha registrato uno stipendio è esemplare — ma il reddito da lavoro non intestato sparisce dalla base in silenzio (P1-5) |
| 6 | Riconoscimento più che ricordo | 2 | Nessuna superficie dice **dove** si attribuisce una riga; «Per categoria» non dichiara il perimetro; «Famiglia» è testo, non un link |
| 7 | Flessibilità ed efficienza | 1 | Nessuna attribuzione in blocco, nessun deep link, nessun drill: un lettore di ritorno qui non ha niente da fare |
| 8 | Estetica e minimalismo | 1 | **578×181 px di vuoto misurati** accanto a Tarsio a 1440; ad agosto verdetto e lettura della Quota sono le **stesse 18 parole**; `2600 €`, `1700 €`, `60%`, `40%` stampati quattro volte a testa |
| 9 | Recupero dagli errori | 2 | Diagnosi ottima (nomina l'input mancante e chi); recupero assente: il ramo `missing-salary` — l'unico che una famiglia incontra davvero — non nomina **nessuna** destinazione (`expenseSplitNarrative.ts:79-80`), mentre i due rari ne nominano una (`:69`, `:72`) |
| 10 | Aiuto e documentazione | 3 | La lettura dichiara la base ad alta voce; non dichiara mai la sua volatilità (una tredicesima muove il rapporto) |
| **Totale** | | **20/40** | **Acceptable**, al limite inferiore — con due P0 dentro |

Nessuna euristica `n/a`.

## Verdetto di specificità del design

**Valutazione LLM.** Le parole sono scritte per questo prodotto e per nessun altro: «A settembre lo stipendio di Tarsio non basta.», «Se ne va il 105% dello stipendio.», «mancano» contro «restano», l'articolo che concorda con la percentuale *come stampata*, l'elenco all'italiana, il tempo verbale che segue se il mese è ancora in corso. `expenseSplitNarrative.ts` non è sollevabile in nessun altro prodotto. **La composizione sotto quella frase, invece, è intercambiabile — e a 1440 è rotta.** Le due persone che la pagina esiste per confrontare finiscono su righe diverse, a 482 px l'una dall'altra in orizzontale e 240 in verticale, con il 18% dell'area della griglia come vuoto in un angolo. La specificità è tutta nel modulo delle parole e non arriva mai al layout.

**Scansione deterministica.** CLI sui file della superficie: **0 finding, exit 0**; sui cinque primitivi che rende (`tile`, `page-verdict`, `ranked-rows`, `narrative-text`, `period-picker`): **0, exit 0**. Verificato che lo zero non sia un no-op (`components/cashflow/*`, `components/ui/*`, tutto `app/dashboard` → 0) e che nessuno dei cinque waiver in `.impeccable/config.json` copra questi file. In-page: **79 hit, di cui 12 dentro il tabpanel** — e tutte e 12 false. Le 8 `undersized-ui-text` sono esattamente `TILE_EYEBROW_CLASS` (10px) e `TILE_SUB_EYEBROW_CLASS` (9px), cioè i gradini della rampa enumerata; le 4 `nested-cards` sono state **falsificate, non assunte**: ogni `section` è stata risalita fino a `body` e non ha un solo antenato card-like. Le altre 67 (85%) vengono dalle tab sorelle montate con `forceMount` (48), dalla shell (17) e dal chrome di pagina (2) — esattamente la sovrastima registrata il 2026-09-18.

**Misure pulite, e contano.** Overflow orizzontale su `main`: **0 nodi su 12 stati**. Contrasto del testo: **0 fallimenti su 105 nodi × 4 combinazioni**, minimo 4,73:1 in light e 6,19:1 in dark. Console: **0 errori, 0 warning, 0 page error** su ~20 caricamenti. Gerarchia dei titoli corretta (`h1` → `h2` verdetto → quattro `h3`). Nessun controllo senza nome accessibile. Nessuna tessera stampa una cifra mentre la sua lettura dice che la cifra non si può calcolare — il rifiuto tiene end-to-end, e questa era la cosa più importante da verificare su una feature mai eseguita con il flag acceso.

Una nota sul Known Issue aperto: `--muted-foreground` su `--background` in light misura qui **4,73:1**, non 4,46:1. Il punto NON è chiuso — la misura originale era presa sulla description del `PageHeader`, che non è stata rimisurata direttamente.

**Overlay.** Injection di `detect.js` riuscita (una sola console group, `68 anti-patterns found`, nessun chrome `#impeccable-overlay` renderizzato) ma in Chromium headless: nessun overlay visibile nel browser dell'utente. Live server avviato su :8400 e fermato (`live-server stop`, porta chiusa, pid terminato).

## Impressione generale

Questa è la pagina con le frasi migliori dell'app montate su una griglia che non chiude. Il modello dei dati è severo dove conta: rifiuta di dividere quando non sa, nomina chi manca, tiene fuori dalla divisione gli euro di chi non è più in Famiglia e lo dice. Poi stampa quel rigore in quattro riquadri che non si allineano, senza un solo verbo: niente da premere, niente da attribuire, nessun numero cliccabile, e la frase più dura del prodotto — «lo stipendio di Tarsio non basta» — consegnata sopra denaro che non è ancora uscito dal conto.

La singola occasione più grande: **invertire la gerarchia**. La domanda è «quanto resta a ciascuno» e l'eroe da 40px risponde «quanto è costato in comune». Se le persone diventano la riga dominante, il confronto torna possibile, il vuoto sparisce con loro e la tessera «In comune» smette di essere la cosa più grande su una pagina che non parla di lei.

## Quello che funziona

1. **Il rifiuto è reale, non dichiarato.** `resolveSplitBasis` restituisce `unavailable` con `missingNames`, ogni figura dipendente diventa `null`, e `personalSpending` sopravvive perché è un fatto qualunque cosa facciano le quote. Lo schermo di agosto lo prova: due «—», due letture che nominano Tarsio, e nessuna percentuale inventata. È il Principio 1 di PRODUCT.md implementato, non citato.
2. **La dichiarazione degli orfani.** «8 voci in comune; altre 2 per 120 € sono di qualcuno che non è più in Famiglia, e restano fuori dalla divisione.» Un prodotto che nomina gli euro che sta *escludendo* nello stesso respiro di quelli che conta è raro. (Ed è proprio questo che rende P1-5 più stridente.)
3. **Il telefono è il progetto migliore, e la correzione è già nel file.** A 390 le due tessere persona si impilano a piena larghezza, verde sopra rosso: esattamente il confronto per cui la pagina esiste. Fra 768 e 1439 (`tablet:col-span-1`) stanno affiancate, larghe uguali, cime allineate. Solo il layout ≥1440 è rotto — il breakpoint di punta.

## Problemi prioritari

### [P0] La griglia a 12 colonne non chiude, e separa la coppia per cui la pagina esiste
`ExpenseSplitTab.tsx:127,145,175,200`. «In comune» è `col-span-5 row-span-2`, «Quota» `col-span-7` (riga 1: 5+7 = 12 ✓), le tessere persona `col-span-6`. La riga 2 fa quindi **5 + 6 = 11** e Tarsio, che non ci sta, va a capo da solo. Misurato a 1440 light (griglia 1144px):

| tessera | x | y | l × a |
|---|---|---|---|
| In comune | 0 | 0 | 470 × 427 |
| Quota | 482 | 0 | 662 × 187 (68px morti sotto il contenuto) |
| Ghiandaia | 482 | 199 | 566 × 228 |
| **Tarsio** | **0** | **439** | 566 × 181 — **vuoto di 578 × 181 px alla sua destra** |

**Perché conta**: l'unico confronto per cui la pagina esiste diventa impossibile — +1173 € in alto a destra contro −83 € in basso a sinistra è una saccade diagonale — e lo schermo legge come non finito. A tre membri (`col-span-4`) peggiora: 5+4 = 9 in riga 2, 4 da solo in riga 3.
**Correzione**: avvolgere entrambe le tessere persona in **una** cella `desktop:col-span-7` contenente `grid grid-cols-2 gap-3`. Riga 2 = 5 + 7 = 12 esatto, la coppia torna affiancata, il vuoto sparisce. E allineare `SKELETON_CELLS` alla geometria che atterra.
**Comando suggerito**: `/impeccable layout`

### [P0] Il rosso di Tarsio è denaro che non è ancora uscito
Il verdetto onora **The Scheduled-Is-Not-Spent Rule**: «Nel totale ci sono ancora 210 € di spese già in calendario da qui a fine mese». Il suo corollario — *una riga che non è successa è marcata ovunque sia elencata* — non è onorato da nessuna altra parte. I 210 € entrano in `common.total`, nella classifica (dove «Bollette Okapi» stampa 390 € = 180 già pagati + 210 in calendario, indistinguibili), in entrambi i `commonShare` e in entrambi i residui, non marcati. La quota di Tarsio su quei 210 € è 83,02 €; il suo residuo stampato è **−83 €**. Tutto il disavanzo è denaro non speso. `MemberBalance` non ha un campo per lo scheduled: è strutturale, non un caso della fixture.

**Perché conta**: la pagina consegna la frase più dura del prodotto sulla forza di soldi ancora in conto, e la colora col token del segno. È esattamente la classe di affermazione che `resolveSplitBasis` è stato scritto per impedire, entrata dall'altra porta. Centri di Costo distingue già `exceeded` (fatto) da `atRisk` (calendario); Divisione ha una parola sola per entrambi.
**Correzione**: `MemberBalance` guadagna `scheduledShare`; la tessera stampa il residuo contabilizzato, col token del segno che segue quello, e un piede «di cui 83 € ancora in calendario»; il verdetto sceglie «mancano» solo sul contabilizzato.
**Comando suggerito**: `/impeccable harden`

### [P1] La pagina non ha un solo verbo
Il pannello contiene **un elemento operabile**, misurato: il PeriodPicker. Tutto il resto è testo. «8 voci in comune» e «altre 2 per 120 €» sono inerti, e la strada che chiuderebbe il cerchio esiste già a una tab di distanza — il filtro «Intestatario» di Tracciamento, costruito per questo (`lib/utils/movementsOwnerFilter.ts`) — e Divisione non la indica mai. È anche l'unica delle cinque tab Cashflow senza azione d'intestazione: `tracking` → «Nuova Spesa», `budget` → «Aggiungi budget», `cost-centers` → «Nuovo centro», `dividends` → due, `split` → niente.

E il ramo che una famiglia incontra davvero non nomina nessuna destinazione: `:69` e `:72` finiscono con «aggiungile in Impostazioni → Preferenze → Famiglia» / «scegliile in … → Cashflow», mentre `:79-80` — `missing-salary` — finisce con «finché manca, le quote non si calcolano.» e basta. Intanto l'unico link in uscita della tab è l'ingranaggio d'intestazione, che porta a `?tab=spese`: la pagina indica a parole un posto dove il suo unico link non va.

**Perché conta**: chi accende la funzione vede una divisione 60/40 completa e plausibile il primo giorno — perché ogni riga storica è «in comune» per default — e non scopre mai che l'attribuzione esiste. Crederà che la divisione sia reale.
**Correzione**: i conteggi diventano link (`?tab=tracking&owner=common`, `&owner=unassigned`, col periodo al seguito); la tab prende un'azione d'intestazione «Attribuisci spese»; la tessera **Quota**, che possiede l'assenza, prende l'unica azione del ramo `missing-salary` («Registra lo stipendio di Tarsio»). Il fan-out di scrittura in quattro punti esiste già in `expenseService.ts`.
**Comando suggerito**: `/impeccable onboard`

### [P1] Il mese vuoto dà due spiegazioni e stampa uno zero da 40px
Luglio: titolo «A luglio le quote non si possono calcolare.», frase «A luglio non c'è nessuna spesa da dividere.» Due spiegazioni diverse dello stesso schermo, e la prima suggerisce un problema di dati da andare a sistemare. La causa è in `expenseSplitNarrative.ts:151`: `headline` viene calcolato da `resolveHeadline` e la guardia del vuoto a `:155` restituisce quello stesso titolo con una frase diversa, invece di sovrascriverlo.

E la tessera «In comune» stampa un **`0 €` da 40px** con sotto «Nessuna spesa in comune in questo periodo.» come `<p>` a 11px fatto a mano (`:167-169`), scavalcando `components/ui/empty-state.tsx`, il cui docstring dice testualmente che non porta nessuna cifra perché un zero lì sarebbe il secondo nome, che è un fatto diverso. Entrambe le sorelle lo usano (`CostCentersTab.tsx:289`, `TransactionFeed.tsx:415`). **The Absence-Has-Three-Names Rule** violata in una tessera sola e in due direzioni insieme.
**Correzione**: quando il periodo non contiene niente, il titolo diventa quello del vuoto; la tessera lascia cadere lo `0 €` e rende `<EmptyState>` con la sua azione.
**Comando suggerito**: `/impeccable clarify`

### [P1] Il reddito da lavoro non intestato sparisce dalla base, e nessuno lo dichiara
`resolveSplitBasis` salta ogni riga di stipendio senza `personalMemberId` **e** ogni riga il cui intestatario non è più in Famiglia (`expenseSplitSummary.ts:156-159`): entrambe con un `continue` muto. Sulla fixture la categoria «Stipendio» del mese vale 5400 €, la base ne somma **4300**: 1100 € di reddito da lavoro sono esclusi dalle quote, e la pagina stampa «60% · 40%» con piena sicurezza. Il lato spese dichiara i suoi orfani in una frase esemplare; il lato entrate — quello che *decide le percentuali* — non dichiara niente.

**Perché conta**: è la stessa disonestà che la feature è stata costruita per evitare, sull'input che conta di più. Una percentuale calcolata sull'80% degli stipendi del mese non è una quota, è una stima non dichiarata.
**Correzione**: la clausola speculare. `describeSplitBasis` aggiunge «1100 € di reddito da lavoro non sono intestati a nessuno e non entrano nelle quote» ogni volta che il reddito da lavoro del periodo supera la somma degli stipendi attribuiti.
**Comando suggerito**: `/impeccable harden`

## Bandiere rosse per persona

**Sam (tastiera, screen reader).** Un solo controllo operabile in 1144×757. Il pannello è **2 stop di Tab**: il contenitore (stop 21) e il picker (stop 22) — cioè l'asse che comanda la pagina è l'*ultimo* stop, benché sia disegnato in alto a destra. Il `role="tabpanel"` porta `aria-labelledby="radix-_r_i_-trigger-split"` e **quell'id non esiste nel documento**: il pannello focalizzato ha nome accessibile vuoto, e i `role="tab"` non hanno né `id` né `aria-controls`. Gli anelli di focus del pannello misurano 1,54:1 in light e 1,87:1 in dark, sotto il pavimento di 3:1. `ExpenseSplitTab.tsx:218` rende un `—` letterale dentro il `<p>` della cifra, senza `aria-hidden`: la regione di Ghiandaia annuncia «… Senza le quote non si sa quanto resta. Trattino.» Il contrasto del testo, però, è pulito ovunque: nessun fallimento AA in nessuno dei due modi.

**Casey (telefono, distratta).** Il layout migliore e zero overflow — ma l'unico controllo del pannello misura **190 × 36 px** a 390, otto sotto il pavimento di 44, con `pointer: coarse` confermato attivo. Il suo drawer, aperto da qui, ha **52 controlli su 52 sotto i 44px**, frecce mese a **28 × 28** e un `role="dialog"` senza nome accessibile. E la cifra per cui Casey ha aperto l'app — il proprio residuo — sta a y≈390 di uno scroll da 1556: seconda schermata.

**Il co-intestatario del conto condiviso** (PRODUCT → *Users*). È letteralmente la persona per cui la funzione esiste, ed è dove la superficie è più sottile. **La pagina non sa chi la sta leggendo**: Tarsio, entrato col proprio account, si vede come una di due tessere simmetriche in terza persona. **La divisione è asserita, mai concordata**: «Le quote vengono dagli stipendi del periodo» presenta un accordo domestico come un fatto di sistema, e una tredicesima lo muove in silenzio senza che nulla dica che è cambiato. E **«mancano 83 €» sarà letto come un debito**: la guida è esplicita che la riconciliazione di chi ha pagato è fuori scopo, ma lo schermo non lo dice mai, e un co-intestatario a cui si dice che gli mancano 83 € su una pagina intitolata «quanto resta a ciascuno» concluderà di doverli a qualcuno.

## Osservazioni minori

- **La classifica è sul perimetro del comune e non lo dice.** Stesso conto, stesso mese, tab adiacenti: qui «Affitto Lemure 900 € · 44%», su Tracciamento «900 € · 27%»; «Auto Narvalo 130 € · 6%» contro «1045 € · 31%». Entrambe si chiamano «per categoria». L'`aria-label` dell'elenco dice «Spese in comune per categoria» — lo screen reader è informato, l'occhio no. Basta il sotto-occhiello: «Per categoria · solo in comune».
- Ad agosto la seconda clausola del verdetto e l'intera lettura della Quota sono le **stesse 18 parole**, a ~180px di distanza su desktop e impilate sul telefono: **The One-Tile-One-Question Rule**.
- `SKELETON_CELLS` promette nel commento che «niente salta quando i dati atterrano», e dichiara tre celle contro quattro tessere.
- «Ghiandaia» compare **cinque volte** sullo schermo di settembre, a tre dimensioni diverse (9px dentro Quota, 10px come occhiello, dentro due frasi).
- La tonalità del verdetto è `negative` appena *una* persona è in rosso: il mese da +1173 € di Ghiandaia viene colorato dall'aritmetica di Tarsio, e la pagina non dice mai di chi sta giudicando il mese.
- A 1280 la tessera «In comune» va a piena larghezza e le barre da 3px si stirano a 564px con ~500px di corridoio vuoto; la riga «Altre» non ha barra affatto.
- Il dark mode è un'inversione pulita: nessun difetto specifico del tema su sei viewport.

**Misure che non sono di questa superficie** (le incontra, non le possiede): il bordo di `Button variant="outline"` a **1,26:1** light / **1,47:1** dark, sotto il 3:1 di WCAG 1.4.11; i 52 controlli sotto i 44px e le frecce 28×28 del drawer di `PeriodPicker`; il `role="dialog"` del drawer senza nome; il cablaggio `tab`/`tabpanel` di `PageTabBar` (nessun `aria-controls`, `aria-labelledby` penzolante) — che è di ogni pagina, non di questa; la description del `PageHeader` a interlinea 1,25.

## Domande da considerare

1. **Perché il pool è la tessera dominante?** La domanda è «quanto resta a ciascuno» e i 40px rispondono «quanto è costato in comune». Se le persone diventano la riga dominante, la gerarchia combacia con la domanda e il vuoto sparisce con lei.
2. **La tessera «Quota» deve esistere?** Contiene due stipendi e un rapporto già detti dal verdetto, da entrambe le letture persona e dal suo stesso aside da 10px. L'unico mestiere insostituibile che ha è possedere l'assenza della base e portare l'unica azione.
3. **E se la tessera parlasse in seconda persona a chi è loggato?** «Ti restano 1173 €» per chi guarda, terza persona per l'altro. L'unica pagina del prodotto che parla di due persone smetterebbe di parlare da nessun posto.
4. **«Mancano» è il verbo giusto per un residuo ancora in parte futuro?** Centri di Costo separa già il fatto dal calendario. Qui una parola sola copre entrambi.
5. **Se le quote sono un accordo domestico, la pagina può mai enunciarle senza dire quando si sono mosse l'ultima volta?** «60/40, era 55/45 ad agosto» costa una clausola e trasforma un output di sistema in un fatto che due persone possono tenersi a vicenda.
