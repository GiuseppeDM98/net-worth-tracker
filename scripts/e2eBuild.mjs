/**
 * e2e:build — the production build the WHOLE Playwright run is served from (`npm run test:e2e`,
 * since 2026-11-16; the area runs stay on `next dev`: doc/guide/e2e-suite.md § The suite's speed).
 *
 * Built only when the code changed since the last one: the build in `.next-e2e-build` carries the
 * fingerprint of the sources it was built from (`buildFingerprint.mjs`), and an equal fingerprint
 * skips the ~1 min of `next build`. `--force` rebuilds anyway.
 *
 * Its own dist dir, not `.next-perf`: the benchmark and the first-screen census build that one with
 * their own options (`perf:build -- --profile`), and neither must find the other's build there.
 *
 * The fingerprint is taken BEFORE the build: a file saved while `next build` runs leaves the stamp
 * older than the tree, so the next run rebuilds instead of trusting a build that may not hold it.
 */
import { spawnSync } from 'node:child_process';
import { readBuildStamp, sourceFingerprint, writeBuildStamp } from './buildFingerprint.mjs';

export const E2E_DIST = '.next-e2e-build';

const force = process.argv.includes('--force');
const fingerprint = sourceFingerprint();

if (!force && readBuildStamp(E2E_DIST) === fingerprint) {
  console.info(`[e2e:build] ${E2E_DIST} is the build of the code as it stands — not rebuilt.`);
  process.exit(0);
}

console.info(`[e2e:build] Building ${E2E_DIST}${force ? ' (--force)' : ' — the code changed since the last build'}…`);
const build = spawnSync('npx next build', {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    NEXT_DIST_DIR: E2E_DIST,
    // The same client configuration `dev:e2e` gives `next dev`: the browser talks to the emulators.
    NEXT_PUBLIC_USE_FIREBASE_EMULATOR: 'true',
    NEXT_PUBLIC_FIREBASE_API_KEY: 'demo-key',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-net-worth',
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo-net-worth.firebaseapp.com',
    // And the server's, in case a page reads Firestore while it is prerendered: never production.
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    GCLOUD_PROJECT: 'demo-net-worth',
  },
});
if (build.status !== 0) process.exit(build.status ?? 1);
writeBuildStamp(E2E_DIST, fingerprint);
console.info(`[e2e:build] ${E2E_DIST} stamped with the code it was built from.`);
