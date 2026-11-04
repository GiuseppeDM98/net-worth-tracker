/**
 * Every per-account document must be in a list mirror:remove walks, or a guided tour leaves the owner's
 * real data in the emulators (2026-11-03: assistantMemory, account-access and budgetHistory were left).
 * Falsification seen red: 'assistantMemory' or 'budgetHistory' out of TOUR_ONLY_DOCS.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PER_USER_DOCS, TOUR_ONLY_DOCS, USER_COLLECTIONS } from '../scripts/mirrorCollections';

const walked = [...USER_COLLECTIONS, ...PER_USER_DOCS, ...TOUR_ONLY_DOCS];

describe('the mirror owns every per-account document', () => {
  it('lists each collection the rules key by account', () => {
    const rules = readFileSync('firestore.rules', 'utf8');
    const keyed = [...rules.matchAll(/match \/([\w-]+)\/\{(?:userId|ownerUid)\}/g)].map((m) => m[1]);
    expect(keyed).toContain('account-access');
    expect(keyed.filter((name) => !walked.includes(name))).toEqual([]);
  });

  it('lists the memory, which the rules deny and only the Admin SDK writes', () => {
    const store = readFileSync('lib/server/assistant/store.ts', 'utf8');
    const memory = /const MEMORY_COLLECTION = '([\w-]+)'/.exec(store)?.[1];
    expect(memory).toBeDefined();
    expect(walked).toContain(memory);
  });
});
