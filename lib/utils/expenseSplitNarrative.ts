/**
 * The words of Cashflow › Divisione: the verdict that answers «quanto è costato in comune, e
 * quanto resta a ciascuno?» before any number, and the one-line reading under each tile.
 *
 * Every function is pure and returns a `Narrative`, so the component sets figures in Geist Mono
 * and colours them by sign while the prose stays prose; no component writes copy, and every
 * phrasing is pinned by a test.
 *
 * The Narrative Honesty Rule does the heavy lifting on this page, because the split has a real
 * failure mode. When `SplitBasis` is `unavailable` the sentences do not fall back to a plausible
 * percentage: they name the input that is missing and say which figures are therefore absent.
 * A page that guessed 50/50 in that state would be inventing an agreement between two people.
 *
 * Italian grammar is data here as everywhere else: the article follows the percentage AS
 * PRINTED (`articleForPercent`), and the tense follows whether the period is still running.
 */

import type { Narrative, NarrativeSegment, PageVerdictModel, VerdictTone } from '@/lib/utils/narrative';
import type { Period } from '@/lib/utils/period';
import type {
  CommonSpending,
  ExpenseSplitSummary,
  MemberBalance,
  SplitBasis,
} from '@/lib/utils/expenseSplitSummary';
import { SPLIT_SECTION_IDS, splitMemberSectionId } from '@/lib/utils/expenseSplitSummary';
import type { RowAnswerMap } from '@/components/ui/row-answers';
// Both from the SDK-free formatters module, never from chartService: this narrative is read by
// the periodic emails too, and chartService would drag the client Firebase SDK into the cron.
import { cachedFormatCurrencyEUR, formatEuroMinus, formatPercentageIt as formatPercentage } from '@/lib/utils/formatters';
import { articleForPercent } from '@/lib/utils/patrimonioNarrative';
import {
  describePeriodSubject,
  describeScheduledHorizon,
  scheduledScope,
} from '@/lib/utils/cashflowNarrative';

// ─── Segment helpers ──────────────────────────────────────────────────────────

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });
const signed = (text: string, sign: 'positive' | 'negative'): NarrativeSegment => ({ text, mono: true, sign });

/** A whole euro figure, compact — the verdict and the readings never need cents. */
const euro = (value: number) => cachedFormatCurrencyEUR(Math.abs(value), true);

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "il 60%", "l'8%", "lo 0%" — the printed integer decides the article. */
function percentWithArticle(share: number): NarrativeSegment[] {
  const percent = share * 100;
  return [prose(articleForPercent(percent, 0)), figure(formatPercentage(percent, 0))];
}

/** «Paolo e Elena», «Paolo, Elena e Luca» — the Italian list, never a raw join. */
function joinNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

// ─── The basis ────────────────────────────────────────────────────────────────

/**
 * Income the shares could not use, because it was left «in comune». Empty when there is none.
 *
 * The spending side has always declared its orphans; until 2026-09-21 the income side — the one
 * that decides the percentages — declared nothing, so a split computed on part of the month's
 * income was printed with the confidence of one computed on all of it. What that income DOES
 * (it pays the pool first) is the «In comune» tile's fact, said there and not here.
 */
function unattributedIncomeClause(unattributedIncome: number): Narrative {
  if (unattributedIncome <= 0) return [];
  return [prose(' Altri '), figure(euro(unattributedIncome)), prose(' di entrate sono in comune e non entrano nelle quote.')];
}

/**
 * Why there is no split — the EXPLANATION, which belongs to the page verdict.
 *
 * Its imperative twin is `describeBasisRemedy`, which the Quota tile prints: the tile owns the
 * absence, so it owns the instruction, and the two never say the same words in two places
 * (DESIGN.md → **The One-Tile-One-Question Rule**).
 */
export function describeMissingBasis(basis: Extract<SplitBasis, { kind: 'unavailable' }>): Narrative {
  const tail = unattributedIncomeClause(basis.unattributedIncome);
  if (basis.reason === 'not-enough-members') {
    return [prose('Per dividere le spese servono almeno due persone.'), ...tail];
  }
  return [
    prose(`In questo periodo non risultano entrate di ${joinNames(basis.missingNames)}: finché mancano, le quote non si calcolano.`),
    ...tail,
  ];
}

/**
 * What to DO about a missing basis, in the imperative — the Quota tile's reading, because that
 * tile is the one that would have held the shares. Each branch names the exact screen: a reading
 * that states an absence without a destination leaves the reader with nothing to do, and the
 * branch a real household actually hits (`missing-income`) was the one naming none.
 */
export function describeBasisRemedy(basis: Extract<SplitBasis, { kind: 'unavailable' }>): Narrative {
  if (basis.reason === 'not-enough-members') {
    return [prose('Aggiungi le persone che dividono le spese in Impostazioni → Preferenze → Famiglia.')];
  }
  const names = joinNames(basis.missingNames);
  const plural = basis.missingNames.length > 1;
  return [
    prose(
      plural
        ? `Registra le entrate di ${names} in Tracciamento e intestale a chi le ha ricevute.`
        : `Registra le entrate di ${names} in Tracciamento e intestagliele.`
    ),
  ];
}

/**
 * "Le quote vengono dalle entrate del periodo: Paolo 2600 € (60%) e Elena 1700 € (40%)."
 * — the Quota tile's reading. It states the base out loud, because a percentage whose origin is
 * invisible is a number the reader has to take on faith. «Entrate», not «stipendi», since
 * 2026-09-27: every income attributed to a person is in the base, whatever its category.
 */
export function describeSplitBasis(basis: SplitBasis): Narrative {
  if (basis.kind === 'unavailable') return describeBasisRemedy(basis);

  const segments: Narrative = [prose('Le quote vengono dalle entrate del periodo: ')];
  basis.members.forEach((entry, index) => {
    if (index > 0) segments.push(prose(index === basis.members.length - 1 ? ' e ' : ', '));
    segments.push(
      prose(`${entry.member.name} `),
      figure(euro(entry.income)),
      prose(' ('),
      figure(formatPercentage(entry.share * 100, 0)),
      prose(')')
    );
  });
  segments.push(prose('.'), ...unattributedIncomeClause(basis.unattributedIncome));
  return segments;
}

// ─── The verdict ──────────────────────────────────────────────────────────────

export interface SplitVerdictInput {
  summary: ExpenseSplitSummary;
  period: Period;
  now: Date;
}

/** The label of «Il perché» on a phone: what the hidden half of the verdict is about (2026-10-12). */
export const SPLIT_REST_LABEL = 'quanto resta a ciascuno';

/**
 * A person's booked residual as their tile prints it at 32px: the compact euro with the «−»
 * U+2212 on a deficit (The Comma Rule; `Intl` writes the hyphen-minus), unsigned when it prints
 * as zero («0 €» for −0,3: a printed zero takes no sign, since 2026-10-12 — until then the sign was decided on the
 * value and the tile printed «−0 €» against the cell's «0 €»). At every width since 2026-10-12
 * (doc/guide/cashflow-divisione.md), so the strip's cell — `formatStripFigure`, which
 * decides the sign the same way — prints exactly what the tile prints.
 */
export function formatBookedResidual(value: number): string {
  return formatEuroMinus(value);
}

/** What the closed rows of Divisione say beside their eyebrow (The Closed-Row Rule): words, never a figure. */
export const SPLIT_CLOSED_ASIDES = { quota: 'dalle entrate', member: 'quanto resta' } as const;

/**
 * The scope line of Divisione's verdict (DESIGN.md → The Binding-Clause Rule): «Nel totale ci
 * sono ancora 300 € di spese già in calendario da qui a fine mese.» — the part of the common pool
 * (and of the common income) dated after today, INSIDE the total the first sentence prints. Until
 * 2026-10-12 it was a sentence of the verdict itself; as the `scope` it is rendered at
 * every width by `PageVerdict`, and the sentence no longer carries it. `null` with nothing ahead.
 */
export function describeSplitScope(summary: ExpenseSplitSummary, period: Period, now: Date): Narrative | null {
  return scheduledScope(summary.common.scheduled, describeScheduledHorizon(period, now));
}

/**
 * Every judgement on this page reads the BOOKED residual, never the whole-period one: a month is
 * called short only on money that has actually left the account. See `MemberBalance.remainingBooked`.
 * The headline says «le entrate» since 2026-09-27, because the base is every income attributed
 * to the person, not the salary alone.
 */
function bookedResiduals(summary: ExpenseSplitSummary): number[] {
  return summary.members
    .map((member) => member.remainingBooked)
    .filter((value): value is number => value !== null);
}

/** True when the period holds no spending at all — neither shared nor anybody's own. */
function hasNothingToSplit(summary: ExpenseSplitSummary): boolean {
  return summary.common.total <= 0 && summary.members.every((member) => member.personalSpending <= 0);
}

function resolveTone(summary: ExpenseSplitSummary): VerdictTone {
  if (summary.basis.kind === 'unavailable') return 'neutral';
  const residuals = bookedResiduals(summary);
  if (residuals.length === 0) return 'neutral';
  if (residuals.some((value) => value < 0)) return 'negative';
  return 'positive';
}

function resolveHeadline(summary: ExpenseSplitSummary, inPeriod: string, ongoing: boolean): string {
  // A period with nothing in it is not a period whose shares failed: it has nothing to share.
  // Until 2026-09-21 the headline said «le quote non si possono calcolare» over a sentence that
  // said «non c'è nessuna spesa da dividere» — two different explanations of one empty screen,
  // and the first of them sent the reader looking for data to fix.
  if (hasNothingToSplit(summary)) {
    return `${capitalise(inPeriod)} non c'è niente da dividere.`;
  }
  if (summary.basis.kind === 'unavailable') {
    return `${capitalise(inPeriod)} le quote non si possono calcolare.`;
  }
  const shortNames = summary.members
    .filter((member) => member.remainingBooked !== null && member.remainingBooked < 0)
    .map((member) => member.member.name);
  if (shortNames.length === summary.members.length) {
    return `${capitalise(inPeriod)} le entrate non ${ongoing ? 'bastano' : 'sono bastate'} a nessuno.`;
  }
  if (shortNames.length > 0) {
    return `${capitalise(inPeriod)} le entrate di ${joinNames(shortNames)} non ${ongoing ? 'bastano' : 'sono bastate'}.`;
  }
  return `${capitalise(inPeriod)} ${ongoing ? 'resta' : 'è restato'} qualcosa a tutti.`;
}

/**
 * ", meno 300 € di entrate in comune: 2110 € da dividere" — what the income left «in comune» did
 * to the pool, right after the gross has been printed; or ", coperte per intero dai 1300 € di
 * entrate in comune: non c'è niente da dividere, e avanzano 300 €" when it covered the lot.
 * Empty when no income was left in comune: then the gross IS the pool and the shares follow it
 * as they always did.
 *
 * The order — gross, what came off, what was divided — is the point: the shares printed after
 * it are visibly shares of the NET, and the surplus is said as a surplus, never handed out.
 */
function poolClause(common: CommonSpending): Narrative {
  if (common.income <= 0) return [];
  if (common.toSplit > 0) {
    return [
      prose(', meno '),
      figure(euro(common.income)),
      prose(' di entrate in comune: '),
      figure(euro(common.toSplit)),
      prose(' da dividere'),
    ];
  }
  const segments: Narrative = [
    prose(', coperte per intero dai '),
    figure(euro(common.income)),
    prose(" di entrate in comune: non c'è niente da dividere"),
  ];
  if (common.surplus > 0) segments.push(prose(', e avanzano '), figure(euro(common.surplus)));
  return segments;
}

/**
 * "Ad agosto le spese in comune sono 2410 €, meno 300 € di entrate in comune: 2110 € da
 * dividere, 1266 € a Paolo (60%) e 844 € a Elena (40%). A Paolo restano 754 € dei
 * 2600 € di entrate; a Elena 436 € dei 1700 €." — without the income clause when nothing
 * was left in comune.
 *
 * The scheduled part of the pool is the verdict's `scope` since 2026-10-12 (`describeSplitScope`,
 * The Binding-Clause Rule): a running period's pool contains rows that have not been paid yet,
 * and the caption says the amount is INSIDE the figure just printed, under the cells on a phone
 * and under the paragraph at 1440 — the sentence itself no longer carries it.
 *
 * Where a phone cuts it: the first sentence (the gross, what the common income took off, the
 * shares — the shares are shares of the NET, and the clause is what says so) stands under the
 * title; «quanto resta a ciascuno» — the residuals and where the calendar takes them — goes behind
 * «Il perché». No cut without a residual to hide: a basis that cannot be computed explains itself
 * in one breath.
 */
export function buildSplitVerdict({ summary, period, now }: SplitVerdictInput): PageVerdictModel {
  const subject = describePeriodSubject(period, now);
  const tone = resolveTone(summary);
  const headline = resolveHeadline(summary, subject.inPeriod, subject.ongoing);
  const opening = capitalise(subject.inPeriod);

  if (hasNothingToSplit(summary)) {
    return { headline, tone, sentence: [prose(`${opening} non risulta nessuna spesa, né in comune né personale.`)] };
  }

  const sentence: Narrative = [
    prose(`${opening} le spese in comune ${subject.ongoing ? 'sono' : 'sono state'} `),
    figure(euro(summary.common.total)),
    ...poolClause(summary.common),
  ];

  if (summary.basis.kind === 'unavailable') {
    sentence.push(prose('. '), ...describeMissingBasis(summary.basis));
    return { headline, tone, sentence };
  }

  // Over a pool the common income covered whole there is no share to name: a percentage of
  // zero would be a form.
  const covered = summary.common.income > 0 && summary.common.toSplit <= 0;
  if (!covered) {
    sentence.push(prose(summary.common.income > 0 ? ', ' : ': '));
    summary.members.forEach((member, index) => {
      if (index > 0) sentence.push(prose(index === summary.members.length - 1 ? ' e ' : ', '));
      sentence.push(
        figure(euro(member.commonShare ?? 0)),
        prose(` a ${member.member.name} (`),
        figure(formatPercentage((member.share ?? 0) * 100, 0)),
        prose(')')
      );
    });
  }
  sentence.push(prose('.'));
  const leadLength = sentence.length;
  const rest: Narrative = [...remainingClause(summary.members), ...calendarClause(summary.members)];
  if (rest.length === 0) return { headline, tone, sentence };
  return { headline, tone, sentence: [...sentence, ...rest], leadLength, restLabel: SPLIT_REST_LABEL };
}

/**
 * " A Paolo restano 754 € dei 2600 € di entrate; a Elena 436 € dei 1700 €."
 *
 * On the BOOKED residual — what has already happened. Where the calendar takes it is
 * `calendarClause`, a separate sentence, because the two are different facts.
 */
function remainingClause(members: MemberBalance[]): Narrative {
  const withResidual = members.filter((member) => member.remainingBooked !== null);
  if (withResidual.length === 0) return [];

  const segments: Narrative = [prose(' ')];
  withResidual.forEach((member, index) => {
    const remaining = member.remainingBooked!;
    const short = remaining < 0;
    segments.push(
      prose(index === 0 ? `A ${member.member.name} ` : `; a ${member.member.name} `),
      prose(short ? 'mancano ' : 'restano '),
      signed(euro(remaining), short ? 'negative' : 'positive')
    );
    // The base is named only once: repeating «di entrate» on every clause reads as a form.
    if (index === 0) {
      segments.push(prose(' dei '), figure(euro(member.income)), prose(' di entrate'));
    } else {
      segments.push(prose(' dei '), figure(euro(member.income)));
    }
  });
  segments.push(prose('.'));
  return segments;
}

/**
 * " Con le spese in calendario, a fine periodo a Paolo restano 1173 € e a Elena mancano
 * 83 €." — where the rows still in the calendar take each residual. It names them itself since
 * 2026-10-12: until then it opened on «Con quelle», whose antecedent was the scheduled
 * sentence just before it — now the verdict's `scope`, out of the sentence (The Binding-Clause Rule).
 *
 * Absent when nothing is scheduled, which is every closed period: then the booked residual IS the
 * period's, and a second sentence repeating it would be a form.
 */
function calendarClause(members: MemberBalance[]): Narrative {
  const moved = members.filter(
    (member) => member.remaining !== null && member.remainingBooked !== null && member.remaining !== member.remainingBooked
  );
  if (moved.length === 0) return [];

  const segments: Narrative = [prose(' Con le spese in calendario, a fine periodo ')];
  moved.forEach((member, index) => {
    const remaining = member.remaining!;
    const short = remaining < 0;
    if (index > 0) segments.push(prose(index === moved.length - 1 ? ' e ' : ', '));
    segments.push(
      prose(`a ${member.member.name} `),
      prose(short ? 'mancano ' : 'restano '),
      signed(euro(remaining), short ? 'negative' : 'positive')
    );
  });
  segments.push(prose('.'));
  return segments;
}

// ─── Tile readings ────────────────────────────────────────────────────────────

/**
 * "47 voci in comune; 2 entrate in comune per 300 € riducono quel che c'è da dividere; altre 3
 * per 250 € sono di qualcuno che non è più in Famiglia, e restano fuori dalla divisione." — the
 * common pool's reading: the spending rows, the income rows and what they did to the pool, and
 * the orphans. The orphan clause exists so those euros are never silently missing from the
 * split; since 2026-09-27 it covers the income rows too, because an income whose owner has left
 * is somebody's and reduces nothing.
 */
export function describeCommonSpending(summary: ExpenseSplitSummary): Narrative {
  const { common, unassigned } = summary;
  const segments: Narrative = [
    figure(String(common.rowCount)),
    prose(common.rowCount === 1 ? ' voce in comune' : ' voci in comune'),
  ];

  if (common.incomeRowCount > 0) {
    const one = common.incomeRowCount === 1;
    segments.push(
      prose('; '),
      figure(String(common.incomeRowCount)),
      prose(one ? ' entrata in comune per ' : ' entrate in comune per '),
      figure(euro(common.income)),
      prose(
        common.toSplit > 0
          ? one ? " riduce quel che c'è da dividere" : " riducono quel che c'è da dividere"
          : one ? ' le copre per intero' : ' le coprono per intero'
      )
    );
  }

  const orphans: Narrative[] = [];
  if (unassigned.rowCount > 0) {
    orphans.push(
      unassigned.rowCount === 1
        ? [prose("un'altra per "), figure(euro(unassigned.total))]
        : [prose('altre '), figure(String(unassigned.rowCount)), prose(' per '), figure(euro(unassigned.total))]
    );
  }
  if (unassigned.incomeRowCount > 0) {
    orphans.push([
      figure(String(unassigned.incomeRowCount)),
      prose(unassigned.incomeRowCount === 1 ? ' entrata per ' : ' entrate per '),
      figure(euro(unassigned.income)),
    ]);
  }
  if (orphans.length > 0) {
    segments.push(prose('; '));
    orphans.forEach((part, index) => {
      if (index > 0) segments.push(prose(' e '));
      segments.push(...part);
    });
    // The verb agrees with how many rows are orphaned, across both kinds.
    const plural = unassigned.rowCount + unassigned.incomeRowCount > 1;
    segments.push(
      prose(
        plural
          ? ' sono di qualcuno che non è più in Famiglia, e restano fuori dalla divisione'
          : ' è di qualcuno che non è più in Famiglia, e resta fuori dalla divisione'
      )
    );
  }
  segments.push(prose('.'));
  return segments;
}

/**
 * "Spese in comune 2410 €, meno 300 € di entrate in comune: 2110 € da dividere." — the pool in
 * one tense-free line, for a surface with no hero to hang the two figures on (the monthly
 * email). Null when no income was left in comune: then the line would only repeat the total.
 */
export function describeCommonIncome(summary: ExpenseSplitSummary): Narrative | null {
  if (summary.common.income <= 0) return null;
  return [prose('Spese in comune '), figure(euro(summary.common.total)), ...poolClause(summary.common), prose('.')];
}

/**
 * "1446 € di spese in comune, 320 € di spese personali: dai 2600 € di entrate restano 834 €."
 * — one person's tile, in the owner's own phrasing. This is the sentence the page exists for.
 */
export function describeMemberBalance(balance: MemberBalance): Narrative {
  if (balance.share === null || balance.commonShare === null || balance.remainingBooked === null) {
    const segments: Narrative = [
      prose('Spese personali '),
      figure(euro(balance.personalSpending)),
      prose('. Senza le quote non si sa quanto resta.'),
    ];
    return segments;
  }

  const short = balance.remainingBooked < 0;
  return [
    figure(euro(balance.commonShare)),
    prose(' di spese in comune ('),
    ...percentWithArticle(balance.share),
    prose('), '),
    figure(euro(balance.personalSpending)),
    prose(' di spese personali: dai '),
    figure(euro(balance.income)),
    prose(' di entrate '),
    prose(short ? 'mancano ' : 'restano '),
    signed(euro(balance.remainingBooked), short ? 'negative' : 'positive'),
    prose('.'),
  ];
}

/**
 * "Con le spese ancora in calendario resta 1173 €." — under a person's figure, where the month
 * takes their residual once what is only scheduled is paid.
 *
 * Null when nothing of theirs is scheduled, because then the figure above already is the whole
 * period's. This is the clause that stops a deficit made entirely of unpaid bills from reading
 * as money already gone (2026-09-21).
 */
export function describeMemberCalendar(balance: MemberBalance): Narrative | null {
  if (balance.remaining === null || balance.remainingBooked === null) return null;
  if (balance.remaining === balance.remainingBooked) return null;
  const short = balance.remaining < 0;
  return [
    prose('Con le spese ancora in calendario '),
    prose(short ? 'mancano ' : 'restano '),
    signed(euro(balance.remaining), short ? 'negative' : 'positive'),
    prose('.'),
  ];
}

/**
 * "Se ne va il 34% delle entrate." — how much of their income the month took, under the
 * person's own figure. Null when there is no income to measure against: a share of zero is a
 * division by zero, not a 0%.
 */
export function describeIncomeConsumed(balance: MemberBalance): Narrative | null {
  const consumedShare = incomeConsumedShare(balance);
  if (consumedShare === null) return null;
  return [prose('Se ne va '), ...percentWithArticle(consumedShare), prose(' delle entrate.')];
}

/**
 * The share of a person's income the period took — their part of the common pool plus their own
 * spending — as a ratio (0,44); null without income or without a basis. One source for the tile's
 * line and the closed row's answer (2026-10-16).
 */
export function incomeConsumedShare(balance: MemberBalance): number | null {
  if (balance.income <= 0 || balance.commonShare === null) return null;
  return (balance.commonShare + balance.personalSpending) / balance.income;
}

/**
 * "60% · 40%" — the Quota tile's aside, the split at a glance beside its own reading. Null when
 * there is nothing to show: an aside that printed «—» would suggest a figure exists.
 */
export function describeSplitAside(summary: ExpenseSplitSummary): Narrative | null {
  if (summary.basis.kind === 'unavailable') return null;
  return [figure(summary.basis.members.map((entry) => formatPercentage(entry.share * 100, 0)).join(' · '))];
}

// ─── The closed rows' answers (2026-10-16) ────────────────────────────────────

/**
 * What Divisione's closed rows answer in the landscape index (components/ui/row-answers.tsx). Each
 * person: «se ne va il 44%», the share of their income the period took, as the tile's line under the
 * hero prints it — neither the residual (the strip's) nor the share of the pool (the verdict's
 * first sentence); the article is its own segment, which the index binds to the figure when elided
 * («se ne va l'80%»). Above 100% it prints as it is, like the tile. Null without income or
 * basis, where «quanto resta» stays. Quota keeps its scope: the shares are the first sentence's,
 * and every other figure of the tile is one per person, not the row's answer.
 */
export function describeSplitClosedAnswers(summary: ExpenseSplitSummary): RowAnswerMap {
  const answers: Record<string, Narrative | null> = { [SPLIT_SECTION_IDS.quota]: null };
  for (const balance of summary.members) {
    const share = incomeConsumedShare(balance);
    answers[splitMemberSectionId(balance.member.id)] =
      share === null ? null : [prose('se ne va'), prose(articleForPercent(share * 100, 0).trim()), figure(formatPercentage(share * 100, 0))];
  }
  return answers;
}
