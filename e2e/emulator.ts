/**
 * The ONE place that names the emulator backend and the parked sessions.
 *
 * The whole run uses several workers, and each worker has its own universe: its own Firestore
 * project (`demo-net-worth-wN`, seeded like the base one), its own server of the one build
 * (`localhost:3100+N`) and its own copy of the six parked sessions. Worker 0 keeps the base project,
 * port 3100 and `e2e/.auth/*.json`: a one-worker run and an area run on `next dev` are what they
 * always were. Auth is shared — the Auth emulator signs every client login into its default project —
 * so the six accounts exist once and only their documents are per worker.
 *
 * So no spec, setup or helper writes a project id, a documents URL, a port or a session path: it
 * takes them from here, and the values follow the worker the file happens to run in
 * (`TEST_PARALLEL_INDEX`, which Playwright sets before a worker process loads anything). The check
 * that nothing went around this file is a grep with no hit outside it:
 *
 *   grep -rnE "demo-net-worth|\.auth/|localhost:31" e2e --include=*.ts
 *
 * The naming rule itself (`-wN`, the base port) is `lib/firebase/emulatorProject.ts`, the module the
 * app reads it from; the rest of the story is doc/guide/e2e-suite.md § The suite's speed.
 *
 * A helper, not a spec: the filename is collected by no project.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { E2E_BASE_PORT, E2E_MAX_WORKERS, workerProjectId } from '../lib/firebase/emulatorProject';

/** The project the emulators are started with: worker 0's, the tour's, and the one Auth lives in. */
export const BASE_PROJECT_ID = 'demo-net-worth';

export const FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
export const AUTH_EMULATOR_HOST = '127.0.0.1:9099';

/** Set by `npm run test:e2e` (the whole run): serve the production build instead of `next dev`. */
export const E2E_ON_BUILD = process.env.E2E_SERVER === 'build';

/**
 * How many workers the whole run uses on the production build. MEASURED, not derived from the core
 * count (2026-11-26, a CPU with 4 fast and 4 slow cores): four workers 8,2–8,5 min and green twice,
 * six 9,8–10 min with reds from contention. Another machine sets `E2E_WORKERS`.
 */
const WHOLE_RUN_WORKERS = 4;

/**
 * How many universes this run has: servers started, projects seeded, sessions parked. `E2E_WORKERS`
 * sets it (never `--workers` alone: the command line cannot start a server); `next dev` has one
 * dist dir and one port, so an area run is one worker.
 */
export const WORKER_COUNT = readWorkerCount();

function readWorkerCount(): number {
  const asked = process.env.E2E_WORKERS;
  const count = asked ? Number(asked) : E2E_ON_BUILD ? WHOLE_RUN_WORKERS : 1;
  if (!Number.isInteger(count) || count < 1 || count > E2E_MAX_WORKERS) {
    throw new Error(`E2E_WORKERS must be a whole number from 1 to ${E2E_MAX_WORKERS}, got «${asked}».`);
  }
  if (count > 1 && !E2E_ON_BUILD) {
    throw new Error(
      'Several workers need one server each, and only the production build can be served more than once: ' +
        'run `npm run test:e2e` (or set E2E_SERVER=build after `npm run e2e:build`), or leave E2E_WORKERS unset.',
    );
  }
  return count;
}

/** The worker this process is: 0 in the runner itself (the config's first load, `global-setup`). */
export const WORKER_INDEX = Number(process.env.TEST_PARALLEL_INDEX ?? 0);

export const projectIdOf = (workerIndex: number): string => workerProjectId(BASE_PROJECT_ID, workerIndex);
export const baseUrlOf = (workerIndex: number): string => `http://localhost:${E2E_BASE_PORT + workerIndex}`;
export const documentsUrlOf = (projectId: string): string =>
  `http://${FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents`;

/** This worker's Firestore project, server and REST root. */
export const PROJECT_ID = projectIdOf(WORKER_INDEX);
export const BASE_URL = baseUrlOf(WORKER_INDEX);
export const FIRESTORE_DOCUMENTS = documentsUrlOf(PROJECT_ID);

/**
 * Point the Admin SDK of this process at the emulator and at this worker's project. Called at module
 * scope by every spec that opens `firebase-admin`, before its first `initializeApp`.
 */
export function pointAdminAtEmulator(): void {
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMULATOR_HOST;
  process.env.GCLOUD_PROJECT = PROJECT_ID;
}

// ── The parked sessions ──────────────────────────────────────────────────────────────────────────

const AUTH_DIR = 'e2e/.auth';

/** Where the session of a fixture account is parked for a worker (`user`, `degraded`, `analisi`, …). */
export function sessionPath(account: string, workerIndex: number = WORKER_INDEX): string {
  return workerIndex > 0 ? `${AUTH_DIR}/w${workerIndex}/${account}.json` : `${AUTH_DIR}/${account}.json`;
}

interface StorageStateFile {
  cookies: unknown[];
  origins: Array<{ origin: string; [key: string]: unknown }>;
}

/**
 * Park the session a setup just wrote for every OTHER worker too.
 *
 * A setup runs once, in whichever worker picks it up, and logs in on that worker's server; a stored
 * session belongs to an origin, and each worker has its own. The account is the same everywhere
 * (Auth is shared), so the file is copied with its origin moved to each other worker's port.
 *
 * @param statePath - the file the setup wrote, `sessionPath(account)` of the worker it ran in
 */
export function shareSessionWithWorkers(statePath: string): void {
  const account = basename(statePath, '.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8')) as StorageStateFile;
  for (let index = 0; index < WORKER_COUNT; index += 1) {
    if (index === WORKER_INDEX) continue;
    const copy: StorageStateFile = {
      ...state,
      origins: state.origins.map((entry) =>
        entry.origin === BASE_URL ? { ...entry, origin: baseUrlOf(index) } : entry,
      ),
    };
    const target = sessionPath(account, index);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(copy, null, 2));
  }
}

// ── The seeds ────────────────────────────────────────────────────────────────────────────────────

/** The environment a seed script reads: the emulators, and the project it writes to. */
export function seedEnv(projectId: string = PROJECT_ID): NodeJS.ProcessEnv {
  return {
    ...process.env,
    FIRESTORE_EMULATOR_HOST,
    FIREBASE_AUTH_EMULATOR_HOST: AUTH_EMULATOR_HOST,
    GCLOUD_PROJECT: projectId,
  };
}

/**
 * The command that runs a seed script: `tsx` itself, not `npm run` — the npm scripts pin the base
 * project, and their start was most of a seed's time (doc/guide/e2e-suite.md § The suite's speed).
 */
export function seedCommand(scriptFile: string, args: string[] = []): { command: string; args: string[] } {
  return { command: process.execPath, args: ['node_modules/tsx/dist/cli.mjs', scriptFile, ...args] };
}

/**
 * Run a seed script against THIS worker's project and wait for it — for a spec that rewrites its
 * scenario between tests. Synchronous on purpose: no navigation may start while Firestore is being
 * rewritten, and the file's tests run one after the other in one worker.
 */
export function runSeedSync(scriptFile: string, args: string[], failure: string): void {
  const seed = seedCommand(scriptFile, args);
  const result = spawnSync(seed.command, seed.args, { stdio: 'pipe', env: seedEnv() });
  if (result.status !== 0) {
    throw new Error(`${failure}:\n${result.stderr?.toString() ?? ''}`);
  }
}
