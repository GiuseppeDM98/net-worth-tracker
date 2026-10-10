/**
 * `doc/mobile/budget.json` lists the surfaces the first-screen census measures; the shell lists its
 * routes in `lib/constants/navigation.ts`. The census is plain `.mjs` and reads the JSON, so the two
 * are held equal here (as `perfRoutes.test.ts` holds `perf/routes.json`): a page added to the shell
 * and not to the census, or a surface the shell no longer has (`/dashboard/dividends` never
 * existed — Dividendi is `?tab=dividends` of Cashflow), fails this file. And every surface has a
 * budget at each of the three viewports, with no budget for a surface that is not listed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { primaryNav, secondaryHrefs, assistantNavItem } from '@/lib/constants/navigation';
import { MOBILE_VIEWPORTS, type MobileBudget } from '@/lib/utils/mobileBudget';

const budget: MobileBudget = JSON.parse(readFileSync(resolve(__dirname, '../doc/mobile/budget.json'), 'utf-8'));
const sorted = (xs: Iterable<string>) => [...xs].sort();

describe('doc/mobile/budget.json — surfaces', () => {
  it('covers every route of the shell but the assistant, and no other', () => {
    const routes = new Set(Object.values(budget.surfaces).map((surface) => surface.path.split('?')[0]));
    const shell = new Set([...primaryNav.map((item) => item.href), ...secondaryHrefs].filter((href) => href !== assistantNavItem.href));

    expect(sorted(routes)).toEqual(sorted(shell));
  });

  it('names the tab of every surface whose route has tabs in the URL', () => {
    for (const [key, surface] of Object.entries(budget.surfaces)) {
      if (surface.path.includes('?tab=')) expect(surface.tab?.trim(), key).toBeTruthy();
    }
  });

  it('applies The First-Screen Rule everywhere but Impostazioni, which has no verdict', () => {
    const exempt = Object.entries(budget.surfaces).filter(([, surface]) => !surface.target).map(([key]) => key);

    expect(exempt).toEqual(['impostazioni']);
  });
});

describe('doc/mobile/budget.json — budget entries', () => {
  it('has an entry at 390, 768 and 1024 for every surface', () => {
    for (const key of Object.keys(budget.surfaces)) {
      expect(sorted(Object.keys(budget.budget[key] ?? {})), key).toEqual(sorted(MOBILE_VIEWPORTS));
    }
  });

  it('has no entry for a surface that is not listed', () => {
    expect(sorted(Object.keys(budget.budget))).toEqual(sorted(Object.keys(budget.surfaces)));
  });

  it('carries aggregate numbers only: every entry is metrics plus an optional raisedBy', () => {
    const allowed = new Set(['screens', 'tilesAboveFold', 'tilesFullyAboveFold', 'figuresAboveFold', 'figuresOutsideVerdict', 'firstClosedRowAbovePill', 'overflowX', 'raisedBy']);
    for (const entries of Object.values(budget.budget)) {
      for (const entry of Object.values(entries)) {
        for (const field of Object.keys(entry ?? {})) expect(allowed.has(field), field).toBe(true);
      }
    }
  });
});
