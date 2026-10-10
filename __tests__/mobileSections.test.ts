/**
 * Tests for lib/utils/mobileSections.ts — the memory of a page's rows below `desktop:` and the
 * ids the DOM uses (The Closed-Row Rule, since 2026-10-10).
 *
 * Falsified on 2026-10-10: «a failed read opens against the memory» went red with the `∪ failed`
 * loop removed from `resolveOpenSections`; «setAll leaves the rest as it was» went red with
 * `nextSectionsForAll` treating `restId` like any row; «a storage that throws» went red with the
 * try/catch around `localStorage.getItem` removed (the read threw instead of answering `null`).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mobileSectionsKey,
  nextSectionsForAll,
  parseStoredSections,
  readStoredSections,
  resolveOpenSections,
  sectionPanelId,
  sectionTriggerId,
  serializeSections,
  subscribeStoredSections,
  VERDICT_REST_SECTION,
  writeStoredSections,
} from '@/lib/utils/mobileSections';

const KNOWN = ['hof-entrate', 'hof-risparmio', 'hof-anni', 'hof-note', VERDICT_REST_SECTION];

describe('mobileSectionsKey and the DOM ids', () => {
  it('should name the route, and the tab when there is one', () => {
    expect(mobileSectionsKey('hall-of-fame')).toBe('mobile-sections:hall-of-fame');
    expect(mobileSectionsKey('cashflow', 'budget')).toBe('mobile-sections:cashflow:budget');
  });

  it('should derive the trigger and panel ids from the section id, and name the rest «perche»', () => {
    expect(sectionTriggerId('hof-anni')).toBe('hof-anni-trigger');
    expect(sectionPanelId('hof-anni')).toBe('hof-anni-panel');
    expect(VERDICT_REST_SECTION).toBe('perche');
  });
});

describe('parseStoredSections and serializeSections', () => {
  it('should read back what was written, sorted and without duplicates', () => {
    const raw = serializeSections(['hof-note', 'hof-anni', 'hof-note']);

    expect(raw).toBe('["hof-anni","hof-note"]');
    expect(parseStoredSections(raw)).toEqual(['hof-anni', 'hof-note']);
  });

  it('should answer null for a never-touched page and for anything that is not an array of strings', () => {
    expect(parseStoredSections(null)).toBeNull();
    expect(parseStoredSections('{not json')).toBeNull();
    expect(parseStoredSections('{}')).toBeNull();
    expect(parseStoredSections('[1]')).toBeNull();
    expect(parseStoredSections('"hof-anni"')).toBeNull();
  });

  it('should keep an empty array as a real memory: everything closed on purpose', () => {
    expect(parseStoredSections('[]')).toEqual([]);
  });
});

describe('resolveOpenSections', () => {
  const resolve = (input: Partial<Parameters<typeof resolveOpenSections>[0]>) =>
    resolveOpenSections({ stored: null, known: KNOWN, defaults: [], failed: [], dismissed: [], ...input });

  it('should open the defaults on a first visit and the memory afterwards', () => {
    expect([...resolve({ defaults: ['hof-anni'] })]).toEqual(['hof-anni']);
    expect([...resolve({ stored: ['hof-note'], defaults: ['hof-anni'] })]).toEqual(['hof-note']);
  });

  it('should drop ids the page no longer knows', () => {
    expect([...resolve({ stored: ['hof-anni', 'patrimonio-mutuo-gone'] })]).toEqual(['hof-anni']);
  });

  it('should remember the verdict rest as a row', () => {
    expect(resolve({ stored: [VERDICT_REST_SECTION] }).has(VERDICT_REST_SECTION)).toBe(true);
  });

  it('should open a failed read whatever the memory says', () => {
    const open = resolve({ stored: ['hof-note'], failed: ['hof-anni'] });

    expect(open.has('hof-anni')).toBe(true);
    expect(open.has('hof-note')).toBe(true);
  });

  it('should keep a failed read closed once the reader dismissed it in this visit', () => {
    const open = resolve({ stored: [], failed: ['hof-anni'], dismissed: ['hof-anni'] });

    expect(open.has('hof-anni')).toBe(false);
  });
});

describe('nextSectionsForAll', () => {
  it('should open every row and leave a closed rest closed', () => {
    const next = nextSectionsForAll(new Set(['hof-anni']), KNOWN, true, VERDICT_REST_SECTION);

    expect(next).toEqual(['hof-entrate', 'hof-risparmio', 'hof-anni', 'hof-note']);
  });

  it('should close every row and leave an open rest open', () => {
    const next = nextSectionsForAll(new Set(['hof-anni', VERDICT_REST_SECTION]), KNOWN, false, VERDICT_REST_SECTION);

    expect(next).toEqual([VERDICT_REST_SECTION]);
  });

  it('should open every row and keep an open rest open', () => {
    const next = nextSectionsForAll(new Set([VERDICT_REST_SECTION]), KNOWN, true, VERDICT_REST_SECTION);

    expect(next).toEqual(KNOWN);
  });
});

describe('the store', () => {
  const key = mobileSectionsKey('hall-of-fame');

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should answer null from a storage that throws, and keep a refused write in memory', () => {
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    vi.stubGlobal('localStorage', throwing);

    expect(readStoredSections(key)).toBeNull();

    const listener = vi.fn();
    const unsubscribe = subscribeStoredSections(listener);
    writeStoredSections(key, ['hof-anni']);
    unsubscribe();

    // The subscribers heard it and the snapshot holds it: the row opens, the memory does not survive.
    expect(listener).toHaveBeenCalledTimes(1);
    expect(readStoredSections(key)).toBe('["hof-anni"]');
  });

  it('should write through to the storage when it accepts, and forget the in-memory copy', () => {
    const backing = new Map<string, string>([[key, '["hof-anni"]']]);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => {
        backing.set(k, v);
      },
    });

    writeStoredSections(key, ['hof-note', 'hof-anni']);

    expect(backing.get(key)).toBe('["hof-anni","hof-note"]');
    expect(readStoredSections(key)).toBe('["hof-anni","hof-note"]');
  });

  it('should answer null where no storage exists at all (the server)', () => {
    vi.stubGlobal('localStorage', undefined);

    expect(readStoredSections(mobileSectionsKey('never-written'))).toBeNull();
  });
});
