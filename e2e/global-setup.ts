/**
 * Playwright global setup — verify the emulators are up, then lay down every fixture, once per worker.
 *
 * The emulators are NOT started here on purpose: `firebase emulators:start` is a long-running
 * process with its own export-on-exit persistence (`scripts/emulators.mjs`), and owning its
 * lifecycle from a test runner would either kill a suite the developer is also using by hand or
 * leave an orphan JVM behind. Instead the reachability check turns "connection refused" — which
 * surfaces 40 seconds later as an inscrutable auth failure — into an instruction.
 *
 * ONE PROJECT PER WORKER (2026-11-26, e2e/emulator.ts): every worker reads its own Firestore
 * project, so the same fixtures — same uids, same fixed ids, same dates — are seeded in each. The
 * scripts are the ones `npm run e2e:seed:*` runs; here they are started through `tsx` itself with
 * the project in the environment, because the npm scripts pin the base one.
 */

import { spawn } from 'node:child_process';
import type { FullConfig } from '@playwright/test';
import {
  AUTH_EMULATOR_HOST,
  E2E_ON_BUILD,
  FIRESTORE_EMULATOR_HOST,
  WORKER_COUNT,
  documentsUrlOf,
  projectIdOf,
  seedCommand,
  seedEnv,
} from './emulator';

const START_INSTRUCTIONS = [
  '',
  'The Firebase emulators are not reachable. Start them first, in a separate terminal:',
  '',
  '  npm run emulators        # leave running; state persists in .emulator-data',
  '',
].join('\n');

async function isReachable(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(3_000) });
    return true;
  } catch {
    return false;
  }
}

/**
 * One seed script against one project, its output buffered and printed whole when it ends: the seeds
 * run side by side, and interleaved lines would hide which fixture — and which project — said what.
 */
function runSeed(projectId: string, scriptFile: string, args: string[], failure: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const seed = seedCommand(scriptFile, args);
    const child = spawn(seed.command, seed.args, { env: seedEnv(projectId) });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      process.stdout.write(`[${projectId}] ${scriptFile}${args.length ? ` ${args.join(' ')}` : ''}\n${output}`);
      if (code === 0) resolve();
      else reject(new Error(`${failure} in ${projectId} — see the output above.`));
    });
  });
}

const OWNER_HEADERS = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

/** The month the base seed dates its rows on: the machine's, as `scripts/seedEmulator.ts` reads it. */
function seedMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Where a project remembers which month its base seed was laid in. Read by nothing in the app. */
const stampUrl = (projectId: string) => `${documentsUrlOf(projectId)}/e2eSeedStamps/base`;

/**
 * The base account (`scripts/seedEmulator.ts`), laid when the project has none or has last month's.
 *
 * It dates its rows on the month it runs in, so a project seeded in October has no current-month
 * row in November and a dozen specs read an empty month. One project could be re-seeded by hand
 * (`npm run emulators:seed`, still the cure for a base account that drifted); four cannot be left to
 * memory, so each carries a stamp and the first run of a month re-seeds it. Idempotent: fixed ids,
 * overwritten.
 */
async function ensureBaseSeed(projectId: string): Promise<void> {
  const month = seedMonth();
  const stamp = await fetch(stampUrl(projectId), { headers: OWNER_HEADERS });
  if (stamp.ok) {
    const body = (await stamp.json()) as { fields?: { month?: { stringValue?: string } } };
    if (body.fields?.month?.stringValue === month) return;
  }
  await runSeed(projectId, 'scripts/seedEmulator.ts', [], 'The base seed failed');
  const written = await fetch(stampUrl(projectId), {
    method: 'PATCH',
    headers: OWNER_HEADERS,
    body: JSON.stringify({ fields: { month: { stringValue: month } } }),
  });
  if (!written.ok) throw new Error(`The base seed's stamp could not be written in ${projectId} (${written.status}).`);
}

/** Every fixture of one project: the base account first, then the rest side by side. */
async function seedProject(projectId: string): Promise<void> {
  await ensureBaseSeed(projectId);

  // In parallel since 2026-11-16: the seeds were ~5 s each in series, nearly all of it the start of
  // `npm run` + `tsx`, and they write disjoint documents — each its own account, the profiles a root
  // collection none of the others touches. The one order that matters is kept as a chain.
  await Promise.all([
    // Impostazioni Coast FIRE sullo STESSO account base, dopo la fixture Previdenza: l'inflow di
    // sblocco del fondo pensione ha senso solo se `e2e-pension-fund` esiste già.
    runSeed(projectId, 'scripts/seedPensionE2E.mts', [], 'The Previdenza E2E fixture failed to seed').then(() =>
      runSeed(projectId, 'scripts/seedCoastFireE2E.mts', [], 'The Coast FIRE E2E fixture failed to seed'),
    ),
    // Solo l'ACCOUNT degli scenari degradati, che `auth.degraded.setup.ts` dà per esistente; i dati li
    // scrive ogni test col proprio scenario. Separati apposta: aggiornare la password di un utente
    // revoca i suoi refresh token, quindi riseminare l'account a ogni scenario butterebbe fuori la
    // sessione appena parcheggiata.
    runSeed(projectId, 'scripts/seedPensionE2E.mts', ['degraded-user'], 'The degraded-scenario account failed to seed'),
    // Account + data in one script (safe: it runs BEFORE auth.analisi.setup.ts parks the
    // session, so the password update cannot revoke a session that does not exist yet).
    runSeed(projectId, 'scripts/seedAnalisiE2E.mts', [], 'The Analisi E2E fixture failed to seed'),
    // Same shape as Analisi's: its own account, created here before auth.centri.setup.ts parks a session.
    runSeed(projectId, 'scripts/seedCostCentersE2E.mts', [], 'The Centri di Costo E2E fixture failed to seed'),
    // Divisione, same shape again: opt-in tab, own account, seeded before its session is parked.
    runSeed(projectId, 'scripts/seedSplitE2E.mts', [], 'The Divisione E2E fixture failed to seed'),
    // Hall of Fame: its own account with a four-year history, seeded before its session is parked.
    // The seed writes snapshots and rows only — the specs build the rankings through the real route.
    runSeed(projectId, 'scripts/seedHallOfFameE2E.mts', [], 'The Hall of Fame E2E fixture failed to seed'),
    // The Esposizione's Yahoo profiles, re-stamped fresh: the route asks Yahoo for any ticker whose
    // cached answer has aged out (24 h for an empty one), and Yahoo is called by the SERVER, out of
    // reach of `page.route` — the seed is what keeps the Allocazione specs off the network.
    runSeed(projectId, 'scripts/seedInstrumentProfilesE2E.mts', [], 'The instrument-profile fixture failed to seed'),
  ]);
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  // `--workers` on the command line reaches `config.workers` but not the list of servers, which was
  // drawn when the config was read: a worker past the last server would test a port nobody serves.
  if (config.workers > WORKER_COUNT) {
    throw new Error(
      `${config.workers} workers were asked for and ${WORKER_COUNT} server${WORKER_COUNT === 1 ? ' is' : 's are'} started: ` +
        (E2E_ON_BUILD
          ? `set E2E_WORKERS=${config.workers} instead of --workers.`
          : 'an area run on `next dev` is one worker — the whole run (`npm run test:e2e`) is the one with several.'),
    );
  }

  const [firestoreUp, authUp] = await Promise.all([
    isReachable(`http://${FIRESTORE_EMULATOR_HOST}`),
    isReachable(`http://${AUTH_EMULATOR_HOST}`),
  ]);

  if (!firestoreUp || !authUp) {
    throw new Error(START_INSTRUCTIONS);
  }

  // The projects side by side: they share no document. The six Auth accounts every worker signs in
  // with are the BASE project's (Auth is shared), created by its seeds as before; the same seeds in
  // another worker's project write their Auth half into a namespace nobody signs in to.
  const started = Date.now();
  const projects = Array.from({ length: config.workers }, (_, index) => projectIdOf(index));
  await Promise.all(projects.map(seedProject));
  console.info(`[global-setup] ${projects.length} project${projects.length === 1 ? '' : 's'} seeded in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}
