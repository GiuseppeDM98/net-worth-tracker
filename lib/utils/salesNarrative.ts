/**
 * The words for a period's sales and for the market-vs-flows split — shared by the Panoramica,
 * Patrimonio and the periodic email, so the three say the same thing about the same trade.
 *
 * SDK-free: formatters from `lib/utils/formatters`, never from `chartService` (the email Lambda
 * imports this — AGENTS.md → Italian Localization).
 */

import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { isMaterialAmount, isMaterialSalesTax, type DeclineCause, type PeriodSalesSummary, type TaxedGrowth } from '@/lib/utils/periodSales';
import type { DebtRepayment, MonthFlows } from '@/lib/utils/marketEffect';
import type { Narrative, NarrativeSegment } from '@/lib/utils/narrative';
import { isPrintedZero } from '@/lib/utils/verdictStrip';

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });

/**
 * Signed compact euro figure with a typographic minus, coloured by sign — unless it prints as a
 * zero: «0 € risparmiati» takes no sign and no colour, like every printed zero of the page
 * (`isPrintedZero`, AGENTS.md § Layout and Color Tokens; here since 2026-10-11, when the
 * retirement of the Panoramica's composition found «+0 €» still printed by this helper).
 */
function signedCompactEuro(value: number): NarrativeSegment {
  const unsigned = cachedFormatCurrencyEUR(Math.abs(value), true);
  if (isPrintedZero(unsigned)) return { text: unsigned, mono: true };
  const negative = value < 0;
  return { text: `${negative ? '−' : '+'}${unsigned}`, mono: true, sign: negative ? 'negative' : 'positive' };
}

/**
 * The clauses a phone must never hide behind a tap (DESIGN.md → The
 * Binding-Clause Rule; since 2026-10-11): the tax paid on a sale and the month without it change the
 * meaning of the variation already printed, so each of their segments is `binding` and
 * `splitVerdict` cancels any cut that would leave them in the rest. The proceeds, the gain, a loss
 * and a missing rate are facts beside the figure, not readings of it: they stay plain. The email
 * ignores the flag (it has no cut); Patrimonio's verdict reads it too since 2026-10-14.
 */
const binding = (segments: Narrative): Narrative => segments.map((segment) => ({ ...segment, binding: true }));

/** «sulla vendita di ORNI» when the period sold exactly one instrument, «sulle vendite» otherwise. */
function taxObject(sales?: PeriodSalesSummary | null): string {
  const instruments = sales?.instruments ?? [];
  return instruments.length === 1 ? `sulla vendita di ${instruments[0].name}` : 'sulle vendite';
}

/**
 * The tail of a falling headline, after «{subject} è in calo». Empty for `unknown`. The
 * `taxes-despite-market` tail names the instrument sold («per le tasse sulla vendita di ORNI, non
 * per il mercato») when the period's sales carry exactly one, «sulle vendite» otherwise — the
 * headline is the ONE place the cause is stated, so it must say which sale.
 */
export function declineHeadlineTail(cause: DeclineCause, sales?: PeriodSalesSummary | null): string {
  switch (cause) {
    case 'taxes-despite-market':
      return ` per le tasse ${taxObject(sales)}, non per il mercato.`;
    case 'despite-market':
      return ', nonostante il mercato.';
    case 'taxes-over-market':
      return ': il mercato ha pesato, le tasse sulle vendite di più.';
    case 'market-and-taxes':
      return ': il mercato ha pesato, e con lui le tasse sulle vendite.';
    case 'flows-over-market':
      return ': più per le uscite che per il mercato.';
    case 'market':
      return ': il mercato ha pesato.';
    case 'unknown':
      return '.';
  }
}

/**
 * The headline of a period the tax kept from growing (`resolveTaxedGrowth`): «Settembre è in pari:
 * le tasse sulla vendita di ORNI si sono prese la crescita.» / «Il portafoglio cresce, ma le tasse
 * sulle vendite si sono prese più di metà della crescita.» `grew` is the caller's verb for a
 * visible growth («cresce» on the pages, «è cresciuto» in the email, which speaks of a closed period).
 */
export function taxedGrowthHeadline(
  subject: string,
  kind: TaxedGrowth,
  sales: PeriodSalesSummary | null | undefined,
  grew = 'cresce',
): string {
  const tax = `le tasse ${taxObject(sales)}`;
  return kind === 'flat'
    ? `${subject} è in pari: ${tax} si sono prese la crescita.`
    : `${subject} ${grew}, ma ${tax} si sono prese più di metà della crescita.`;
}

/**
 * A month's change and the halves it is read against: the market (the price effect, the
 * month's traded quotes included) and the savings ALREADY made (income − expenses dated up to
 * today; null when the cashflow is not known, and then no part claims to be savings).
 */
export interface MonthSplit {
  delta: number;
  marketEffect: number;
  savings: number | null;
  /**
   * The user's money that moved outside the cashflow — the pension contributions and the debts
   * repaid — each named as its own part; absent on a payload that predates it, and then those
   * euro stay in «altre variazioni» as before.
   */
  flows?: MonthFlows | null;
}

/**
 * Whether «altre variazioni» is worth a clause in a sentence. The residual is the gap between the
 * balances typed by hand and the cashflow rows — mostly TIMING: a credit-card expense is in the
 * cashflow the day it is made and leaves the account the month after, so the residual swings one
 * month and gives it back the next (owner, 2026-09-19: settembre 2026's +150 € was card spending
 * not yet debited, a debt balance corrected by hand and a 3,64 € gap on the estimated tax). Under
 * max(100 €, 5% of the change) it is noise, not a cause: the sentence drops it, the figure stays
 * in the rows and tooltips that list every part. Shared by the Panoramica, Patrimonio and Storico.
 */
export function isMaterialOtherChange(other: number, total: number): boolean {
  return isMaterialAmount(other, total);
}

/**
 * A signed euro figure WITHOUT a sign colour: the user's own money moving (a contribution, a debt
 * repaid) is a flow, not a gain or a loss — Storico prints its flows the same way (owner,
 * 2026-10-14). A printed zero is unsigned.
 */
function signedCompactFlow(value: number): NarrativeSegment {
  const { text, mono } = signedCompactEuro(value);
  return { text, mono };
}

const printsAsZero = (value: number) => isPrintedZero(cachedFormatCurrencyEUR(Math.abs(value), true));

/** The principal repaid over every debt; negative when the debt went up. */
export function debtRepaidTotal(debts: DebtRepayment[]): number {
  return debts.reduce((sum, debt) => sum + debt.repaid, 0);
}

/**
 * « (Mutuo +300 €, Prestito auto +150 €)» — the debts behind a total by the names of their assets
 * (owner, 2026-10-14), « (Mutuo)» alone with one. The names take no article: they are typed by the
 * user. A debt that prints as zero is not listed; empty when none is left. Shared with the email.
 */
export function describeDebtNames(debts: DebtRepayment[]): Narrative {
  const named = debts.filter((debt) => !printsAsZero(debt.repaid));
  if (named.length === 0) return [];
  if (named.length === 1) return [prose(` (${named[0].name})`)];
  const list: Narrative = [prose(' (')];
  named.forEach((debt, index) => {
    list.push(prose(`${index > 0 ? ', ' : ''}${debt.name} `), signedCompactFlow(debt.repaid));
  });
  list.push(prose(')'));
  return list;
}

/**
 * «+450 € di debito rimborsato (Mutuo +300 €, Prestito auto +150 €)»; «−20.000 € di nuovo debito
 * (Prestito auto)» when the total went up. Empty when the total prints as zero.
 */
function debtPart(debts: DebtRepayment[]): Narrative {
  const total = debtRepaidTotal(debts);
  if (printsAsZero(total)) return [];
  return [signedCompactFlow(total), prose(total > 0 ? ' di debito rimborsato' : ' di nuovo debito'), ...describeDebtNames(debts)];
}

/** Two parts read «A e B», three or more «A, B, C» — the split's punctuation since 2026-09-19. */
function joinParts(parts: Narrative[]): Narrative {
  const separator = parts.length === 2 ? ' e ' : ', ';
  return parts.flatMap((part, index) => (index > 0 ? [prose(separator), ...part] : part));
}

/**
 * «+2018 € dal mercato, +2095 € risparmiati, +300 € di debito rimborsato (Mutuo), +1792 € versati
 * nel fondo pensione, +100 € di altre variazioni» — `total` split into the market, the savings,
 * the money the user moved outside the cashflow (`flows`, each part only when it does not print as
 * zero) and the exact residual (interest, balances corrected by hand, hand-valued holdings,
 * expenses not recorded). The residual has its own NAME because «dai tuoi movimenti», the one
 * bucket it used to share with the savings, was read as income − expenses (owner, 2026-09-19);
 * the flows have theirs because a month's TFR and voluntary contributions read as «+1792 € di
 * altre variazioni», a figure that looked like an error (owner, 2026-10-14). The residual is
 * dropped below `isMaterialOtherChange`, so the named parts may not add up to `total` by a few
 * euro. Without the savings the last part says what it holds.
 */
function monthSplitParts(total: number, split: Omit<MonthSplit, 'delta'>): Narrative {
  const parts: Narrative[] = [[signedCompactEuro(split.marketEffect), prose(' dal mercato')]];
  const debts = split.flows?.debts ?? [];
  const debtTotal = debtRepaidTotal(debts);
  const pensionPaidIn = split.flows?.pensionPaidIn ?? 0;
  const flowParts: Narrative[] = [];
  const debt = debtPart(debts);
  if (debt.length > 0) flowParts.push(debt);
  if (!printsAsZero(pensionPaidIn)) flowParts.push([signedCompactFlow(pensionPaidIn), prose(' versati nel fondo pensione')]);
  const rest = total - split.marketEffect - debtTotal - pensionPaidIn;

  if (split.savings === null) {
    return joinParts([...parts, ...flowParts, [signedCompactEuro(rest), prose(' tra risparmio e altre variazioni')]]);
  }
  // The word follows the PRINTED sign: «−0,2 €» prints as an unsigned «0 €», and a zero is «risparmiati».
  const savedFigure = signedCompactEuro(split.savings);
  parts.push([savedFigure, prose(savedFigure.sign === 'negative' ? ' spesi oltre le entrate' : ' risparmiati')]);
  parts.push(...flowParts);
  const other = rest - split.savings;
  if (isMaterialOtherChange(other, total)) parts.push([signedCompactEuro(other), prose(' di altre variazioni')]);
  return joinParts(parts);
}

/**
 * «Di quel movimento: +3980 € dal mercato, +1180 € risparmiati, −1040 € di altre variazioni.» —
 * the month's change in the words the taxed sale's counterfactual uses. Exact by construction.
 */
export function describeMonthSplit(split: MonthSplit): Narrative {
  return [prose('Di quel movimento: '), ...monthSplitParts(split.delta, split), prose('.')];
}

/** «Ornitorinco World» for one instrument, «3 strumenti» for more. */
function salesSubject(sales: PeriodSalesSummary): NarrativeSegment[] {
  if (sales.instruments.length === 1) return [prose(sales.instruments[0].name)];
  return [figure(String(sales.instruments.length)), prose(' strumenti')];
}

/**
 * «Hai venduto Ornitorinco World per 40.000 € con una plusvalenza di 16.000 € e pagato
 * circa 4000 € di tasse.» The tax is the broker's withholding, already gone at the sale (regime
 * amministrato), so the verb is «pagato», not «pagherai»; «circa» because it is estimated from the
 * instrument's rate. A loss carries no tax; a missing rate says so instead of printing zero.
 *
 * With `split` and a tax, the sentence closes on the month WITHOUT it — «: senza, il mese avrebbe
 * fatto +4200 € (+2000 € dal mercato, +1800 € risparmiati, +400 € di altre variazioni).» — and
 * replaces `describeMonthSplit`, whose parts would mix the tax back in (−1300 € «dai tuoi
 * movimenti» on a lived month, a figure nobody could read). The parts sum to
 * Δ + tax by construction, but for an immaterial «altre variazioni» (`isMaterialOtherChange`).
 */
export function describeSales(sales: PeriodSalesSummary, split?: MonthSplit): Narrative {
  const narrative: Narrative = [
    prose('Hai venduto '),
    ...salesSubject(sales),
    prose(' per '),
    figure(cachedFormatCurrencyEUR(sales.proceeds, true)),
  ];

  if (sales.realizedGain <= 0) {
    narrative.push(
      prose(' con una minusvalenza di '),
      figure(cachedFormatCurrencyEUR(Math.abs(sales.realizedGain), true)),
      prose(', senza tasse.'),
    );
    return narrative;
  }

  narrative.push(prose(' con una plusvalenza di '), figure(cachedFormatCurrencyEUR(sales.realizedGain, true)));
  if (sales.estimatedTax === null) {
    const where = sales.instruments.length === 1 ? 'sullo strumento' : 'su ogni strumento';
    narrative.push(prose(`; senza un'aliquota ${where} le tasse non sono stimate.`));
    return narrative;
  }
  // «circa» belongs to an estimate; a tax typed from the statement is a fact. The tax is binding
  // even at zero: «pagato 0 € di tasse» still says what the variation does not carry.
  narrative.push(
    ...binding([
      prose(sales.taxIsWithheld ? ' e pagato ' : ' e pagato circa '),
      figure(cachedFormatCurrencyEUR(sales.estimatedTax, true)),
      prose(' di tasse'),
    ]),
  );
  // An immaterial tax (`isMaterialSalesTax`) stays a fact: the month without it says nothing, and
  // the caller prints the plain split instead (`saleCarriesMonthSplit`).
  if (!split || !isMaterialSalesTax(sales.estimatedTax, split.delta)) {
    narrative.push(prose('.'));
    return narrative;
  }
  const withoutTax = split.delta + sales.estimatedTax;
  narrative.push(
    ...binding([
      prose(': senza, il mese avrebbe fatto '),
      signedCompactEuro(withoutTax),
      prose(' ('),
      ...monthSplitParts(withoutTax, split),
      prose(').'),
    ]),
  );
  return narrative;
}

/** Whether `describeSales` carries the month without the tax, so the caller drops its own split. */
export function saleCarriesMonthSplit(sales: PeriodSalesSummary | null | undefined, split: MonthSplit | undefined): boolean {
  return split !== undefined && isMaterialSalesTax(sales?.estimatedTax ?? null, split.delta);
}

/**
 * «Nello stesso mese hai comprato 6 strumenti per 34.305 €.» — what the ledger recorded as bought
 * beside the sale, so 39.052 € «venduti» do not read as money gone when they were rebalanced.
 * Stated as a fact, never as «con la vendita hai comprato»: the ledger cannot tell which money paid.
 * Empty when nothing was bought (or the payload predates the field).
 */
export function describePurchases(sales: PeriodSalesSummary, periodNoun = 'mese'): Narrative {
  const purchases = sales.purchases;
  if (!purchases || purchases.amount <= 0) return [];
  const count = purchases.instrumentCount;
  return [
    prose(`Nello stesso ${periodNoun} hai comprato `),
    figure(String(count)),
    prose(` ${count === 1 ? 'strumento' : 'strumenti'} per `),
    figure(cachedFormatCurrencyEUR(purchases.amount, true)),
    prose('.'),
  ];
}
