/**
 * The Firestore project of ONE Playwright worker — on the Local Emulator Suite only.
 *
 * The whole E2E run uses several workers (doc/guide/e2e-suite.md § The suite's speed), and two
 * workers on one set of documents race. The Firestore emulator isolates by project id, so worker N
 * gets its own project, `<base>-wN`, seeded like the base one; worker 0 keeps the base project, which
 * is why a one-worker run and the tour server read what they always read. Auth is NOT isolated: the
 * Auth emulator signs every client login into its default project, so the accounts stay shared.
 *
 * The page learns its worker from the PORT it is served on (3100 + N): the client bundle is built
 * once, with the base project baked in, and each worker has its own server of that one build.
 *
 * Nothing here can reach production: `clientProjectId` returns the base project unless the build
 * carries the emulator flag, and the Admin side reads its variable only under
 * `FIRESTORE_EMULATOR_HOST` (lib/firebase/admin.ts). Held by `__tests__/emulatorProject.test.ts`.
 *
 * No `@/` import in this file: `e2e/emulator.ts` and `playwright.config.ts` import it by path.
 */

/** The port of worker 0's server; worker N is served on this plus N. */
export const E2E_BASE_PORT = 3100;

/** Ports above the last worker's are someone else's (:3200 is the benchmark's server). */
export const E2E_MAX_WORKERS = 16;

/** The Firestore project of a worker: the base project for worker 0, `<base>-wN` for the others. */
export function workerProjectId(baseProjectId: string, workerIndex: number): string {
  return workerIndex > 0 ? `${baseProjectId}-w${workerIndex}` : baseProjectId;
}

/** Which worker a page served on `port` belongs to; 0 for any port that is not a worker's. */
export function workerIndexOfPort(port: string | undefined): number {
  if (!port || !/^\d+$/.test(port)) return 0;
  const index = Number(port) - E2E_BASE_PORT;
  return index > 0 && index < E2E_MAX_WORKERS ? index : 0;
}

/**
 * The project id the browser's Firebase app is created with.
 *
 * @param baseProjectId - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, as the build baked it
 * @param usesEmulator - whether the build carries `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true`
 * @param port - `window.location.port`, or undefined on the server
 */
export function clientProjectId(
  baseProjectId: string | undefined,
  usesEmulator: boolean,
  port: string | undefined,
): string | undefined {
  if (!usesEmulator || !baseProjectId) return baseProjectId;
  return workerProjectId(baseProjectId, workerIndexOfPort(port));
}

/**
 * The Firestore project of the Admin SDK when it is not the default app's, or undefined.
 *
 * @param emulatorHost - `FIRESTORE_EMULATOR_HOST`: without it the override does not exist
 * @param requestedProject - `E2E_FIRESTORE_PROJECT`, set by the worker's server (scripts/perfServe.mjs)
 * @param defaultProject - the project of the default Admin app, which keeps Auth
 */
export function adminFirestoreProjectOverride(
  emulatorHost: string | undefined,
  requestedProject: string | undefined,
  defaultProject: string | undefined,
): string | undefined {
  if (!emulatorHost || !requestedProject || requestedProject === defaultProject) return undefined;
  return requestedProject;
}
