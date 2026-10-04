/**
 * Tests for vercel.json.
 *
 * A stray comma in this file breaks the deploy silently, and the Hobby plan
 * rejects more than one region, so the file is held here: valid JSON, ONE
 * European region next to Firestore (eur3), and the two crons intact.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const config = JSON.parse(
  readFileSync(path.resolve(__dirname, '../vercel.json'), 'utf8'),
) as { regions?: string[]; crons?: { path: string; schedule: string }[] };

describe('vercel.json', () => {
  it('runs the functions in one European region (Hobby accepts one)', () => {
    expect(config.regions).toEqual(['fra1']);
  });

  it('keeps the two crons', () => {
    expect(config.crons).toEqual([
      { path: '/api/cron/monthly-snapshot', schedule: '0 18 * * *' },
      { path: '/api/cron/daily-dividend-processing', schedule: '0 18 * * *' },
    ]);
  });
});
