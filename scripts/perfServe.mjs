/**
 * perf:serve — serve the `npm run perf:build` output on :3200 against the local emulators, for
 * `npm run perf:bench` (the manual: doc/guide/velocita.md).
 *
 * `next start` refuses a `output: "standalone"` build, so this is SETUP.md's recipe («`npm run
 * start` refuses to serve the build») as a script: copy `static` and `public` next to the
 * standalone `server.js` — Next does not, and without them every asset 404s — then start it.
 *
 * Why :3200: :3000 is the tour server (`dev:emulator`), :3100 the Playwright one (`dev:e2e`); the
 * benchmark must contend with neither.
 *
 * Where `server.js` lives is SEARCHED, never assumed: Next mirrors the project's path below the
 * tracing root it infers, so on the Windows laptop it lands in
 * `.next-perf/standalone/Documents/GitHub/net-worth-tracker/` and on another machine elsewhere.
 */
import { cpSync, existsSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, relative } from 'node:path';

const DIST = '.next-perf';
const PORT = '3200';
const STANDALONE = join(DIST, 'standalone');

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
  console.error(`[perf:serve] No production build in ${DIST}: run \`npm run perf:build\` first.`);
  process.exit(1);
}
const serverDir = findServerDir(STANDALONE);
if (!serverDir) {
  console.error(`[perf:serve] No server.js under ${STANDALONE}.`);
  process.exit(1);
}

// The two copies Next leaves to us. The static dir follows the dist dir's NAME inside the app dir.
cpSync(join(DIST, 'static'), join(serverDir, DIST, 'static'), { recursive: true, force: true });
cpSync('public', join(serverDir, 'public'), { recursive: true, force: true });
console.info(`[perf:serve] ${relative('.', join(serverDir, 'server.js'))} on http://localhost:${PORT} (emulators: Auth :9099, Firestore :8080)`);

// The client side was pointed at the emulators when perf:build baked NEXT_PUBLIC_USE_FIREBASE_EMULATOR;
// these route the SERVER side (the Admin SDK of every /api route) there too.
const child = spawn(process.execPath, ['server.js'], {
  cwd: serverDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT,
    // HOSTNAME is set by Git Bash to the machine's name, which would bind the server away from localhost.
    HOSTNAME: 'localhost',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    GCLOUD_PROJECT: 'demo-net-worth',
  },
});
child.on('exit', (code) => process.exit(code ?? 0));
