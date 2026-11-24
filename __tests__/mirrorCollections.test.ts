/**
 * Every per-account document must be in a list mirror:remove walks, or a guided tour leaves the owner's
 * real data in the emulators (2026-11-03: assistantMemory, account-access and budgetHistory were left).
 * Falsification seen red: 'assistantMemory' or 'budgetHistory' out of TOUR_ONLY_DOCS.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PER_USER_DOCS, PER_USER_MONTH_DOCS, TOUR_ONLY_DOCS, USER_COLLECTIONS } from '../scripts/mirrorCollections';

const walked = [...USER_COLLECTIONS, ...PER_USER_DOCS, ...PER_USER_MONTH_DOCS, ...TOUR_ONLY_DOCS];

describe('the mirror owns every per-account document', () => {
  it('lists each collection the rules key by account', () => {
    const rules = readFileSync('firestore.rules', 'utf8');
    const keyed = [...rules.matchAll(/match \/([\w-]+)\/\{(?:userId|ownerUid)\}/g)].map((m) => m[1]);
    expect(keyed).toContain('account-access');
    // The daily archive (2026-11-23), seen red with PER_USER_MONTH_DOCS out of the union.
    expect(keyed).toContain('dailySnapshots');
    expect(keyed.filter((name) => !walked.includes(name))).toEqual([]);
  });

  // A collection keyed by a random id names its account in `userId` (`canAccess(resource.data.userId)`): the
  // mirror copies it as a query by owner. assetAllocationTargets reads the same way but its id IS the uid.
  // Seen red with 'accumulationPlans' out of USER_COLLECTIONS.
  it('lists each collection the rules read by its userId field', () => {
    const rules = readFileSync('firestore.rules', 'utf8');
    const byField = rules.split(/(?=\n\s*match \/)/)
      .filter((block) => /canAccess\(resource\.data\.userId\)/.test(block))
      .map((block) => /match \/([\w-]+)\/\{\w+\}/.exec(block)?.[1])
      .filter((name): name is string => !!name);
    expect(byField).toContain('accumulationPlans');
    expect(byField.filter((name) => !USER_COLLECTIONS.includes(name) && !PER_USER_DOCS.includes(name))).toEqual([]);
  });

  // No code reads or writes a `goals` collection (the goals live in goalBasedInvesting/{uid}): a dead entry
  // left on 2026-11-23. Seen red with 'goals' back in USER_COLLECTIONS.
  it('lists no collection the app does not have', () => {
    expect(walked).not.toContain('goals');
    expect(walked).toContain('goalBasedInvesting');
  });

  it('lists the memory, which the rules deny and only the Admin SDK writes', () => {
    const store = readFileSync('lib/server/assistant/store.ts', 'utf8');
    const memory = /const MEMORY_COLLECTION = '([\w-]+)'/.exec(store)?.[1];
    expect(memory).toBeDefined();
    expect(walked).toContain(memory);
  });
});
