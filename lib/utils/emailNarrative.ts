/**
 * The narrative layer of the two periodic emails: the verdict that opens them and the one-line
 * reading under each tile.
 *
 * Why an email needs its own verdict. The AI comment used to be the only prose in the message,
 * and it is optional by design — `generateEmailAiComment` swallows every failure so a missing
 * Anthropic key, a rate limit or a timeout can never stop the send. An email that opened on the
 * comment therefore opened on a number whenever the model was unavailable, which is the one
 * thing the Verdict-First Rule forbids. So the verdict is generated from RULES here, always
 * present and testable clause by clause, and the AI comment sits under it as what it is: prose.
 *
 * Everything in this file is pure and returns a `Narrative`, so the same sentence can be set in
 * the DOM, in email HTML and in a PDF without being written three times. It imports its
 * formatters from `lib/utils/formatters.ts` rather than from `chartService`, which top-level
 * imports the client Firebase SDK and would drag `firebase/auth` into a Lambda (the reason
 * `formatPercentageIt` was moved there in the first place).
 *
 * The Narrative Honesty Rule governs every function below: a missing input drops its clause,
 * never a placeholder, and no sentence claims a cause the data cannot support — a period that
 * grew while the market lost did not grow *because of* the market.
 */

import { cachedFormatCurrencyEUR, formatPercentageIt as formatPercentage } from '@/lib/utils/formatters';
import { MONTH_NAMES } from '@/lib/constants/months';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { atThePercent, pluralArticleFor } from '@/lib/utils/patrimonioNarrative';
import type { Narrative, NarrativeSegment, PageVerdictModel, VerdictTone } from '@/lib/utils/narrative';

export type { Narrative, PageVerdictModel, VerdictTone } from '@/lib/utils/narrative';

// ─── The period ───────────────────────────────────────────────────────────────

export type EmailPeriodKind = 'monthly' | 'quarterly' | 'semiannual' | 'yearly';

export interface EmailPeriod {
  kind: EmailPeriodKind;
  year: number;
  /** The period's LAST month, 1-12. For a monthly email, the month itself. */
  month: number;
  /** 1-4, quarterly only. */
  quarter?: number;
  /** 1 (Jan-Jun) or 2 (Jul-Dec), semiannual only. */
  semester?: number;
}

const ORDINALS = ['primo', 'secondo', 'terzo', 'quarto'] as const;

const SHORT_MONTHS = [
  'gen', 'feb', 'mar', 'apr', 'mag', 'giu',
  'lug', 'ago', 'set', 'ott', 'nov', 'dic',
] as const;

/**
 * The period as the SUBJECT of the verdict headline — "Agosto", "Il terzo trimestre".
 *
 * All four forms are masculine singular, which is what lets the headline templates below use
 * one verb agreement ("è cresciuto", "è in calo") instead of four.
 */
export function periodSubject(period: EmailPeriod): string {
  switch (period.kind) {
    case 'quarterly':
      return `Il ${ORDINALS[(period.quarter ?? 1) - 1]} trimestre`;
    case 'semiannual':
      return `Il ${ORDINALS[(period.semester ?? 1) - 1]} semestre`;
    case 'yearly':
      return `Il ${period.year}`;
    default:
      return MONTH_NAMES[period.month - 1];
  }
}

/** The email's subject line and header title: "Agosto 2026", "Q3 2026", "Anno 2026". */
export function periodTitle(period: EmailPeriod): string {
  switch (period.kind) {
    case 'quarterly':
      return `Q${period.quarter} ${period.year}`;
    case 'semiannual':
      return `${period.semester}° Semestre ${period.year}`;
    case 'yearly':
      return `Anno ${period.year}`;
    default:
      return `${MONTH_NAMES[period.month - 1]} ${period.year}`;
  }
}

/** The eyebrow above the verdict: what kind of report this is. */
export function periodKindLabel(kind: EmailPeriodKind): string {
  switch (kind) {
    case 'quarterly':
      return 'Riepilogo trimestrale';
    case 'semiannual':
      return 'Riepilogo semestrale';
    case 'yearly':
      return 'Riepilogo annuale';
    default:
      return 'Riepilogo mensile';
  }
}

/** The first month of the period, 1-12. */
function periodStartMonth(period: EmailPeriod): number {
  switch (period.kind) {
    case 'quarterly':
      return period.month - 2;
    case 'semiannual':
      return period.semester === 1 ? 1 : 7;
    case 'yearly':
      return 1;
    default:
      return period.month;
  }
}

/**
 * A tile's scope — the window its figures are measured over: "agosto 2026", "lug–set 2026".
 * Every flow tile carries one, because in an email there is no period picker to look at.
 */
export function periodScopeLabel(period: EmailPeriod): string {
  if (period.kind === 'monthly') {
    return `${MONTH_NAMES[period.month - 1].toLowerCase()} ${period.year}`;
  }
  if (period.kind === 'yearly') return `${period.year}`;
  const start = SHORT_MONTHS[periodStartMonth(period) - 1];
  const end = SHORT_MONTHS[period.month - 1];
  return `${start}–${end} ${period.year}`;
}

/** The period's closing DAY, for a tile that states a point in time: "31 ago 2026". */
export function periodEndLabel(period: EmailPeriod): string {
  const lastDay = new Date(period.year, period.month, 0).getDate();
  return `${lastDay} ${SHORT_MONTHS[period.month - 1]} ${period.year}`;
}

/** What the period is compared against, as it reads inside a sentence: "luglio", "il 2025". */
export function periodBaselineLabel(period: EmailPeriod): string {
  switch (period.kind) {
    case 'quarterly':
      return 'il trimestre precedente';
    case 'semiannual':
      return 'il semestre precedente';
    case 'yearly':
      return `il ${period.year - 1}`;
    default: {
      const previous = period.month === 1 ? 12 : period.month - 1;
      return MONTH_NAMES[previous - 1].toLowerCase();
    }
  }
}

/** The same baseline as a COLUMN heading, capitalised and standalone: "Luglio 2026". */
export function periodBaselineHeading(period: EmailPeriod): string {
  switch (period.kind) {
    case 'quarterly':
      return `Q${(period.quarter ?? 1) === 1 ? 4 : (period.quarter ?? 1) - 1} ${(period.quarter ?? 1) === 1 ? period.year - 1 : period.year}`;
    case 'semiannual':
      return period.semester === 1 ? `2° Semestre ${period.year - 1}` : `1° Semestre ${period.year}`;
    case 'yearly':
      return `${period.year - 1}`;
    default: {
      const previous = period.month === 1 ? 12 : period.month - 1;
      const year = period.month === 1 ? period.year - 1 : period.year;
      return `${MONTH_NAMES[previous - 1]} ${year}`;
    }
  }
}

/** The same period, one year earlier, as a heading: "Agosto 2025". */
export function yearEarlierHeading(period: EmailPeriod): string {
  switch (period.kind) {
    case 'quarterly':
      return `Q${period.quarter} ${period.year - 1}`;
    case 'semiannual':
      return `${period.semester}° Semestre ${period.year - 1}`;
    case 'yearly':
      return `${period.year - 1}`;
    default:
      return `${MONTH_NAMES[period.month - 1]} ${period.year - 1}`;
  }
}

// ─── Segment helpers ──────────────────────────────────────────────────────────

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });

/** A euro amount with no sign — a magnitude, not a change. */
const euro = (value: number, compact = true): NarrativeSegment =>
  figure(cachedFormatCurrencyEUR(value, compact));

/** Signed euro with a typographic minus, coloured by sign. */
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

const classNoun = (assetClass: string): string => ASSET_CLASS_LABELS[assetClass] ?? assetClass;

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function pluralise(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

// ─── The verdict ──────────────────────────────────────────────────────────────

export interface PeriodEmailVerdictInput {
  period: EmailPeriod;
  currentNetWorth: number;
  /** 0 when no earlier snapshot exists — there is then no baseline and no delta to state. */
  previousNetWorth: number;
  netWorthDelta: number;
  netWorthDeltaPct: number;
  totalIncome: number;
  /** Always a positive magnitude, following `calculateTotalExpenses`. */
  totalExpenses: number;
  /**
   * `Δ patrimonio − risparmio netto`, or null when no earlier snapshot makes it attributable.
   * A STRUCTURAL residual: it also absorbs movements the app never saw, which is why the tile
   * that prints it says so and the verdict never calls it "performance".
   */
  marketEffect: number | null;
  /**
   * Hall of Fame standing of this period's net-worth change; absent when not computable.
   * `trend` matters: a period can rank because it grew the most OR because it fell the most,
   * and calling a record decline "il mese migliore" is the plainest possible lie.
   */
  rank?: { position: number; total: number; scope: 'month' | 'year'; trend: 'growth' | 'decline' } | null;
}

/**
 * The headline and its tone.
 *
 * The one rule that must never be relaxed — the same one the Panoramica enforces: a period is
 * blamed on the market only when the market actually lost money. When the market gained and
 * the total still fell, the cause is the user's own flows, and the headline says so.
 */
function resolveHeadline(input: PeriodEmailVerdictInput): { headline: string; tone: VerdictTone } {
  const subject = periodSubject(input.period);
  const hasBaseline = input.previousNetWorth > 0;
  const savings = input.totalIncome - input.totalExpenses;

  if (!hasBaseline) {
    // Nothing to compare against: the email states what the period WAS, and judges nothing.
    return { headline: `${subject} è il primo periodo registrato.`, tone: 'neutral' };
  }

  if (input.netWorthDelta >= 0) {
    if (input.totalIncome > 0 && savings < 0) {
      return { headline: `${subject} è cresciuto, ma le spese hanno superato le entrate.`, tone: 'warning' };
    }
    if (input.marketEffect !== null && input.marketEffect > 0) {
      return { headline: `${subject} è cresciuto: il mercato ha spinto.`, tone: 'positive' };
    }
    if (input.marketEffect !== null) {
      return { headline: `${subject} è cresciuto, nonostante il mercato.`, tone: 'positive' };
    }
    return { headline: `${subject} è cresciuto.`, tone: 'positive' };
  }

  if (input.marketEffect !== null && input.marketEffect >= 0) {
    return { headline: `${subject} è in calo, nonostante il mercato.`, tone: 'warning' };
  }
  if (input.marketEffect !== null) {
    return { headline: `${subject} è in calo: il mercato ha pesato.`, tone: 'negative' };
  }
  return { headline: `${subject} è in calo.`, tone: 'negative' };
}

/**
 * The verdict of a periodic email: the headline, then the facts as one sentence.
 *
 * Clause by clause, each one droppable: no earlier snapshot → no delta and no split; no income
 * → no savings rate; nothing attributable → no market clause; no Hall of Fame standing → no
 * record clause. What is left is always a complete Italian sentence.
 */
export function buildPeriodEmailVerdict(input: PeriodEmailVerdictInput): PageVerdictModel {
  const { headline, tone } = resolveHeadline(input);
  const hasBaseline = input.previousNetWorth > 0;
  const savings = input.totalIncome - input.totalExpenses;

  const sentence: Narrative = [prose('Il patrimonio vale '), euro(input.currentNetWorth)];

  if (hasBaseline) {
    sentence.push(
      prose(': '),
      signedEuro(input.netWorthDelta),
      prose(' ('),
      signedPercent(input.netWorthDeltaPct),
      prose(`) su ${periodBaselineLabel(input.period)}`),
    );
  }
  sentence.push(prose('.'));

  // The split is exact by construction — `marketEffect` is DEFINED as Δ minus net savings — so
  // it is stated only when both halves exist, and never inferred from one of them.
  if (hasBaseline && input.marketEffect !== null) {
    sentence.push(
      prose(' Di quel movimento, '),
      signedEuro(input.marketEffect),
      prose(' viene dal mercato e '),
      signedEuro(savings),
      prose(' da quanto hai risparmiato.'),
    );
  } else if (input.totalIncome > 0) {
    sentence.push(
      prose(' Hai messo da parte '),
      signedEuro(savings),
      prose(', il '),
      figure(formatPercentage((savings / input.totalIncome) * 100, 1)),
      prose(' di quanto è entrato.'),
    );
  }

  if (input.rank) {
    const noun = input.rank.scope === 'month' ? 'mese' : 'anno';
    const standing = input.rank.trend === 'growth' ? `${noun} migliore` : 'calo più marcato';
    sentence.push(
      prose(' È il '),
      figure(`${input.rank.position}°`),
      prose(` ${standing} su `),
      figure(`${input.rank.total}`),
      prose(` ${pluralise(input.rank.total, 'registrato', 'registrati')}.`),
    );
  }

  return { headline, tone, sentence };
}

// ─── Tile readings ────────────────────────────────────────────────────────────

/**
 * Patrimonio. With no earlier snapshot the tile names the absence rather than printing a zero
 * delta — «nothing recorded» and «a measured zero» are different facts (The
 * Absence-Has-Three-Names Rule).
 */
export function describeNetWorthTile(input: {
  period: EmailPeriod;
  previousNetWorth: number;
  netWorthDelta: number;
  netWorthDeltaPct: number;
}): Narrative {
  if (input.previousNetWorth <= 0) {
    return [prose('Non c’è un periodo precedente da cui misurare la variazione.')];
  }
  const verb = input.netWorthDelta >= 0 ? 'è salito' : 'è sceso';
  return [
    prose(`Rispetto a ${periodBaselineLabel(input.period)} ${verb} di `),
    signedEuro(input.netWorthDelta),
    prose(', il '),
    signedPercent(input.netWorthDeltaPct),
    prose('.'),
  ];
}

/** The market split, as the Patrimonio tile's footer. Absent when not attributable. */
export function describeMarketSplit(marketEffect: number | null, savings: number): Narrative | null {
  if (marketEffect === null) return null;
  return [
    prose('Mercato '),
    signedEuro(marketEffect),
    prose(', risparmio '),
    signedEuro(savings),
    prose('. È un residuo strutturale: assorbe anche i movimenti non tracciati.'),
  ];
}

/**
 * Composizione. The claim «più di tutte le altre classi messe insieme» is only made when the
 * leader is actually above half — below that it is simply false, however dominant it looks.
 */
export function describeCompositionTile(
  classes: Array<{ assetClass: string; value: number }>,
): Narrative | null {
  const positive = classes.filter((entry) => entry.value > 0);
  if (positive.length === 0) return null;

  const total = positive.reduce((sum, entry) => sum + entry.value, 0);
  if (total <= 0) return null;

  const sorted = [...positive].sort((a, b) => b.value - a.value);
  const top = sorted[0];
  const share = (top.value / total) * 100;

  if (sorted.length === 1) {
    return [prose(`Tutto in ${classNoun(top.assetClass).toLowerCase()}.`)];
  }

  if (share > 50) {
    return [
      prose(`${capitalise(classNoun(top.assetClass))} ${atThePercent(share, 1)}`),
      figure(formatPercentage(share, 1)),
      prose(', più di tutte le altre classi messe insieme.'),
    ];
  }

  return [
    prose(`La classe più pesante è ${classNoun(top.assetClass).toLowerCase()}, `),
    figure(formatPercentage(share, 1)),
    prose(` su ${sorted.length} classi.`),
  ];
}

export interface AssetClassMove {
  name: string;
  deltaPct: number;
  deltaAbs: number;
}

/**
 * Andamento per classe. Best and worst are two different questions when measured in percent
 * and in euro — a 6% move on a small position is not the mover of the period — so the reading
 * names both axes, and says nothing when only one of them exists.
 */
export function describeClassMovesTile(performers: {
  bestPct: AssetClassMove | null;
  worstPct: AssetClassMove | null;
  bestAbs: AssetClassMove | null;
  worstAbs: AssetClassMove | null;
}): Narrative | null {
  const { bestPct, worstPct, bestAbs } = performers;
  if (!bestPct && !bestAbs) return null;

  const clauses: Narrative = [];
  if (bestPct && bestAbs && bestPct.name !== bestAbs.name) {
    clauses.push(
      prose('In percentuale ha spinto '),
      figure(bestPct.name),
      prose(', in euro '),
      figure(bestAbs.name),
    );
  } else if (bestAbs) {
    clauses.push(prose('Ha spinto '), figure(bestAbs.name));
  } else if (bestPct) {
    clauses.push(prose('Ha spinto '), figure(bestPct.name));
  }

  // Only claim a loser when one actually lost: a period in which every class gained has none.
  if (worstPct && worstPct.deltaPct < 0) {
    clauses.push(prose('; sotto zero '), figure(worstPct.name));
  }
  clauses.push(prose('.'));
  return clauses;
}

/** Cashflow. A negative saving is stated as such, never as a negative "messo da parte". */
export function describeCashflowTile(input: { totalIncome: number; totalExpenses: number }): Narrative {
  const savings = input.totalIncome - input.totalExpenses;

  if (input.totalIncome <= 0) {
    if (input.totalExpenses <= 0) return [prose('Nessun movimento registrato nel periodo.')];
    return [prose('Sono uscite '), euro(input.totalExpenses), prose(', senza entrate registrate.')];
  }

  if (savings < 0) {
    return [
      prose('Sono usciti '),
      euro(Math.abs(savings)),
      prose(' più di quanto è entrato.'),
    ];
  }

  return [
    prose('Hai messo da parte '),
    euro(savings),
    prose(', il '),
    figure(formatPercentage((savings / input.totalIncome) * 100, 1)),
    prose(' di quanto è entrato.'),
  ];
}

/**
 * A ranked list's reading: what the leader weighs and what the shown rows explain together.
 * Used by the expense and income category tiles, whose question differs only in the noun.
 */
function describeRankedShare(
  entries: Array<{ name: string; amount: number }>,
  shownCount: number,
  leadIn: (name: string, share: string) => Narrative,
): Narrative | null {
  const positive = entries.filter((entry) => entry.amount > 0);
  if (positive.length === 0) return null;
  const total = positive.reduce((sum, entry) => sum + entry.amount, 0);
  if (total <= 0) return null;

  const sorted = [...positive].sort((a, b) => b.amount - a.amount);
  const top = sorted[0];
  const narrative = leadIn(top.name, formatPercentage((top.amount / total) * 100, 1));

  // The "first N explain X%" clause exists only when rows are actually being withheld.
  const shown = Math.min(shownCount, sorted.length);
  if (shown < sorted.length) {
    const shownTotal = sorted.slice(0, shown).reduce((sum, entry) => sum + entry.amount, 0);
    narrative.push(
      prose(`; ${pluralArticleFor(shown)} `),
      figure(`${shown}`),
      prose(' in elenco ne spiegano l’'),
      figure(formatPercentage((shownTotal / total) * 100, 1)),
      prose('.'),
    );
  } else {
    narrative.push(prose('.'));
  }
  return narrative;
}

export function describeExpenseCategoriesTile(
  categories: Array<{ name: string; amount: number }>,
  shownCount: number,
): Narrative | null {
  return describeRankedShare(categories, shownCount, (name, share) => [
    prose(`${name} è la voce più pesante, `),
    figure(share),
    prose(' delle uscite'),
  ]);
}

export function describeIncomeCategoriesTile(
  categories: Array<{ name: string; amount: number }>,
  shownCount: number,
): Narrative | null {
  return describeRankedShare(categories, shownCount, (name, share) => [
    prose(`${name} copre il `),
    figure(share),
    prose(' di quanto è entrato'),
  ]);
}

/** Spese per tipo — the Fisse/Variabili/Debiti split, as the expense tile's footer. */
export function describeExpenseTypes(
  types: Array<{ label: string; amount: number }>,
): Narrative | null {
  const positive = types.filter((entry) => entry.amount > 0);
  if (positive.length === 0) return null;
  const total = positive.reduce((sum, entry) => sum + entry.amount, 0);
  if (total <= 0) return null;

  const narrative: Narrative = [];
  positive.forEach((entry, index) => {
    if (index > 0) narrative.push(prose(' · '));
    narrative.push(
      prose(`${entry.label} `),
      euro(entry.amount),
      prose(' ('),
      figure(formatPercentage((entry.amount / total) * 100, 1)),
      prose(')'),
    );
  });
  narrative.push(prose('.'));
  return narrative;
}

/** Spese maggiori. States what the listed rows weigh against the period's whole spending. */
export function describeTopExpensesTile(
  shown: Array<{ amount: number }>,
  totalExpenses: number,
): Narrative | null {
  if (shown.length === 0) return null;
  const shownTotal = shown.reduce((sum, entry) => sum + entry.amount, 0);
  const opening: Narrative = [
    prose(`${capitalise(numberWord(shown.length))} ${pluralise(shown.length, 'voce pesa', 'voci pesano')} `),
    euro(shownTotal),
  ];
  if (totalExpenses > 0) {
    opening.push(
      prose(', il '),
      figure(formatPercentage((shownTotal / totalExpenses) * 100, 1)),
      prose(' delle uscite del periodo.'),
    );
  } else {
    opening.push(prose('.'));
  }
  return opening;
}

/**
 * Small cardinals spelled out, so a reading opens on a word and not on a digit.
 *
 * Italian needs THREE forms of "one" and only of one: `una voce`, `un budget`, and the standalone
 * pronoun `uno è già oltre il limite`. Every other cardinal is invariant, which is why the form
 * argument exists at all — getting it wrong printed "Una pagamento ricevuto".
 */
function numberWord(count: number, form: 'feminine' | 'masculine' | 'pronoun' = 'feminine'): string {
  if (count === 1) {
    if (form === 'feminine') return 'una';
    return form === 'masculine' ? 'un' : 'uno';
  }
  const words = ['zero', '', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci'];
  return words[count] ?? `${count}`;
}

export function describeDividendsTile(total: number, count: number): Narrative | null {
  if (count <= 0) return null;
  return [
    prose(`${capitalise(numberWord(count, 'masculine'))} ${pluralise(count, 'pagamento ricevuto', 'pagamenti ricevuti')}, per un lordo di `),
    euro(total, false),
    prose('.'),
  ];
}

export interface YearOverYearDelta {
  absChange: number;
  pctChange: number | null;
}

/**
 * «Rispetto a un anno fa». The tile exists ONLY when the year-earlier baseline is a different
 * window from the previous period — on a yearly email the two coincide, and every figure in it
 * would repeat the Patrimonio and Cashflow tiles (The One-Tile-One-Question Rule).
 */
export function describeYearOverYearTile(input: {
  period: EmailPeriod;
  netWorth: YearOverYearDelta | null;
  income: YearOverYearDelta | null;
  expenses: YearOverYearDelta | null;
}): Narrative | null {
  if (!input.netWorth) return null;

  const narrative: Narrative = [
    prose('In dodici mesi il patrimonio '),
    prose(input.netWorth.absChange >= 0 ? 'è salito di ' : 'è sceso di '),
    signedEuro(input.netWorth.absChange),
  ];

  // The pace comparison is only worth a clause when BOTH flows have a baseline to compare to.
  if (input.income && input.expenses) {
    const incomeUp = input.income.absChange >= 0;
    const expensesUp = input.expenses.absChange >= 0;
    narrative.push(
      incomeUp === expensesUp
        ? prose('; entrate e uscite si sono mosse nella stessa direzione.')
        : prose(
            incomeUp
              ? '; le entrate sono cresciute mentre le uscite sono calate.'
              : '; le uscite sono cresciute mentre le entrate sono calate.',
          ),
    );
  } else {
    narrative.push(prose('.'));
  }
  return narrative;
}

export interface EmailBudgetAlert {
  label: string;
  level: 'exceeded' | 'warning';
}

/** Budget. Counts what is over and what is near, and says nothing about what is fine. */
export function describeBudgetAlertsTile(
  alerts: EmailBudgetAlert[],
  /** How many budgets exist in total. Omit it where the caller does not know — the
   *  "and the rest closed under" clause then disappears rather than being invented. */
  totalBudgets?: number,
): Narrative | null {
  if (alerts.length === 0) return null;
  const exceeded = alerts.filter((alert) => alert.level === 'exceeded').length;
  const warning = alerts.length - exceeded;

  const clauses: string[] = [];
  if (exceeded > 0) clauses.push(`${numberWord(exceeded, 'masculine')} ${pluralise(exceeded, 'budget è stato superato', 'budget sono stati superati')}`);
  if (warning > 0) clauses.push(`${numberWord(warning, 'pronoun')} ${pluralise(warning, 'è vicino al limite', 'sono vicini al limite')}`);

  const narrative: Narrative = [prose(`${capitalise(clauses.join(' e '))}`)];
  const rest = totalBudgets === undefined ? 0 : totalBudgets - alerts.length;
  if (rest > 0) {
    narrative.push(prose(`; ${pluralArticleFor(rest)} `), figure(`${rest}`), prose(pluralise(rest, ' restante ha chiuso sotto.', ' restanti hanno chiuso sotto.')));
  } else {
    narrative.push(prose('.'));
  }
  return narrative;
}

// ─── The budget email ─────────────────────────────────────────────────────────

export interface BudgetEmailVerdictInput {
  /** Expense budgets that are neither over nor near their limit. */
  onTrackCount: number;
  /** Expense budgets that are over or near. */
  atRiskCount: number;
  exceededCount: number;
  /** The overall monthly ceiling, when one is configured. */
  overall: { spent: number; limit: number; projected: number | null } | null;
  /** Day of the current month, and how many days it has — the ceiling's window. */
  dayOfMonth: number;
  daysInMonth: number;
}

/**
 * The budget email's verdict.
 *
 * Nothing in this email is weekly. It is SENT on Sunday, but the ceiling and the monthly
 * budgets are month-to-date and the annual ones year-to-date — a distinction that once reached
 * production as "a fine anno" on a monthly projection. The verdict therefore names the month's
 * position explicitly, and the word "settimana" appears nowhere in this module.
 */
export function buildBudgetEmailVerdict(input: BudgetEmailVerdictInput): PageVerdictModel {
  const total = input.onTrackCount + input.atRiskCount;

  const headline = resolveBudgetHeadline(input, total);

  const sentence: Narrative = [
    prose('Al giorno '),
    figure(`${input.dayOfMonth}`),
    prose(' di '),
    figure(`${input.daysInMonth}`),
  ];

  if (input.overall && input.overall.limit > 0) {
    sentence.push(
      prose(' hai speso '),
      euro(input.overall.spent),
      prose(' del tetto mensile di '),
      euro(input.overall.limit),
    );
    if (input.overall.projected !== null) {
      sentence.push(
        prose('; al ritmo attuale la proiezione a fine mese è '),
        euro(input.overall.projected),
      );
    }
    sentence.push(prose('.'));
  } else {
    sentence.push(prose(', questo è lo stato dei tuoi budget.'));
  }

  if (input.atRiskCount > 0) {
    const near = input.atRiskCount - input.exceededCount;
    const clauses: string[] = [];
    if (input.exceededCount > 0) {
      clauses.push(`${numberWord(input.exceededCount, 'pronoun')} ${pluralise(input.exceededCount, 'è già oltre il limite', 'sono già oltre il limite')}`);
    }
    if (near > 0) {
      clauses.push(`${numberWord(near, 'pronoun')} ${pluralise(near, 'è vicino', 'sono vicini')}`);
    }
    sentence.push(prose(` ${capitalise(clauses.join(', '))}.`));
  }

  return { headline, tone: resolveBudgetTone(input), sentence };
}

function resolveBudgetHeadline(input: BudgetEmailVerdictInput, total: number): string {
  if (total === 0 && !input.overall) return 'Non hai budget configurati.';

  // The ceiling is judged on the projection when there is one: a ceiling at 80% on the 10th of
  // the month is not "holding", and the projection is the only figure that knows that.
  const ceilingHolds =
    input.overall === null ||
    input.overall.limit <= 0 ||
    (input.overall.projected ?? input.overall.spent) <= input.overall.limit;

  const ceilingClause = ceilingHolds ? 'il tetto del mese regge' : 'il tetto del mese non regge';

  if (total === 0) {
    return `${capitalise(ceilingClause)}.`;
  }

  if (input.atRiskCount === 0) {
    const allInLine =
      total === 1 ? 'L’unico budget è in linea' : `Tutti i ${numberWord(total, 'masculine')} budget sono in linea`;
    return ceilingHolds ? `${allInLine}, e il tetto regge.` : `${allInLine}, ma il tetto del mese non regge.`;
  }

  const inLine = `${capitalise(numberWord(input.onTrackCount, 'masculine'))} budget su ${numberWord(total, 'masculine')} ${pluralise(input.onTrackCount, 'è in linea', 'sono in linea')}`;
  return ceilingHolds ? `${inLine}, ${ceilingClause}.` : `${inLine}, e ${ceilingClause}.`;
}

function resolveBudgetTone(input: BudgetEmailVerdictInput): VerdictTone {
  if (input.exceededCount > 0) return 'negative';
  if (input.atRiskCount > 0) return 'warning';
  return 'positive';
}

/**
 * The overall ceiling's reading: the two percentages that only mean something together —
 * how much of the ceiling is used, and how much of the month has passed.
 */
export function describeOverallCeiling(input: {
  spent: number;
  limit: number;
  dayOfMonth: number;
  daysInMonth: number;
}): Narrative | null {
  if (input.limit <= 0) return null;
  const usedPct = (input.spent / input.limit) * 100;
  const elapsedPct = (input.dayOfMonth / input.daysInMonth) * 100;
  const pace = usedPct <= elapsedPct ? 'il passo è giusto' : 'stai spendendo più in fretta del tempo che passa';

  return [
    prose('Hai usato il '),
    figure(formatPercentage(usedPct, 0)),
    prose(' del tetto al '),
    figure(formatPercentage(elapsedPct, 0)),
    prose(` del mese: ${pace}.`),
  ];
}

export interface BudgetRowSummary {
  label: string;
  ratio: number;
  status: 'ok' | 'warning' | 'over';
  isIncome: boolean;
}

/** Budget mensili. Names the ones that need attention, or says plainly that none do. */
export function describeMonthlyBudgetsTile(rows: BudgetRowSummary[]): Narrative | null {
  const expenses = rows.filter((row) => !row.isIncome);
  if (expenses.length === 0) return null;

  const over = expenses.filter((row) => row.status === 'over');
  const near = expenses.filter((row) => row.status === 'warning');

  if (over.length === 0 && near.length === 0) {
    return [
      prose(`${capitalise(numberWord(expenses.length, 'masculine'))} ${pluralise(expenses.length, 'budget del mese è sotto il limite', 'budget del mese sono sotto il limite')}.`),
    ];
  }

  const narrative: Narrative = [];
  if (over.length > 0) {
    narrative.push(
      prose(over.length === 1 && near.length === 0 ? 'Solo ' : ''),
      figure(over.map((row) => row.label).join(', ')),
      prose(pluralise(over.length, ' ha sfondato il limite', ' hanno sfondato il limite')),
    );
  }
  if (near.length > 0) {
    narrative.push(
      prose(over.length > 0 ? '; ' : ''),
      figure(near.map((row) => row.label).join(', ')),
      prose(
        pluralise(
          near.length,
          ' chiuderà al limite se non cambia passo',
          ' chiuderanno al limite se non cambiano passo',
        ),
      ),
    );
  }
  narrative.push(prose('.'));
  return narrative;
}

/**
 * Budget annuali. The pace clause compares the share consumed with the share of the YEAR that
 * has passed — the only comparison that means anything on a twelve-month window — and it is a
 * statement of pace, never a verdict: the status thresholds stay the ones `rowStatus` applies.
 */
export function describeAnnualBudgetsTile(
  rows: BudgetRowSummary[],
  yearElapsedPct: number,
): Narrative | null {
  const expenses = rows.filter((row) => !row.isIncome);
  if (expenses.length === 0) return null;

  const ahead = expenses.filter((row) => row.ratio * 100 > yearElapsedPct);
  if (ahead.length === 0) {
    return [
      prose('Tutti i budget dell’anno sono sotto il '),
      figure(formatPercentage(yearElapsedPct, 0)),
      prose(' di calendario già trascorso.'),
    ];
  }

  const leader = [...ahead].sort((a, b) => b.ratio - a.ratio)[0];
  return [
    figure(leader.label),
    prose(' ha già consumato il '),
    figure(formatPercentage(leader.ratio * 100, 0)),
    prose(' del suo budget con il '),
    figure(formatPercentage(yearElapsedPct, 0)),
    prose(' dell’anno alle spalle.'),
  ];
}

/** The window a budget row is measured over, as its own caption. Never "questa settimana". */
export function budgetWindowLabel(period: 'monthly' | 'annual', monthName: string): string {
  return period === 'annual' ? 'da inizio anno a oggi' : `dal 1° ${monthName} a oggi`;
}
