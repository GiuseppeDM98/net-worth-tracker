/**
 * Composition-over-time for the Storico "Composizione" chapter.
 *
 * Design
 * ------
 * The chapter answers one question — *how is the patrimonio split, and how is that split
 * drifting?* — over two different cuts of the same euro: by asset class, and by liquidity.
 * Both cuts produce the identical shape (`CompositionSeries`), which is what lets one chart,
 * one legend and one breakdown list serve both without a branch per cut.
 *
 * Two invariants drive everything here, and both exist because the predecessor violated them:
 *
 *  1. **The stack closes.** Every row's shares sum to exactly 100. The old chart divided each
 *     class by `snapshot.totalNetWorth` while plotting six of the eight `AssetClass` members,
 *     so the shares silently fell short for anyone holding `trendFollowing` or `carry` — and
 *     the pension carve-out's zero-clamp can push the plotted sum the OTHER way, above the
 *     total (see `prepareAssetClassHistoryData`). Normalizing over `max(total, Σ plotted)`
 *     absorbs both directions: the residual is never negative, so the stack can never overflow
 *     the [0, 100] axis and can never leave an unexplained gap under it.
 *
 *  2. **A gap is named, not left blank.** Whatever the euro total covers and the bands do not
 *     becomes an explicit "Altro" band rather than empty space. Product principle: a figure the
 *     product cannot attribute is stated, not omitted.
 *
 * Shares are what the chart plots; euro values ride along on the same row so the tooltip can
 * show both units. That pairing is what let the €/% toggle be deleted rather than fixed.
 */

import type { AssetClass } from '@/types/assets';
import type { AssetClassHistoryPoint } from '@/lib/services/chartService';
import { ASSET_CLASS_LABELS, ASSET_CLASS_CHART_INDEX, ASSET_CLASS_SEQUENCE } from './allocationUtils';

/** Which cut of net worth the chart is showing. Owned by the section's segmented pill. */
export type CompositionCut = 'assetClass' | 'liquidity';

/** Band key of the synthetic pension series — an `AssetType`, never an `AssetClass`. */
export const PENSION_BAND_KEY = 'pension';

/** Band key of the unattributed remainder. */
export const RESIDUAL_BAND_KEY = 'residual';

/**
 * A residual below this share is rounding, not a finding, and gets folded into the largest
 * band rather than earning a legend row of its own. Above it, the gap is real and is named.
 */
const RESIDUAL_VISIBILITY_THRESHOLD_PCT = 0.5;

/** Values below this are treated as zero when deciding whether a band exists at all. */
const EPSILON_EUR = 0.005;

export interface CompositionBand {
  key: string;
  label: string;
  /**
   * Slot into `useChartColors()`. `null` means "not a palette hue" — the residual band, which
   * must read as neutral rather than as one more class, and is painted `--muted-foreground`.
   */
  colorIndex: number | null;
}

/**
 * One month. `share_<bandKey>` holds the plotted percentage and `value_<bandKey>` the euro
 * figure; both live flat on the row because Recharts resolves `dataKey` against the row object
 * and hands the WHOLE row to the tooltip, which is how one hover can show both units.
 */
export interface CompositionRow {
  date: string;
  month: number;
  year: number;
  /** The snapshot's own total — the number the tooltip reports, never a re-derived sum. */
  totalNetWorth: number;
  [seriesKey: string]: string | number;
}

/** One row of the breakdown list under the chart: the latest month, ranked. */
export interface CompositionBreakdownEntry {
  key: string;
  label: string;
  colorIndex: number | null;
  valueEur: number;
  sharePct: number;
  /**
   * Change in share against the same month one year earlier, in percentage points.
   * `null` when that month is not in the series — unknowable, never 0.
   */
  deltaPp: number | null;
}

export interface CompositionSeries {
  /** Bands actually present in the data, in stack order (first = bottom of the stack). */
  bands: CompositionBand[];
  rows: CompositionRow[];
  /** Latest month, ranked by value descending. Empty when there is no data. */
  breakdown: CompositionBreakdownEntry[];
  /** Latest month's total, for the section's dominant value. `null` with no data. */
  latestTotalEur: number | null;
  /** Label of the latest month, e.g. `Agosto 2026`. `null` with no data. */
  latestPeriodLabel: string | null;
}

export function shareKey(bandKey: string): string {
  return `share_${bandKey}`;
}

export function valueKey(bandKey: string): string {
  return `value_${bandKey}`;
}

const MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

/**
 * `Marzo 2025` — the tooltip's label. The `MM/YY` axis key is deliberately not reused here:
 * an axis tick is scanned, a tooltip is read.
 */
export function formatPeriodLabel(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1] ?? String(month)} ${year}`;
}

/** One month's euro figures for a single cut, before normalization. */
interface RawPoint {
  date: string;
  month: number;
  year: number;
  totalNetWorth: number;
  /** Euro per band key. Must contain an entry for every band in `bands`. */
  valuesByBand: Record<string, number>;
}

/**
 * Turn raw euro figures into a closed, plottable series.
 *
 * `candidateBands` is the full vocabulary of the cut; a band is kept only when it carries value
 * in at least one month, so a portfolio without crypto never pays for a crypto legend row.
 */
function buildSeries(candidateBands: CompositionBand[], points: RawPoint[]): CompositionSeries {
  const liveBands = candidateBands.filter((band) =>
    points.some((point) => Math.abs(point.valuesByBand[band.key] ?? 0) > EPSILON_EUR)
  );

  // The residual is measured before the band list is frozen: it decides its own visibility.
  const residualByDate = new Map<string, number>();
  let residualIsVisible = false;
  for (const point of points) {
    const plotted = liveBands.reduce((sum, band) => sum + (point.valuesByBand[band.key] ?? 0), 0);
    // Normalizing over the larger of the two absorbs a plotted sum that overshoots the
    // snapshot total (the pension carve-out's zero-clamp), so the residual is never negative.
    const denominator = Math.max(point.totalNetWorth, plotted);
    const residual = denominator - plotted;
    residualByDate.set(point.date, residual);
    if (denominator > 0 && (residual / denominator) * 100 >= RESIDUAL_VISIBILITY_THRESHOLD_PCT) {
      residualIsVisible = true;
    }
  }

  const bands: CompositionBand[] = residualIsVisible
    ? [...liveBands, { key: RESIDUAL_BAND_KEY, label: 'Non attribuito', colorIndex: null }]
    : liveBands;

  const rows: CompositionRow[] = points.map((point) => {
    const residual = residualByDate.get(point.date) ?? 0;
    const values: Record<string, number> = {};
    for (const band of liveBands) {
      values[band.key] = point.valuesByBand[band.key] ?? 0;
    }
    if (residualIsVisible) values[RESIDUAL_BAND_KEY] = residual;

    // The denominator is whatever is actually drawn, which is what makes the stack close at
    // exactly 100 in every row. A sub-threshold remainder is therefore absorbed proportionally
    // across the bands rather than left as a gap under the axis top — at ≤0.5% that is a
    // rounding-scale distortion, whereas a stack that does not reach 100 reads as missing data.
    const denominator = Object.values(values).reduce((sum, value) => sum + value, 0);

    const row: CompositionRow = {
      date: point.date,
      month: point.month,
      year: point.year,
      totalNetWorth: point.totalNetWorth,
    };
    for (const band of bands) {
      const value = values[band.key] ?? 0;
      row[valueKey(band.key)] = value;
      row[shareKey(band.key)] = denominator > 0 ? (value / denominator) * 100 : 0;
    }
    return row;
  });

  const latest = rows[rows.length - 1];
  if (!latest) {
    return { bands, rows, breakdown: [], latestTotalEur: null, latestPeriodLabel: null };
  }

  const yearEarlier = rows.find(
    (row) => row.year === (latest.year as number) - 1 && row.month === latest.month
  );

  const breakdown: CompositionBreakdownEntry[] = bands
    .map((band) => {
      const sharePct = latest[shareKey(band.key)] as number;
      const priorShare = yearEarlier?.[shareKey(band.key)] as number | undefined;
      return {
        key: band.key,
        label: band.label,
        colorIndex: band.colorIndex,
        valueEur: latest[valueKey(band.key)] as number,
        sharePct,
        deltaPp: priorShare === undefined ? null : sharePct - priorShare,
      };
    })
    .sort((a, b) => b.valueEur - a.valueEur);

  return {
    bands,
    rows,
    breakdown,
    latestTotalEur: latest.totalNetWorth as number,
    latestPeriodLabel: formatPeriodLabel(latest.month as number, latest.year as number),
  };
}

/**
 * Asset-class cut.
 *
 * The band vocabulary is derived from `ASSET_CLASS_SEQUENCE`, never from a hand-written list —
 * that is the whole point of the constant. Previdenza is appended last because it is an
 * `AssetType` rather than an `AssetClass`, and it takes chart slot 8: slots 6 and 7 belong to
 * `trendFollowing` and `carry` in `ASSET_CLASS_CHART_INDEX`, and re-using one would put two
 * different things in the same hue on the same chart AND break the class's colour identity
 * against the Allocazione page, which is exactly what that constant exists to prevent.
 */
const PENSION_CHART_INDEX = 8;

export function buildAssetClassComposition(points: AssetClassHistoryPoint[]): CompositionSeries {
  const candidateBands: CompositionBand[] = [
    ...ASSET_CLASS_SEQUENCE.map((assetClass) => ({
      key: assetClass,
      label: ASSET_CLASS_LABELS[assetClass] ?? assetClass,
      colorIndex: ASSET_CLASS_CHART_INDEX[assetClass] ?? null,
    })),
    { key: PENSION_BAND_KEY, label: 'Previdenza', colorIndex: PENSION_CHART_INDEX },
  ];

  const rawPoints: RawPoint[] = points.map((point) => {
    const valuesByBand: Record<string, number> = {};
    for (const assetClass of ASSET_CLASS_SEQUENCE) {
      valuesByBand[assetClass] = point.byClass[assetClass as AssetClass] ?? 0;
    }
    valuesByBand[PENSION_BAND_KEY] = point.pension;
    return {
      date: point.date,
      month: point.month,
      year: point.year,
      totalNetWorth: point.totalNetWorth,
      valuesByBand,
    };
  });

  return buildSeries(candidateBands, rawPoints);
}

/** One month of the liquidity cut, as `prepareNetWorthHistoryData` emits it. */
export interface LiquidityHistoryPoint {
  date: string;
  month: number;
  year: number;
  totalNetWorth: number;
  liquidNetWorth: number;
  illiquidNetWorth: number;
}

/**
 * Liquidity cut.
 *
 * Liquid and illiquid are a strict partition of the same asset set at the source
 * (`calculateLiquidNetWorth` / `calculateIlliquidNetWorth` use exactly complementary
 * predicates), so the two bands normally reconstruct the total exactly. They do NOT on
 * snapshots written before `illiquidNetWorth` existed, where `prepareNetWorthHistoryData`
 * defaults it to 0 while the liquid figure stays partial — and that is precisely the case the
 * residual band is here to name instead of hiding.
 *
 * Colour slots 0 and 2 are inherited from the chart this replaces, so a returning user's
 * "liquid is blue" memory survives the redesign.
 */
export function buildLiquidityComposition(points: LiquidityHistoryPoint[]): CompositionSeries {
  const candidateBands: CompositionBand[] = [
    { key: 'liquid', label: 'Liquido', colorIndex: 0 },
    { key: 'illiquid', label: 'Illiquido', colorIndex: 2 },
  ];

  const rawPoints: RawPoint[] = points.map((point) => ({
    date: point.date,
    month: point.month,
    year: point.year,
    totalNetWorth: point.totalNetWorth,
    valuesByBand: {
      liquid: point.liquidNetWorth,
      illiquid: point.illiquidNetWorth,
    },
  }));

  return buildSeries(candidateBands, rawPoints);
}

/**
 * Italian separators, deliberately.
 *
 * `toFixed(1)` would announce "50.0%" where the breakdown row beside it reads "50,0%" — an
 * Italian screen reader reads a dot as a different number, so the two would disagree about the
 * same figure. A label that contradicts the visible text is worse than no label.
 */
const SHARE_FORMATTER = new Intl.NumberFormat('it-IT', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatSharePct(sharePct: number): string {
  return SHARE_FORMATTER.format(sharePct / 100);
}

/**
 * The chart is announced to screen readers as an image, which is only honest because every
 * band's current value and share are also on the page as text in the breakdown list below it.
 * The label therefore carries the colour→name mapping the sighted reader gets from the swatches.
 */
export function buildChartAriaLabel(cut: CompositionCut, series: CompositionSeries): string {
  const subject =
    cut === 'assetClass' ? 'per classe di asset' : 'tra liquido e illiquido';
  if (series.rows.length === 0) return `Composizione del patrimonio ${subject}: nessun dato.`;

  const span = `da ${formatPeriodLabel(series.rows[0].month as number, series.rows[0].year as number)} a ${series.latestPeriodLabel}`;
  const composition = series.breakdown
    .map((entry) => `${entry.label} ${formatSharePct(entry.sharePct)}`)
    .join(', ');
  return `Grafico ad aree impilate: composizione del patrimonio ${subject}, ${span}. Nell'ultimo mese: ${composition}.`;
}

