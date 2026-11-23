/**
 * perf:serve — serve a production build (standalone) against the local emulators. By default the
 * `npm run perf:build` output on :3200, for `npm run perf:bench` and the census (the manual:
 * doc/guide/velocita.md); since 2026-11-16 also the `e2e:build` output on :3100, the whole Playwright
 * run's server (`playwright.config.ts`, doc/guide/e2e-suite.md § The suite's speed):
 *
 *   node scripts/perfServe.mjs [--port=3200] [--dist=.next-perf] [--env-local] [--fresh]
 *
 * - `--env-local` loads `.env.local` the way `next dev` does: a standalone `server.js` reads no env
 *   file, so without it a dynamic page reads no key (the Consulente's). The emulator variables are set
 *   FIRST, and `@next/env` never overrides a variable already set — so the Admin SDK stays on the
 *   emulators whatever the file holds.
 * - `--fresh` refuses a build whose fingerprint is not the code's as it stands (`buildFingerprint.mjs`):
 *   a server that runs a stale build answers green on code that no longer exists.
 *
 * `next start` refuses a `output: "standalone"` build, so this is SETUP.md's recipe («`npm run
 * start` refuses to serve the build») as a script: copy `static` and `public` next to the
 * standalone `server.js` — Next does not, and without them every asset 404s — then start it.
 *
 * Why :3200 by default: :3000 is the tour server (`dev:emulator`), :3100 the Playwright one; the
 * benchmark must contend with neither.
 *
 * Where `server.js` lives is SEARCHED, never assumed: Next mirrors the project's path below the
 * tracing root it infers, so on a Windows checkout it lands in
 * `.next-perf/standalone/Documents/GitHub/net-worth-tracker/` and on another machine elsewhere.
 */
import { cpSync, existsSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';
import { readBuildStamp, sourceFingerprint } from './buildFingerprint.mjs';

// `@next/env` resolved from `next` itself — the copy `next dev` reads `.env.local` with, and not a
// dependency of ours to keep in step with it.
const requireFromNext = createRequire(createRequire(import.meta.url).resolve('next/package.json'));
const { loadEnvConfig } = requireFromNext('@next/env');

function option(name, fallback) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : fallback;
}

const DIST = option('dist', '.next-perf');
const PORT = option('port', '3200');
const LOAD_ENV_LOCAL = process.argv.includes('--env-local');
const REQUIRE_FRESH = process.argv.includes('--fresh');
const STANDALONE = join(DIST, 'standalone');
const TAG = `[serve ${DIST} :${PORT}]`;

/** The shallowest `server.js` under `standalone/`, outside `node_modules`. */
function findServerDir(root) {
  let level = [root];
  while (level.length) {
    const next = [];
    for (const dir of level) {
      const entries = readdirSync(dir, { withFileTypes: true });
      if (entries.some((e) => e.isFile() && e.name === 'server.js')) return dir;
      for (const e of entries) if (e.isDirectory() && e.name !== 'node_modules' && !e.name.startsWith('.')) next.push(join(dir, e.name));
    }
    level = next;
  }
  return null;
}

if (!existsSync(join(DIST, 'BUILD_ID')) || !existsSync(STANDALONE)) {
  console.error(`${TAG} No production build in ${DIST}: build it first (\`npm run perf:build\` for .next-perf, \`npm run e2e:build\` for .next-e2e-build).`);
  process.exit(1);
}
if (REQUIRE_FRESH && readBuildStamp(DIST) !== sourceFingerprint()) {
  console.error(`${TAG} The build in ${DIST} is not the build of the code as it stands: run \`npm run e2e:build\` (or the whole run, \`npm run test:e2e\`, which builds first).`);
  process.exit(1);
}
const serverDir = findServerDir(STANDALONE);
if (!serverDir) {
  console.error(`${TAG} No server.js under ${STANDALONE}.`);
  process.exit(1);
}

// The two copies Next leaves to us. The static dir follows the dist dir's NAME inside the app dir.
cpSync(join(DIST, 'static'), join(serverDir, DIST, 'static'), { recursive: true, force: true });
cpSync('public', join(serverDir, 'public'), { recursive: true, force: true });

// The client side was pointed at the emulators when the build baked NEXT_PUBLIC_USE_FIREBASE_EMULATOR;
// these route the SERVER side (the Admin SDK of every /api route) there too. Set before `.env.local`
// is read, which never overrides them.
Object.assign(process.env, {
  PORT,
  // HOSTNAME is set by Git Bash to the machine's name, which would bind the server away from localhost.
  HOSTNAME: 'localhost',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  GCLOUD_PROJECT: 'demo-net-worth',
});
if (LOAD_ENV_LOCAL) loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });

console.info(`${TAG} ${relative('.', join(serverDir, 'server.js'))} on http://localhost:${PORT} (emulators: Auth :9099, Firestore :8080)`);
const child = spawn(process.execPath, ['server.js'], { cwd: serverDir, stdio: 'inherit', env: process.env });
child.on('exit', (code) => process.exit(code ?? 0));
// Playwright stops its web server with a signal: pass it on, or the standalone server outlives the run.
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
