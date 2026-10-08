/**
 * The size budget's two halves (doc/guide/velocita.md § Il ratchet e il tetto alzato): a route over its
 * ceiling is red, and a ceiling that climbs above the committed one is red unless it carries a
 * reason of its own. The script only reads the build and git; every decision is pinned here, so
 * the budget is never a check that has not been seen red.
 */
import { describe, it, expect } from 'vitest';
import {
  compareRoutesToBudget,
  ceilingFromMeasure,
  countLibraryCopies,
  countTextChars,
  extractInitialChunks,
  tightenBudget,
  LIBRARY_SIGNATURES,
  SHARED_KEY,
  type MeasuredBuild,
  type PerfBudget,
} from '@/lib/utils/perfBudget';

const budget: PerfBudget = {
  sharedGzKB: 470,
  routes: {
    '/dashboard': { initialJsGzKB: 546 },
    '/dashboard/analisi': { initialJsGzKB: 750 },
  },
};

const measuredWithin: MeasuredBuild = {
  sharedGzKB: 460,
  routes: { '/dashboard': 535, '/dashboard/analisi': 734 },
};

describe('compareRoutesToBudget — the ceiling', () => {
  it('passes when every route and the shared chunks stay under their ceilings', () => {
    const verdict = compareRoutesToBudget(measuredWithin, budget, budget);

    expect(verdict.ok).toBe(true);
    expect(verdict.violations).toEqual([]);
    expect(verdict.rows.map((r) => r.key)).toEqual([SHARED_KEY, '/dashboard', '/dashboard/analisi']);
  });

  it('fails and names the route when one route grows past its ceiling', () => {
    const measured = { ...measuredWithin, routes: { ...measuredWithin.routes, '/dashboard/analisi': 760.4 } };

    const verdict = compareRoutesToBudget(measured, budget, budget);

    expect(verdict.ok).toBe(false);
    expect(verdict.violations).toEqual([
      { kind: 'over-ceiling', key: '/dashboard/analisi', measuredKB: 760.4, ceilingKB: 750 },
    ]);
    expect(verdict.rows.find((r) => r.key === '/dashboard/analisi')?.ok).toBe(false);
    expect(verdict.rows.find((r) => r.key === '/dashboard')?.ok).toBe(true);
  });

  it('treats a measure exactly AT the ceiling as within it', () => {
    const measured = { ...measuredWithin, routes: { ...measuredWithin.routes, '/dashboard': 546 } };

    expect(compareRoutesToBudget(measured, budget, budget).ok).toBe(true);
  });

  it('fails when the chunks every page shares grow past their own ceiling', () => {
    const verdict = compareRoutesToBudget({ ...measuredWithin, sharedGzKB: 471 }, budget, budget);

    expect(verdict.violations).toEqual([{ kind: 'over-ceiling', key: SHARED_KEY, measuredKB: 471, ceilingKB: 470 }]);
  });

  it('fails when a new page has no ceiling, so a route is never born unbudgeted', () => {
    const measured = { ...measuredWithin, routes: { ...measuredWithin.routes, '/dashboard/nuova': 500 } };

    const verdict = compareRoutesToBudget(measured, budget, budget);

    expect(verdict.violations).toEqual([{ kind: 'no-ceiling', key: '/dashboard/nuova', measuredKB: 500 }]);
  });

  it('fails when a ceiling guards a page the build no longer has', () => {
    const measured = { ...measuredWithin, routes: { '/dashboard': 535 } };

    const verdict = compareRoutesToBudget(measured, budget, budget);

    expect(verdict.violations).toEqual([{ kind: 'not-in-build', key: '/dashboard/analisi', ceilingKB: 750 }]);
  });
});

describe('compareRoutesToBudget — the raised ceiling (§ 9)', () => {
  const raised = (raisedBy?: string): PerfBudget => ({
    ...budget,
    routes: { ...budget.routes, '/dashboard/analisi': { initialJsGzKB: 780, ...(raisedBy ? { raisedBy } : {}) } },
  });

  it('fails when a ceiling climbs above the committed one without a raisedBy', () => {
    const verdict = compareRoutesToBudget(measuredWithin, raised(), budget);

    expect(verdict.ok).toBe(false);
    expect(verdict.violations).toEqual([
      { kind: 'raised-without-reason', key: '/dashboard/analisi', ceilingKB: 780, previousCeilingKB: 750 },
    ]);
  });

  it('treats a blank raisedBy as no reason at all', () => {
    expect(compareRoutesToBudget(measuredWithin, raised('   '), budget).violations[0]?.kind).toBe(
      'raised-without-reason',
    );
  });

  it('passes when the raise carries its own reason', () => {
    expect(compareRoutesToBudget(measuredWithin, raised('#410: il Flusso per ruolo'), budget).ok).toBe(true);
  });

  it('fails when the raise reuses the reason of the previous raise', () => {
    const committed = raised('#410: il Flusso per ruolo');
    const climbedAgain: PerfBudget = {
      ...committed,
      routes: {
        ...committed.routes,
        '/dashboard/analisi': { initialJsGzKB: 800, raisedBy: '#410: il Flusso per ruolo' },
      },
    };

    const verdict = compareRoutesToBudget(measuredWithin, climbedAgain, committed);

    expect(verdict.violations).toEqual([
      {
        kind: 'reason-reused',
        key: '/dashboard/analisi',
        ceilingKB: 800,
        previousCeilingKB: 780,
        raisedBy: '#410: il Flusso per ruolo',
      },
    ]);
  });

  it('holds the shared ceiling to the same rule', () => {
    const verdict = compareRoutesToBudget(measuredWithin, { ...budget, sharedGzKB: 480 }, budget);

    expect(verdict.violations).toEqual([
      { kind: 'raised-without-reason', key: SHARED_KEY, ceilingKB: 480, previousCeilingKB: 470 },
    ]);
  });

  it('asks nothing of a ceiling that goes DOWN', () => {
    const lowered: PerfBudget = { ...budget, routes: { ...budget.routes, '/dashboard/analisi': { initialJsGzKB: 740 } } };

    expect(compareRoutesToBudget(measuredWithin, lowered, budget).ok).toBe(true);
  });

  it('runs no climb check when HEAD has no budget yet (the commit that creates it)', () => {
    expect(compareRoutesToBudget(measuredWithin, raised(), null).ok).toBe(true);
  });

  it('runs no climb check for a route HEAD did not budget', () => {
    const committed: PerfBudget = { ...budget, routes: { '/dashboard': budget.routes['/dashboard'] } };

    expect(compareRoutesToBudget(measuredWithin, raised(), committed).ok).toBe(true);
  });
});

describe('ceilingFromMeasure and tightenBudget — the ceiling moves only with a measure', () => {
  it('gives a fresh ceiling +2% over the measure, rounded up to the KB', () => {
    expect(ceilingFromMeasure(535)).toBe(546);
    expect(ceilingFromMeasure(100)).toBe(102);
    expect(ceilingFromMeasure(0.4)).toBe(1);
  });

  it('writes a budget from scratch when there is none', () => {
    expect(tightenBudget(measuredWithin, null)).toEqual({
      sharedGzKB: 470,
      routes: { '/dashboard': { initialJsGzKB: 546 }, '/dashboard/analisi': { initialJsGzKB: 749 } },
    });
  });

  it('lowers a ceiling when the build shrank and drops the reason of the raise it paid back', () => {
    const current: PerfBudget = {
      sharedGzKB: 470,
      routes: {
        '/dashboard': { initialJsGzKB: 546 },
        '/dashboard/analisi': { initialJsGzKB: 780, raisedBy: '#410: il Flusso per ruolo' },
      },
    };

    const next = tightenBudget({ sharedGzKB: 400, routes: { '/dashboard': 535, '/dashboard/analisi': 600 } }, current);

    expect(next).toEqual({
      sharedGzKB: 408,
      routes: { '/dashboard': { initialJsGzKB: 546 }, '/dashboard/analisi': { initialJsGzKB: 612 } },
    });
  });

  it('never raises a ceiling, even when the build grew past it', () => {
    const next = tightenBudget({ ...measuredWithin, routes: { ...measuredWithin.routes, '/dashboard': 900 } }, budget);

    expect(next.routes['/dashboard']).toEqual({ initialJsGzKB: 546 });
  });
});

describe('libraryCopies — one copy of a library for the whole build', () => {
  const guarded: PerfBudget = { ...budget, libraryCopies: { recharts: 1 } };
  const withCopies = (copies: number): MeasuredBuild => ({ ...measuredWithin, libraryCopies: { recharts: copies } });

  it('counts the chunks that carry the library, not the chunks that only import it', () => {
    const recharts = `e.s(["CartesianGrid",0,x]);className:"${LIBRARY_SIGNATURES.recharts}"`;
    const chartPage = 'n.CartesianGrid,n.LineChart'; // a chart's own chunk: export names, no library code

    expect(countLibraryCopies([recharts, chartPage, 'other'], LIBRARY_SIGNATURES)).toEqual({ recharts: 1 });
    expect(countLibraryCopies([recharts, recharts, recharts, recharts], LIBRARY_SIGNATURES)).toEqual({ recharts: 4 });
  });

  it('passes with the library in as many chunks as it allows', () => {
    expect(compareRoutesToBudget(withCopies(1), guarded, guarded).ok).toBe(true);
  });

  it('fails and names the library when a second copy appears', () => {
    const verdict = compareRoutesToBudget(withCopies(4), guarded, guarded);

    expect(verdict.ok).toBe(false);
    expect(verdict.violations).toEqual([{ kind: 'library-copies', key: 'recharts', copies: 4, maxCopies: 1 }]);
  });

  it('fails when the library is in no chunk at all: a signature that matches nothing guards nothing', () => {
    expect(compareRoutesToBudget(withCopies(0), guarded, guarded).violations).toEqual([{ kind: 'library-not-found', key: 'recharts' }]);
    expect(compareRoutesToBudget(measuredWithin, guarded, guarded).violations).toEqual([{ kind: 'library-not-found', key: 'recharts' }]);
  });

  it('checks nothing when the budget guards no library', () => {
    expect(compareRoutesToBudget(withCopies(4), budget, budget).ok).toBe(true);
  });

  it('is carried over by --write untouched: it is a rule, not a measure', () => {
    expect(tightenBudget(withCopies(4), guarded).libraryCopies).toEqual({ recharts: 1 });
  });
});

describe('reading a prerendered page', () => {
  const html = [
    '<!DOCTYPE html><html><head>',
    '<link rel="preload" as="script" href="/_next/static/chunks/preloaded.js"/>',
    '<script src="/_next/static/chunks/a1.js" async=""></script>',
    '<script src="/_next/static/chunks/turbopack-b2.js" async=""></script>',
    '<style>.x{color:red}</style></head>',
    '<body><div class="animate-spin"></div><p>Caricamento</p>',
    '<script src="/_next/static/chunks/a1.js" async=""></script>',
    '<script>self.__next_f.push([1,"static/chunks/lazy.js"])</script>',
    '</body></html>',
  ].join('');

  it('lists every script chunk once, in document order, and nothing the page only mentions', () => {
    expect(extractInitialChunks(html)).toEqual(['static/chunks/a1.js', 'static/chunks/turbopack-b2.js']);
  });

  it('counts the visible text only, without scripts, styles or tags', () => {
    expect(countTextChars(html)).toBe('Caricamento'.length);
  });
});
