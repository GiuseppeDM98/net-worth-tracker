/**
 * The words for a period's sales and for the market-vs-flows split — shared by the Panoramica,
 * Patrimonio and the periodic email, so the three say the same thing about the same trade.
 *
 * SDK-free: formatters from `lib/utils/formatters`, never from `chartService` (the email Lambda
 * imports this — AGENTS.md → Italian Localization).
 */

import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import type { DeclineCause, PeriodSalesSummary, TaxedGrowth } from '@/lib/utils/periodSales';
import type { Narrative, NarrativeSegment } from '@/lib/utils/narrative';

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });

/** Signed compact euro figure with a typographic minus, coloured by sign. */
function signedCompactEuro(value: number): NarrativeSegment {
  const sign = value >= 0 ? '+' : '−';
  return {
    text: `${sign}${cachedFormatCurrencyEUR(Math.abs(value), true)}`,
    mono: true,
    sign: value >= 0 ? 'positive' : 'negative',
  };
}

/** «sulla vendita di VWCE» when the period sold exactly one instrument, «sulle vendite» otherwise. */
function taxObject(sales?: PeriodSalesSummary | null): string {
  const instruments = sales?.instruments ?? [];
  return instruments.length === 1 ? `sulla vendita di ${instruments[0].name}` : 'sulle vendite';
}

/**
 * The tail of a falling headline, after «{subject} è in calo». Empty for `unknown`. The
 * `taxes-despite-market` tail names the instrument sold («per le tasse sulla vendita di VWCE, non
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
 * le tasse sulla vendita di VWCE si sono prese la crescita.» / «Il portafoglio cresce, ma le tasse
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
}

/** «Altre variazioni» is said only from this many euro… */
const OTHER_CHANGES_MIN_EUR = 100;
/** …and from this share of the change being split, whichever is larger. */
const OTHER_CHANGES_MIN_SHARE = 0.05;

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
  return Math.abs(other) >= Math.max(OTHER_CHANGES_MIN_EUR, Math.abs(total) * OTHER_CHANGES_MIN_SHARE);
}

/**
 * «+2018 € dal mercato, +2095 € risparmiati, +100 € di altre variazioni» — `total` split into the
 * market, the savings and the exact residual (interest, balances corrected by hand, hand-valued
 * holdings, expenses not recorded). The residual has its own NAME because «dai tuoi movimenti»,
 * the one bucket it used to share with the savings, was read as income − expenses (owner,
 * 2026-09-19); it is dropped below `isMaterialOtherChange`, so the two named parts may not add up
 * to `total` by a few euro. Without the savings the second part says what it holds.
 */
function monthSplitParts(total: number, marketEffect: number, savings: number | null): Narrative {
  const market: Narrative = [signedCompactEuro(marketEffect), prose(' dal mercato')];
  const rest = total - marketEffect;
  if (savings === null) {
    return [...market, prose(' e '), signedCompactEuro(rest), prose(' tra risparmio e altre variazioni')];
  }
  const saved: Narrative = [signedCompactEuro(savings), prose(savings >= 0 ? ' risparmiati' : ' spesi oltre le entrate')];
  const other = rest - savings;
  if (!isMaterialOtherChange(other, total)) return [...market, prose(' e '), ...saved];
  return [...market, prose(', '), ...saved, prose(', '), signedCompactEuro(other), prose(' di altre variazioni')];
}

/**
 * «Di quel movimento: +3980 € dal mercato, +1180 € risparmiati, −1040 € di altre variazioni.» —
 * the month's change in the words the taxed sale's counterfactual uses. Exact by construction.
 */
export function describeMonthSplit(split: MonthSplit): Narrative {
  return [prose('Di quel movimento: '), ...monthSplitParts(split.delta, split.marketEffect, split.savings), prose('.')];
}

/** «Vanguard FTSE All-World» for one instrument, «3 strumenti» for more. */
function salesSubject(sales: PeriodSalesSummary): NarrativeSegment[] {
  if (sales.instruments.length === 1) return [prose(sales.instruments[0].name)];
  return [figure(String(sales.instruments.length)), prose(' strumenti')];
}

/**
 * «Hai venduto Vanguard FTSE All-World per 39.052 € con una plusvalenza di 15.726 € e pagato
 * circa 4089 € di tasse.» The tax is the broker's withholding, already gone at the sale (regime
 * amministrato), so the verb is «pagato», not «pagherai»; «circa» because it is estimated from the
 * instrument's rate. A loss carries no tax; a missing rate says so instead of printing zero.
 *
 * With `split` and a tax, the sentence closes on the month WITHOUT it — «: senza, il mese avrebbe
 * fatto +4213 € (+2018 € dal mercato, +2095 € risparmiati, +400 € di altre variazioni).» — and
 * replaces `describeMonthSplit`, whose parts would mix the tax back in (−1356 € «dai tuoi
 * movimenti» on the real account's settembre 2026, a figure nobody could read). The parts sum to
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
  narrative.push(
    prose(' e pagato circa '),
    figure(cachedFormatCurrencyEUR(sales.estimatedTax, true)),
    prose(' di tasse'),
  );
  if (!split || sales.estimatedTax <= 0) {
    narrative.push(prose('.'));
    return narrative;
  }
  const withoutTax = split.delta + sales.estimatedTax;
  narrative.push(
    prose(': senza, il mese avrebbe fatto '),
    signedCompactEuro(withoutTax),
    prose(' ('),
    ...monthSplitParts(withoutTax, split.marketEffect, split.savings),
    prose(').'),
  );
  return narrative;
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
