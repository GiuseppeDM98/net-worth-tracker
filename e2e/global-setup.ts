/**
 * Playwright global setup — verify the emulators are up, then lay down the Previdenza fixture.
 *
 * The emulators are NOT started here on purpose: `firebase emulators:start` is a long-running
 * process with its own export-on-exit persistence (`scripts/emulators.mjs`), and owning its
 * lifecycle from a test runner would either kill a suite the developer is also using by hand or
 * leave an orphan JVM behind. Instead the reachability check turns "connection refused" — which
 * surfaces 40 seconds later as an inscrutable auth failure — into an instruction.
 */

import { spawnSync } from 'node:child_process';

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

export default async function globalSetup(): Promise<void> {
  const [firestoreUp, authUp] = await Promise.all([
    isReachable(FIRESTORE_EMULATOR_URL),
    isReachable(AUTH_EMULATOR_URL),
  ]);

  if (!firestoreUp || !authUp) {
    throw new Error(START_INSTRUCTIONS);
  }

  const seed = spawnSync('npm', ['run', 'e2e:seed'], { stdio: 'inherit', shell: true });
  if (seed.status !== 0) {
    throw new Error('The Previdenza E2E fixture failed to seed — see the output above.');
  }

  // Impostazioni Coast FIRE sullo STESSO account base, dopo la fixture Previdenza: l'inflow di
  // sblocco del fondo pensione ha senso solo se `e2e-pension-fund` esiste già.
  const coastSeed = spawnSync('npm', ['run', 'e2e:seed:coast'], { stdio: 'inherit', shell: true });
  if (coastSeed.status !== 0) {
    throw new Error('The Coast FIRE E2E fixture failed to seed — see the output above.');
  }

  // Solo l'ACCOUNT degli scenari degradati, che `auth.degraded.setup.ts` dà per esistente; i dati li
  // scrive ogni test col proprio scenario. Separati apposta: aggiornare la password di un utente
  // revoca i suoi refresh token, quindi riseminare l'account a ogni scenario butterebbe fuori la
  // sessione appena parcheggiata.
  const degradedSeed = spawnSync('npm', ['run', 'e2e:seed', '--', 'degraded-user'], {
    stdio: 'inherit',
    shell: true,
  });
  if (degradedSeed.status !== 0) {
    throw new Error('The degraded-scenario account failed to seed — see the output above.');
  }

  // Account + data in one script (safe: it runs BEFORE auth.analisi.setup.ts parks the
  // session, so the password update cannot revoke a session that does not exist yet).
  const analisiSeed = spawnSync('npm', ['run', 'e2e:seed:analisi'], { stdio: 'inherit', shell: true });
  if (analisiSeed.status !== 0) {
    throw new Error('The Analisi E2E fixture failed to seed — see the output above.');
  }
}
