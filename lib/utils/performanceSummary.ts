/**
 * Pure helpers that turn the Rendimenti page's already-computed numbers into the
 * single answers its redesign leads with. Nothing here fetches or touches Firebase;
 * every function is a pure transform over types the page already has in hand, so the
 * unit tests import it without mocking anything.
 *
 * Three questions the old page never answered at a glance:
 *   1. VERDICT (B1) — "am I doing well?" `summarizePerformance` blends TWR-vs-risk-free
 *      and the Sharpe band into one qualitative tone + one line of prose.
 *   2. CONSISTENCY (B2) — "how steady is it?" `computeReturnConsistency` reads the
 *      monthly-returns heatmap for the positive-month share and the best/worst month.
 *   3. DRAWDOWN STATUS (B3) — "where am I vs my peak right now?" `computeDrawdownStatus`
 *      reads the last underwater point.
 *
 * NOTE on B2 vs the Storico page: Storico counts positive/negative MONTHS on net-worth
 * growth (savings included). This counts months of investment RETURN (cash-flow-isolated,
 * the heatmap's own definition). Different question, different number — intentionally.
 */

import type {
  MonthlyReturnHeatmapData,
  UnderwaterDrawdownData,
} from '@/types/performance';

// ---------------------------------------------------------------------------
// B1 — performance verdict
// ---------------------------------------------------------------------------

/** Qualitative tone of the verdict. Maps to a color band in the UI (action colors). */
export type PerformanceTone = 'strong' | 'solid' | 'fragile' | 'weak' | 'neutral';

export interface PerformanceVerdict {
  tone: PerformanceTone;
  /** Short headline, e.g. "Solido". */
  headline: string;
  /** One sentence of plain-Italian reasoning. */
  detail: string;
}

// Sharpe interpretation bands (standard finance reading, matches the metric tooltip).
const SHARPE_GOOD = 1;
const SHARPE_EXCELLENT = 2;

/**
 * Blend return-above-risk-free with the Sharpe band into a single verdict.
 *
 * The logic is deliberately simple and explainable (no magic weights): the SIGN of the
 * excess return over the risk-free rate sets the basic direction (are you beating cash?),
 * and the Sharpe band refines it (is that return worth the risk taken?). When Sharpe is
 * unavailable (too few months for volatility) we fall back to the excess-return sign.
 */
export function summarizePerformance(params: {
  timeWeightedReturn: number | null;
  sharpeRatio: number | null;
  riskFreeRate: number;
}): PerformanceVerdict {
  const { timeWeightedReturn: twr, sharpeRatio: sharpe, riskFreeRate } = params;

  if (twr === null) {
    return {
      tone: 'neutral',
      headline: 'Dati insufficienti',
      detail: 'Servono più mesi di storico per esprimere un giudizio sul rendimento.',
    };
  }

  const beatsRiskFree = twr > riskFreeRate;
  const isPositive = twr > 0;

  // With a Sharpe ratio we can speak about risk-adjusted quality, not just direction.
  if (sharpe !== null) {
    if (sharpe >= SHARPE_EXCELLENT && beatsRiskFree) {
      return {
        tone: 'strong',
        headline: 'Eccellente',
        detail: 'Rendimento ben sopra il tasso privo di rischio e ottimo equilibrio rischio-rendimento.',
      };
    }
    if (sharpe >= SHARPE_GOOD && beatsRiskFree) {
      return {
        tone: 'solid',
        headline: 'Solido',
        detail: 'Il rendimento supera il tasso privo di rischio con un buon rapporto rischio-rendimento.',
      };
    }
    if (isPositive && sharpe >= 0) {
      return {
        tone: 'fragile',
        headline: 'Fragile',
        detail: 'Il rendimento è positivo ma il rischio assunto è alto rispetto a quanto rende.',
      };
    }
    return {
      tone: 'weak',
      headline: 'Debole',
      detail: 'Il rendimento non compensa il rischio: sotto il tasso privo di rischio per unità di rischio.',
    };
  }

  // No Sharpe — judge on direction vs risk-free only.
  if (beatsRiskFree) {
    return {
      tone: 'solid',
      headline: 'Positivo',
      detail: 'Il rendimento supera il tasso privo di rischio nel periodo selezionato.',
    };
  }
  if (isPositive) {
    return {
      tone: 'fragile',
      headline: 'Modesto',
      detail: 'Rendimento positivo ma sotto il tasso privo di rischio del periodo.',
    };
  }
  return {
    tone: 'weak',
    headline: 'Negativo',
    detail: 'Il portafoglio ha perso valore nel periodo, al netto dei contributi.',
  };
}

/**
 * Signed gap between the portfolio's annualized TWR and a reference benchmark's
 * annualized return, in percentage points. Null when either side is missing.
 * Positive = the portfolio is beating the benchmark.
 */
export function computeBenchmarkDelta(
  portfolioTWR: number | null,
  benchmarkAnnualized: number | null
): number | null {
  if (portfolioTWR === null || benchmarkAnnualized === null) return null;
  return portfolioTWR - benchmarkAnnualized;
}

// ---------------------------------------------------------------------------
// B2 — return consistency (from the monthly-returns heatmap)
// ---------------------------------------------------------------------------

export interface ReturnConsistency {
  positiveMonths: number;
  totalMonths: number;
  /** Share of months with a positive return, 0–100. 0 when there are no months. */
  positiveShare: number;
  best: { label: string; return: number } | null;
  worst: { label: string; return: number } | null;
}

const MONTH_ABBR = [
  'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu',
  'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic',
];

/** Format a year+month (1-12) as "Mag 25" for the best/worst labels. */
function formatMonthLabel(year: number, month: number): string {
  const abbr = MONTH_ABBR[month - 1] ?? String(month);
  return `${abbr} ${String(year).slice(-2)}`;
}

/**
 * Read the monthly-returns heatmap for steadiness signals: how many months were
 * positive, and the single best and worst month. A flat month (return exactly 0) is
 * counted as non-positive — it neither grew nor lost. Months with no data are skipped.
 */
export function computeReturnConsistency(
  heatmap: MonthlyReturnHeatmapData[]
): ReturnConsistency {
  let positiveMonths = 0;
  let totalMonths = 0;
  let best: { label: string; return: number } | null = null;
  let worst: { label: string; return: number } | null = null;

  for (const yearRow of heatmap) {
    for (const m of yearRow.months) {
      if (m.return === null) continue;
      totalMonths += 1;
      if (m.return > 0) positiveMonths += 1;
      const label = formatMonthLabel(yearRow.year, m.month);
      if (!best || m.return > best.return) best = { label, return: m.return };
      if (!worst || m.return < worst.return) worst = { label, return: m.return };
    }
  }

  return {
    positiveMonths,
    totalMonths,
    positiveShare: totalMonths > 0 ? (positiveMonths / totalMonths) * 100 : 0,
    best,
    worst,
  };
}

// ---------------------------------------------------------------------------
// B3 — current drawdown status (from the underwater series)
// ---------------------------------------------------------------------------

export interface DrawdownStatus {
  /** true when the latest point is at a fresh high for the selected period (drawdown ~0). */
  atPeak: boolean;
  /** Current distance below the peak, as a non-positive percentage (e.g. -3.2). */
  current: number;
}

// Drawdowns shallower than this read as "at the peak" — floating-point noise and
// sub-tenth-of-a-percent dips are not a meaningful distance from the high.
const AT_PEAK_THRESHOLD = 0.05;

/**
 * Current position versus the all-time high, read from the LAST underwater point.
 * Returns null for an empty series (no snapshots to judge).
 */
export function computeDrawdownStatus(
  underwater: UnderwaterDrawdownData[]
): DrawdownStatus | null {
  if (underwater.length === 0) return null;
  const current = underwater[underwater.length - 1].drawdown;
  return { atPeak: Math.abs(current) < AT_PEAK_THRESHOLD, current };
}
