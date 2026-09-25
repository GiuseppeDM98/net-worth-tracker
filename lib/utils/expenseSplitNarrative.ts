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
  ExpenseSplitSummary,
  MemberBalance,
  SplitBasis,
} from '@/lib/utils/expenseSplitSummary';
// Both from the SDK-free formatters module, never from chartService: this narrative is read by
// the periodic emails too, and chartService would drag the client Firebase SDK into the cron.
import { cachedFormatCurrencyEUR, formatPercentageIt as formatPercentage } from '@/lib/utils/formatters';
import { articleForPercent } from '@/lib/utils/patrimonioNarrative';
import {
  describePeriodSubject,
  describeScheduledHorizon,
  scheduledSentence,
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

/** «Giuseppe e Marcella», «Giuseppe, Marcella e Luca» — the Italian list, never a raw join. */
function joinNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

// ─── The basis ────────────────────────────────────────────────────────────────

/**
 * Labor income the shares could not use, because nobody the settings still know is named on it.
 * Empty when there is none.
 *
 * The spending side has always declared its orphans; until 2026-09-21 the income side — the one
 * that decides the percentages — declared nothing, so a split computed on part of the month's
 * salaries was printed with the confidence of one computed on all of them.
 */
function unattributedSalaryClause(unattributedSalary: number): Narrative {
  if (unattributedSalary <= 0) return [];
  return [
    prose(' Altri '),
    figure(euro(unattributedSalary)),
    prose(' di reddito da lavoro non sono intestati a nessuno e non entrano nelle quote.'),
  ];
}

/**
 * Why there is no split — the EXPLANATION, which belongs to the page verdict.
 *
 * Its imperative twin is `describeBasisRemedy`, which the Quota tile prints: the tile owns the
 * absence, so it owns the instruction, and the two never say the same words in two places
 * (DESIGN.md → **The One-Tile-One-Question Rule**).
 */
export function describeMissingBasis(basis: Extract<SplitBasis, { kind: 'unavailable' }>): Narrative {
  const tail = unattributedSalaryClause(basis.unattributedSalary);
  if (basis.reason === 'not-enough-members') {
    return [prose('Per dividere le spese servono almeno due persone.'), ...tail];
  }
  if (basis.reason === 'no-labor-categories') {
    return [prose('Nessuna categoria conta come reddito da lavoro, quindi non si sa quali entrate siano stipendi.'), ...tail];
  }
  const names = joinNames(basis.missingNames);
  const plural = basis.missingNames.length > 1;
  return [
    prose(
      plural
        ? `In questo periodo non risultano stipendi di ${names}: finché mancano, le quote non si calcolano.`
        : `In questo periodo non risulta lo stipendio di ${names}: finché manca, le quote non si calcolano.`
    ),
    ...tail,
  ];
}

/**
 * What to DO about a missing basis, in the imperative — the Quota tile's reading, because that
 * tile is the one that would have held the shares. Each branch names the exact screen: a reading
 * that states an absence without a destination leaves the reader with nothing to do, and the
 * branch a real household actually hits (`missing-salary`) was the one naming none.
 */
export function describeBasisRemedy(basis: Extract<SplitBasis, { kind: 'unavailable' }>): Narrative {
  if (basis.reason === 'not-enough-members') {
    return [prose('Aggiungi le persone che dividono le spese in Impostazioni → Preferenze → Famiglia.')];
  }
  if (basis.reason === 'no-labor-categories') {
    return [prose('Scegli quali categorie sono reddito da lavoro in Impostazioni → Preferenze → Cashflow.')];
  }
  const names = joinNames(basis.missingNames);
  const plural = basis.missingNames.length > 1;
  return [
    prose(
      plural
        ? `Registra gli stipendi di ${names} in Tracciamento e intestali a chi li ha ricevuti.`
        : `Registra lo stipendio di ${names} in Tracciamento e intestaglielo.`
    ),
  ];
}

/**
 * "Le quote vengono dagli stipendi del periodo: Giuseppe 2600 € (60%) e Marcella 1700 € (40%)."
 * — the Quota tile's reading. It states the base out loud, because a percentage whose origin is
 * invisible is a number the reader has to take on faith.
 */
export function describeSplitBasis(basis: SplitBasis): Narrative {
  if (basis.kind === 'unavailable') return describeBasisRemedy(basis);

  const segments: Narrative = [prose('Le quote vengono dagli stipendi del periodo: ')];
  basis.members.forEach((entry, index) => {
    if (index > 0) segments.push(prose(index === basis.members.length - 1 ? ' e ' : ', '));
    segments.push(
      prose(`${entry.member.name} `),
      figure(euro(entry.salary)),
      prose(' ('),
      figure(formatPercentage(entry.share * 100, 0)),
      prose(')')
    );
  });
  segments.push(prose('.'), ...unattributedSalaryClause(basis.unattributedSalary));
  return segments;
}

// ─── The verdict ──────────────────────────────────────────────────────────────

export interface SplitVerdictInput {
  summary: ExpenseSplitSummary;
  period: Period;
  now: Date;
}

/**
 * Every judgement on this page reads the BOOKED residual, never the whole-period one: a month is
 * called short only on money that has actually left the account. See `MemberBalance.remainingBooked`.
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
    return `${capitalise(inPeriod)} lo stipendio non ${ongoing ? 'basta' : 'è bastato'} a nessuno.`;
  }
  if (shortNames.length > 0) {
    return `${capitalise(inPeriod)} lo stipendio di ${joinNames(shortNames)} non ${ongoing ? 'basta' : 'è bastato'}.`;
  }
  return `${capitalise(inPeriod)} ${ongoing ? 'resta' : 'è restato'} qualcosa a tutti.`;
}

/**
 * "Ad agosto le spese in comune sono 2410 €: 1446 € a Giuseppe (60%) e 964 € a Marcella (40%).
 * A Giuseppe restano 754 € dei 2600 € di stipendio; a Marcella 436 € dei 1700 €."
 *
 * The scheduled clause closes it exactly as on Tracciamento and Analisi, and for the same
 * reason: a running period's pool contains rows that have not been paid yet, and the amount is
 * INSIDE the figure just printed, not beside it.
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
  ];

  if (summary.basis.kind === 'unavailable') {
    sentence.push(prose('. '), ...describeMissingBasis(summary.basis));
  } else {
    sentence.push(prose(': '));
    summary.members.forEach((member, index) => {
      if (index > 0) sentence.push(prose(index === summary.members.length - 1 ? ' e ' : ', '));
      sentence.push(
        figure(euro(member.commonShare ?? 0)),
        prose(` a ${member.member.name} (`),
        figure(formatPercentage((member.share ?? 0) * 100, 0)),
        prose(')')
      );
    });
    sentence.push(prose('.'), ...remainingClause(summary.members));
  }

  sentence.push(...(scheduledSentence(summary.common.scheduled, describeScheduledHorizon(period, now)) ?? []));
  sentence.push(...calendarClause(summary.members));
  return { headline, tone, sentence };
}

/**
 * " A Giuseppe restano 754 € dei 2600 € di stipendio; a Marcella 436 € dei 1700 €."
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
    // The base is named only once: repeating «di stipendio» on every clause reads as a form.
    if (index === 0) {
      segments.push(prose(' dei '), figure(euro(member.salary)), prose(' di stipendio'));
    } else {
      segments.push(prose(' dei '), figure(euro(member.salary)));
    }
  });
  segments.push(prose('.'));
  return segments;
}

/**
 * " Con quelle, a fine periodo a Giuseppe restano 1173 € e a Marcella mancano 83 €." — where the
 * rows still in the calendar take each residual, once `scheduledSentence` has named them.
 *
 * Absent when nothing is scheduled, which is every closed period: then the booked residual IS the
 * period's, and a second sentence repeating it would be a form.
 */
function calendarClause(members: MemberBalance[]): Narrative {
  const moved = members.filter(
    (member) => member.remaining !== null && member.remainingBooked !== null && member.remaining !== member.remainingBooked
  );
  if (moved.length === 0) return [];

  const segments: Narrative = [prose(' Con quelle, a fine periodo ')];
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
 * "47 voci in comune; 3 sono di una persona che non è più in Famiglia." — the common pool's
 * reading. The orphan clause exists so those euros are never silently missing from the split.
 */
export function describeCommonSpending(summary: ExpenseSplitSummary): Narrative {
  const segments: Narrative = [
    figure(String(summary.common.rowCount)),
    prose(summary.common.rowCount === 1 ? ' voce in comune' : ' voci in comune'),
  ];
  if (summary.unassigned.rowCount > 0) {
    segments.push(
      prose('; altre '),
      figure(String(summary.unassigned.rowCount)),
      prose(' per '),
      figure(euro(summary.unassigned.total)),
      prose(" sono di qualcuno che non è più in Famiglia, e restano fuori dalla divisione")
    );
  }
  segments.push(prose('.'));
  return segments;
}

/**
 * "1446 € di spese in comune, 320 € di spese personali: dai 2600 € di stipendio restano 834 €."
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
    figure(euro(balance.salary)),
    prose(' di stipendio '),
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
 * "Il 34% di quel che ha guadagnato" — how much of their salary the month took, under the
 * person's own figure. Null when there is no salary to measure against: a share of zero is a
 * division by zero, not a 0%.
 */
export function describeSalaryConsumed(balance: MemberBalance): Narrative | null {
  if (balance.salary <= 0 || balance.commonShare === null) return null;
  const consumedShare = (balance.commonShare + balance.personalSpending) / balance.salary;
  return [prose('Se ne va '), ...percentWithArticle(consumedShare), prose(' dello stipendio.')];
}

/**
 * "60% · 40%" — the Quota tile's aside, the split at a glance beside its own reading. Null when
 * there is nothing to show: an aside that printed «—» would suggest a figure exists.
 */
export function describeSplitAside(summary: ExpenseSplitSummary): Narrative | null {
  if (summary.basis.kind === 'unavailable') return null;
  return [figure(summary.basis.members.map((entry) => formatPercentage(entry.share * 100, 0)).join(' · '))];
}
