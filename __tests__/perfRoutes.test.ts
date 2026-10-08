/**
 * `perf/routes.json` is the benchmark's list of pages; `lib/constants/navigation.ts` is the app's.
 * The benchmark is plain `.mjs` and cannot import the `@/` alias, so the two are held equal here:
 * a page added to the shell and not to the benchmark,
 * or a route the benchmark visits that the shell no longer has (`/dashboard/dividends` never
 * existed — Dividendi is `?tab=dividends` of Cashflow), fails this file.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { primaryNav, secondaryHrefs, analysisNav, planningNav, assistantNavItem } from '@/lib/constants/navigation';

interface PerfRoute {
  name: string;
  href: string;
  bench?: boolean;
  why?: string;
}

const perfRoutes: PerfRoute[] = JSON.parse(
  readFileSync(resolve(__dirname, '../perf/routes.json'), 'utf-8'),
).routes;

const sorted = (xs: string[]) => [...xs].sort();

describe('perf/routes.json — parity with lib/constants/navigation.ts', () => {
  it('lists exactly the routes of the shell: the primary tabs and every secondary href', () => {
    const shellHrefs = [...primaryNav.map((item) => item.href), ...secondaryHrefs];

    expect(sorted(perfRoutes.map((route) => route.href))).toEqual(sorted(shellHrefs));
  });

  it('lists each route once', () => {
    const hrefs = perfRoutes.map((route) => route.href);

    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('names each nav route as the shell does, so the benchmark table reads like the sidebar', () => {
    const navItems = [...primaryNav, ...analysisNav, ...planningNav, assistantNavItem];

    for (const item of navItems) {
      expect(perfRoutes.find((route) => route.href === item.href)?.name).toBe(item.name);
    }
  });

  it('says why whenever a route is left out of the timing run', () => {
    for (const route of perfRoutes.filter((r) => r.bench === false)) {
      expect(route.why?.trim(), route.href).toBeTruthy();
    }
  });
});
