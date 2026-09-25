/**
 * A histogram of calendar years — the FIRE year of the Calcolatore's paths, the year a Monte
 * Carlo simulation runs out of money — as equal-width bins of whole years.
 *
 * ONE binning for both surfaces (Rule of Three, before the third arrives): the width is the
 * smallest of 1, 2, 3, 5 or 10 years that keeps the bin count under `maxBins`, so a five-year
 * spread reads year by year and a forty-year one in fives; a hand-written bar chart in a tile
 * cannot label forty columns. The reference year (the base scenario's, the median) marks its bin,
 * which the chart outlines — never the other bins dimmed (DESIGN.md → In-tile Bars).
 *
 * Pure and Firestore-free.
 */

export interface YearHistogramBin {
  /** First and last calendar year of the bin, both inclusive. */
  fromYear: number;
  toYear: number;
  count: number;
  /** Share of `total` (the caller's denominator), in percent. */
  sharePct: number;
  /** The bin the reference year falls in — outlined on the chart. */
  isReference: boolean;
}

export interface YearHistogram {
  bins: YearHistogramBin[];
  binWidthYears: number;
}

export interface BinYearsOptions {
  /** The denominator of `sharePct`; defaults to the number of years given. */
  total?: number;
  /** The year whose bin is outlined; null or absent marks none. */
  referenceYear?: number | null;
  /** The most bins the chart can label (default 12). */
  maxBins?: number;
  /** The last bin never runs past this year (the simulation's horizon); defaults to the largest year given. */
  ceilingYear?: number;
}

const BIN_WIDTHS = [1, 2, 3, 5, 10] as const;

/** The smallest of the allowed widths that keeps `span` years under `maxBins` bins; 10 when none does. */
export function resolveBinWidth(spanYears: number, maxBins: number): number {
  return BIN_WIDTHS.find((width) => Math.ceil(spanYears / width) <= maxBins) ?? BIN_WIDTHS[BIN_WIDTHS.length - 1];
}

/**
 * Bins the given calendar years from the earliest one up, in equal widths. With no years the
 * histogram is empty (the caller says why); the counts always add up to the years given.
 */
export function binYears(years: number[], options: BinYearsOptions = {}): YearHistogram {
  if (years.length === 0) return { bins: [], binWidthYears: 1 };
  const total = options.total ?? years.length;
  const maxBins = options.maxBins ?? 12;
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const ceilingYear = Math.max(options.ceilingYear ?? maxYear, maxYear);
  const width = resolveBinWidth(maxYear - minYear + 1, maxBins);
  const binCount = Math.ceil((maxYear - minYear + 1) / width);
  const reference = options.referenceYear ?? null;

  const bins: YearHistogramBin[] = [];
  for (let index = 0; index < binCount; index++) {
    const fromYear = minYear + index * width;
    const toYear = Math.min(fromYear + width - 1, ceilingYear);
    const count = years.filter((year) => year >= fromYear && year <= toYear).length;
    bins.push({
      fromYear,
      toYear,
      count,
      sharePct: total > 0 ? (count / total) * 100 : 0,
      isReference: reference !== null && reference >= fromYear && reference <= toYear,
    });
  }
  return { bins, binWidthYears: width };
}
