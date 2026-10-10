/**
 * The first-screen budget of the small-screen composition: per surface × viewport, how long the
 * page is and what the first screen holds, against `doc/mobile/budget.json` — a budget that can
 * only get BETTER (doc/guide/prima-schermata.md).
 *
 * Pure on purpose, like `perfBudget.ts`: `scripts/mobileCensus.mjs` measures in a browser,
 * `scripts/mobileBudget.mts` reads the files and git, this module decides. Every metric has a
 * direction and zero tolerance (the fixture `census@example.com` is deterministic, so a drift of
 * one is a finding, never noise — doc/mobile/README.md § 9, decision 23):
 *   - a CEILING (`screens`, `figuresAboveFold`, `figuresOutsideVerdict`) may not be exceeded;
 *   - a FLOOR (`tilesAboveFold`, `tilesFullyAboveFold`) may not be missed;
 *   - `firstClosedRowAbovePill` is a three-state ratchet: `null` (no closed row on the page yet)
 *     accepts only `null`, `true` stays `true`, and `false` is an exception registered only with
 *     a `raisedBy` (decision 19);
 *   - `overflowX` is always `false`, whatever the budget says.
 * And the ratchet's second half, as in `perfBudget`: an entry WORSE than the one committed in HEAD
 * needs a `raisedBy` of its own — a reason already spent on an earlier widening does not cover a
 * new one (decision 22: «MOB-02: pill a 44 px»).
 */

export const MOBILE_VIEWPORTS = ['390', '768', '1024'] as const;
export type MobileViewport = (typeof MOBILE_VIEWPORTS)[number];

/** The account the budget is measured on (decision 10): never the mirror. */
export const CENSUS_ACCOUNT = 'census@example.com';

export const CEILING_METRICS = ['screens', 'figuresAboveFold', 'figuresOutsideVerdict'] as const;
export const FLOOR_METRICS = ['tilesAboveFold', 'tilesFullyAboveFold'] as const;
export type CeilingMetric = (typeof CEILING_METRICS)[number];
export type FloorMetric = (typeof FLOOR_METRICS)[number];
export type NumericMetric = CeilingMetric | FloorMetric;
export type MobileMetric = NumericMetric | 'firstClosedRowAbovePill' | 'overflowX';

/** What the census measures on one surface at one viewport (MOB-01 § 4, the table). */
export interface MobileMetrics {
  screens: number;
  tilesAboveFold: number;
  tilesFullyAboveFold: number;
  figuresAboveFold: number;
  figuresOutsideVerdict: number;
  /** `null` while the page has no closed row (MOB-02 § 4.2 creates them). */
  firstClosedRowAbovePill: boolean | null;
  overflowX: boolean;
}

/** One budget entry: the metrics, plus why it was widened when it was. */
export interface MobileBudgetEntry extends MobileMetrics {
  /** «MOB-NN: perché». Required on a widening, and on a `firstClosedRowAbovePill: false`. */
  raisedBy?: string;
}

export interface MobileSurface {
  /** The route, with `?tab=` when the tab is in the URL (Cashflow). */
  path: string;
  /** The tab's accessible name in `PageTabBar`, for a tabbed surface. */
  tab?: string;
  /** Whether The First-Screen Rule applies: false only where there is no verdict (Impostazioni). */
  target: boolean;
}

/** The shape of `doc/mobile/budget.json`. Aggregate numbers only: never a verdict's or an eyebrow's text. */
export interface MobileBudget {
  measuredAt: string;
  account: string;
  /** Slack per numeric metric, in its own unit; empty = zero tolerance (decision 23). */
  tolerance: Partial<Record<NumericMetric, number>>;
  /** Metrics printed but not enforced at a viewport, until MOB-08 empties the list. */
  informational: Partial<Record<MobileViewport, MobileMetric[]>>;
  surfaces: Record<string, MobileSurface>;
  budget: Record<string, Partial<Record<MobileViewport, MobileBudgetEntry>>>;
}

/**
 * One measured surface × viewport of `.mobile-census/last-run.json`. `missing`: the tab does not
 * exist or did not become the selected one; `unsettled`: the page never settled in 60 s. Both are
 * red, and neither carries metrics anyone could trust.
 */
export interface CensusRow {
  surface: string;
  viewport: MobileViewport;
  status: 'ok' | 'missing' | 'unsettled';
  metrics: MobileMetrics | null;
}

export interface CensusRun {
  email: string;
  at: string;
  results: CensusRow[];
}

export type MobileViolation =
  | { kind: 'over-ceiling'; surface: string; viewport: MobileViewport; metric: CeilingMetric; measured: number; limit: number }
  | { kind: 'under-floor'; surface: string; viewport: MobileViewport; metric: FloorMetric; measured: number; limit: number }
  | { kind: 'overflow-x'; surface: string; viewport: MobileViewport; metric: 'overflowX' }
  | { kind: 'closed-row-unregistered'; surface: string; viewport: MobileViewport; metric: 'firstClosedRowAbovePill'; measured: boolean }
  | { kind: 'closed-row-regressed'; surface: string; viewport: MobileViewport; metric: 'firstClosedRowAbovePill'; measured: boolean | null; limit: boolean }
  | { kind: 'closed-row-false-without-reason'; surface: string; viewport: MobileViewport; metric: 'firstClosedRowAbovePill' }
  | { kind: 'missing' | 'unsettled' | 'not-measured'; surface: string; viewport: MobileViewport; metric: null }
  | { kind: 'no-budget'; surface: string; viewport: MobileViewport; metric: null }
  | { kind: 'widened-without-reason'; surface: string; viewport: MobileViewport; metric: MobileMetric }
  | { kind: 'reason-reused'; surface: string; viewport: MobileViewport; metric: MobileMetric; raisedBy: string };

/** The First-Screen Rule's column: met, not yet, or not applicable (no verdict). */
export interface FirstScreenTarget {
  surface: string;
  viewport: MobileViewport;
  status: 'met' | 'not-yet' | 'none';
  detail: string;
}

export interface MobileBudgetVerdict {
  ok: boolean;
  violations: MobileViolation[];
  /** Breaches of a metric listed in `informational` at that viewport: printed, never fatal. */
  informational: MobileViolation[];
  targets: FirstScreenTarget[];
}

/** The First-Screen Rule at 390 (decision 16): at most five figures outside the verdict, LA tessera included. */
export const FIRST_SCREEN_MAX_FIGURES = 5;

/**
 * How good a closed-row value is, for the ratchet: `true` (the first closed row ends above the
 * pill) beats `null` (no closed row yet), which beats `false` (a closed row below the pill).
 */
const CLOSED_ROW_RANK = (value: boolean | null): number => (value === true ? 2 : value === null ? 1 : 0);

/** Every measured metric against its budget entry, in the metric's direction. */
function compareEntry(
  surface: string,
  viewport: MobileViewport,
  measured: MobileMetrics,
  entry: MobileBudgetEntry,
  tolerance: MobileBudget['tolerance'],
): MobileViolation[] {
  const violations: MobileViolation[] = [];
  for (const metric of CEILING_METRICS) {
    const limit = entry[metric] + (tolerance[metric] ?? 0);
    if (measured[metric] > limit) violations.push({ kind: 'over-ceiling', surface, viewport, metric, measured: measured[metric], limit: entry[metric] });
  }
  for (const metric of FLOOR_METRICS) {
    const limit = entry[metric] - (tolerance[metric] ?? 0);
    if (measured[metric] < limit) violations.push({ kind: 'under-floor', surface, viewport, metric, measured: measured[metric], limit: entry[metric] });
  }
  if (measured.overflowX) violations.push({ kind: 'overflow-x', surface, viewport, metric: 'overflowX' });

  const row = measured.firstClosedRowAbovePill;
  const metric = 'firstClosedRowAbovePill';
  if (entry.firstClosedRowAbovePill === null) {
    // A closed row the budget does not know yet is red until `--tighten` registers it (`true`) or
    // the owner registers the exception by hand (`false` + `raisedBy`).
    if (row !== null) violations.push({ kind: 'closed-row-unregistered', surface, viewport, metric, measured: row });
  } else if (CLOSED_ROW_RANK(row) < CLOSED_ROW_RANK(entry.firstClosedRowAbovePill) || row === null) {
    // `null` after a registered value means the closed rows are gone: the contract was lost.
    violations.push({ kind: 'closed-row-regressed', surface, viewport, metric, measured: row, limit: entry.firstClosedRowAbovePill });
  }
  return violations;
}

/** The metrics of `entry` that are WORSE than in `previous`, in each metric's direction. */
function widenedMetrics(entry: MobileBudgetEntry, previous: MobileBudgetEntry): MobileMetric[] {
  const widened: MobileMetric[] = [];
  for (const metric of CEILING_METRICS) if (entry[metric] > previous[metric]) widened.push(metric);
  for (const metric of FLOOR_METRICS) if (entry[metric] < previous[metric]) widened.push(metric);
  if (CLOSED_ROW_RANK(entry.firstClosedRowAbovePill) < CLOSED_ROW_RANK(previous.firstClosedRowAbovePill)) {
    widened.push('firstClosedRowAbovePill');
  }
  if (entry.overflowX && !previous.overflowX) widened.push('overflowX');
  return widened;
}

/**
 * The budget's own rules, independent of any measure: a widening against HEAD needs a NEW
 * `raisedBy`, and a `firstClosedRowAbovePill: false` needs one at all.
 */
function checkEntryReasons(
  surface: string,
  viewport: MobileViewport,
  entry: MobileBudgetEntry,
  previous: MobileBudgetEntry | undefined,
): MobileViolation[] {
  const violations: MobileViolation[] = [];
  const reason = entry.raisedBy?.trim();
  if (entry.firstClosedRowAbovePill === false && !reason) {
    violations.push({ kind: 'closed-row-false-without-reason', surface, viewport, metric: 'firstClosedRowAbovePill' });
  }
  if (!previous) return violations;
  for (const metric of widenedMetrics(entry, previous)) {
    if (!reason) violations.push({ kind: 'widened-without-reason', surface, viewport, metric });
    else if (reason === previous.raisedBy?.trim()) violations.push({ kind: 'reason-reused', surface, viewport, metric, raisedBy: reason });
  }
  return violations;
}

/** The First-Screen Rule for one measured row. At 768/1024 the objective is MOB-08's measure. */
function firstScreenTarget(surface: string, viewport: MobileViewport, spec: MobileSurface | undefined, metrics: MobileMetrics | null): FirstScreenTarget {
  if (!spec?.target) return { surface, viewport, status: 'none', detail: 'nessun verdetto' };
  if (viewport !== '390') return { surface, viewport, status: 'not-yet', detail: 'obiettivo = il misurato di MOB-08' };
  if (!metrics) return { surface, viewport, status: 'not-yet', detail: 'non misurata' };
  const figuresOk = metrics.figuresOutsideVerdict <= FIRST_SCREEN_MAX_FIGURES;
  const rowOk = metrics.firstClosedRowAbovePill === true;
  if (figuresOk && rowOk) return { surface, viewport, status: 'met', detail: `${metrics.figuresOutsideVerdict} cifre, riga chiusa sopra la pill` };
  const missing = [
    figuresOk ? null : `${metrics.figuresOutsideVerdict} cifre fuori dal verdetto (≤ ${FIRST_SCREEN_MAX_FIGURES})`,
    rowOk ? null : metrics.firstClosedRowAbovePill === null ? 'nessuna riga chiusa' : 'riga chiusa sotto la pill',
  ].filter(Boolean);
  return { surface, viewport, status: 'not-yet', detail: missing.join(' · ') };
}

const isInformational = (budget: MobileBudget, violation: MobileViolation): boolean =>
  violation.metric !== null && (budget.informational[violation.viewport] ?? []).includes(violation.metric);

/**
 * Compare a census run with the budget and with the budget committed in HEAD (`previousBudget`,
 * null when HEAD has none — the commit that creates it).
 *
 * Every budget entry must have been measured (a subset run is never green) and every measured row
 * must have an entry (a new surface declares its budget in the commit that adds it). A breach of a
 * metric listed as `informational` at that viewport goes to `informational`, not to `violations`.
 */
export function compareCensusToBudget(
  measured: readonly CensusRow[],
  budget: MobileBudget,
  previousBudget: MobileBudget | null = null,
): MobileBudgetVerdict {
  const all: MobileViolation[] = [];
  const targets: FirstScreenTarget[] = [];
  const byKey = new Map(measured.map((row) => [`${row.surface}@${row.viewport}`, row]));

  for (const [surface, entries] of Object.entries(budget.budget)) {
    for (const viewport of MOBILE_VIEWPORTS) {
      const entry = entries[viewport];
      if (!entry) continue;
      all.push(...checkEntryReasons(surface, viewport, entry, previousBudget?.budget[surface]?.[viewport]));
      const row = byKey.get(`${surface}@${viewport}`);
      if (!row) {
        all.push({ kind: 'not-measured', surface, viewport, metric: null });
        continue;
      }
      targets.push(firstScreenTarget(surface, viewport, budget.surfaces[surface], row.metrics));
      if (row.status !== 'ok' || !row.metrics) {
        all.push({ kind: row.status === 'ok' ? 'unsettled' : row.status, surface, viewport, metric: null });
        continue;
      }
      all.push(...compareEntry(surface, viewport, row.metrics, entry, budget.tolerance));
    }
  }
  for (const row of measured) {
    if (budget.budget[row.surface]?.[row.viewport]) continue;
    all.push({ kind: 'no-budget', surface: row.surface, viewport: row.viewport, metric: null });
  }

  const violations = all.filter((violation) => !isInformational(budget, violation));
  const informational = all.filter((violation) => isInformational(budget, violation));
  return { ok: violations.length === 0, violations, informational, targets };
}

/**
 * Why `mobile:budget -- --tighten` must refuse this run, or null when it may write: the budget
 * is born and moves only on the census fixture, and only from a run where every surface settled.
 */
export function tightenRefusal(run: CensusRun): string | null {
  if (run.email !== CENSUS_ACCOUNT) return `la corsa è di ${run.email}: il budget si misura solo su ${CENSUS_ACCOUNT}`;
  const broken = run.results.filter((row) => row.status !== 'ok' || !row.metrics);
  if (broken.length > 0) return `superfici non misurate: ${broken.map((row) => `${row.surface}@${row.viewport} (${row.status})`).join(', ')}`;
  return null;
}

/** The better of two closed-row values; `false` is never written by a measure (decision 19). */
function tightenClosedRow(measured: boolean | null, current: boolean | null | undefined): boolean | null {
  if (current === undefined) return measured === true ? true : null;
  return measured === true ? true : current;
}

/** One entry after a measure: every metric moves only in its good direction, to the exact measure. */
function tightenEntry(measured: MobileMetrics, current: MobileBudgetEntry | undefined): MobileBudgetEntry {
  const pick = <M extends NumericMetric>(metric: M, better: (a: number, b: number) => number) =>
    current ? better(measured[metric], current[metric]) : measured[metric];
  return {
    screens: pick('screens', Math.min),
    tilesAboveFold: pick('tilesAboveFold', Math.max),
    tilesFullyAboveFold: pick('tilesFullyAboveFold', Math.max),
    figuresAboveFold: pick('figuresAboveFold', Math.min),
    figuresOutsideVerdict: pick('figuresOutsideVerdict', Math.min),
    firstClosedRowAbovePill: tightenClosedRow(measured.firstClosedRowAbovePill, current?.firstClosedRowAbovePill),
    // A horizontal overflow is never a budget: it stays false even if a run measured one.
    overflowX: false,
    // The reason stays with the entry: it may excuse a metric the measure did not tighten.
    ...(current?.raisedBy ? { raisedBy: current.raisedBy } : {}),
  };
}

/**
 * The budget after a census run, for `mobile:budget -- --tighten`: each value moves only in the
 * good direction and to the EXACT measure (zero tolerance), never the other way — a widening is
 * written by hand with its `raisedBy`, so it can never happen by accident. A surface × viewport
 * with no entry yet takes the measure. Rows that are not `ok` are skipped (`tightenRefusal`
 * stops the script before it gets here). Same argument order as `perfBudget.tightenBudget`.
 */
export function tightenBudget(run: CensusRun, budget: MobileBudget): MobileBudget {
  const next: MobileBudget['budget'] = {};
  for (const [surface, entries] of Object.entries(budget.budget)) next[surface] = { ...entries };
  let changed = false;
  for (const row of run.results) {
    if (row.status !== 'ok' || !row.metrics) continue;
    const current = budget.budget[row.surface]?.[row.viewport];
    const tightened = tightenEntry(row.metrics, current);
    if (JSON.stringify(tightened) !== JSON.stringify(current)) changed = true;
    next[row.surface] = { ...next[row.surface], [row.viewport]: tightened };
  }
  return { ...budget, measuredAt: changed ? run.at.slice(0, 10) : budget.measuredAt, budget: next };
}

/** Human sentence for one violation, for the script's output. */
export function describeMobileViolation(v: MobileViolation): string {
  const where = `${v.surface} @ ${v.viewport}`;
  switch (v.kind) {
    case 'over-ceiling':
      return `${where}: ${v.metric} ${v.measured} oltre il tetto ${v.limit}`;
    case 'under-floor':
      return `${where}: ${v.metric} ${v.measured} sotto il pavimento ${v.limit}`;
    case 'overflow-x':
      return `${where}: main scorre in orizzontale`;
    case 'closed-row-unregistered':
      return `${where}: riga chiusa non registrata (misurato ${v.measured}, budget null) — \`--tighten\` registra true, false solo a mano con raisedBy`;
    case 'closed-row-regressed':
      return `${where}: firstClosedRowAbovePill ${v.measured} peggiore del budget ${v.limit}`;
    case 'closed-row-false-without-reason':
      return `${where}: firstClosedRowAbovePill false senza «raisedBy»`;
    case 'missing':
      return `${where}: superficie mancante (la tab non c'è o non è quella selezionata)`;
    case 'unsettled':
      return `${where}: la pagina non si è assestata entro 60 s`;
    case 'not-measured':
      return `${where}: ha un budget ma la corsa non l'ha misurata`;
    case 'no-budget':
      return `${where}: misurata ma senza budget in doc/mobile/budget.json`;
    case 'widened-without-reason':
      return `${where}: ${v.metric} allargato rispetto a HEAD senza «raisedBy»`;
    case 'reason-reused':
      return `${where}: ${v.metric} allargato con il «raisedBy» dell'allargamento precedente («${v.raisedBy}»)`;
  }
}
