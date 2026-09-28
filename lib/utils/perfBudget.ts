/**
 * The size budget of the build: how much JavaScript each route ships before it can paint, against
 * a ceiling that only a MEASURE may move (perf/README.md § Il ratchet e il tetto alzato).
 *
 * Pure on purpose: `scripts/perfBudget.mts` reads the build and git, this module decides. The
 * ratchet has two halves, and both live here so a test can watch each go red:
 *   1. a route over its ceiling fails;
 *   2. a ceiling HIGHER than the committed one fails unless it carries a `raisedBy` of its own —
 *      a new feature may grow a route, but only by saying so in the same commit, and a reason
 *      already spent on an earlier raise does not cover a new one.
 * A ceiling that goes DOWN needs nothing: that is the direction the ratchet exists for.
 */

/** One route's ceiling in `perf/budget.json`. */
export interface RouteCeiling {
  /** Initial JS of the route, gzip, in KB (1 KB = 1024 bytes). */
  initialJsGzKB: number;
  /** Why the ceiling was raised: «#NNN: reason». Required only on a raise (see the header). */
  raisedBy?: string;
}

/** The shape of `perf/budget.json`. */
export interface PerfBudget {
  /** Keyed by the route's path as the browser sees it (`/dashboard/analisi`). */
  routes: Record<string, RouteCeiling>;
  /** The chunks EVERY dashboard route loads (the shell: React, Firebase, Framer…), gzip KB. */
  sharedGzKB: number;
  sharedRaisedBy?: string;
}

/** What the script measured on disk, in the same units as the budget. */
export interface MeasuredBuild {
  routes: Record<string, number>;
  sharedGzKB: number;
}

/** The key under which the shared chunks appear among the rows and violations. */
export const SHARED_KEY = '(condivisi)';

export type BudgetViolation =
  | { kind: 'over-ceiling'; key: string; measuredKB: number; ceilingKB: number }
  | { kind: 'raised-without-reason'; key: string; ceilingKB: number; previousCeilingKB: number }
  | { kind: 'reason-reused'; key: string; ceilingKB: number; previousCeilingKB: number; raisedBy: string }
  | { kind: 'no-ceiling'; key: string; measuredKB: number }
  | { kind: 'not-in-build'; key: string; ceilingKB: number };

export interface BudgetRow {
  key: string;
  measuredKB: number | null;
  ceilingKB: number | null;
  ok: boolean;
}

export interface BudgetVerdict {
  ok: boolean;
  rows: BudgetRow[];
  violations: BudgetViolation[];
}

/** The headroom a fresh ceiling gets over its measure (§ 2: «+2%, arrotondato per eccesso»). */
export const CEILING_HEADROOM = 1.02;

/** A ceiling from a measure: +2%, rounded UP to the KB (535 → 546). */
export function ceilingFromMeasure(measuredKB: number): number {
  // Round to the thousandth first: 1.02 is not exact in binary, and a product like 51.000000001
  // would otherwise ceil to one KB more than the rule says.
  return Math.ceil(Math.round(measuredKB * CEILING_HEADROOM * 1000) / 1000);
}

interface CeilingEntry {
  key: string;
  ceiling: RouteCeiling;
}

function entriesOf(budget: PerfBudget): CeilingEntry[] {
  return [
    { key: SHARED_KEY, ceiling: { initialJsGzKB: budget.sharedGzKB, raisedBy: budget.sharedRaisedBy } },
    ...Object.entries(budget.routes).map(([key, ceiling]) => ({ key, ceiling })),
  ];
}

function ceilingOf(budget: PerfBudget | null, key: string): RouteCeiling | null {
  if (!budget) return null;
  if (key === SHARED_KEY) return { initialJsGzKB: budget.sharedGzKB, raisedBy: budget.sharedRaisedBy };
  return budget.routes[key] ?? null;
}

function measureOf(measured: MeasuredBuild, key: string): number | null {
  if (key === SHARED_KEY) return measured.sharedGzKB;
  return measured.routes[key] ?? null;
}

/**
 * The second half of the ratchet: a ceiling above the committed one needs a NEW reason.
 * `previous` null means the budget is being born (no file in HEAD) — nothing to climb from.
 */
function checkRaise(key: string, ceiling: RouteCeiling, previous: RouteCeiling | null): BudgetViolation | null {
  if (!previous || ceiling.initialJsGzKB <= previous.initialJsGzKB) return null;
  const reason = ceiling.raisedBy?.trim();
  const base = { key, ceilingKB: ceiling.initialJsGzKB, previousCeilingKB: previous.initialJsGzKB };
  if (!reason) return { kind: 'raised-without-reason', ...base };
  if (reason === previous.raisedBy?.trim()) return { kind: 'reason-reused', ...base, raisedBy: reason };
  return null;
}

/**
 * Compare a measured build with the budget and with the budget committed in HEAD.
 *
 * Every route of the budget must exist in the build (a renamed page would otherwise leave its
 * ceiling guarding nothing) and every measured route must have a ceiling (a new page declares
 * its size in the commit that adds it). `ok` is false on the first of any violation.
 */
export function compareRoutesToBudget(
  measured: MeasuredBuild,
  budget: PerfBudget,
  previousBudget: PerfBudget | null,
): BudgetVerdict {
  const violations: BudgetViolation[] = [];
  const rows: BudgetRow[] = [];

  for (const { key, ceiling } of entriesOf(budget)) {
    const measuredKB = measureOf(measured, key);
    const before = violations.length;
    if (measuredKB === null) {
      violations.push({ kind: 'not-in-build', key, ceilingKB: ceiling.initialJsGzKB });
    } else if (measuredKB > ceiling.initialJsGzKB) {
      violations.push({ kind: 'over-ceiling', key, measuredKB, ceilingKB: ceiling.initialJsGzKB });
    }
    const raise = checkRaise(key, ceiling, ceilingOf(previousBudget, key));
    if (raise) violations.push(raise);
    rows.push({ key, measuredKB, ceilingKB: ceiling.initialJsGzKB, ok: violations.length === before });
  }

  for (const [key, measuredKB] of Object.entries(measured.routes)) {
    if (key in budget.routes) continue;
    violations.push({ kind: 'no-ceiling', key, measuredKB });
    rows.push({ key, measuredKB, ceilingKB: null, ok: false });
  }

  return { ok: violations.length === 0, rows, violations };
}

/**
 * The budget after a measure, for `perf:budget -- --write`: each ceiling moves DOWN to
 * `ceilingFromMeasure` when the build got smaller, never up — a raise is written by hand, with its
 * `raisedBy`, so it can never happen by accident. A lowered ceiling drops its `raisedBy` (the
 * growth it excused is paid back). A route with no ceiling yet gets one from the measure.
 */
export function tightenBudget(measured: MeasuredBuild, budget: PerfBudget | null): PerfBudget {
  const lower = (measuredKB: number, current: RouteCeiling | undefined): RouteCeiling => {
    const fresh = ceilingFromMeasure(measuredKB);
    if (!current || fresh < current.initialJsGzKB) return { initialJsGzKB: fresh };
    return current;
  };
  const routes: Record<string, RouteCeiling> = {};
  for (const key of Object.keys(measured.routes).sort()) {
    routes[key] = lower(measured.routes[key], budget?.routes[key]);
  }
  const shared = lower(
    measured.sharedGzKB,
    budget ? { initialJsGzKB: budget.sharedGzKB, raisedBy: budget.sharedRaisedBy } : undefined,
  );
  return {
    routes,
    sharedGzKB: shared.initialJsGzKB,
    ...(shared.raisedBy ? { sharedRaisedBy: shared.raisedBy } : {}),
  };
}

/** Human sentence for one violation, for the script's output. */
export function describeViolation(v: BudgetViolation): string {
  switch (v.kind) {
    case 'over-ceiling':
      return `${v.key}: ${v.measuredKB} KB gz oltre il tetto di ${v.ceilingKB} KB`;
    case 'raised-without-reason':
      return `${v.key}: tetto alzato da ${v.previousCeilingKB} a ${v.ceilingKB} KB senza «raisedBy»`;
    case 'reason-reused':
      return `${v.key}: tetto alzato da ${v.previousCeilingKB} a ${v.ceilingKB} KB con il «raisedBy» del rialzo precedente («${v.raisedBy}»)`;
    case 'no-ceiling':
      return `${v.key}: ${v.measuredKB} KB gz e nessun tetto in perf/budget.json`;
    case 'not-in-build':
      return `${v.key}: ha un tetto (${v.ceilingKB} KB) ma la build non ha la sua pagina`;
  }
}

/**
 * The initial chunks of a prerendered page: every `<script src="/_next/static/chunks/…">`, in
 * document order, once each. Chunks the page loads LATER (a `next/dynamic`, a lazy icon) are not
 * here by construction — which is what «initial» means.
 */
export function extractInitialChunks(html: string): string[] {
  const chunks = new Set<string>();
  for (const match of html.matchAll(/<script[^>]*\ssrc="\/_next\/(static\/chunks\/[^"?]+\.js)[^"]*"/g)) {
    chunks.add(match[1]);
  }
  return [...chunks];
}

/**
 * Characters of visible text in a prerendered page's BODY (scripts, styles and tags removed,
 * whitespace collapsed). Every dashboard route prerenders ProtectedRoute's spinner only, so this is
 * 0 today (2026-09-28; the «46» of 2026-09-26 counted the `<title>`, which nobody sees as the page);
 * PERF-02 raises it by putting the shell in the HTML.
 */
export function countTextChars(html: string): number {
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  const text = body
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length;
}
