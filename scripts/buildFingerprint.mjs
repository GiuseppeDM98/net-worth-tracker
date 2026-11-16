/**
 * What a production build was built FROM, as one hash — so a server never runs a build older than
 * the code beside it in silence (2026-11-16, the whole Playwright run on a production server:
 * doc/guide/e2e-playwright.md § The suite's speed).
 *
 * The hash covers the CONTENT of every file git would see — tracked and untracked, the ignored ones
 * left out, as Tailwind's own scan does — plus `.env.local`, which `next build` reads and bakes into
 * the prerendered pages (only its hash, never its text). A file's mtime would be cheaper and wrong: a
 * branch switch back and forth leaves the content equal and the mtime new.
 *
 * `e2e/` and `__tests__/` are left out on purpose: the specs, their helpers and the unit tests never
 * reach the app's bundle, and a spec fixed between two whole runs must not cost a rebuild.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const EXCLUDED = /^(e2e|__tests__)\//;
const STAMP = 'e2e-build-fingerprint';

export function sourceFingerprint() {
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter((file) => file && !EXCLUDED.test(file))
    .sort();
  const hash = createHash('sha256');
  for (const file of [...new Set(files)]) {
    // A tracked file deleted in the working tree is listed by `--cached` and is simply absent.
    if (!existsSync(file)) continue;
    hash.update(file).update('\0').update(readFileSync(file)).update('\0');
  }
  if (existsSync('.env.local')) hash.update('.env.local\0').update(readFileSync('.env.local'));
  return hash.digest('hex');
}

/** The fingerprint the build in `dist` was stamped with, or null when it carries none. */
export function readBuildStamp(dist) {
  const path = join(dist, STAMP);
  return existsSync(path) ? readFileSync(path, 'utf8').trim() : null;
}

export function writeBuildStamp(dist, fingerprint) {
  writeFileSync(join(dist, STAMP), `${fingerprint}\n`);
}
