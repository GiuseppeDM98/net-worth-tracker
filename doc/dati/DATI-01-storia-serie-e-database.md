# DATI-01 — The series' history leaves the README; the database decision is restated on today's count

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: nothing. Written on 2026-11-23; every `file:line`
> is cited @ b0bf8276 (a line number is a hint, the quoted text is the anchor). Owner's points 1 and 3; decisions 2,
> 9, 46 and 47.

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
3. `doc/guide/collaudo.md` says where the history is (the folder's `git log` and the pull requests), that a
   retirement writes none, and that this series goes to `main` spec by spec. Proof:
   `grep -c "No history of the series is written anywhere" doc/guide/collaudo.md` prints 1 and
   `grep -c "goes to .main. spec by spec" doc/guide/collaudo.md` prints 1.
4. `AGENTS.md` restates the database decision with the count of 2026-11-23 (§ 4.3, verbatim), still one bullet. Proof:
   `grep -c "asked twice, answered twice" AGENTS.md` prints 1.
5. `CLAUDE.md` stays under 20.000 characters, counted as doc/guide/collaudo.md § Where things are recorded says
   (`node -e "console.log(require('fs').readFileSync('CLAUDE.md','utf8').length)"` — 18.660 @ b0bf8276; `wc -c` counts
   bytes and reads 18.920). This spec shortens it: the «Latest» entry it writes (§ 4.4) is about 700 characters
   shorter than the one it replaces.
6. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run` and `TZ=UTC npx vitest run` are green, in Git
   Bash (nothing but text changed; no test reads README.md, CLAUDE.md, AGENTS.md or doc/guide/collaudo.md — the only
   Markdown a test reads is SETUP.md, `__tests__/productName.test.ts`).

## 3. Decisions

- **Decision 2** (owner, 2026-11-23): the history is removed entirely; nothing replaces it in a tracked document.
- **Decision 9** (owner, 2026-11-23): no migration to Turso; Firestore stays; AGENTS.md is updated with the count.
  Firebase Auth is a separate decision, not taken.
- **Decision 46** (owner, 2026-11-23): `CLAUDE.md`'s «Latest» entry is REPLACED whole by every spec of the series,
  never prepended to (the rule of doc/guide/collaudo.md § Where things are recorded). § 4.4 writes the entry.
- **Decision 47** (owner, 2026-11-23): a guide that passes ~500 lines is split by the session of the spec that
  pushes it over; nothing of it applies here (collaudo.md gains two clauses on existing lines, AGENTS.md stays one
  bullet).
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
anywhere** (owner, 2026-11-23; README.md's three such paragraphs were removed on {the implementation day, ISO}): the folder's `git log` and
the pull requests are the history.»

`:154-155`, the Branches bullet — BEFORE: «…the PERF series went to `main` on its own, PR #446).» AFTER: «…the PERF
series went to `main` on its own, PR #446; the DATI series of 2026-11-23 goes to `main` spec by spec, each as soon as
it is implemented — owner, 2026-11-23).» It is the clause WORKFLOW.md already carries (its last section, «the DATI
series of 2026-11-23 goes to `main` spec by spec»), which sends the reader to this guide for the whole rule.

### 4.3 AGENTS.md:181-186

Keep the bullet's first sentence up to «…so what counts is round trips IN SERIES).» and replace the rest with:

> No `onSnapshot`, no migration — asked twice, answered twice. On 2026-09-26 for Postgres/Supabase/Convex; on
> 2026-11-23 for Turso (SQLite), counted on the code of that day: the browser writes 17 of the 26 collections of
> `firestore.rules` directly and reads 25 (the 25 client services that import `firebase/firestore` export 167
> functions), so leaving Firestore turns each into a server route (16–22 new route files), moves ~70 production
> modules, ~100 unit files with Firestore-shaped fakes and the 108 E2E specs with their nine seed scripts and the
> mirror, and the core (assets, expenses, the ledger, dividends, settings) moves in ONE cut,
> because its transactions cross those collections. What SQL would give — no 500-write batch, no `in` of 30, foreign
> keys, a file database instead of the JVM emulator — touches none of the measured causes, and the pages compute in
> memory on whole lists (no query aggregates on the database). Firebase Auth is a separate decision, not taken. The
> two Firestore levers are the function region (SETUP.md § Function region) and the materialized per-page summaries
> (§ Caching).

The four counts, measured @ b0bf8276 in Git Bash (run them again: a count that moved is written as it reads that
day): the collections are the `match /<name>/{…}` blocks of `firestore.rules` nested one level under
`/databases/{database}/documents` (26; `history` under `allocationAdvice` is a sub-collection), nine of them closed to
a browser write (`allow write: if false`, `allow read, write: if false`, `allow create, update, delete: if false`) and
one of those closed to a read too; `grep -l "firebase/firestore" lib/services/*.ts | wc -l` prints 25 and
`grep -l "firebase/firestore" lib/services/*.ts | xargs grep -c "^export \(async \)\?function" | awk -F: '{s+=$2} END {print s}'`
prints 167; `find e2e -name '*.spec.ts' | wc -l` prints 108; `ls scripts/seed*` prints nine files. The other figures
(route files, production modules, unit files) are the estimate of 2026-11-23 and keep their «~».

### 4.4 CLAUDE.md

- `:17`, the «Latest» entry — REPLACED whole (decision 46): everything from «- Latest (2026-11-23): **The November
  series is closed…» to «…Open: nothing. Next: no spec is open.» becomes ONE entry:

  > - Latest ({the implementation day, ISO}): **The series `doc/dati/` is open** (index doc/dati/README.md: the specs,
  >   the owner's decisions and the status table in § 6; it goes to `main` spec by spec). The series' history left
  >   README.md — a retired series is read in `git log -- doc/<serie>/` and in its pull requests — and the database
  >   question is answered in AGENTS.md § React Query and Derived State (2026-11-23: Firestore stays). Open: doc/dati/
  >   (README § 6). Next: DATI-02.

  The November series, the checks after its deploy and the drift test leave the entry with it: they are closed and
  they are in `git log -- CLAUDE.md`. The clause «the series' history in README.md § Documentation» goes with the
  entry.
- `:57` — BEFORE: «The nine MOB specs (2026-09-26 → 2026-10-17) are history: README.md § Documentation.» AFTER: «The
  nine MOB specs (2026-09-26 → 2026-10-17) are history: `git log -- doc/mobile/`.»

## 5. Constraints and traps

- **Documents are English** (WORKFLOW.md rule 4): here it means the quoted owner's words stay Italian inside «…», the
  new sentences are English.
- **CLAUDE.md is an index under 20.000 characters**: here it means the «Latest» entry is the one of § 4.4 and nothing
  else is added; count the characters with the `node` line of criterion 5, before and after.
- **«Latest» is replaced by every spec** (decision 46): here it means the entry written by § 4.4 is the shape every
  later spec of the series rewrites — date, what the spec changed in one sentence, «Open: doc/dati/ (README § 6)»,
  «Next: DATI-NN».
- **No owner data in a tracked file** (WORKFLOW.md rule 6; doc/dati/README.md § 8 rule 4): here it means the AGENTS.md sentence carries the counts of
  the CODE (collections, functions, files), never the account's volumes.
- **A series label never enters the code** (doc/guide/collaudo.md): here it means the AGENTS.md sentence says
  «2026-11-23», never «DATI-01».
- **The repo's files are CRLF**: patch with Edit, never with a shell heredoc carrying apostrophes or backticks.
- `doc/guide/collaudo.md:169` and `:189` stay as they are (they name the draft release's section).

## 6. Tests per level

No runtime code changes, so the proofs are the greps of § 2; each is load-bearing in the sense that it fails on the
tree before the change (run them first, in Git Bash: `grep -c` prints 3 and the second grep 3 lines for criterion 1,
4 lines for criterion 2, and the three `grep -c` of criteria 3 and 4 print 0). Unit: the whole suite once in each of
the two zones, green (criterion 6). E2E, budgets: not run — no file under `app/`, `components/`, `lib/`
changes.

## 7. Guided verification (WORKFLOW.md § 2)

Not applicable beyond phase A (the diff read by the owner): no behaviour changes. Expected outcome declared first:
GitHub renders README.md with the documentation table followed directly by «Tech Stack».

## 8. Putting it into service

No DDL, no deploy step, no measure. After the commit is in `develop`, the owner opens the PR `develop` → `main`
(index § 8 rule 13); nothing else is deployed. One thing outside the repo, the owner's: `claude-config/prompts/08_CREA_RITIRO_SPEC.md`
line 144 still tells a retirement to write the series' history to README — it is edited in that repo, not here.

## 9. Documentation

README.md (§ 4.1) · doc/guide/collaudo.md (§ 4.2) · AGENTS.md (§ 4.3, stays one bullet: the file sits at 989 lines of
its ~1.000 and the bullet replaces, it does not add) · CLAUDE.md (§ 4.4, under 20.000) · `doc/dati/README.md` § 6 (status row).
`Draft Release Temp.md`: no entry (nothing a user sees).

## 10. Declared out of scope

- The dead `price-history` index and the `'goals'` entry of `USER_COLLECTIONS` → DATI-02 § 4.6 removes both while it
  edits the same two files for the daily archive.
- A measurement of Firestore's production latency → not planned; doc/guide/velocita.md § Letture che sembrano difetti
  already states the 50–150 ms round trip, unchanged.
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
stampare ciò che dice il § 6), README.md (§ 4.1), doc/guide/collaudo.md (§ 4.2, tre modifiche), AGENTS.md
(§ 4.3, con i quattro conteggi rilanciati), CLAUDE.md (§ 4.4: la voce «Latest» si SOSTITUISCE per intero), la
riga 01 di doc/dati/README.md § 6 a `implemented`, poi di nuovo i grep (i conteggi dei criteri 1 e 2 a 0 o
vuoti, quelli dei criteri 3 e 4 a 1) e la suite sotto TZ=Europe/Rome e sotto TZ=UTC. Tutti i comandi in Git
Bash. Le frasi «AFTER» sono già scritte: copiale, mettendo il giorno dell'implementazione dove la spec lo
chiede.

Fermati e chiedimi se: un testo BEFORE della spec non si trova più parola per parola (il numero di riga è
solo un indizio, @ b0bf8276), oppure CLAUDE.md supera i 20.000 caratteri.

Collaudo: § 7 (solo la fase A). Un branch, un commit, solo dopo il mio OK con il riassunto del diff.
SESSION_NOTES.md non si committa. A commit in develop, ricordami la PR develop → main (regola 13 dell'indice).
```

Model: **Sonnet 5.5**, effort **medium** — an S spec, documents only, every criterion closed by a grep. Estimated
size: S (five files, ~90 lines removed, ~20 written).
