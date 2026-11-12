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
| `app/dashboard/layout.tsx:56` | `<span …>Portfolio Tracker</span>` (the top bar of a phone held sideways: landscape below 1000px) |
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

1. `git grep --untracked -niE "portfolio[ -]tracker" -- . ':!doc/nove' ':!SESSION_NOTES.md'`, run from the repo
   root, prints nothing and exits 1 (it reads every tracked and non-ignored file: the source, `types/`, `perf/`,
   `public/`, the root configuration files and every document; today it prints the thirteen lines of § 1). The
   documentation of § 9 never writes the old name.
2. The nine UI strings read exactly as in § 4. **Proof**: `__tests__/productName.test.ts` (new, § 6), one row per
   string.
3. `SETUP.md` reads «Net Worth Tracker» in its title and first paragraph, `net-worth-tracker` as the example project
   name and `Net Worth Tracker Web` as the example nickname. **Proof**: criterion 1.
4. The brand does not wrap or truncate wherever it is shown: the sidebar at 1440×900 (expanded), the sidebar sheet
   at 1024×768 (opened by the rail's «Account e preferenze») and at 844×390 (opened by «Apri il menu»), and the top
   bar at 844×390 — the only size class that shows it (`app/dashboard/layout.tsx`:
   `max-desktop:portrait:hidden … tablet-landscape:hidden`). At 390×844 and 768×1024 in portrait neither brand is
   on screen. **Proof**: phase C of § 7 — a throwaway Playwright probe reads, for each visible brand `<span>`,
   `scrollWidth <= clientWidth` and a `getBoundingClientRect().height` below twice its computed `line-height`
   (the new name has the same seventeen characters as the old one; no new E2E).
5. `npx tsc --noEmit`, `npm run lint` and the whole Vitest run are green in `Europe/Rome`, the machine's zone and `UTC`.

## 3. Decisions

- **Owner (point 8, 2026-11-12)**: «Togliere dal repo qualsiasi riferimento a portfolio tracker, che è il vecchio
  nome dell'app».
- **Adopted, reversible (b)**: the product name is written in English title case, «Net Worth Tracker», on every
  surface, the Italian ones included (the old name was English too); the Italian tagline of the tab title stays.
- **Owner 37 (2026-11-12)**: the old name on surfaces outside the repo is out of scope (§ 10).
- **Owner 38 (2026-11-12)**: the page's meta description (`app/layout.tsx:65`, «Traccia e monitora il tuo portafoglio
  di investimenti») stays as it is: point 8 is about the name.
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
/**
 * The product name. The app is called «Net Worth Tracker» on every surface the user reads (owner,
 * 2026-11-12): the tab title, the sidebar and the top bar, the access pages' eyebrow, the landing. The old
 * name must not come back in the source or in the setup guide; each expectation was seen red with the old
 * string put back.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIRS = ['app', 'components', 'lib', 'contexts'];
const OLD_NAME = /portfolio[ -]tracker/i;
const NEW_NAME_SITES: ReadonlyArray<readonly [string, string]> = [
  ['app/layout.tsx', 'title: "Net Worth Tracker - Gestisci il tuo Patrimonio"'],
  ['app/dashboard/layout.tsx', '>Net Worth Tracker</span>'],
  ['components/layout/Sidebar.tsx', '<span className="truncate">Net Worth Tracker</span>'],
  ['components/auth/AuthShell.tsx', '<p className={TILE_EYEBROW_CLASS}>Net Worth Tracker</p>'],
  ['app/login/page.tsx', 'verdictAriaLabel="Che cos’è Net Worth Tracker"'],
  ['app/page.tsx', 'label="Net Worth Tracker"'],
  ['app/page.tsx', 'ariaLabel="Cos’è Net Worth Tracker"'],
  ['app/page.tsx', "Net Worth Tracker — open source su{' '}"],
  ['app/page.tsx', 'aria-label="Net Worth Tracker su GitHub (apre in una nuova scheda)"'],
];

function listSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return listSources(full);
    return /\.(ts|tsx|css)$/.test(name) ? [full] : [];
  });
}

describe('the product name', () => {
  it('should never read the old name in the source the user sees', () => {
    const offenders = SOURCE_DIRS.flatMap((dir) => listSources(path.join(ROOT, dir)))
      .filter((file) => OLD_NAME.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(ROOT, file).split(path.sep).join('/'));
    expect(offenders).toEqual([]);
  });

  it.each(NEW_NAME_SITES)('should print the new name in %s: %s', (file, expected) => {
    expect(readFileSync(path.join(ROOT, file), 'utf8')).toContain(expected);
  });

  it('should keep the setup guide on the new name', () => {
    expect(OLD_NAME.test(readFileSync(path.join(ROOT, 'SETUP.md'), 'utf8'))).toBe(false);
  });
});
```

It is a `.test.ts`, so it runs in the `node` project of `vitest.config.ts`, like
`__tests__/reactCompilerCoverage.test.ts`, which walks the same source folders. The test guards the source and
`SETUP.md`; the other documents are held by criterion 1's command at the implementation, not by a test (a document
may quote the series' history).

## 5. Constraints and traps (AGENTS.md / repo rules, «here it means that»)

- **Repo files are CRLF**: here it means that the edits go through the Edit tool on the exact string, never a `sed`
  over the file (a rewritten line ending makes the whole file a diff).
- **The shell is prerendered before Firebase Auth resolves** (doc/guide/shell.md): the brand in `Sidebar.tsx` and
  `app/dashboard/layout.tsx` is part of that shell; the string changes, nothing else in those two elements.
- **`e2e/shellBoot.ts` and the landing specs do not read the name** (checked, § 1): no E2E changes.
- **The Firebase project id of a real deployment is not the example in `SETUP.md`**: the example changes, no
  configuration does (`.env*`, `firebase.json`, `.firebaserc` are not touched).
- **`README.md`, `DESIGN.md`, `AGENTS.md` and `CLAUDE.md` already say «Net Worth Tracker»; `PRODUCT.md`, the PDF
  (`components/pdf/*`) and the two emails (`lib/server/{monthlyEmailService,weeklyBudgetEmailService}.ts`) carry
  no old name**: nothing to change there; criterion 1 proves it.

## 6. Tests per level (with the mutation that proves each)

| Level | Test | Mutation that turns it red |
| --- | --- | --- |
| Vitest (node) | `productName.test.ts` › «should never read the old name…» | put «Portfolio Tracker» back in `components/layout/Sidebar.tsx` |
| Vitest (node) | «should print the new name in …» (nine rows) | write «Net Worth» in place of the name in `components/layout/Sidebar.tsx`: that row goes red, the old-name scan stays green |
| Vitest (node) | «should keep the setup guide on the new name» | restore `SETUP.md:1` |

No component test and no E2E: the change carries no behaviour.

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: the tab title, the sidebar, the top bar of a phone held sideways, the landing
(label, footer and its link's accessible name) and the eyebrow of `/login` and `/register` read «Net Worth
Tracker»; nothing else on those screens moves.

- **A (automatic)**: criterion 1's `git grep`, the new test, `tsc`, lint, Vitest in the three zones.
- **B (emulators)**: `npm run emulators`, `emulators:seed`, `dev:emulator`.
- **C (browser, the session)**: a throwaway Playwright script (WORKFLOW.md § 2, obligation 4), signed in as the
  seeded `test@example.com` for `/dashboard`: `/`, `/login` and `/register` at 390×844, 768×1024 and 1440×900 —
  `document.title`, the landing's label, the auth eyebrow, and the footer link found by
  `getByRole('link', { name: 'Net Worth Tracker su GitHub (apre in una nuova scheda)' })`; `/dashboard` at the four
  sizes of criterion 4 — each brand on one line, not truncated.
- **D–E**: not applicable (no data, no failure path).
- **F (owner)**: a look at `/` and `/dashboard` on the develop deploy.
- **G** (the two budgets close by README.md § 8's ONE rule, decisions 33 and 34): stop the emulators; no fixture was added.

## 8. Putting it into service

One PR to `develop`. No migration, no environment variable, no rule to deploy.

## 9. Documentation

- `CLAUDE.md` › «Latest»: the ONE bullet's opening is rewritten to `Latest (<the session's date>): **The app is
  called «Net Worth Tracker» on every surface** (PR #<n>, the first spec of doc/nove/;
  __tests__/productName.test.ts keeps the old name out). Next: the retirement of NOVE-01, then NOVE-02
  (doc/nove/README.md § 5).` — the sentences on the AI series' close are cut, the «Open:» list stays word for
  word, and the old name is never written (criterion 1).
- `Draft Release Temp.md`: prepend to `## 🔧 Improvements` one entry: `- **Ogni pagina — il nome** — The app is
  called «Net Worth Tracker» everywhere you read it: the browser tab, the sidebar, the top bar of a phone held
  sideways, the login and registration pages and the landing.`
- `doc/nove/README.md` § 6: the status of NOVE-01.
- No guide changes: no rule was added.

## 10. Declared out of scope

- **The GitHub repository name, the Vercel project and the Firebase project** are the owner's deployment: no heir,
  nothing to do.
- **The old name outside the repo** (decision 37) — the Firebase project's public name shown by Google's popup
  (`contexts/AuthContext.tsx:343`) and by Firebase Auth's mails, the OAuth consent screen, the sender in Vercel's
  `RESEND_FROM_EMAIL`: not verifiable from the repo, not touched; none, declared.
- **The meta description** (decision 38): unchanged; none, declared.
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
- Leggi doc/guide/shell.md, doc/guide/landing.md e doc/guide/accesso-registrazione.md PRIMA di
  toccare la shell, la landing e le pagine di accesso
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

Implementa la spec così com'è scritta: le tredici stringhe della § 4, il test
__tests__/productName.test.ts e i documenti della § 9. Fermati e chiedimi se il git grep del
criterio 1, lanciato PRIMA di modificare, stampa una riga che la § 1 non elenca. Collaudo: § 7. Un branch, un commit, solo dopo il mio
OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Sonnet 5.5**, effort **medium** — an S spec in one area, text only, every criterion closed by a test or a
grep. Estimated size: 1 short session, ~30 min; 13 strings, ~30 lines of test.
