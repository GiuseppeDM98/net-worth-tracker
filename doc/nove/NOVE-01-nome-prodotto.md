# NOVE-01 — The product is called «Net Worth Tracker» everywhere

> Series `doc/nove/` (README.md § 5): **depends on nothing**; the first spec of the series because every later one
> writes copy. Written on 2026-11-12; every `file:line` is cited on `develop` @ b841cbd7. Executes the owner's point 8
> and the adopted choice (b) (README.md § 4).

## 1. The problem today (evidence on the code)

The repository, the domain and the documents say «net worth tracker»; the interface still says «Portfolio Tracker».
Thirteen occurrences in seven files, none read by a test (`grep -rn "Portfolio Tracker" e2e __tests__` is empty):

| File:line @ b841cbd7 | Today |
| --- | --- |
| `app/layout.tsx:64` | `title: "Portfolio Tracker - Gestisci il tuo Patrimonio"` (the browser tab of every page) |
| `app/dashboard/layout.tsx:56` | `<span …>Portfolio Tracker</span>` (the phone's top bar) |
| `components/layout/Sidebar.tsx:128` | `<span className="truncate">Portfolio Tracker</span>` |
| `components/auth/AuthShell.tsx:54` | `<p className={TILE_EYEBROW_CLASS}>Portfolio Tracker</p>` |
| `app/login/page.tsx:90` | `verdictAriaLabel="Che cos’è Portfolio Tracker"` |
| `app/page.tsx:176` | `label="Portfolio Tracker"` |
| `app/page.tsx:191` | `ariaLabel="Cos’è Portfolio Tracker"` |
| `app/page.tsx:324` | `Portfolio Tracker — open source su{' '}` |
| `app/page.tsx:329` | `aria-label="Portfolio Tracker su GitHub (apre in una nuova scheda)"` |
| `SETUP.md:1` | `# Setup Guide - Portfolio Tracker` |
| `SETUP.md:3` | `…setting up the Portfolio Tracker web app from scratch…` |
| `SETUP.md:39` | `Enter a project name (e.g., \`portfolio-tracker\`)` |
| `SETUP.md:108` | `Register your app with a nickname (e.g., \`Portfolio Tracker Web\`)` |

## 2. Goal and acceptance criteria

The name the user reads is «Net Worth Tracker» on every surface, and a test keeps the old one from coming back.

1. `grep -rniE "portfolio[ -]tracker" app components lib contexts e2e __tests__ scripts *.md doc --exclude-dir=nove`
   prints nothing. **Proof**: the command, run from the repo root, exits 1.
2. The nine UI strings read exactly as in § 4. **Proof**: `__tests__/productName.test.ts` (new, § 6).
3. `SETUP.md` reads «Net Worth Tracker» in its title and first paragraph, `net-worth-tracker` as the example project
   name and `Net Worth Tracker Web` as the example nickname. **Proof**: criterion 1.
4. The sidebar brand and the phone's top bar do not wrap or truncate at 390, 768 and 1440. **Proof**: phase C of § 7
   (the new name has the same seventeen characters as the old one; the check is a look, not a new E2E).
5. `npx tsc --noEmit`, `npm run lint` and the whole Vitest run are green in `Europe/Rome`, the machine's zone and `UTC`.

## 3. Decisions

- **Owner (point 8, 2026-11-12)**: «rimuovere ogni riferimento a "portfolio tracker", è "net worth tracker"».
- **Adopted, reversible (b)**: the product name is written in English title case, «Net Worth Tracker», on every
  surface, the Italian ones included (the old name was English too); the Italian tagline of the tab title stays.
- No earlier decision is overturned.

## 4. Solution

Text only; no component, type or style changes.

| File | After |
| --- | --- |
| `app/layout.tsx` | `title: "Net Worth Tracker - Gestisci il tuo Patrimonio"` |
| `app/dashboard/layout.tsx` | `Net Worth Tracker` |
| `components/layout/Sidebar.tsx` | `Net Worth Tracker` |
| `components/auth/AuthShell.tsx` | `Net Worth Tracker` |
| `app/login/page.tsx` | `verdictAriaLabel="Che cos’è Net Worth Tracker"` |
| `app/page.tsx` (label) | `label="Net Worth Tracker"` |
| `app/page.tsx` (verdict) | `ariaLabel="Cos’è Net Worth Tracker"` |
| `app/page.tsx` (footer) | `Net Worth Tracker — open source su{' '}` |
| `app/page.tsx` (link) | `aria-label="Net Worth Tracker su GitHub (apre in una nuova scheda)"` |
| `SETUP.md:1` | `# Setup Guide - Net Worth Tracker` |
| `SETUP.md:3` | `…setting up the Net Worth Tracker web app from scratch…` |
| `SETUP.md:39` | `Enter a project name (e.g., \`net-worth-tracker\`)` |
| `SETUP.md:108` | `Register your app with a nickname (e.g., \`Net Worth Tracker Web\`)` |

The typographic apostrophe (`’`, U+2019) of the two `aria` strings is kept as it is in the file.

### `__tests__/productName.test.ts` (new)

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');
const SOURCE_DIRS = ['app', 'components', 'lib', 'contexts'];
const OLD_NAME = /portfolio[ -]tracker/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|css)$/.test(entry) ? [path] : [];
  });
}

describe('the product name', () => {
  it('should never read the old name in the source the user sees', () => {
    const offenders = SOURCE_DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir))).filter((file) => OLD_NAME.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('should title every page with the new name', () => {
    expect(readFileSync(join(ROOT, 'app/layout.tsx'), 'utf8')).toContain('title: "Net Worth Tracker - Gestisci il tuo Patrimonio"');
  });

  it('should keep the setup guide on the new name', () => {
    expect(OLD_NAME.test(readFileSync(join(ROOT, 'SETUP.md'), 'utf8'))).toBe(false);
  });
});
```

It runs in the default (node) Vitest project, like `__tests__/vercelConfig.test.ts`, which also reads files from disk.

## 5. Constraints and traps (AGENTS.md / repo rules, «here it means that»)

- **Repo files are CRLF**: here it means that the edits go through the Edit tool on the exact string, never a `sed`
  over the file (a rewritten line ending makes the whole file a diff).
- **The shell is prerendered before Firebase Auth resolves** (doc/guide/shell.md): the brand in `Sidebar.tsx` and
  `app/dashboard/layout.tsx` is part of that shell; the string changes, nothing else in those two elements.
- **`e2e/shellBoot.ts` and the landing specs do not read the name** (checked, § 1): no E2E changes.
- **The Firebase project id of a real deployment is not the example in `SETUP.md`**: the example changes, no
  configuration does (`.env*`, `firebase.json`, `.firebaserc` are not touched).
- **`README.md`, `PRODUCT.md`, `DESIGN.md`, `AGENTS.md`, `CLAUDE.md` already say «Net Worth Tracker»**: nothing to
  change there; criterion 1 proves it.

## 6. Tests per level (with the mutation that proves each)

| Level | Test | Mutation that turns it red |
| --- | --- | --- |
| Vitest (node) | `productName.test.ts` › «should never read the old name…» | put «Portfolio Tracker» back in `components/layout/Sidebar.tsx` |
| Vitest (node) | «should title every page with the new name» | restore the old `title` in `app/layout.tsx` |
| Vitest (node) | «should keep the setup guide on the new name» | restore `SETUP.md:1` |

No component test and no E2E: the change carries no behaviour.

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: the tab title, the sidebar, the phone's top bar, the landing (label, footer) and
the login tile read «Net Worth Tracker»; nothing else on those screens moves.

- **A (automatic)**: criterion 1's grep, the new test, `tsc`, lint, Vitest in the three zones.
- **B (emulators)**: `npm run emulators`, `emulators:seed`, `dev:emulator`.
- **C (browser, the session)**: `/`, `/login`, `/dashboard` at 390, 768 and 1440: the brand on one line, the tab
  title, the landing footer link's accessible name.
- **D–E**: not applicable (no data, no failure path).
- **F (owner)**: a look at `/` and `/dashboard` on the develop deploy.
- **G**: stop the emulators; no fixture was added.

## 8. Putting it into service

One PR to `develop`. No migration, no environment variable, no rule to deploy.

## 9. Documentation

- `CLAUDE.md` › «Latest»: one line naming the rename and this PR.
- `Draft Release Temp.md`: one entry, «L'app si chiama Net Worth Tracker ovunque».
- `doc/nove/README.md` § 6: the status of NOVE-01.
- No guide changes: no rule was added.

## 10. Declared out of scope

- **The GitHub repository name, the Vercel project and the Firebase project** already carry the new name or are the
  owner's deployment: no heir, nothing to do.
- **A logo or wordmark**: the themes of NOVE-12/13 draw the page emblems; a brand mark is not asked by any point of
  this series (heir: none, declared).

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/nove/NOVE-01-nome-prodotto.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec doc/nove/NOVE-01-nome-prodotto.md e l'indice della serie doc/nove/README.md
  (§ 3 decisioni, § 4 scelte adottate, § 7 contratti condivisi, § 8 regole)
- Leggi doc/guide/shell.md e doc/guide/landing.md PRIMA di toccare la shell e la landing
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md: il codice che scrivi li segue

Lancia npm audit e confrontalo con doc/guide/dipendenze.md (regola 8 di WORKFLOW.md).
Rispondimi in una riga: invariate dal <data>, oppure gli avvisi nuovi; quelli nuovi li
registriamo nella guida con una decisione, non si aggiorna nulla in questa sessione.

Prima della prima modifica: controlla il branch attivo (git branch --show-current) e crea
il branch di sessione da lì. Mai modificare un file sul branch di integrazione.

Crea SESSION_NOTES.md per tracciare il lavoro (non tracciato: a fine sessione si riversa
nei documenti e si cancella).

Ogni dubbio o scelta che spetta a me me la chiedi SUBITO con AskUserQuestion, una scelta
per domanda, a gruppi di quattro: mai un «da decidere» lasciato nel codice, nei documenti o
nel riassunto. Se serve un comando che solo io posso lanciare (produzione, un login
interattivo), dammelo una riga alla volta con l'esito atteso.

Implementa la spec così com'è scritta: le tredici stringhe della § 4 e il test
__tests__/productName.test.ts. Fermati e chiedimi se il grep del criterio 1 trova
un'occorrenza che la § 1 non elenca. Collaudo: § 7. Un branch, un commit, solo dopo il mio
OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Sonnet 5.5**, effort **medium** — an S spec in one area, text only, every criterion closed by a test or a
grep. Estimated size: 1 short session, ~30 min; 13 strings, ~30 lines of test.
