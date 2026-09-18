/**
 * Overlap between ETF top holdings and direct-stock duplication.
 *
 * Pure and dependency-free: it takes the per-ETF holding vectors (the same Yahoo Finance
 * `topHoldings` the exposure pipeline already fetches) plus the direct equity stocks, and
 * answers «which instruments hold the same titles, and how much?».
 *
 * Two computations, intentionally separate:
 * - `computeOverlapPairs`: every pair of ETFs, with the shared titles and their weights.
 *   The overlap of A and B is Σ min(wA, wB) over the shared top holdings — the fraction of
 *   either fund that is, title by title, the same money as in the other.
 * - `computeDuplicatedStocks`: every directly-held stock that also sits in some ETF's top
 *   holdings («Apple detenuta direttamente e via ETF»).
 *
 * Honesty notes, enforced by the math rather than the prose. Yahoo Finance exposes only the
 * top ~10 positions per ETF, so every figure is a lower bound of the true overlap and the
 * tile must say so. Symbols match case-insensitively after trimming; a holding without a
 * usable weight is skipped, never counted as zero.
 */

/** One ETF's top-holdings vector. Weights are 0..1 fractions of the ETF. */
export interface OverlapEtfVector {
  ticker: string;
  assetName: string;
  assetValueEur: number;
  holdings: Array<{ symbol: string; name: string; weight: number }>;
}

/** A directly-held equity stock. */
export interface OverlapDirectStock {
  ticker: string;
  name: string;
  valueEur: number;
}

/** One title shared by a pair of ETFs. */
export interface SharedOverlapHolding {
  symbol: string;
  name: string;
  /** Weight inside each ETF (0..1 fractions). */
  weightA: number;
  weightB: number;
  /** min(wA·valueA, wB·valueB): the euros that are the same money in both. */
  overlapEur: number;
}

/** The overlap of one ETF pair. */
export interface OverlapPair {
  tickerA: string;
  nameA: string;
  valueA: number;
  tickerB: string;
  nameB: string;
  valueB: number;
  /** Σ min(wA, wB) over the shared top holdings, 0..1. */
  overlap: number;
  sharedCount: number;
  /** Shared titles, heaviest overlap first. */
  shared: SharedOverlapHolding[];
  /** Σ overlapEur of the shared titles. */
  overlapEur: number;
}

/** A direct stock also held through one or more ETFs. */
export interface DuplicatedStock {
  ticker: string;
  name: string;
  directValueEur: number;
  viaEtfValueEur: number;
  etfSources: Array<{
    ticker: string;
    assetName: string;
    /** The stock's weight inside that ETF (0..1). */
    weight: number;
    contributionEur: number;
  }>;
}

export function normalizeOverlapSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function isUsableWeight(weight: unknown): weight is number {
  return typeof weight === 'number' && Number.isFinite(weight) && weight > 0;
}

/**
 * Vectors keyed by normalized ticker. Two records of the same ETF (e.g. held on two
 * accounts) merge into one — values add up, the holdings come from the larger record —
 * so a fund never pairs with itself.
 */
function mergeVectorsByTicker(vectors: OverlapEtfVector[]): OverlapEtfVector[] {
  const merged = new Map<string, OverlapEtfVector>();
  for (const vector of vectors) {
    const key = normalizeOverlapSymbol(vector.ticker);
    if (!key) continue;
    const holdings = vector.holdings.filter(
      (h) => !!normalizeOverlapSymbol(h.symbol) && isUsableWeight(h.weight),
    );
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...vector, holdings });
    } else {
      merged.set(key, {
        ...existing,
        assetValueEur: existing.assetValueEur + vector.assetValueEur,
        holdings: vector.assetValueEur > existing.assetValueEur ? holdings : existing.holdings,
      });
    }
  }
  return [...merged.values()];
}

/** Every ETF pair sharing at least one top holding, most overlapped first. */
export function computeOverlapPairs(vectors: OverlapEtfVector[]): OverlapPair[] {
  const merged = mergeVectorsByTicker(vectors);
  const pairs: OverlapPair[] = [];
  for (let i = 0; i < merged.length; i++) {
    for (let j = i + 1; j < merged.length; j++) {
      const a = merged[i];
      const b = merged[j];
      const weightsB = new Map<string, { name: string; weight: number }>();
      for (const h of b.holdings) {
        weightsB.set(normalizeOverlapSymbol(h.symbol), { name: h.name, weight: h.weight });
      }
      const shared: SharedOverlapHolding[] = [];
      for (const h of a.holdings) {
        const other = weightsB.get(normalizeOverlapSymbol(h.symbol));
        if (!other) continue;
        shared.push({
          symbol: normalizeOverlapSymbol(h.symbol),
          name: h.name || other.name,
          weightA: h.weight,
          weightB: other.weight,
          overlapEur: Math.min(h.weight * a.assetValueEur, other.weight * b.assetValueEur),
        });
      }
      if (shared.length === 0) continue;
      shared.sort((x, y) => y.overlapEur - x.overlapEur);
      pairs.push({
        tickerA: a.ticker,
        nameA: a.assetName,
        valueA: a.assetValueEur,
        tickerB: b.ticker,
        nameB: b.assetName,
        valueB: b.assetValueEur,
        overlap: shared.reduce((sum, h) => sum + Math.min(h.weightA, h.weightB), 0),
        sharedCount: shared.length,
        shared,
        overlapEur: shared.reduce((sum, h) => sum + h.overlapEur, 0),
      });
    }
  }
  pairs.sort((x, y) => y.overlap - x.overlap);
  return pairs;
}

/** Direct stocks that also sit in some ETF's top holdings, most duplicated money first. */
export function computeDuplicatedStocks(
  vectors: OverlapEtfVector[],
  stocks: OverlapDirectStock[],
): DuplicatedStock[] {
  const merged = mergeVectorsByTicker(vectors);
  const result: DuplicatedStock[] = [];
  for (const stock of stocks) {
    const key = normalizeOverlapSymbol(stock.ticker);
    if (!key) continue;
    const etfSources: DuplicatedStock['etfSources'] = [];
    for (const vector of merged) {
      const holding = vector.holdings.find((h) => normalizeOverlapSymbol(h.symbol) === key);
      if (!holding) continue;
      etfSources.push({
        ticker: vector.ticker,
        assetName: vector.assetName,
        weight: holding.weight,
        contributionEur: holding.weight * vector.assetValueEur,
      });
    }
    if (etfSources.length === 0) continue;
    etfSources.sort((x, y) => y.contributionEur - x.contributionEur);
    result.push({
      ticker: stock.ticker,
      name: stock.name,
      directValueEur: stock.valueEur,
      viaEtfValueEur: etfSources.reduce((sum, s) => sum + s.contributionEur, 0),
      etfSources,
    });
  }
  result.sort((x, y) => y.viaEtfValueEur - x.viaEtfValueEur);
  return result;
}

// ─── Tile shaping ─────────────────────────────────────────────────────────────

export type OverlapViewKey = 'pairs' | 'duplicates';

export interface OverlapRowSource {
  ticker: string;
  name: string;
  amount: number;
  /**
   * The weight inside the source (0..1) and the source's value, when known —
   * «3,1% di 40.000 € = 1.240 €». Absent for the direct leg of a duplicated stock
   * (a weight of 1 would print «100% di 6000 € = 6000 €», which repeats the figure)
   * and for a pair's shared titles, which carry two weights each.
   */
  weight?: number;
  baseValue?: number;
  /** A pair's shared titles print both weights as «4,2% × 3,1%». */
  detail?: string;
}

export interface OverlapRow {
  key: string;
  label: string;
  caption?: string;
  amount: number;
  /** Overlap share (pairs) or portfolio share (duplicates), one decimal. */
  percentage: number;
  sources: OverlapRowSource[];
}

export interface OverlapView {
  rows: OverlapRow[];
  /** What the rows do not cover; null for pairs (overlaps are not shares of a total). */
  remainder: { label: string; amount: number; percentage: number } | null;
}

export interface OverlapInput {
  etfs: OverlapEtfVector[];
  stocks: OverlapDirectStock[];
  totalPortfolioValue: number;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

const REMAINDER_LABEL = 'Resto del portafoglio';

/** The tile's rows: ranked pairs or duplicated stocks, the largest `limit` of them. */
export function summarizeOverlap(input: OverlapInput, view: OverlapViewKey, limit: number): OverlapView {
  if (view === 'pairs') {
    const pairs = computeOverlapPairs(input.etfs).slice(0, Math.max(0, limit));
    const rows = pairs.map((pair): OverlapRow => ({
      key: `${normalizeOverlapSymbol(pair.tickerA)}×${normalizeOverlapSymbol(pair.tickerB)}`,
      label: `${pair.tickerA} × ${pair.tickerB}`,
      caption: `${pair.sharedCount} ${pair.sharedCount === 1 ? 'titolo in comune' : 'titoli in comune'}`,
      amount: pair.overlapEur,
      percentage: round1(pair.overlap * 100),
      // The shared titles keep both weights on the detail line, so the tile prints
      // «4,2% di VWCE · 3,1% di SWDA» under each one.
      sources: pair.shared.map((h): OverlapRowSource => ({
        ticker: h.symbol,
        name: h.name,
        amount: h.overlapEur,
        detail: `${formatWeightPct(h.weightA)} di ${pair.tickerA} · ${formatWeightPct(h.weightB)} di ${pair.tickerB}`,
      })),
    }));
    return { rows, remainder: null };
  }

  const all = computeDuplicatedStocks(input.etfs, input.stocks).map((dup): OverlapRow => {
    const total = dup.directValueEur + dup.viaEtfValueEur;
    return {
      key: normalizeOverlapSymbol(dup.ticker),
      label: dup.name,
      caption: `${1 + dup.etfSources.length} strumenti`,
      amount: total,
      percentage: input.totalPortfolioValue > 0 ? round1((total / input.totalPortfolioValue) * 100) : 0,
      sources: [
        { ticker: dup.ticker, name: `${dup.name} (diretto)`, amount: dup.directValueEur },
        ...dup.etfSources.map((s): OverlapRowSource => ({
          ticker: s.ticker,
          name: s.assetName,
          amount: s.contributionEur,
          weight: s.weight,
          baseValue: undefined,
        })),
      ],
    };
  });
  const rows = all.slice(0, Math.max(0, limit));
  const shown = rows.reduce((sum, row) => sum + row.amount, 0);
  const shownPct = rows.reduce((sum, row) => sum + row.percentage, 0);
  const restAmount = input.totalPortfolioValue - shown;
  const restPct = round1(100 - shownPct);
  // The ETF legs' base values (the ETF totals) are looked up below so the tile can
  // print the «p% di TOT €» formula for each leg.
  const etfValues = new Map(mergeVectorsByTicker(input.etfs).map((v) => [normalizeOverlapSymbol(v.ticker), v.assetValueEur]));
  rows.forEach((row) => {
    row.sources.forEach((source) => {
      if (source.weight == null) return;
      source.baseValue = etfValues.get(normalizeOverlapSymbol(source.ticker));
    });
  });
  const remainder = restAmount > 0.5 && restPct > 0 ? { label: REMAINDER_LABEL, amount: restAmount, percentage: restPct } : null;
  return { rows, remainder };
}

/** «4,2%» it-IT, one decimal — the weight as the drill-down prints it. */
function formatWeightPct(weight: number): string {
  return `${(weight * 100).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export interface OverlapHighlights {
  topPair: { tickerA: string; tickerB: string; overlapPct: number; sharedCount: number } | null;
  topDuplicated: { name: string; ticker: string; instrumentCount: number } | null;
  etfCount: number;
  pairCount: number;
}

/** What the Sovrapposizioni reading names: the most overlapped pair, the top duplicated stock. */
export function summarizeOverlapHighlights(input: OverlapInput): OverlapHighlights {
  const pairs = computeOverlapPairs(input.etfs);
  const dups = computeDuplicatedStocks(input.etfs, input.stocks);
  const top = pairs[0] ?? null;
  const dup = dups[0] ?? null;
  return {
    topPair: top
      ? {
          tickerA: top.tickerA,
          tickerB: top.tickerB,
          overlapPct: round1(top.overlap * 100),
          sharedCount: top.sharedCount,
        }
      : null,
    topDuplicated: dup
      ? { name: dup.name, ticker: dup.ticker, instrumentCount: 1 + dup.etfSources.length }
      : null,
    etfCount: mergeVectorsByTicker(input.etfs).length,
    pairCount: pairs.length,
  };
}
