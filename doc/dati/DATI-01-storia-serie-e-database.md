# DATI-01 — The series' history leaves the README; the database decision is restated on today's count

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: nothing. Written on 2026-11-23; every `file:line`
> is cited @ b0bf8276. Owner's points 1 and 3; decisions 2 and 9.

## 1. The problem today (evidence on the code)

- **README.md carries three paragraphs of series history** — «The mobile-composition series» (`README.md:242-264`),
  «The AI series» (`:266-285`), «The November series» (`:287-313`), 72 lines under `## Documentation` (`:229`). They
  were put there by each series' last retirement, because `doc/guide/collaudo.md:163` says «the series' history goes
  to README.md § Documentation». Their only reader is someone looking for a deleted spec folder, and every one ends on
  the same pointer (`git log -- doc/mobile/`, `-- doc/ai/`, `-- doc/nove/`). README.md is the document a visitor of the
  public repo reads first: 72 lines of internal process sit between the documentation table and the tech stack.
- **Four sentences point at it**: `CLAUDE.md:17` («the series' history in README.md § Documentation»), `CLAUDE.md:57`
  («The nine MOB specs (2026-09-26 → 2026-10-17) are history: README.md § Documentation.»),
  `doc/guide/collaudo.md:157` («their history in README.md § Documentation») and `:163` (the rule itself).
  `doc/guide/collaudo.md:169` and `:189` name the «§ Documentation» of `Draft Release Temp.md`, a different section:
  they stay.
- **The database decision is recorded on a count of 2026-09-26** (`AGENTS.md:181-186`): «no migration
  (Postgres/Supabase/Convex would rewrite ~40 services, the rules and the harness…)». On 2026-11-23 the owner asked
  again, for Turso (SQLite), and the code was counted: the answer is the same, but the sentence does not name SQLite,
  does not say WHY the move is expensive (the browser writes Firestore directly) and does not say that login is a
  separate question.

## 2. Goal and acceptance criteria

The history of a series lives in git and in its pull requests, nowhere else; the database question is answered once,
with the numbers of the day it was last asked.

1. `README.md` has no series-history paragraph: between the documentation table and `## Tech Stack` there is one blank
   line. Proof: `grep -c "series (20" README.md` prints 0 and `grep -n "git log -- doc/" README.md` prints nothing.
2. No sentence in the repo sends a reader to README.md for a series' history. Proof:
   `grep -rn "history in README\|history goes to README\|are history: README" CLAUDE.md AGENTS.md WORKFLOW.md doc/guide`
   prints nothing.
3. `doc/guide/collaudo.md` says where the history is (the folder's `git log` and the pull requests) and that a
   retirement writes none. Proof: the two sentences of § 4.2, present verbatim.
4. `AGENTS.md` restates the database decision with the count of 2026-11-23 (§ 4.3, verbatim), still one bullet.
5. `CLAUDE.md` stays under 20.000 characters (`wc -c CLAUDE.md` — 18.920 @ b0bf8276; this spec shortens it).
6. `npx tsc --noEmit`, `npm run lint` and `TZ=Europe/Rome npx vitest run` are green (nothing but text changed; the
   run proves no test read the removed text — `__tests__/` holds document tests, e.g. `mirrorCollections.test.ts`).

## 3. Decisions

- **Decision 2** (owner, 2026-11-23): the history is removed entirely; nothing replaces it in a tracked document.
- **Decision 9** (owner, 2026-11-23): no migration to Turso; Firestore stays; AGENTS.md is updated with the count.
  Firebase Auth is a separate decision, not taken.
- Adopted, reversible: (a) the three paragraphs are deleted, not moved to a `doc/` file — the specs, the indexes and
  the decisions are already in `git log -- doc/<serie>/`, and the pull requests carry the narrative; (b) the dead
  entries the count found (`price-history` index in `firestore.indexes.json:268`, `'goals'` in `USER_COLLECTIONS` of
  `scripts/mirrorCollections.ts`) are NOT touched here: removing an index is a deploy, see § 10.

## 4. Solution

### 4.1 README.md

Delete lines 242–313 (the three paragraphs and the blank lines between them) and one of the two blank lines left
around them, so that the table's last row (`:240`) is followed by one blank line and `## Tech Stack`.

### 4.2 doc/guide/collaudo.md

`:156-157` — BEFORE: «(since 2026-09-28: the fourteen PERF specs, then the nine MOB ones — their history in README.md
§ Documentation)». AFTER: «(since 2026-09-28: the fourteen PERF specs, then the nine MOB ones — a retired series is
read in `git log -- doc/<serie>/` and in its pull requests)».

`:162-163` — BEFORE: «…(a number outlives the document that numbered it), and the series' history goes to README.md
§ Documentation.» AFTER: «…(a number outlives the document that numbered it). **No history of the series is written
anywhere** (owner, 2026-11-23: README.md carried three such paragraphs, removed that day): the folder's `git log` and
the pull requests are the history.»

### 4.3 AGENTS.md:181-186

Keep the bullet's first sentence up to «…so what counts is round trips IN SERIES).» and replace the rest with:

> No `onSnapshot`, no migration — asked twice, answered twice. On 2026-09-26 for Postgres/Supabase/Convex; on
> 2026-11-23 for Turso (SQLite), counted on the code of that day: the browser reads and writes 22 collections straight
> under `firestore.rules` (96 exported functions of 25 client services), so leaving Firestore turns each into a server
> route (16–22 new route files), moves ~70 production modules, ~100 unit files with Firestore-shaped fakes and 31 E2E
> specs with their ten seeds, and the core (assets, expenses, the ledger, dividends, settings) moves in ONE cut,
> because its transactions cross those collections. What SQL would give — no 500-write batch, no `in` of 30, foreign
> keys, a file database instead of the JVM emulator — touches none of the measured causes, and the pages compute in
> memory on whole lists (no query aggregates on the database). Firebase Auth is a separate decision, not taken. The
> two Firestore levers are the function region (SETUP.md § Function region) and the materialized per-page summaries
> (§ Caching).

### 4.4 CLAUDE.md

- `:17` — remove the clause «the series' history in README.md § Documentation, » so the parenthesis reads «(the specs
  and the 100 owner decisions in `git log -- doc/nove/`; the costume in doc/guide/temi.md § Il costume)».
- `:57` — BEFORE: «The nine MOB specs (2026-09-26 → 2026-10-17) are history: README.md § Documentation.» AFTER: «The
  nine MOB specs (2026-09-26 → 2026-10-17) are history: `git log -- doc/mobile/`.»
- `:17`, the «Latest» sentence: prepend the date of the implementation and one clause — «the series' history left
  README.md and the database question is answered in AGENTS.md § Data & State (2026-11-23: Firestore stays)» — and keep
  «Open» pointing at this series' index (`doc/dati/README.md` § 6).

## 5. Constraints and traps

- **Documents are English** (WORKFLOW.md rule 3): here it means the quoted owner's words stay Italian inside «…», the
  new sentences are English.
- **CLAUDE.md is an index under 20.000 characters**: here it means the «Latest» clause is one line and nothing else is
  added; measure with `wc -c` before and after.
- **No owner data in a tracked file** (WORKFLOW.md rule 5): here it means the AGENTS.md sentence carries the counts of
  the CODE (collections, functions, files), never the account's volumes.
- **A series label never enters the code** (doc/guide/collaudo.md): here it means the AGENTS.md sentence says
  «2026-11-23», never «DATI-01».
- **The repo's files are CRLF**: patch with Edit, never with a shell heredoc carrying apostrophes or backticks.
- `doc/guide/collaudo.md:169` and `:189` stay as they are (they name the draft release's section).

## 6. Tests per level

No runtime code changes, so the proofs are the greps of § 2; each is load-bearing in the sense that it fails on the
tree before the change (run them first and see the non-empty output: 3 matches for criterion 1, 3 for criterion 2).
Unit: the whole suite once, green (criterion 6). E2E, budgets: not run — no file under `app/`, `components/`, `lib/`
changes.

## 7. Guided verification (WORKFLOW.md § 2)

Not applicable beyond phase A (the diff read by the owner): no behaviour changes. Expected outcome declared first:
GitHub renders README.md with the documentation table followed directly by «Tech Stack».

## 8. Putting it into service

No DDL, no deploy step, no measure. One thing outside the repo, the owner's: `claude-config/prompts/08_CREA_RITIRO_SPEC.md`
line 144 still tells a retirement to write the series' history to README — it is edited in that repo, not here.

## 9. Documentation

README.md (§ 4.1) · doc/guide/collaudo.md (§ 4.2) · AGENTS.md (§ 4.3, stays one bullet; the file has no size limit but
the bullet replaces, it does not add) · CLAUDE.md (§ 4.4, under 20.000) · `doc/dati/README.md` § 6 (status row).
`Draft Release Temp.md`: no entry (nothing a user sees).

## 10. Declared out of scope

- The dead `price-history` index and the `'goals'` entry of `USER_COLLECTIONS` → DATI-02 § 4.6 removes both while it
  edits the same two files for the daily archive.
- A measurement of Firestore's production latency (never taken: doc/guide/velocita.md:190) → not planned; recorded in
  doc/guide/velocita.md as it is today.
- Login without Firebase Auth → not planned; CLAUDE.md § Current Status would name it if the owner opens it.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/dati/DATI-01-storia-serie-e-database.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec per intero e l'indice della serie doc/dati/README.md (decisioni, contratti
  condivisi, regole della serie)
- Leggi doc/guide/collaudo.md (la regola del ritiro che questa spec riscrive)
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md: il codice che scrivi li segue

Prima di tutto: lancia `node ~/.claude/processi-collaudo.mjs` (conta gli script di collaudo e i servizi
che questo repo usa — emulatori Firebase, server Next — ancora accesi; la seconda riga dell'output
dice quali servizi ha cercato). Se trova qualcosa non è di
questa sessione, che è appena iniziata: quelli «di un'altra sessione aperta» non si toccano; quelli
«di nessuna sessione nota» me li nomini (cosa, da quanto) e li chiudi con `--chiudi --anche-ignote`
solo dopo il mio sì. Dimmelo in una riga: «processi: nessuno» oppure l'elenco.

Se il repo ha un lockfile: lancia l'audit del gestore di pacchetti e confrontalo con
doc/guide/dipendenze.md (regola 8 di WORKFLOW.md). Rispondimi in una riga: invariate dal
<data>, oppure gli avvisi nuovi; quelli nuovi li registriamo nella guida con una decisione,
non si aggiorna nulla in questa sessione. Se la guida manca, creala.

Prima della prima modifica: controlla il branch attivo (git branch --show-current) e crea
il branch di sessione da lì. Mai modificare un file sul branch di integrazione.

Crea SESSION_NOTES.md per tracciare il lavoro (non tracciato: a fine sessione si riversa
nei documenti e si cancella).

Ogni dubbio o scelta che spetta a me me la chiedi SUBITO con AskUserQuestion, una scelta
per domanda, a gruppi di quattro: mai un «da decidere» lasciato nel codice, nei documenti o
nel riassunto. Se serve un comando che solo io posso lanciare (produzione, un login
interattivo), dammelo una riga alla volta con l'esito atteso.

Implementa la spec così com'è scritta, nell'ordine: i grep del § 2 sull'albero di partenza (devono
stampare qualcosa), README.md (§ 4.1), doc/guide/collaudo.md (§ 4.2), AGENTS.md (§ 4.3), CLAUDE.md
(§ 4.4), poi di nuovo i grep (vuoti) e la suite. Le frasi «AFTER» sono già scritte: copiale.

Fermati e chiedimi se: una delle righe citate non è più dove la spec dice (cita il commit b0bf8276),
oppure CLAUDE.md supera i 20.000 caratteri.

Collaudo: § 7 (solo la fase A). Un branch, un commit, solo dopo il mio OK con il riassunto del diff.
SESSION_NOTES.md non si committa.
```

Model: **Sonnet 5.5**, effort **medium** — an S spec, documents only, every criterion closed by a grep. Estimated
size: S (four files, ~90 lines removed, ~15 written).
