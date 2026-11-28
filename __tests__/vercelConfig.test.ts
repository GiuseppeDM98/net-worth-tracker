/**
 * Tests for vercel.json.
 *
 * A stray comma in this file breaks the deploy silently, and the Hobby plan
 * rejects more than one region, so the file is held here: valid JSON, ONE
 * European region next to Firestore (eur3), and the three crons intact.
 *
 * The region is pinned by name on purpose: moving or removing it (the
 * rollback) is a deliberate change, and this expectation changes in the same
 * commit. Each guard was seen red on 2026-10-04: a second region, a renamed
 * cron path, and a doubled comma (the suite then fails at collection).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const config = JSON.parse(
  readFileSync(path.resolve(__dirname, '../vercel.json'), 'utf8'),
) as { regions?: string[]; crons?: { path: string; schedule: string }[] };

const manifest = JSON.parse(
  readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'),
) as { engines?: { node?: string }; overrides?: Record<string, string> };

describe('package.json on Vercel', () => {
  /**
   * Vercel honours `engines.node` over the project setting: the dev machine and the Lambda run the
   * same major, so a module that loads here loads there. Seen red with the field removed.
   */
  it('pins the Lambda to the Node major the dev machine runs', () => {
    expect(manifest.engines?.node).toBe('24.x');
  });

  /**
   * A Vercel Function starts Node with `--no-experimental-require-module`, so a `require()` of an
   * ESM-only package fails at ANY Node version: on 2026-10-08 every Admin route answered 500 —
   * `ERR_REQUIRE_ESM` on `jose@6`, which `jwks-rsa@4` (firebase-admin 14) `require()`s — on the
   * 22.x and the 24.x runtime alike, while the same production build on the dev machine answered 401.
   * The override keeps `jwks-rsa` on 3.x (jose 4, CommonJS); firebase-admin calls only
   * `jwks({ jwksUri, cache })` and `getSigningKeys()`, identical in both majors. The emulator suite
   * cannot see this (`verifyIdToken` skips the signature there). Seen red with the override removed.
   */
  it('keeps jwks-rsa on 3.x, the last major whose jose firebase-admin can require on a Vercel Function', () => {
    expect(manifest.overrides?.['jwks-rsa']).toBe('^3.2.2');
  });
});

describe('vercel.json', () => {
  it('runs the functions in one European region (Hobby accepts one)', () => {
    expect(config.regions).toEqual(['fra1']);
  });

  /**
   * The periodic emails leave from a cron of their own an hour after the snapshots (2026-11-28): Vercel
   * fires a daily cron anywhere inside its hour, and 19:00 UTC is still the same Italian day.
   */
  it('keeps the three crons, the emails an hour after the snapshots', () => {
    expect(config.crons).toEqual([
      { path: '/api/cron/monthly-snapshot', schedule: '0 18 * * *' },
      { path: '/api/cron/daily-dividend-processing', schedule: '0 18 * * *' },
      { path: '/api/cron/periodic-emails', schedule: '0 19 * * *' },
    ]);
  });

  /**
   * A cron route without `maxDuration` stops at the plan's default; an email with its comment written
   * at effort high takes minutes. Read from the SOURCE: importing a cron route drags its whole module
   * graph. Seen red with the line removed from either route.
   */
  it.each(['monthly-snapshot', 'periodic-emails'])('gives the %s cron 300 seconds', (route) => {
    const source = readFileSync(path.resolve(__dirname, `../app/api/cron/${route}/route.ts`), 'utf8');
    expect(source).toContain('export const maxDuration = 300;');
  });
});
