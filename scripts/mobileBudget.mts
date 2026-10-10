/**
 * mobile:budget — the last `npm run mobile:census` against doc/mobile/budget.json, the first-screen
 * budget that can only get better (the manual: doc/guide/velocita.md § Il censimento della prima
 * schermata).
 *
 * Reads `.mobile-census/last-run.json` (no browser, no server) and hands it to
 * `compareCensusToBudget` (lib/utils/mobileBudget.ts) together with the budget committed in HEAD
 * (`git show HEAD:doc/mobile/budget.json`, as `perf:budget` does), so an entry widened without a
 * `raisedBy` of its own is red too. Prints every violation, the informational breaches (768/1024
 * until MOB-08) and the «obiettivo» column of The First-Screen Rule.
 *
 * Usage (options ALWAYS after `--`, from Git Bash on Windows):
 *   npm run mobile:budget
 *   npm run mobile:budget -- --tighten   writes the exact measure where it is better; never widens.
 *                                        Refused unless the run is census@example.com's and every
 *                                        surface settled.
 * Exit 1 on any violation, or on a refused `--tighten`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  compareCensusToBudget,
  describeMobileViolation,
  tightenBudget,
  tightenRefusal,
  type CensusRun,
  type FirstScreenTarget,
  type MobileBudget,
} from '@/lib/utils/mobileBudget';

const BUDGET_PATH = 'doc/mobile/budget.json';
const RUN_PATH = '.mobile-census/last-run.json';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? 'true'];
  }),
);
const TIGHTEN = args.tighten === 'true';

/** The budget committed in HEAD, or null when HEAD has none (the commit that creates it). */
function readCommittedBudget(): MobileBudget | null {
  try {
    const text = execFileSync('git', ['show', `HEAD:${BUDGET_PATH}`], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(text) as MobileBudget;
  } catch {
    return null;
  }
}

if (!existsSync(RUN_PATH)) {
  console.error(`[mobile:budget] ${RUN_PATH} manca: lancia prima \`npm run mobile:census -- --email=census@example.com\`.`);
  process.exit(1);
}
const run = JSON.parse(readFileSync(RUN_PATH, 'utf-8')) as CensusRun & { durationMs?: number };
let budget = JSON.parse(readFileSync(BUDGET_PATH, 'utf-8')) as MobileBudget;
console.log(
  `[mobile:budget] corsa di ${run.email} del ${run.at} (${run.results.length} misure) · budget ${BUDGET_PATH} ` +
    `(account ${budget.account}, misurato il ${budget.measuredAt || '—'})${TIGHTEN ? ' · --tighten' : ''}`,
);

// Tighten first, then compare what was written
if (TIGHTEN) {
  const refusal = tightenRefusal(run);
  if (refusal) {
    console.error(`[mobile:budget] --tighten rifiutato: ${refusal}.`);
    process.exit(1);
  }
  budget = tightenBudget(run, budget);
  writeFileSync(BUDGET_PATH, `${JSON.stringify(budget, null, 2)}\n`);
  console.log(`[mobile:budget] ${BUDGET_PATH} scritto: ogni valore al misurato esatto dove è migliore, mai allargato.`);
}
const verdict = compareCensusToBudget(run.results, budget, readCommittedBudget());

// The table: one line per measured surface × viewport
const targetOf = new Map<string, FirstScreenTarget>(verdict.targets.map((t) => [`${t.surface}@${t.viewport}`, t]));
const TARGET_LABEL = { met: 'sì', 'not-yet': 'non ancora', none: '—' } as const;
console.log('\nsuperficie | viewport | screens | tessere (inizio/intere) | cifre (piega/fuori verdetto) | riga chiusa | overflowX | esito | obiettivo');
for (const row of run.results) {
  const key = `${row.surface}@${row.viewport}`;
  const bad = verdict.violations.some((v) => `${v.surface}@${v.viewport}` === key);
  const target = targetOf.get(key);
  const m = row.metrics;
  console.log(
    [
      row.surface,
      row.viewport,
      m ? m.screens : row.status,
      m ? `${m.tilesAboveFold}/${m.tilesFullyAboveFold}` : '-',
      m ? `${m.figuresAboveFold}/${m.figuresOutsideVerdict}` : '-',
      m ? String(m.firstClosedRowAbovePill) : '-',
      m ? String(m.overflowX) : '-',
      bad ? 'ROSSO' : 'ok',
      target ? `${TARGET_LABEL[target.status]}${target.status === 'not-yet' ? ` (${target.detail})` : ''}` : '-',
    ].join(' | '),
  );
}

if (verdict.informational.length) {
  console.log('\nInformative (stampate, non vincolanti fino a MOB-08):');
  for (const v of verdict.informational) console.log(`  · ${describeMobileViolation(v)}`);
}
if (typeof run.durationMs === 'number') console.log(`\nDurata della corsa: ${(run.durationMs / 60000).toFixed(1)} min`);

if (!verdict.ok) {
  console.error('\n[mobile:budget] ROSSO:');
  for (const v of verdict.violations) console.error(`  - ${describeMobileViolation(v)}`);
  console.error('  Una voce si allarga solo a mano, con l\'OK del proprietario: «raisedBy»: «MOB-NN: perché» sulla voce');
  console.error('  (superficie × viewport) e una riga in doc/mobile/README.md § 3.1, nello stesso commit.');
  process.exit(1);
}
console.log(`\n[mobile:budget] verde: ${run.results.length} misure dentro il budget.`);
