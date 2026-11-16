/**
 * Playwright global setup — verify the emulators are up, then lay down every fixture.
 *
 * The emulators are NOT started here on purpose: `firebase emulators:start` is a long-running
 * process with its own export-on-exit persistence (`scripts/emulators.mjs`), and owning its
 * lifecycle from a test runner would either kill a suite the developer is also using by hand or
 * leave an orphan JVM behind. Instead the reachability check turns "connection refused" — which
 * surfaces 40 seconds later as an inscrutable auth failure — into an instruction.
 */

import { spawn } from 'node:child_process';

const FIRESTORE_EMULATOR_URL = 'http://127.0.0.1:8080';
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

const START_INSTRUCTIONS = [
  '',
  'The Firebase emulators are not reachable. Start them first, in a separate terminal:',
  '',
  '  npm run emulators        # leave running; state persists in .emulator-data',
  '  npm run emulators:seed   # once, creates the base test account',
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
 * One `npm run <script>`, its output buffered and printed whole when it ends: the seeds run side by
 * side, and interleaved lines would hide which fixture said what.
 */
function runSeed(script: string, args: string[], failure: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', script, ...(args.length ? ['--', ...args] : [])], { shell: true });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      process.stdout.write(output);
      if (code === 0) resolve();
      else reject(new Error(`${failure} — see the output above.`));
    });
  });
}

export default async function globalSetup(): Promise<void> {
  const [firestoreUp, authUp] = await Promise.all([
    isReachable(FIRESTORE_EMULATOR_URL),
    isReachable(AUTH_EMULATOR_URL),
  ]);

  if (!firestoreUp || !authUp) {
    throw new Error(START_INSTRUCTIONS);
  }

  // In parallel since 2026-11-16: the eight seeds were ~5 s each in series, nearly all of it the start
  // of `npm run` + `tsx`, and they write disjoint documents — each its own account, the profiles a
  // root collection none of the others touches. The one order that matters is kept as a chain.
  await Promise.all([
    // Impostazioni Coast FIRE sullo STESSO account base, dopo la fixture Previdenza: l'inflow di
    // sblocco del fondo pensione ha senso solo se `e2e-pension-fund` esiste già.
    runSeed('e2e:seed', [], 'The Previdenza E2E fixture failed to seed').then(() =>
      runSeed('e2e:seed:coast', [], 'The Coast FIRE E2E fixture failed to seed'),
    ),
    // Solo l'ACCOUNT degli scenari degradati, che `auth.degraded.setup.ts` dà per esistente; i dati li
    // scrive ogni test col proprio scenario. Separati apposta: aggiornare la password di un utente
    // revoca i suoi refresh token, quindi riseminare l'account a ogni scenario butterebbe fuori la
    // sessione appena parcheggiata.
    runSeed('e2e:seed', ['degraded-user'], 'The degraded-scenario account failed to seed'),
    // Account + data in one script (safe: it runs BEFORE auth.analisi.setup.ts parks the
    // session, so the password update cannot revoke a session that does not exist yet).
    runSeed('e2e:seed:analisi', [], 'The Analisi E2E fixture failed to seed'),
    // Same shape as Analisi's: its own account, created here before auth.centri.setup.ts parks a session.
    runSeed('e2e:seed:centri', [], 'The Centri di Costo E2E fixture failed to seed'),
    // Divisione, same shape again: opt-in tab, own account, seeded before its session is parked.
    runSeed('e2e:seed:split', [], 'The Divisione E2E fixture failed to seed'),
    // Hall of Fame: its own account with a four-year history, seeded before its session is parked.
    // The seed writes snapshots and rows only — the specs build the rankings through the real route.
    runSeed('e2e:seed:hof', [], 'The Hall of Fame E2E fixture failed to seed'),
    // The Esposizione's Yahoo profiles, re-stamped fresh: the route asks Yahoo for any ticker whose
    // cached answer has aged out (24 h for an empty one), and Yahoo is called by the SERVER, out of
    // reach of `page.route` — the seed is what keeps the Allocazione specs off the network.
    runSeed('e2e:seed:profiles', [], 'The instrument-profile fixture failed to seed'),
  ]);
}
