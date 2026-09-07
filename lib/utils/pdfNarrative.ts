/**
 * The narrative layer of the PDF export: the verdict the report opens on, and the one-line
 * reading that opens each of its seven sections.
 *
 * Same contract as every other `*Narrative.ts` in the app — pure, tested clause by clause,
 * returning a `Narrative` rather than a string — with one difference forced by the medium:
 * `@react-pdf/renderer` has no Geist, so the segments' `mono` flag does not change the face
 * (see `PDF_FONTS` in `lib/constants/printTokens.ts`). It still marks which words are figures,
 * which is what `PDFNarrative` uses to set them in the bold weight and the sign colour.
 *
 * Nothing here computes a new quantity: every figure below is already in `PDFSectionData`,
 * built by `lib/services/pdfDataService.ts`. A reading that needed arithmetic of its own would
 * belong there, behind a test, not in a sentence builder.
 */

import { cachedFormatCurrencyEUR, formatPercentageIt as formatPercentage } from '@/lib/utils/formatters';
import { MONTH_NAMES } from '@/lib/constants/months';
import type { Narrative, NarrativeSegment, PageVerdictModel, VerdictTone } from '@/lib/utils/narrative';
import type {
  AllocationData,
  CashflowData,
  FireData,
  HistoryData,
  PerformanceData,
  PortfolioData,
  SummaryData,
  TimeFilter,
} from '@/types/pdf';

export type { Narrative, PageVerdictModel } from '@/lib/utils/narrative';

// ─── The WinAnsi boundary ─────────────────────────────────────────────────────

/**
 * Makes a string printable by a standard PDF font.
 *
 * `@react-pdf/renderer` sets the standard-14 faces in WinAnsiEncoding, which covers Latin-1
 * plus a handful of typographic characters — but NOT U+2212, the typographic minus the rest of
 * the app uses for a negative figure. react-pdf drops what it cannot encode SILENTLY: the
 * Allocazione gaps printed «620» and «7500» where they meant «−620 €» and «−7500 €», which is
 * the same figure with the opposite meaning. Caught only by reading a rendered PDF.
 *
 * So the narrative keeps producing the typographic minus — it is the right character, and the
 * email and the DOM print it — and this function converts it at the boundary, once, for every
 * string that reaches a PDF text node. It maps ONLY what WinAnsi lacks; the apostrophe, the
 * dashes, «», · and × are all encodable and are left alone.
 */
export function pdfSafeText(text: string): string {
  return text.replace(/−/g, '-');
}

// ─── Segment helpers ──────────────────────────────────────────────────────────

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });

const euro = (value: number, compact = true): NarrativeSegment =>
  figure(cachedFormatCurrencyEUR(value, compact));

function signedEuro(value: number, compact = true): NarrativeSegment {
  return {
    text: `${value >= 0 ? '+' : '−'}${cachedFormatCurrencyEUR(Math.abs(value), compact)}`,
    mono: true,
    sign: value >= 0 ? 'positive' : 'negative',
  };
}

function signedPercent(value: number, decimals = 2): NarrativeSegment {
  return {
    text: `${value >= 0 ? '+' : '−'}${formatPercentage(Math.abs(value), decimals)}`,
    mono: true,
    sign: value >= 0 ? 'positive' : 'negative',
  };
}

function pluralise(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

// ─── The report's own vocabulary ──────────────────────────────────────────────

/**
 * What the report covers, as its eyebrow: "Report totale", "Report annuale · 2026".
 *
 * Sentence case, not the Title Case the cover used to shout in: the eyebrow is a label, and
 * DESIGN.md gives it 10px uppercase with letter-spacing — shouting twice is once too many.
 */
export function reportScopeLabel(
  timeFilter: TimeFilter | undefined,
  selectedYear?: number,
  selectedMonth?: number,
  now: Date = new Date(),
): string {
  const year = selectedYear ?? now.getFullYear();
  switch (timeFilter) {
    case 'monthly': {
      const monthIndex = (selectedMonth ?? now.getMonth() + 1) - 1;
      return `Report mensile · ${MONTH_NAMES[monthIndex]} ${year}`;
    }
    case 'yearly':
      return `Report annuale · ${year}`;
    default:
      return 'Report totale';
  }
}

/**
 * The Italian name of each section — the same words the app's navigation uses.
 *
 * The PDF used to mix registers: "Portfolio Assets" and "FIRE Calculator" beside "Entrate e
 * Uscite" and "Storico Patrimonio". Italian is the product's language for anything the user
 * reads (CLAUDE.md), and a report is read.
 */
export const PDF_SECTION_TITLES = {
  portfolio: 'Patrimonio',
  allocation: 'Allocazione',
  history: 'Storico',
  cashflow: 'Cashflow',
  performance: 'Rendimenti',
  fire: 'FIRE',
  summary: 'Riepilogo',
} as const;

export type PdfSectionKey = keyof typeof PDF_SECTION_TITLES;

// ─── The cover verdict ────────────────────────────────────────────────────────

export interface ReportVerdictInput {
  /** Present when the Storico section was selected — the only source of a growth figure. */
  history?: Pick<HistoryData, 'totalGrowth' | 'totalGrowthAbsolute'> | null;
  portfolio?: Pick<PortfolioData, 'totalValue' | 'assets'> | null;
  summary?: Pick<SummaryData, 'totalNetWorth' | 'assetCount'> | null;
  timeFilter?: TimeFilter;
}

/**
 * The report's opening sentence.
 *
 * The cover is the one page a reader always sees, and it used to carry a 36px blue "Portfolio
 * Report" and a badge — a title page that said nothing the file name did not. Now it answers
 * the report's question before the sections argue it, and it degrades honestly: without the
 * Storico section there is no growth to state, so the headline states the position instead.
 */
export function buildReportVerdict(input: ReportVerdictInput): PageVerdictModel {
  const totalValue = input.portfolio?.totalValue ?? input.summary?.totalNetWorth ?? null;
  const assetCount = input.portfolio?.assets.length ?? input.summary?.assetCount ?? null;
  const growth = input.history?.totalGrowth ?? null;
  const growthAbs = input.history?.totalGrowthAbsolute ?? null;

  const window =
    input.timeFilter === 'monthly' ? 'nel mese' : input.timeFilter === 'yearly' ? 'nell’anno' : 'da quando lo registri';

  let headline: string;
  let tone: VerdictTone;
  if (growth === null) {
    headline = 'Il patrimonio, come si presenta oggi.';
    tone = 'neutral';
  } else if (growth >= 0) {
    headline = `Il patrimonio è cresciuto del ${formatPercentage(growth, 1)} ${window}.`;
    tone = 'positive';
  } else {
    headline = `Il patrimonio è sceso del ${formatPercentage(Math.abs(growth), 1)} ${window}.`;
    tone = 'negative';
  }

  const sentence: Narrative = [];
  if (totalValue !== null) {
    sentence.push(prose('Oggi vale '), euro(totalValue));
    if (assetCount !== null) {
      sentence.push(prose(` su `), figure(`${assetCount}`), prose(` ${pluralise(assetCount, 'strumento', 'strumenti')}`));
    }
    sentence.push(prose('.'));
  }
  if (growthAbs !== null) {
    sentence.push(
      prose(sentence.length ? ' La variazione del periodo vale ' : 'La variazione del periodo vale '),
      signedEuro(growthAbs),
      prose('.'),
    );
  }
  if (sentence.length === 0) {
    sentence.push(prose('Le sezioni che seguono riportano i dati alla data di generazione.'));
  }

  return { headline, tone, sentence };
}

// ─── Section readings ─────────────────────────────────────────────────────────

/** Patrimonio: what it is worth, how much of it is liquid, and what is unrealised. */
export function describePortfolioSection(data: PortfolioData): Narrative {
  const narrative: Narrative = [prose('Il patrimonio vale '), euro(data.totalValue)];
  // With no value and no gain every optional clause drops, and the sentence must still close
  // on exactly one full stop — appending it up front left "0 €.." on an empty portfolio.
  const hasClause = data.totalValue > 0 || data.totalUnrealizedGains !== 0;
  if (!hasClause) return [...narrative, prose('.')];
  narrative.push(prose('.'));

  if (data.totalValue > 0) {
    narrative.push(
      prose(' L’'),
      figure(formatPercentage((data.liquidValue / data.totalValue) * 100, 1)),
      prose(' è liquidabile entro pochi giorni'),
    );
  }
  // A gain is only "unrealised" against a cost basis; with nothing invested there is none.
  if (data.totalUnrealizedGains !== 0) {
    narrative.push(
      prose(data.totalValue > 0 ? '; il guadagno non realizzato è ' : ' Il guadagno non realizzato è '),
      signedEuro(data.totalUnrealizedGains),
      prose(', il '),
      signedPercent(data.totalUnrealizedGainsPercent),
      prose(' su quanto hai versato'),
    );
  }
  narrative.push(prose('.'));
  return narrative;
}

/** Allocazione: how far the portfolio sits from its plan, and whether that needs an action. */
export function describeAllocationSection(data: AllocationData): Narrative {
  if (!data.hasTargets) {
    return [prose('Nessun obiettivo di allocazione è impostato: le quote qui sotto sono quelle correnti, senza un piano con cui confrontarle.')];
  }

  const drifted = data.byAssetClass
    .filter((entry) => entry.differencePercent !== undefined)
    .sort((a, b) => Math.abs(b.differencePercent ?? 0) - Math.abs(a.differencePercent ?? 0));
  const worst = drifted[0];

  if (!data.rebalancingNeeded || !worst) {
    return [prose('Il portafoglio è allineato al piano: nessuna classe richiede un intervento.')];
  }

  const gap = worst.differencePercent ?? 0;
  return [
    prose(`Lo scarto più grande è su ${worst.displayName.toLowerCase()}, `),
    signedPercent(gap, 1),
    prose(' rispetto al bersaglio; '),
    figure(`${data.rebalancingActions.length}`),
    prose(` ${pluralise(data.rebalancingActions.length, 'operazione riporterebbe', 'operazioni riporterebbero')} il portafoglio in banda.`),
  ];
}

/**
 * Storico: the distance between the first point of the window and the last.
 *
 * `HistoryData` carries TWO windows — `netWorthEvolution` is the filtered one the page
 * tabulates, while `totalGrowth` is measured between `oldestSnapshot` and `latestSnapshot`,
 * which on anything but a Totale export is a different pair. The first draft of this reading
 * took its endpoints from one and its delta from the other and printed «da 289.400 € a
 * 312.480 €: +222.480 €», three numbers that cannot all be true at once.
 *
 * It now measures ONE window: the endpoints of the series it is describing, and the delta
 * between exactly those two points.
 */
export function describeHistorySection(data: HistoryData): Narrative {
  const points = data.netWorthEvolution.length;
  if (points === 0) {
    return [prose('Non ci sono ancora snapshot da cui ricostruire uno storico.')];
  }
  if (points === 1) {
    return [
      prose('È registrato un solo snapshot, '),
      euro(data.netWorthEvolution[0].totalNetWorth),
      prose(': uno solo non basta per misurare una crescita.'),
    ];
  }

  const first = data.netWorthEvolution[0].totalNetWorth;
  const last = data.netWorthEvolution[points - 1].totalNetWorth;
  const change = last - first;

  const narrative: Narrative = [
    prose('Su '),
    figure(`${points}`),
    prose(' snapshot il patrimonio è passato da '),
    euro(first),
    prose(' a '),
    euro(last),
    prose(': '),
    signedEuro(change),
  ];
  // A percentage needs a base: from zero (or from a debt) there is no growth rate to state.
  if (first > 0) {
    narrative.push(prose(', il '), signedPercent((change / first) * 100, 1));
  }
  narrative.push(prose('.'));
  return narrative;
}

/**
 * Cashflow: what was saved over the window, and at what rate.
 *
 * The window itself is NOT stated here — the section's scope line says it, because on a Totale
 * export it is not "everything": `cashflowHistoryStartYear` floors it, and the caption that
 * names that floor is the one thing standing between the reader and a wrong conclusion.
 */
export function describeCashflowSection(data: CashflowData): Narrative {
  if (data.totalIncome <= 0 && data.totalExpenses <= 0) {
    return [prose('Nessun movimento di cassa è registrato in questa finestra.')];
  }
  if (data.totalIncome <= 0) {
    return [prose('Sono uscite '), euro(data.totalExpenses), prose(', senza entrate registrate.')];
  }

  const narrative: Narrative = [];
  if (data.netCashflow >= 0) {
    narrative.push(prose('Hai messo da parte '), euro(data.netCashflow));
  } else {
    narrative.push(prose('Sono usciti '), euro(Math.abs(data.netCashflow)), prose(' più di quanto è entrato'));
  }

  if (data.numberOfMonthsTracked > 0) {
    narrative.push(
      prose(' su '),
      figure(`${data.numberOfMonthsTracked}`),
      prose(` ${pluralise(data.numberOfMonthsTracked, 'mese', 'mesi')}, in media `),
      euro(data.averageMonthlySavings),
      prose(' al mese'),
    );
  }
  narrative.push(
    prose(': per ogni euro speso ne sono entrati '),
    figure(data.incomeToExpenseRatio.toFixed(2).replace('.', ',')),
    prose('.'),
  );
  return narrative;
}

/** Rendimenti: the one figure the page itself calls the recommended one, and its window. */
export function describePerformanceSection(data: PerformanceData): Narrative {
  const twr = data.metrics.timeWeightedReturn;
  if (twr === undefined || twr === null) {
    return [prose('Il rendimento non è calcolabile su questa finestra.')];
  }
  const narrative: Narrative = [
    prose('Il rendimento time-weighted del periodo è '),
    signedPercent(twr, 2),
    prose(` su ${data.periodLabel}`),
  ];
  if (data.metrics.cagr !== undefined && data.metrics.cagr !== null) {
    narrative.push(prose(', pari al '), signedPercent(data.metrics.cagr, 2), prose(' annualizzato'));
  }
  narrative.push(prose('.'));
  return narrative;
}

/** FIRE: how far along the path, in one figure and one horizon. */
export function describeFireSection(data: FireData): Narrative {
  if (data.fireNumber <= 0) {
    return [prose('Il numero FIRE non è calcolabile: manca una stima di spesa annuale su cui poggiarlo.')];
  }
  const remaining = Math.max(0, data.fireNumber - data.currentNetWorth);
  const narrative: Narrative = [
    prose('Il numero FIRE è '),
    euro(data.fireNumber),
    prose(' al '),
    figure(formatPercentage(data.safeWithdrawalRate, 1)),
    prose(' di prelievo: sei al '),
    figure(formatPercentage(data.progressToFI, 1)),
    prose('.'),
  ];
  if (remaining > 0) {
    narrative.push(prose(' Mancano '), euro(remaining), prose('.'));
  } else {
    narrative.push(prose(' Il traguardo è raggiunto.'));
  }
  return narrative;
}

/** Riepilogo: the two facts that judge the whole report. */
export function describeSummarySection(data: SummaryData): Narrative {
  const narrative: Narrative = [
    prose('L’allocazione è a '),
    figure(`${Math.round(data.allocationScore)}`),
    prose(' su 100 dal bersaglio'),
  ];
  if (data.incomeToExpenseRatio > 0) {
    narrative.push(
      prose(' e per ogni euro speso ne entrano '),
      figure(data.incomeToExpenseRatio.toFixed(2).replace('.', ',')),
    );
  }
  narrative.push(prose('. Alla FIRE manca il '), figure(formatPercentage(Math.max(0, 100 - data.fireProgress), 1)), prose(' del percorso.'));
  return narrative;
}

/**
 * The Cashflow section's scope line — the ONE place the export's floor is spoken.
 *
 * On a Totale export `cashflowHistoryStartYear` floors the window (doc/guide/email-pdf.md § PDF Export);
 * Storico, Rendimenti and FIRE stay unbounded. That asymmetry is deliberate — the cashflow
 * before the floor is bulk-imported noise — but a reader who is not told will read "Totale" as
 * "everything" and conclude their first years had no spending.
 */
export function cashflowScopeLine(months: string[], floorYear: number | null, monthCount?: number): string {
  const window = months.length > 0 ? `${months[0]} – ${months[months.length - 1]}` : 'nessun mese registrato';
  // The count comes from `numberOfMonthsTracked` when the caller has it, so the range and the
  // number can never disagree about the same window.
  const count = monthCount ?? months.length;
  const base = `${window} · ${count} ${pluralise(count, 'mese', 'mesi')}`;
  return floorYear === null ? base : `${base} · da ${floorYear}, l’anno da cui lo storico è attendibile`;
}
